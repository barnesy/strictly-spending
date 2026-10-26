import { accountsApi, accountSchema } from './accounts';
import { transactionsApi, transactionSchema, merchantOverridesApi } from './transactions';
import { categoriesApi, rulesApi, categorySchema } from './categories';
import { budgetsApi, budgetSchema } from './budgets';
import { settingsApi } from './settings';
import { importsApi } from './imports';
import { csvMappingsApi } from './csvMappings';
import { taxApi } from './tax';
import { loansApi, loanSchema } from './loans';
import { chatApi } from './chat';
import { scenariosApi, scenarioSchema, goalSchema } from './scenarios';
import { forecastApi } from './forecast';
import { simplefinApi } from './simplefin';
import type { AppSetting, McpServerInfo } from './settings';

export {
  accountSchema,
  transactionSchema,
  categorySchema,
  budgetSchema,
  loanSchema,
  scenarioSchema,
  goalSchema,
  scenariosApi,
  forecastApi,
};

export type { AppSetting, McpServerInfo };
export * from './types';
export * from './forecast';
export * from './simplefin';

export const api = {
  ...accountsApi,
  ...transactionsApi,
  ...categoriesApi,
  ...rulesApi,
  ...budgetsApi,
  ...settingsApi,
  ...importsApi,
  ...merchantOverridesApi,
  ...csvMappingsApi,
  ...taxApi,
  ...loansApi,
  ...chatApi,
  ...forecastApi,
  ...simplefinApi,
  scenariosApi,
};
