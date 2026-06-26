import { AVAILABLE_TOOLS } from '../aiTools';

export type ChatMessage = {
  role: 'system'|'user'|'assistant';
  content: string;
  injectedSkills?: string[];
  actionResult?: any;
  isStreaming?: boolean;
  steps?: string[];
  activeSkillId?: string;
  completedStages?: string[];
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  purpose?: 'tool_select' | 'explanation';
};

export const COPILOT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "A short, descriptive title." },
    body: { type: "string", description: "The response explanation. MUST NOT contain fake numbers or calculations." },
    gen_ux: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["choices", "form", "confirmation", "none"], description: "The type of UI to generate. Use 'none' if no extra UI is needed." },
        options: { type: "array", items: { type: "string" } }
      },
      required: ["type", "options"]
    },
    suggested_actions: { type: "array", items: { type: "string" }, description: "1 to 3 strings for follow-up buttons." },
    agent_action: {
      type: "object",
      properties: {
        action: { 
          type: "string", 
          enum: AVAILABLE_TOOLS.flatMap(t => t.name.split(' / ')),
          description: "The system action to take. query_data fetches data."
        },
        id: { type: "string" },
        page: { type: "string", description: "The path to navigate to, e.g. '/settings'" },
        categories: { type: "array", items: { type: "string" }, description: "Array of category names, ['all'], or ['current']." },
        accounts: { type: "array", items: { type: "string" } },
        search: { type: "string" },
        preset: { 
          type: "string", 
          enum: ["ytd", "last30", "last90", "thisMonth", "lastMonth", "allTime", "custom", "current"] 
        },
        customStart: { type: "string" },
        customEnd: { type: "string" },
        recurrenceFilter: { type: "string", enum: ["all", "recurring", "onetime"] },
        minPrice: { type: "number" },
        maxPrice: { type: "number" },
        domSelector: { type: "string" },
        type: { type: "string", enum: ["skill", "markdown", "spreadsheet"] },
        title: { type: "string" },
        content: { type: "string" },
        explanation: { type: "string" }
      },
      required: ["action"]
    }
  },
  required: ["title", "body", "gen_ux", "suggested_actions", "agent_action"]
};

export const EVALUATOR_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    score: { type: "number" },
    reasoning: { type: "string" }
  },
  required: ["success", "score", "reasoning"]
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
    directMode?: boolean
  ): Promise<string>;
  reviewTransactions(transactions: { desc: string; ruleCategory: string }[], availableCategories: string[], signal?: AbortSignal): Promise<string[]>;
  reviewTransactionsWithRules(
    transactions: { desc: string; ruleCategory: string; localRecurrence?: string }[],
    availableCategories: string[],
    signal?: AbortSignal
  ): Promise<{ category: string; pattern: string; recurrence: "recurring" | "onetime" }[]>;
  pullModel?(progressCallback?: (progress: number, status: string) => void): Promise<void>;
  abortPull?(): void;
}

export interface SkillTestResult {
  success: boolean;
  score: number;
  reasoning: string;
  output: string;
}