export type Source = 'chase' | 'boa-credit' | 'boa-checking' | 'truist-checking' | 'demo' | 'custom';

export type AccountType = 'checking' | 'credit' | 'savings';

export type CategoryType = 'spend' | 'income' | 'transfer';

export interface Account {
  id?: number;
  name: string;
  type: AccountType;
  institution: string;
  last4?: string;
  source: Source;
  enabled: boolean;
  currentBalance?: number;
}

export interface Transaction {
  id?: number;
  accountId: number;
  date: string;
  description: string;
  amount: number;
  rawCategory?: string;
  category: string;
  source: Source;
  merchantKey: string;
  userOverridden: boolean;
  dedupKey: string;
  importBatchId?: number;
  recurrence: 'recurring' | 'onetime';
  recurrenceOverride?: 'recurring' | 'onetime' | null;
}

export interface CategoryRule {
  id?: number;
  pattern: string;
  category: string;
  priority: number;
  createdAt: string;
}

export interface Category {
  id?: number;
  name: string;
  color: string;
  type: CategoryType;
  sortOrder: number;
  defaultRecurrence?: 'recurring' | 'onetime';
}

export interface ImportBatch {
  id?: number;
  filename: string;
  source: Source;
  importedAt: string;
  rowCount: number;
  newCount: number;
  duplicateCount: number;
  /** SHA-256 of the file's raw text. Used by the watch-folder scanner to
   *  silently skip files it has already imported (filename-agnostic). */
  contentHash?: string;
}

/**
 * Generic key/value store for app settings (watch folder handle, prefs, etc.)
 * Values are arbitrary structured-clonable types.
 */
export interface AppSetting<T = unknown> {
  key: string;
  value: T;
}

export type PostImportAction = 'leave' | 'move' | 'delete';

export interface WatchFolderConfig {
  // FileSystemDirectoryHandle is structured-clonable; Dexie stores it as-is.
  handle: FileSystemDirectoryHandle;
  name: string;
  connectedAt: string;
  postImportAction: PostImportAction;
  autoImport: boolean;
}

export type RecurrenceKind = 'monthly' | 'biweekly' | 'weekly' | 'annual' | 'none';

export interface MerchantOverride {
  merchantKey: string;
  // null means "force one-time", undefined value not stored, a kind string forces that classification
  recurrence: RecurrenceKind;
}

export interface Budget {
  category: string; // primary key
  monthlyAmount: number;
  /** Updated whenever the user manually edits the amount (vs auto-seeded). */
  userSet: boolean;
}

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  rawCategory?: string;
  source: Source;
  accountName: string;
  accountType: AccountType;
  institution: string;
  last4?: string;
  balance?: number;
}

export interface WorkspaceBlock {
  id: string;
  type: 'insights' | 'chart' | 'actions' | 'simulator' | 'dataset';
  title: string;
  // insights
  summary?: string;
  color?: 'info' | 'success' | 'warning' | 'error' | 'primary';
  // chart
  chartCategories?: string[];
  chartMonths?: number;
  chartType?: 'historical' | 'forecast';
  chartVisualType?: 'bar' | 'line' | 'pie' | 'area';
  // actions
  actionItems?: { text: string; impact: string; completed?: boolean }[];
  // simulator
  simCategory?: string;
  simCurrentMonthly?: number;
  simTargetSavings?: number;
  simExplanation?: string;
  // dataset (searchable logs)
  querySearch?: string;
  queryLimit?: number;
  expanded?: boolean;
}

export interface WorkspaceConfig {
  id: string;
  name: string;
  blocks: WorkspaceBlock[];
  createdAt: string;
  timeRangeMonths?: number;
  disabledCategories?: string[];
}

export interface SkillTestCase {
  prompt: string;
  criteria: string;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  systemPromptExtension: string;
  enabled: boolean;
  isBuiltIn?: boolean;
  testCases?: SkillTestCase[];
}

export interface ChatArtifact {
  id: string;
  type: 'skill' | 'markdown' | 'spreadsheet';
  title: string;
  content: string;
  explanation?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbChatMessage {
  id?: number;
  threadId: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  actionResult?: any;
  createdAt: string;
  steps?: string[];
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  purpose?: 'tool_select' | 'explanation';
}

export interface CsvMapping {
  id?: number;
  name: string;
  headerHash: string;
  headers: string[];
  dateColumn: string;
  descriptionColumn: string;
  amountColumn?: string;
  debitColumn?: string;
  creditColumn?: string;
  balanceColumn?: string;
  accountName: string;
  accountType: AccountType;
  institution: string;
}

export interface ProposedCategorizationItem {
  transactionId: number;
  description: string;
  amount: number;
  date: string;
  originalCategory: string;
  proposedCategory: string;
  approved: boolean;
}

export interface ProposedCategorizationReport {
  id: string;
  createdAt: string;
  items: ProposedCategorizationItem[];
}


