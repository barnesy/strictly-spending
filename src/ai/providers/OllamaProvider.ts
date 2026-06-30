import type { AIProvider, ChatMessage } from '../types';
import { handleOllamaError, safeFetch } from '../utils';
import { getSystemPrompt, fewShots } from '../prompts';
import { parseAIResponse } from '../utils';
import { cleanChatHistory } from '../../copilotMatcher';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { AGENT_TOOLS } from '../architecture';

export class OllamaProvider implements AIProvider {
  public id = 'ollama';
  public name = 'Local Ollama';
  public isLoaded = false;
  public modelName = 'gemma2:2b';
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

      
      const unlisten = await listen<{ pct: number; status: string }>('ollama_pull_progress', (event) => {
        const payload = event.payload;
        if (payload.status === 'success') {
            this.isLoaded = true;
        }
        progressCallback?.(payload.pct, payload.status);
      });

      try {
        await invoke('pull_ollama_model', { name: this.modelName });
        this.isLoaded = true;
      } finally {
        unlisten();
      }
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
    signal?: AbortSignal,
    directMode?: boolean,
    toolsOverride?: any[]
  ): Promise<{ content: string; tool_calls?: any[]; thinking?: string }> {
    if (!this.isLoaded) throw new Error("Ollama AI not initialized.");

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

      const isGemma = this.modelName.toLowerCase().includes('gemma');
      const numCtx = isGemma ? 131072 : 32768; // Adjust context based on model

      const schema = responseSchema || null;
      
      const tools = toolsOverride || AGENT_TOOLS;
      const stream = !!onChunk;

      const body: any = {
        model: this.modelName,
        messages: fullMessages,
        stream: stream,
        options: { temperature: directMode ? 0.7 : 0.2, num_predict: 8192, num_ctx: numCtx },
        tools: tools
      };

      if (schema) {
        body.format = schema;
        body.tools = undefined; // If explicit format is requested, disable native tools
      }

      try {
        const { useChatStore } = await import('../../chatStore');
        useChatStore.getState().setLastDebugPayload(JSON.stringify(body, null, 2));
      } catch (e) {
        console.error("Failed to save debug payload", e);
      }

      if (onChunk) {
        const unlistenChunk = await listen<string>('llm_chunk', (event) => {
          onChunk(event.payload);
        });
        
        const unlistenDone = await listen<any>('llm_done', (event) => {
          const payload = event.payload;
          onChunk('', { promptTokens: payload.prompt_eval_count || 0, completionTokens: payload.eval_count || 0 });
        });

        try {
          const result = await invoke<{ content: string; tool_calls?: any[]; thinking?: string }>('run_copilot_chat', {
            model: body.model,
            messages: body.messages,
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
        const result = await invoke<{ content: string; tool_calls?: any[]; thinking?: string }>('run_copilot_chat', {
          model: body.model,
          messages: body.messages,
          format: body.format || null,
          tools: body.tools || null,
          options: body.options,
          stream: body.stream
        });
        return result;
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

      let content = '{"results":[]}';
      try {
        const res = await invoke<{ content: string; tool_calls?: any[]; thinking?: string }>('run_copilot_chat', {
          model: this.modelName,
          messages: [{ role: 'user', content: prompt }],
          format: 'json',
          options: { temperature: 0.1 }
        });
        content = res.content;
      } catch (err) {
        throw new Error(`Ollama error: ${err}`);
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

      let content = '{"results":[]}';
      try {
        const res = await invoke<{ content: string; tool_calls?: any[]; thinking?: string }>('run_copilot_chat', {
          model: this.modelName,
          messages: [{ role: 'user', content: prompt }],
          format: 'json',
          options: { temperature: 0.1 }
        });
        content = res.content;
      } catch (err) {
        throw new Error(`Ollama error: ${err}`);
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
      throw handleOllamaError(e);
    }
  }

  async parseReceipt(imageBase64: string, signal?: AbortSignal): Promise<{ merchant: string; date: string; total: number; tax: number; items: any[] }> {
    if (!this.isLoaded) throw new Error("Ollama AI not initialized.");

    const prompt = `Extract the following information from this receipt image. 
Return EXACTLY a JSON object with this schema:
{
  "merchant": "Name of the store or merchant",
  "date": "YYYY-MM-DD",
  "total": 123.45,
  "tax": 1.23,
  "items": [{"name": "item 1", "price": 10.0}]
}
If a field is missing, use null or 0. Respond with only the JSON.`;

    try {
      const res = await invoke<{ content: string; tool_calls?: any[]; thinking?: string }>('run_copilot_chat', {
        model: this.modelName,
        messages: [{ role: 'user', content: prompt, images: [imageBase64] }],
        format: 'json',
        options: { temperature: 0.1 }
      });
      const parsed = parseAIResponse(res.content);
      return {
        merchant: parsed.merchant || 'Unknown',
        date: parsed.date || '',
        total: Number(parsed.total) || 0,
        tax: Number(parsed.tax) || 0,
        items: Array.isArray(parsed.items) ? parsed.items : []
      };
    } catch (e: any) {
      throw handleOllamaError(e);
    }
  }

  async parseBankStatement(text: string, signal?: AbortSignal): Promise<{ transactions: { date: string; description: string; amount: number; debitCredit?: 'debit' | 'credit' }[] }> {
    if (!this.isLoaded) throw new Error("Ollama AI not initialized.");

    const prompt = `Extract the transaction history from the following bank statement text.
Return EXACTLY a JSON object with this schema:
{
  "transactions": [
    {"date": "YYYY-MM-DD", "description": "Transaction details", "amount": 123.45, "debitCredit": "debit"}
  ]
}
If it is a deposit/credit, make debitCredit "credit". If it is a withdrawal/expense, make it "debit".
Amount should always be a positive number.
Respond with only the JSON.

Bank Statement Text:
${text.substring(0, 8000)}`; // Truncate text just in case to prevent context overflow

    try {
      const res = await invoke<{ content: string; tool_calls?: any[]; thinking?: string }>('run_copilot_chat', {
        model: this.modelName,
        messages: [{ role: 'user', content: prompt }],
        format: 'json',
        options: { temperature: 0.1 }
      });
      const parsed = parseAIResponse(res.content);
      return {
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : []
      };
    } catch (e: any) {
      throw handleOllamaError(e);
    }
  }
}