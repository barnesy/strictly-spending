import type { AIProvider, ChatMessage } from '../types';
import { COPILOT_RESPONSE_SCHEMA } from '../types';
import { handleOllamaError, safeFetch } from '../utils';
import { getSystemPrompt, fewShots } from '../prompts';
import { parseAIResponse } from '../utils';
import { cleanChatHistory } from '../../copilotMatcher';

export class OllamaProvider implements AIProvider {
  public id = 'ollama';
  public name = 'Local Ollama';
  public isLoaded = false;
  public modelName = 'llama3.2:1b';
  private pullAbortController: AbortController | null = null;

  async init(progressCallback?: (progress: string, percent?: number) => void): Promise<void> {
    try {
      progressCallback?.("Checking connection to Ollama server...", 30);
      const response = await safeFetch('http://localhost:11434/api/tags');
      if (!response.ok) {
        throw new Error('Ollama server is not running.');
      }
      
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        throw new Error('Failed to parse Ollama tags response as JSON.');
      }

      const hasModel = data.models?.some((m: any) => {
        const installed = m.name;
        if (installed === this.modelName) return true;
        
        const reqBase = this.modelName.split(':')[0];
        const reqTag = this.modelName.split(':')[1] || 'latest';
        
        const instBase = installed.split(':')[0];
        const instTag = installed.split(':')[1] || 'latest';
        
        if (reqBase === instBase) {
          if (reqTag === instTag) return true;
          if ((reqTag === 'latest' || reqTag === '3b') && (instTag === 'latest' || instTag === '3b')) {
            return true;
          }
        }
        return false;
      });
      
      if (!hasModel) {
        this.isLoaded = false;
        throw new Error(`Model '${this.modelName}' is not installed in Ollama. Please download the model.`);
      }
      
      this.isLoaded = true;
      progressCallback?.("AI ready!", 100);
    } catch (e: any) {
      this.isLoaded = false;
      throw handleOllamaError(e);
    }
  }

  async pullModel(progressCallback?: (progress: number, status: string) => void): Promise<void> {
    this.pullAbortController = new AbortController();
    try {
      const response = await safeFetch('http://localhost:11434/api/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: this.modelName }),
        signal: this.pullAbortController.signal as any,
      });

      if (!response.ok) {
        throw new Error(`Failed to pull model: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('ReadableStream not supported in this browser.');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const progressInfo = JSON.parse(line);
            if (progressInfo.status === 'success') {
              this.isLoaded = true;
              progressCallback?.(100, 'success');
              return;
            }
            
            if (progressInfo.total) {
              const pct = Math.round((progressInfo.completed / progressInfo.total) * 100);
              progressCallback?.(pct, progressInfo.status || 'downloading');
            } else {
              progressCallback?.(0, progressInfo.status || 'initializing');
            }
          } catch (e) {
            console.error('Failed to parse pull progress line:', e);
          }
        }
      }
      
      this.isLoaded = true;
    } catch (e: any) {
      this.isLoaded = false;
      if (e.name === 'AbortError') {
        console.log('Model download aborted.');
        return;
      }
      throw handleOllamaError(e);
    } finally {
      this.pullAbortController = null;
    }
  }

  abortPull(): void {
    if (this.pullAbortController) {
      this.pullAbortController.abort();
      this.pullAbortController = null;
    }
  }

  async chatCopilot(
    messages: ChatMessage[],
    stateContext: string,
    overrideSystemPrompt?: string,
    responseSchema?: any,
    onChunk?: (text: string, meta?: { promptTokens: number; completionTokens: number }) => void,
    signal?: AbortSignal
  ): Promise<string> {
    if (!this.isLoaded) throw new Error("Ollama AI not initialized.");

    try {
      const extendedSystemPrompt = await getSystemPrompt(stateContext, overrideSystemPrompt);
      const cleanedMessages = cleanChatHistory(messages);
      
      const fullMessages = overrideSystemPrompt
        ? [
            { role: 'system' as const, content: extendedSystemPrompt },
            ...cleanedMessages
          ]
        : [
            { role: 'system' as const, content: extendedSystemPrompt },
            ...fewShots,
            ...cleanedMessages
          ];

      const isGemma = this.modelName.toLowerCase().includes('gemma');
      const numCtx = isGemma ? 8192 : 4096; // Adjust context based on model

      const schema = responseSchema !== undefined ? responseSchema : COPILOT_RESPONSE_SCHEMA;
      const body: any = {
        model: this.modelName,
        messages: fullMessages,
        stream: !!onChunk,
        options: { temperature: 0.2, num_predict: 1024, num_ctx: numCtx }
      };

      if (schema) {
        body.format = schema;
      }

      try {
        const { useChatStore } = await import('../../chatStore');
        useChatStore.getState().setLastDebugPayload(JSON.stringify(body, null, 2));
      } catch (e) {
        console.error("Failed to save debug payload", e);
      }

      const response = await safeFetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal
      });

      if (!response.ok) throw new Error(`Ollama chat error: ${response.statusText}`);

      if (onChunk) {
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Response body is not readable.');
        }

        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let accumulatedContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const parsedChunk = JSON.parse(trimmed);
              const content = parsedChunk.message?.content || '';
              if (content) {
                accumulatedContent += content;
                onChunk(content);
              }
              if (parsedChunk.done) {
                const pCount = parsedChunk.prompt_eval_count;
                const eCount = parsedChunk.eval_count;
                if (pCount !== undefined || eCount !== undefined) {
                  onChunk('', { promptTokens: pCount || 0, completionTokens: eCount || 0 });
                }
              }
            } catch (e) {
              console.warn('Failed to parse streaming line:', trimmed, e);
            }
          }
        }

        if (buffer.trim()) {
          try {
            const parsedChunk = JSON.parse(buffer.trim());
            const content = parsedChunk.message?.content || '';
            if (content) {
              accumulatedContent += content;
              onChunk(content);
            }
            if (parsedChunk.done) {
              const pCount = parsedChunk.prompt_eval_count;
              const eCount = parsedChunk.eval_count;
              if (pCount !== undefined || eCount !== undefined) {
                onChunk('', { promptTokens: pCount || 0, completionTokens: eCount || 0 });
              }
            }
          } catch (e) {
            // ignore
          }
        }

        return accumulatedContent;
      } else {
        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (parseErr) {
          throw new Error('Failed to parse Ollama chat response as JSON.');
        }
        return data.message?.content || '';
      }
    } catch (e: any) {
      throw handleOllamaError(e);
    }
  }

  async reviewTransactions(
    transactions: { desc: string; ruleCategory: string }[],
    availableCategories: string[],
    signal?: AbortSignal
  ): Promise<string[]> {
    if (!this.isLoaded) throw new Error("Ollama AI not initialized.");

    try {
      const prompt = `You are a financial categorization auditor running locally. 
Review the following transaction descriptions and the category assigned to them by a simple rule engine.
Respond with a JSON object containing a "results" array of strings, where each string is the BEST category for the transaction at the exact same index. 
You MUST choose from the following Available Categories EXACTLY (do not invent new ones):
${availableCategories.map(c => `- ${c}`).join('\n')}

Transactions:
${transactions.map((t, i) => `${i+1}. Desc: "${t.desc}" | Rule Guessed: "${t.ruleCategory}"`).join('\n')}

Example valid JSON output:
{
  "results": ["Dining", "Transportation", "Shopping"]
}
`;

      const response = await safeFetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          messages: [{ role: 'user', content: prompt }],
          format: 'json',
          stream: false,
          options: { temperature: 0.1 }
        }),
        signal
      });

      if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        console.error('Ollama raw response was:', text);
        throw new Error('Failed to parse Ollama classification response as JSON.');
      }
      const content = data.message?.content || '{"results":[]}';

      let parsed = null;
      try {
        parsed = parseAIResponse(content);
      } catch (err) {
        console.error('Failed to parse AI classification response content:', content, err);
      }

      if (parsed && Array.isArray(parsed.results) && parsed.results.length === transactions.length) {
        return parsed.results.map((res: any, idx: number) => {
          const val = String(res).trim();
          if (val && val !== 'Uncategorized' && availableCategories.includes(val)) {
            return val;
          }
          const fallback = transactions[idx].ruleCategory;
          return (fallback && fallback !== 'Uncategorized' && availableCategories.includes(fallback)) ? fallback : '';
        });
      }
      return transactions.map(t => {
        const fallback = t.ruleCategory;
        return (fallback && fallback !== 'Uncategorized' && availableCategories.includes(fallback)) ? fallback : '';
      });
    } catch (e: any) {
      throw handleOllamaError(e);
    }
  }

  async reviewTransactionsWithRules(
    transactions: { desc: string; ruleCategory: string }[],
    availableCategories: string[],
    signal?: AbortSignal
  ): Promise<{ category: string; pattern: string; recurrence: 'recurring' | 'onetime' }[]> {
    if (!this.isLoaded) throw new Error("Ollama AI not initialized.");

    try {
      const prompt = `You are a financial categorization auditor running locally.
Review the following transaction descriptions and suggest:
1. The BEST category from the available list.
2. A simplified keyword/pattern that can be used as a matching rule for future transactions of this merchant.
   - The keyword MUST be simplified to the most important, distinctive part (e.g. "starbucks" instead of "SQ * STARBUCKS #12").
   - Strip any random numbers, IDs, dates, credit card prefixes.
   - It should be lowercase.
3. Whether this transaction is recurring (e.g. a subscription, rent, utility bill) or onetime.

You MUST choose categories from the following Available Categories EXACTLY (do not invent new ones):
${availableCategories.map(c => `- ${c}`).join('\n')}

Transactions:
${transactions.map((t, i) => `${i+1}. Desc: "${t.desc}" | Rule Guessed: "${t.ruleCategory}"`).join('\n')}

Respond with a JSON object containing a "results" array of objects, where each object has:
- "category": the suggested category
- "pattern": the simplified keyword pattern
- "recurrence": "recurring" or "onetime"

Example valid JSON output:
{
  "results": [
    { "category": "Restaurants & Coffee", "pattern": "starbucks", "recurrence": "onetime" },
    { "category": "Entertainment", "pattern": "netflix", "recurrence": "recurring" }
  ]
}
`;

      const response = await safeFetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          messages: [{ role: 'user', content: prompt }],
          format: 'json',
          stream: false,
          options: { temperature: 0.1 }
        }),
        signal
      });

      if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        console.error('Ollama raw response was:', text);
        throw new Error('Failed to parse Ollama classification response as JSON.');
      }
      const content = data.message?.content || '{"results":[]}';

      let parsed = null;
      try {
        parsed = parseAIResponse(content);
      } catch (err) {
        console.error('Failed to parse AI classification response content:', content, err);
      }

      const resultsList: { category: string; pattern: string; recurrence: 'recurring' | 'onetime' }[] = [];

      if (parsed && Array.isArray(parsed.results) && parsed.results.length === transactions.length) {
        for (let idx = 0; idx < transactions.length; idx++) {
          const item = parsed.results[idx];
          const cat = item && typeof item === 'object' && item.category ? String(item.category).trim() : '';
          const pat = item && typeof item === 'object' && item.pattern ? String(item.pattern).trim().toLowerCase() : '';
          const rec = item && typeof item === 'object' && item.recurrence === 'recurring' ? 'recurring' : 'onetime';
          
          let finalCat = '';
          if (cat && cat !== 'Uncategorized' && availableCategories.includes(cat)) {
            finalCat = cat;
          } else {
            const fallback = transactions[idx].ruleCategory;
            finalCat = (fallback && fallback !== 'Uncategorized' && availableCategories.includes(fallback)) ? fallback : '';
          }

          resultsList.push({
            category: finalCat,
            pattern: pat || transactions[idx].desc.toLowerCase(),
            recurrence: rec
          });
        }
      } else {
        // Fallback
        for (let idx = 0; idx < transactions.length; idx++) {
          const fallback = transactions[idx].ruleCategory;
          resultsList.push({
            category: (fallback && fallback !== 'Uncategorized' && availableCategories.includes(fallback)) ? fallback : '',
            pattern: transactions[idx].desc.toLowerCase(),
            recurrence: 'onetime'
          });
        }
      }

      return resultsList;
    } catch (e: any) {
      throw handleOllamaError(e);
    }
  }
}