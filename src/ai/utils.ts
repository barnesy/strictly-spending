export const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

export let cachedTauriFetch: any = null;

export async function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  console.log('[safeFetch] Request started:', input);
  try {
    if (isTauri) {
      console.log('[safeFetch] isTauri=true. Importing @tauri-apps/plugin-http...');
      if (!cachedTauriFetch) {
        const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
        cachedTauriFetch = tauriFetch;
        console.log('[safeFetch] Import successful.');
      }
      const { signal, ...tauriInit } = init || {};
      if (signal?.aborted) {
        console.log('[safeFetch] Request aborted before sending.');
        throw new DOMException('The user aborted a request.', 'AbortError');
      }
      console.log('[safeFetch] Calling cachedTauriFetch with init:', tauriInit);
      const res = await cachedTauriFetch(input as any, tauriInit as any) as unknown as Response;
      console.log('[safeFetch] Response received. Status:', res.status);
      return res;
    }
    console.log('[safeFetch] isTauri=false. Calling browser native fetch...');
    const res = await fetch(input, init);
    console.log('[safeFetch] Browser native fetch success. Status:', res.status);
    return res;
  } catch (error: any) {
    console.error('[safeFetch] Error caught:', error);
    if (error?.name === 'AbortError' || error?.message?.toLowerCase().includes('abort')) {
      throw error;
    }
    const errorMsg = error?.message || String(error);
    if (
      errorMsg.includes('The string did not match the expected pattern') ||
      errorMsg.includes('Failed to fetch') ||
      errorMsg.includes('NetworkError') ||
      errorMsg.includes('Connection refused')
    ) {
      throw new Error('Ollama server is offline or connection was blocked. Please check that Ollama is running.');
    }
    throw error;
  }
}

export function handleOllamaError(error: any): any {
  if (error?.name === 'AbortError' || error?.message?.toLowerCase().includes('abort')) {
    return error;
  }
  const errorMsg = error?.message || String(error);
  if (
    errorMsg.includes('The string did not match the expected pattern') ||
    errorMsg.includes('Failed to fetch') ||
    errorMsg.includes('NetworkError') ||
    errorMsg.includes('Connection refused')
  ) {
    return new Error('Ollama server is offline or connection was blocked. Please check that Ollama is running.');
  }
  return error;
}

export function cleanJSONString(str: string): string {
  let mode: 'outside' | 'key' | 'string' = 'outside';
  let escaped = false;
  let result = '';
  let lastStructuralChar = '';
  const contextStack: ('{' | '[')[] = [];

  const getNextNonWhitespace = (index: number): { char: string; index: number } => {
    for (let i = index + 1; i < str.length; i++) {
      if (!/\s/.test(str[i])) {
        return { char: str[i], index: i };
      }
    }
    return { char: '', index: str.length };
  };

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (char === '\\' && !escaped) {
      escaped = true;
      result += char;
      continue;
    }

    const currentContext = contextStack[contextStack.length - 1];

    if (char === '"' && !escaped) {
      if (mode === 'outside') {
        if (currentContext === '[') {
          mode = 'string';
          result += char;
        } else if (lastStructuralChar === ':') {
          mode = 'string';
          result += char;
        } else {
          mode = 'key';
          result += char;
        }
      } else if (mode === 'key') {
        const next = getNextNonWhitespace(i);
        if (next.char === ':') {
          mode = 'outside';
          result += char;
        } else {
          result += '\\"';
        }
      } else if (mode === 'string') {
        const next = getNextNonWhitespace(i);
        let isEnd = false;
        if (next.char === '}' || next.char === ']' || next.char === '') {
          isEnd = true;
        } else if (next.char === ',') {
          const afterComma = getNextNonWhitespace(next.index);
          if (afterComma.char === '"' || afterComma.char === '}' || afterComma.char === ']' || afterComma.char === '{' || afterComma.char === '[') {
            isEnd = true;
          }
        }
        
        if (isEnd) {
          mode = 'outside';
          result += char;
        } else {
          result += '\\"';
        }
      }
    } else {
      if ((mode === 'string' || mode === 'key') && (char === '\n' || char === '\r')) {
        result += '\\n';
      } else {
        result += char;
      }

      if (mode === 'outside' && !/\s/.test(char)) {
        if ('{}[],:'.includes(char)) {
          lastStructuralChar = char;
          
          if (char === '{' || char === '[') {
            contextStack.push(char);
          } else if (char === '}' || char === ']') {
            contextStack.pop();
          }
        }
      }
    }

    escaped = false;
  }

  return result.replace(/,\s*([}\]])/g, '$1');
}

