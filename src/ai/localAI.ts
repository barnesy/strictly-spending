import type { AIProvider, ChatMessage } from './types';
import { OllamaProvider } from './providers/OllamaProvider';
import { GeminiProvider } from './providers/GeminiProvider';

export class LocalAI implements AIProvider {
  public id = 'dispatcher';
  public name = 'AI Dispatcher';
  public activeProvider: AIProvider;
  private providers: Map<string, AIProvider> = new Map();

  constructor() {
    this.providers.set('ollama', new OllamaProvider());
    this.providers.set('gemini', new GeminiProvider());
    this.activeProvider = this.providers.get('ollama')!;
    this.syncActiveProvider();
  }

  public syncActiveProvider() {
    if (typeof window !== 'undefined') {
      const savedProviderId = localStorage.getItem('app:aiProvider') || 'ollama';
      const provider = this.providers.get(savedProviderId);
      if (provider) {
        this.activeProvider = provider;
      }

      const savedModel = localStorage.getItem('app:modelName');
      if (savedModel) {
        this.activeProvider.modelName = savedModel;
      } else {
        if (savedProviderId === 'gemini') this.activeProvider.modelName = 'gemini-3.1-flash';
        else this.activeProvider.modelName = 'gemma2:2b';
      }
    }
  }

  public get isLoaded(): boolean {
    return this.activeProvider.isLoaded;
  }
  public set isLoaded(val: boolean) {
    this.activeProvider.isLoaded = val;
  }

  public get modelName(): string {
    return this.activeProvider.modelName;
  }
  public set modelName(val: string) {
    this.activeProvider.modelName = val;
  }

  public setModelName(name: string) {
    this.modelName = name;
    if (typeof window !== 'undefined') {
      localStorage.setItem('app:modelName', name);
    }
    this.syncActiveProvider();
  }

  public getProviderId(): string {
    return this.activeProvider.id;
  }

  public setProviderId(id: 'ollama' | 'gemini') {
    if (typeof window !== 'undefined') {
      localStorage.setItem('app:aiProvider', id);
    }
    this.syncActiveProvider();
  }

  async init(progressCallback?: (progress: string, percent?: number) => void): Promise<void> {
    this.syncActiveProvider();
    await this.activeProvider.init(progressCallback);
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
  ): Promise<{ content: string; tool_calls?: any[] }> {
    this.syncActiveProvider();
    return await this.activeProvider.chatCopilot(
      messages,
      stateContext,
      overrideSystemPrompt,
      responseSchema,
      onChunk,
      signal,
      directMode,
      toolsOverride
    );
  }

  async reviewTransactions(transactions: any[], availableCategories: string[], signal?: AbortSignal): Promise<string[]> {
    this.syncActiveProvider();
    return this.activeProvider.reviewTransactions(transactions, availableCategories, signal);
  }

  async reviewTransactionsWithRules(
    transactions: { desc: string; ruleCategory: string; localRecurrence?: string }[],
    availableCategories: string[],
    signal?: AbortSignal
  ) {
    if (!this.activeProvider) throw new Error('No AI provider loaded');
    return this.activeProvider.reviewTransactionsWithRules(transactions, availableCategories, signal);
  }

  async pullModel(progressCallback?: (progress: number, status: string) => void): Promise<void> {
    this.syncActiveProvider();
    if (this.activeProvider.pullModel) {
      await this.activeProvider.pullModel(progressCallback);
    } else {
      await this.activeProvider.init((status, percent) => {
        progressCallback?.(percent || 0, status);
      });
    }
  }

  abortPull(): void {
    this.syncActiveProvider();
    if (this.activeProvider.abortPull) {
      this.activeProvider.abortPull();
    }
  }
}

export const localAI = new LocalAI();