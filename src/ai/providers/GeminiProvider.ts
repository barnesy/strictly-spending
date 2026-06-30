import type { AIProvider, ChatMessage } from '../types';
import { getSystemPrompt, fewShots } from '../prompts';
import { parseAIResponse } from '../utils';
import { cleanChatHistory } from '../../copilotMatcher';

export class GeminiProvider implements AIProvider {
  public id = 'gemini';
  public name = 'Google Gemini';
  public isLoaded = false;
  public modelName = 'gemini-3.1-flash';
  
  private getApiKey(): string {
    return localStorage.getItem('app:geminiApiKey') || '';
  }

  async init(progressCallback?: (progress: string, percent?: number) => void): Promise<void> {
    const key = this.getApiKey();
    if (!key) {
      this.isLoaded = false;
      throw new Error("Gemini API key is missing. Please set it in Settings.");
    }
    
    this.isLoaded = true;
    progressCallback?.("Gemini ready!", 100);
  }

  async pullModel(progressCallback?: (progress: number, status: string) => void): Promise<void> {
    // Cloud models don't need pulling
    this.isLoaded = true;
    progressCallback?.(100, 'success');
  }

  abortPull(): void {
    // No-op
  }

  async chatCopilot(
    messages: ChatMessage[],
    stateContext: string,
    overrideSystemPrompt?: string,
    responseSchema?: any,
    onChunk?: (text: string, meta?: { promptTokens: number; completionTokens: number }) => void,
    signal?: AbortSignal,
    directMode?: boolean,
    toolsOverride?: any[]
  ): Promise<{ content: string; tool_calls?: any[]; thinking?: string }> {
    if (!this.isLoaded) throw new Error("Gemini AI not initialized.");
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("Gemini API key is missing.");

    try {
      let fullMessages;
      if (directMode) {
        fullMessages = [
          { role: 'system' as const, content: "You are a helpful general-purpose AI assistant." },
          ...cleanChatHistory(messages)
        ];
      } else {
        const extendedSystemPrompt = await getSystemPrompt(stateContext, overrideSystemPrompt);
        const cleanedMessages = cleanChatHistory(messages);
        
        fullMessages = overrideSystemPrompt
          ? [
              { role: 'system' as const, content: extendedSystemPrompt },
              ...cleanedMessages
            ]
          : [
              { role: 'system' as const, content: extendedSystemPrompt },
              ...fewShots,
              ...cleanedMessages
            ];
      }

      const schema = responseSchema || null;
      
      const { AGENT_TOOLS } = await import('../architecture');
      const tools = toolsOverride || AGENT_TOOLS;
      const stream = !!onChunk;

      const body: any = {
        model: this.modelName,
        messages: fullMessages,
        stream: stream,
        options: { temperature: directMode ? 0.7 : 0.2 },
        tools: tools
      };

      if (schema) {
        body.format = schema;
        body.tools = undefined; 
      }

      try {
        const { useChatStore } = await import('../../chatStore');
        useChatStore.getState().setLastDebugPayload(JSON.stringify(body, null, 2));
      } catch (e) {
        console.error("Failed to save debug payload", e);
      }

      if (onChunk) {
        const { listen } = await import('@tauri-apps/api/event');
        const { invoke } = await import('@tauri-apps/api/core');
        
        const unlistenChunk = await listen<string>('llm_chunk', (event) => {
          onChunk(event.payload);
        });
        
        const unlistenDone = await listen<any>('llm_done', (event) => {
          const payload = event.payload;
          onChunk('', { promptTokens: payload.prompt_eval_count || 0, completionTokens: payload.eval_count || 0 });
        });

        try {
          const result = await invoke<{ content: string; tool_calls?: any[]; thinking?: string }>('run_gemini_chat', {
            model: body.model,
            messages: body.messages,
            apiKey: apiKey,
            format: body.format || null,
            tools: body.tools || null,
            options: body.options,
            stream: body.stream
          });
          
          return result;
        } finally {
          unlistenChunk();
          unlistenDone();
        }
      } else {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke<{ content: string; tool_calls?: any[]; thinking?: string }>('run_gemini_chat', {
          model: body.model,
          messages: body.messages,
          apiKey: apiKey,
          format: body.format || null,
          tools: body.tools || null,
          options: body.options,
          stream: body.stream
        });
        return result;
      }
    } catch (e: any) {
      throw new Error(`Gemini Error: ${e.message || String(e)}`);
    }
  }

  async reviewTransactions(
    transactions: { desc: string; ruleCategory: string }[],
    availableCategories: string[],
    signal?: AbortSignal
  ): Promise<string[]> {
    if (!this.isLoaded) throw new Error("Gemini AI not initialized.");
    const apiKey = this.getApiKey();

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

      const { invoke } = await import('@tauri-apps/api/core');
      let content = '{"results":[]}';
      try {
        const res = await invoke<{ content: string; tool_calls?: any[]; thinking?: string }>('run_gemini_chat', {
          model: this.modelName,
          apiKey: apiKey,
          messages: [{ role: 'user', content: prompt }],
          format: 'json',
          options: { temperature: 0.1 }
        });
        content = res.content;
      } catch (err) {
        throw new Error(`Gemini error: ${err}`);
      }

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
      throw new Error(`Gemini Error: ${e.message || String(e)}`);
    }
  }

  async reviewTransactionsWithRules(
    transactions: { desc: string; ruleCategory: string }[],
    availableCategories: string[],
    signal?: AbortSignal
  ): Promise<{ category: string; pattern: string; recurrence: 'recurring' | 'onetime' }[]> {
    if (!this.isLoaded) throw new Error("Gemini AI not initialized.");
    const apiKey = this.getApiKey();

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

      const { invoke } = await import('@tauri-apps/api/core');
      let content = '{"results":[]}';
      try {
        const res = await invoke<{ content: string; tool_calls?: any[]; thinking?: string }>('run_gemini_chat', {
          model: this.modelName,
          apiKey: apiKey,
          messages: [{ role: 'user', content: prompt }],
          format: 'json',
          options: { temperature: 0.1 }
        });
        content = res.content;
      } catch (err) {
        throw new Error(`Gemini error: ${err}`);
      }

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
      throw new Error(`Gemini Error: ${e.message || String(e)}`);
    }
  }
}