export function extractFieldUsingRegex(text: string, fieldName: string): string | null {
  const regex = new RegExp(`"${fieldName}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'i');
  const match = text.match(regex);
  if (match) {
    try {
      return JSON.parse(`"${match[1]}"`);
    } catch {
      return match[1];
    }
  }
  return null;
}

export function getMessageDisplayContent(parsed: any, isStreaming?: boolean): string {
  if (!parsed || Object.keys(parsed).length === 0) return "*Thinking...*";
  if (parsed.body && typeof parsed.body === 'string') return parsed.body;
  if (parsed.explanation && typeof parsed.explanation === 'string') return parsed.explanation;
  if (parsed.agent_action?.explanation && typeof parsed.agent_action.explanation === 'string') {
    return parsed.agent_action.explanation;
  }

  if (parsed.agent_action && parsed.agent_action.action && parsed.agent_action.action !== 'none') {
    const action = parsed.agent_action.action;
    if (action === 'filter') return 'Applied spending filters.';
    if (action === 'navigate') return `Navigated to ${parsed.agent_action.page || 'another page'}.`;
    if (action === 'query_data') return 'Queried financial data from database.';
    if (action === 'subscription_alerts') return 'Scanned for subscription alerts.';
    if (action === 'spending_anomalies') return 'Scanned for spending anomalies.';
    if (action === 'create_artifact') return `Created artifact: ${parsed.agent_action.title || 'Untitled'}.`;
    if (action === 'update_artifact') return `Updated artifact: ${parsed.agent_action.title || 'Untitled'}.`;
    if (action === 'audit_accessibility') return 'Audited application accessibility.';
    if (action === 'dom_update') return 'Updated application element.';
    if (action === 'project_runway') return 'Calculated financial runway projection.';
  }

  // If we have a title but no body yet, let's show the title with thinking status if streaming
  if (isStreaming && parsed.title && typeof parsed.title === 'string') {
    return `### ${parsed.title}\n\n*Thinking...*`;
  }

  if (parsed.title && typeof parsed.title === 'string') return parsed.title;
  if (parsed.message && typeof parsed.message === 'string') return parsed.message;
  if (parsed.text && typeof parsed.text === 'string') return parsed.text;

  return "I processed your request, but did not generate a text explanation.";
}

