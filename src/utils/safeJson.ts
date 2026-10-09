/**
 * Safely parse a JSON or relaxed JavaScript object string (e.g. from an LLM output)
 * WITHOUT using eval() or new Function().
 */
export function safeParseChartOption(rawText: string): Record<string, any> | null {
  if (!rawText || typeof rawText !== 'string') return null;
  const text = rawText.trim();

  // 1. Try standard JSON.parse first
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    if (Array.isArray(parsed)) {
      return { series: parsed };
    }
  } catch {
    // Continue to relaxed normalization
  }

  // 2. Safe normalization of relaxed object syntax (unquoted keys, single quotes, comments, trailing commas)
  try {
    // Strip comments
    let cleaned = text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n\r]*/g, '');

    // Replace single-quoted strings with double-quoted strings
    cleaned = cleaned.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, group) => {
      return '"' + group.replace(/"/g, '\\"') + '"';
    });

    // Quote unquoted object keys (e.g. { title: "..." } -> { "title": "..." })
    cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');

    // Remove trailing commas before closing braces/brackets
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    // Fall back to clean JSON extraction if wrapped with extra text
  }

  return null;
}
