import type { AIProvider, ChatMessage } from './types';
import { OllamaProvider } from './providers/OllamaProvider';

export class LocalAI implements AIProvider {
  public id = 'dispatcher';
  public name = 'AI Dispatcher';
  public activeProvider: AIProvider;

  constructor() {
    this.activeProvider = new OllamaProvider();
    this.syncActiveProvider();
  }

  public syncActiveProvider() {
    if (typeof window !== 'undefined') {
      const savedModel = localStorage.getItem('app:modelName');
      if (savedModel) {
        this.activeProvider.modelName = savedModel;
      } else {
        this.activeProvider.modelName = 'gemma2:2b';
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
    return 'ollama';
  }

  public setProviderId(id: 'ollama' | 'web-llm') {
    if (typeof window !== 'undefined') {
      localStorage.setItem('app:aiProvider', id);
    }
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
    directMode?: boolean
  ): Promise<string> {
    this.syncActiveProvider();
    return this.activeProvider.chatCopilot(messages, stateContext, overrideSystemPrompt, responseSchema, onChunk, signal, directMode);
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