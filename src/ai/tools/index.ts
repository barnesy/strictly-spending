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
import { ExportTransactionsTool } from './ExportTransactionsTool';
import { CreateArtifactTool } from './CreateArtifactTool';
import { UpdateArtifactTool } from './UpdateArtifactTool';
import { UpdateTaxSettingsTool } from './UpdateTaxSettingsTool';
import { UpdateDeductionStatusTool } from './UpdateDeductionStatusTool';
import { CategorizeTransactionsTool } from './CategorizeTransactionsTool';
import { SubscriptionAlertsTool } from './SubscriptionAlertsTool';
import { SpendingAnomaliesTool } from './SpendingAnomaliesTool';
import { AuditAccessibilityTool } from './AuditAccessibilityTool';
import { ProjectRunwayTool } from './ProjectRunwayTool';
import { ManageLoansTool } from './ManageLoansTool';
import { ManageBudgetsTool } from './ManageBudgetsTool';
import { CreateAutoRuleTool } from './CreateAutoRuleTool';
import { ReadPdfTool } from './ReadPdfTool';

toolRegistry.register(new QueryDataTool());
toolRegistry.register(new ExportTransactionsTool());
toolRegistry.register(new CreateArtifactTool());
toolRegistry.register(new UpdateArtifactTool());
toolRegistry.register(new UpdateTaxSettingsTool());
toolRegistry.register(new UpdateDeductionStatusTool());
toolRegistry.register(new CategorizeTransactionsTool());
toolRegistry.register(new SubscriptionAlertsTool());
toolRegistry.register(new SpendingAnomaliesTool());
toolRegistry.register(new AuditAccessibilityTool());
toolRegistry.register(new ProjectRunwayTool());
toolRegistry.register(new ManageLoansTool());
toolRegistry.register(new ManageBudgetsTool());
toolRegistry.register(new CreateAutoRuleTool());
toolRegistry.register(new ReadPdfTool());