export function parseAIResponse(text: string): any {
  if (!text) return null;
  
  const parseWithClean = (str: string) => {
    try {
      const cleaned = cleanJSONString(str);
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  };

  let jsonStr = text.trim();
  const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match) {
    jsonStr = match[1].trim();
  } else {
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start >= 0 && end >= 0) {
      jsonStr = jsonStr.slice(start, end + 1);
    }
  }

  // Try parsing directly first
  let res = parseWithClean(jsonStr);
  if (res) return res;

  // Try direct repair (closing open string/braces)
  try {
    let temp = jsonStr.trim();
    let inStr = false;
    let esc = false;
    const stack: string[] = [];
    for (let i = 0; i < temp.length; i++) {
      if (temp[i] === '\\' && !esc) { esc = true; continue; }
      if (temp[i] === '"' && !esc) inStr = !inStr;
      if (!inStr) {
        if (temp[i] === '{') stack.push('{');
        else if (temp[i] === '[') stack.push('[');
        else if (temp[i] === '}') {
          if (stack[stack.length - 1] === '{') stack.pop();
        }
        else if (temp[i] === ']') {
          if (stack[stack.length - 1] === '[') stack.pop();
        }
      }
      esc = false;
    }
    if (inStr) temp += '"';
    while (stack.length > 0) {
      const op = stack.pop();
      if (op === '{') temp += '}';
      else if (op === '[') temp += ']';
    }
    
    const directRepaired = parseWithClean(temp);
    if (directRepaired) return directRepaired;
  } catch (err) {
    // Ignore and proceed to iterative chop-repair
  }

  // If direct repair fails, try to repair by iterative chopping from the end
  try {
    let s = jsonStr.trim();
    for (let attempts = 0; attempts < 10; attempts++) {
      const lastComma = s.lastIndexOf(',');
      if (lastComma < 0) break;
      s = s.slice(0, lastComma).trim();
      
      let temp = s;
      let inStr = false;
      let esc = false;
      const stack: string[] = [];
      for (let i = 0; i < temp.length; i++) {
        if (temp[i] === '\\' && !esc) { esc = true; continue; }
        if (temp[i] === '"' && !esc) inStr = !inStr;
        if (!inStr) {
          if (temp[i] === '{') stack.push('{');
          else if (temp[i] === '[') stack.push('[');
          else if (temp[i] === '}') stack.pop();
          else if (temp[i] === ']') stack.pop();
        }
        esc = false;
      }
      if (inStr) temp += '"';
      while (stack.length > 0) {
        const op = stack.pop();
        if (op === '{') temp += '}';
        else if (op === '[') temp += ']';
      }
      
      res = parseWithClean(temp);
      if (res) return res;
    }
  } catch (err) {
    console.warn("JSON repair failed:", err);
  }

  console.warn("Failed to parse AI JSON response:", text);
  return null;
}

export function forceBoldAndTwoDecimals(text: string): string {
  // 1. Protect code blocks, links, HTML tags, and dates
  const placeholders: string[] = [];
  
  const toAlpha = (num: number): string => {
    let str = '';
    let temp = num;
    do {
      str = String.fromCharCode(65 + (temp % 26)) + str;
      temp = Math.floor(temp / 26) - 1;
    } while (temp >= 0);
    return str;
  };

  const savePlaceholder = (val: string) => {
    const ph = `__PLACEHOLDER_${toAlpha(placeholders.length)}__`;
    placeholders.push(val);
    return ph;
  };

  // Protect triple backtick code blocks
  let processed = text.replace(/```[\s\S]*?```/g, savePlaceholder);
  // Protect inline code blocks
  processed = processed.replace(/`[^`]*?`/g, savePlaceholder);
  // Protect markdown links
  processed = processed.replace(/\[[^\]]*?\]\([^\)]*?\)/g, savePlaceholder);
  // Protect HTML tags
  processed = processed.replace(/<[^>]*?>/g, savePlaceholder);
  // Protect standard ISO dates (YYYY-MM-DD)
  processed = processed.replace(/\b\d{4}-\d{2}-\d{2}\b/g, savePlaceholder);

  // 2. Process numbers in the remaining text
  // Matches optional asterisks, optional sign/dollar prefix, digits, optional decimal, optional percent, optional asterisks
  const regex = /(\*\*)?([+\-]?\$?)(\d+(?:,\d{3})*)(\.\d+)?(%)?(\*\*)?/g;

  processed = processed.replace(regex, (match, _leftAsterisks, prefix, integerPart, decimalPart, percent, _rightAsterisks) => {
    const cleanedInteger = integerPart.replace(/,/g, '');
    const numValue = parseFloat(cleanedInteger + (decimalPart || ''));

    if (isNaN(numValue)) {
      return match;
    }

    // Exclude years (bare 4-digit integers starting with 19 or 20)
    const isYear = !prefix.includes('$') && !percent && !decimalPart && numValue >= 1900 && numValue <= 2099 && integerPart.length === 4;
    if (isYear) {
      return match;
    }

    // Format to 2 decimal places
    const formattedVal = numValue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    const finalPrefix = prefix || '';
    const finalPercent = percent || '';
    return `**${finalPrefix}${formattedVal}${finalPercent}**`;
  });

  // 3. Restore placeholders in reverse order
  for (let i = placeholders.length - 1; i >= 0; i--) {
    processed = processed.replace(`__PLACEHOLDER_${toAlpha(i)}__`, placeholders[i]);
  }

  return processed;
}