import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').notNull(),
  date: text('date').notNull(),
  description: text('description').notNull(),
  amount: real('amount').notNull(),
  rawCategory: text('raw_category'),
  category: text('category').notNull(),
  source: text('source').$type<import('../types').Source>().notNull(),
  merchantKey: text('merchant_key').notNull(),
  userOverridden: integer('user_overridden', { mode: 'boolean' }).notNull().default(false),
  dedupKey: text('dedup_key').notNull().unique(),
  importBatchId: integer('import_batch_id'),
  recurrence: text('recurrence').$type<'recurring' | 'onetime'>().notNull(),
  recurrenceOverride: text('recurrence_override').$type<'recurring' | 'onetime' | null>(),
  isBusiness: integer('is_business', { mode: 'boolean' }),
  taxCategory: text('tax_category'),
  deductionStatus: text('deduction_status').$type<'pending' | 'confirmed' | 'rejected' | null>(),
});

export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  type: text('type').$type<any>().notNull(),
  institution: text('institution').notNull(),
  last4: text('last4'),
  source: text('source').$type<import('../types').Source>().notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  currentBalance: real('current_balance'),
});

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  color: text('color').notNull(),
  type: text('type').$type<any>().notNull(),
  sortOrder: integer('sort_order').notNull(),
  defaultRecurrence: text('default_recurrence').$type<'recurring' | 'onetime' | null>(),
});

export const merchantOverrides = sqliteTable('merchant_overrides', {
  merchantKey: text('merchant_key').primaryKey(),
  recurrence: text('recurrence').$type<import('../types').RecurrenceKind>().notNull(),
});

export const budgets = sqliteTable('budgets', {
  category: text('category').primaryKey(),
  monthlyAmount: real('monthly_amount').notNull(),
  userSet: integer('user_set', { mode: 'boolean' }).notNull().default(false),
});

export const rules = sqliteTable('rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pattern: text('pattern').notNull().unique(),
  category: text('category').notNull(),
  priority: integer('priority').notNull(),
  createdAt: text('created_at').notNull(),
});

export const taxRules = sqliteTable('tax_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pattern: text('pattern').notNull().unique(),
  isBusiness: integer('is_business', { mode: 'boolean' }).notNull(),
  taxCategory: text('tax_category'),
  priority: integer('priority').notNull(),
  createdAt: text('created_at').notNull(),
});

export const imports = sqliteTable('imports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  filename: text('filename').notNull(),
  source: text('source').$type<import('../types').Source>().notNull(),
  importedAt: text('imported_at').notNull(),
  rowCount: integer('row_count').notNull(),
  newCount: integer('new_count').notNull(),
  duplicateCount: integer('duplicate_count').notNull(),
  contentHash: text('content_hash'),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
});

export const artifacts = sqliteTable('artifacts', {
  id: text('id').primaryKey(),
  type: text('type').$type<any>().notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  explanation: text('explanation'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const threads = sqliteTable('threads', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  threadId: text('thread_id').notNull(),
  role: text('role').$type<'system' | 'user' | 'assistant'>().notNull(),
  content: text('content').notNull(),
  actionResult: text('action_result', { mode: 'json' }),
  createdAt: text('created_at').notNull(),
  activeSkillId: text('active_skill_id'),
  completedStages: text('completed_stages', { mode: 'json' }),
  steps: text('steps', { mode: 'json' }),
  tokenUsage: text('token_usage', { mode: 'json' }),
  purpose: text('purpose').$type<'tool_select' | 'explanation' | null>(),
});

export const csvMappings = sqliteTable('csv_mappings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  headerHash: text('header_hash').notNull(),
  headers: text('headers', { mode: 'json' }).notNull(),
  dateColumn: text('date_column').notNull(),
  descriptionColumn: text('description_column').notNull(),
  amountColumn: text('amount_column'),
  debitColumn: text('debit_column'),
  creditColumn: text('credit_column'),
  balanceColumn: text('balance_column'),
  accountName: text('account_name').notNull(),
  accountType: text('account_type').notNull(),
  institution: text('institution').notNull(),
});

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull(),
  type: text('type').$type<any>().notNull(),
  source: text('source').$type<'generated' | 'uploaded'>().notNull(),
  associatedChecklistId: text('associated_checklist_id'),
  createdAt: text('created_at').notNull(),
  metadata: text('metadata', { mode: 'json' }),
});

export const documentContents = sqliteTable('document_contents', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
});

export const loans = sqliteTable('loans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type').$type<any>().notNull(),
  principal: real('principal').notNull(),
  rate: real('rate').notNull(),
  termYears: integer('term_years').notNull(),
  startDate: text('start_date').notNull(),
  category: text('category').notNull(),
  merchant: text('merchant'),
  monthlyPayment: real('monthly_payment'),
  propertyValue: real('property_value'),
  downPayment: real('down_payment'),
  extraMonthlyPayment: real('extra_monthly_payment'),
  extraOneTimePayment: real('extra_one_time_payment'),
  extraOneTimeMonth: integer('extra_one_time_month'),
  createdAt: text('created_at').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
});
