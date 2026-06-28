import { AVAILABLE_TOOLS } from '../aiTools';

export interface ChatMessage {
  id?: number;
  threadId?: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  actionResult?: any;
  purpose?: 'tool_select' | 'explanation';
  tool_calls?: any[];
  thinking?: string;
  isStreaming?: boolean;
  steps?: any[];
  tokenUsage?: { prompt: number; completion: number; total: number };
  createdAt?: string;
  isAborted?: boolean;
  error?: string;
};

export interface AIProvider {
  id: string;
  name: string;
  isLoaded: boolean;
  modelName: string;
  init(progressCallback?: (progress: string, percent?: number) => void): Promise<void>;
  chatCopilot(
    messages: ChatMessage[],
    stateContext: string,
    overrideSystemPrompt?: string,
    responseSchema?: any,
    onChunk?: (text: string, meta?: { promptTokens: number; completionTokens: number }) => void,
    signal?: AbortSignal,
    directMode?: boolean,
    toolsOverride?: any[]
  ): Promise<{ content: string; tool_calls?: any[]; thinking?: string }>;
  reviewTransactions(transactions: { desc: string; ruleCategory: string }[], availableCategories: string[], signal?: AbortSignal): Promise<string[]>;
  reviewTransactionsWithRules(
    transactions: { desc: string; ruleCategory: string; localRecurrence?: string }[],
    availableCategories: string[],
    signal?: AbortSignal
  ): Promise<{ category: string; pattern: string; recurrence: "recurring" | "onetime" }[]>;
  pullModel?(progressCallback?: (progress: number, status: string) => void): Promise<void>;
  abortPull?(): void;
}
