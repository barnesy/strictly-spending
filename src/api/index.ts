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
import type { AppSetting } from './settings';

export {
  accountSchema,
  transactionSchema,
  categorySchema,
  budgetSchema,
  loanSchema
};

export type { AppSetting };
export * from './types';

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
};
