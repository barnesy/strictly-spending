import type { FiltersState } from '../../store';
import type { DataState } from '../../dataStore';

export interface AIToolContext {
  filters: FiltersState;
  dataStore: DataState;
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
import { SubscriptionAlertsTool } from './SubscriptionAlertsTool';
import { SpendingAnomaliesTool } from './SpendingAnomaliesTool';
import { GenerateDocumentTool } from './GenerateDocumentTool';
import { ProjectRunwayTool } from './ProjectRunwayTool';
import { AuditAccessibilityTool } from './AuditAccessibilityTool';
import { UpdateTaxSettingsTool } from './UpdateTaxSettingsTool';
import { UpdateDeductionStatusTool } from './UpdateDeductionStatusTool';
import { CategorizeTransactionsTool } from './CategorizeTransactionsTool';
import { DebtOptimizationTool } from './DebtOptimizationTool';
import { CashFlowPredictorTool } from './CashFlowPredictorTool';
import { ScenarioForecastingTool } from './ScenarioForecastingTool';
import { GoalTrackerTool } from './GoalTrackerTool';
import { TaxEstimatorTool } from './TaxEstimatorTool';

toolRegistry.register(new QueryDataTool());
toolRegistry.register(new SubscriptionAlertsTool());
toolRegistry.register(new SpendingAnomaliesTool());
toolRegistry.register(new GenerateDocumentTool());
toolRegistry.register(new ProjectRunwayTool());
toolRegistry.register(new AuditAccessibilityTool());
toolRegistry.register(new UpdateTaxSettingsTool());
toolRegistry.register(new UpdateDeductionStatusTool());
toolRegistry.register(new CategorizeTransactionsTool());
toolRegistry.register(new DebtOptimizationTool());
toolRegistry.register(new CashFlowPredictorTool());
toolRegistry.register(new ScenarioForecastingTool());
toolRegistry.register(new GoalTrackerTool());
toolRegistry.register(new TaxEstimatorTool());
