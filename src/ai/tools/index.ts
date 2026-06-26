import type { FiltersState } from '../../store';

export interface AIToolContext {
  filters: FiltersState;
  dataStore: any;
  budgetStore: any;
  lastQueryState?: any;
}

export interface ToolExecutionResult {
  feedbackError?: string;
  systemResultsMsg?: string;
  actionResult?: any;
  data?: Record<string, any>;
  lastQueryState?: {
    start: string;
    end: string;
    cats: string[];
    accts: number[];
    search: string;
    minPrice?: number;
    maxPrice?: number;
  };
}

export interface AIToolHandler {
  name: string;
  execute(actionObj: any, context: AIToolContext): Promise<ToolExecutionResult>;
}

export class ToolRegistry {
  private handlers = new Map<string, AIToolHandler>();

  register(handler: AIToolHandler) {
    this.handlers.set(handler.name, handler);
  }

  get(name: string): AIToolHandler | undefined {
    return this.handlers.get(name);
  }
}

export const toolRegistry = new ToolRegistry();

import { QueryDataTool } from './QueryDataTool';
import { GenerateDocumentTool } from './GenerateDocumentTool';

toolRegistry.register(new QueryDataTool());
toolRegistry.register(new GenerateDocumentTool());
