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
  isBusiness?: boolean;
  taxCategory?: string;
  deductionStatus?: 'pending' | 'confirmed' | 'rejected';
}

export interface CategoryRule {
  id?: number;
  pattern: string;
  category: string;
  priority: number;
  createdAt: string;
}

export interface TaxRule {
  id?: number;
  pattern: string;
  isBusiness: boolean;
  taxCategory?: string;
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
export type AppSetting =
  | { key: 'watchFolder'; value: WatchFolderConfig }
  | { key: 'license'; value: { active: boolean; key: string; activatedAt?: string } }
  | { key: 'chatCollapse'; value: boolean }
  | { key: 'app:agentSkills'; value: AgentSkill[] }
  | { key: 'app:baselineTestCases'; value: SkillTestCase[] }
  | { key: 'app:systemPrompt'; value: string }
  | { key: 'app:systemPromptVersion'; value: number }
  | { key: 'app:aiGuessScore'; value: { correctCount: number; totalCount: number } }
  | { key: 'app:workspaces'; value: WorkspaceConfig[] }
  | { key: 'app:pendingCategorizationReport'; value: ProposedCategorizationReport }
  | {
      key: 'themeConfig';
      value: {
        mode: 'light' | 'dark';
        primaryColor: string;
        secondaryColor: string;
        backgroundColor?: string;
        paperColor?: string;
        textColor?: string;
        borderRadius?: number;
        fontFamily?: string;
        fontSize?: number;
        paletteName?: string;
      };
    }
  | { key: 'app:taxSettings'; value: TaxSettings }
  | { key: 'app:loan:house'; value: any }
  | { key: 'app:loan:car'; value: any };

export type PostImportAction = 'leave' | 'move' | 'delete';

export interface WatchFolderConfig {
  /**
   * The saved directory handle.
   * FileSystemDirectoryHandle is structured-clonable; IndexedDB stores it as-is.
   */
  handle: FileSystemDirectoryHandle;
  name: string;
  connectedAt: string;
  postImportAction: PostImportAction;
  autoImport: boolean;
}

export interface TaxSettings {
  // Business Basics & Financials
  businessIdentity?: {
    dba?: string;
    address?: string;
    einSsn?: string;
  };
  businessFinancials?: {
    hasPnl?: boolean;
    hasBalanceSheet?: boolean;
    hasGeneralLedger?: boolean;
  };

  // Business Income & Tax Forms
  businessIncome?: {
    forms1099Total?: number;
    grossSales?: number;
    otherIncome?: number;
  };

  // Business Deductions & Expense Details
  businessDeductions?: {
    general?: {
      advertising?: number;
      software?: number;
      professionalFees?: number;
      insurance?: number;
      officeSupplies?: number;
      utilities?: number;
      travel?: number;
    };
    vehicle?: {
      businessMiles?: number;
      personalMiles?: number;
      datePlacedInService?: string;
      actualExpenses?: number;
    };
    homeOffice?: {
      sqFtOffice?: number;
      sqFtHome?: number;
      rent?: number;
      propertyTax?: number;
      insurance?: number;
      utilities?: number;
    };
    assetPurchases?: number;
    contractorsAndPayroll?: {
      w2W3Total?: number;
      forms1099Issued?: number;
    };
  };

  // Personal Tax Information
  personalInfo?: {
    filingStatus?: 'single' | 'married_joint' | 'married_separate' | 'head_household';
    dependents?: number;
    hasPriorYearReturn?: boolean;
    w2Income?: number;
    w2Withheld?: number;
    investment1099s?: number;
    k1s?: number;
    deductions?: {
      iraContributions?: number;
      healthInsurance?: number;
      charitableDonations?: number;
      studentLoanInterest?: number;
    };
  };

  // Tax Payments Already Made
  taxPayments?: {
    estimatedPayments?: number;
    stateLocalFees?: number;
  };

  // Shared / Top Level
  hasBusiness: boolean;
  taxYear: number;
  checklist: Record<string, boolean>;
  uploadedDocuments?: Record<string, { filename: string; type: string; uploadedAt: string }>;
  accountDefaults?: Record<string, string>;
  categoryDefaults?: Record<string, string>;
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

export interface AgentSkillStage {
  id?: string;
  title: string;
  requiredAction: string;
  systemPromptExtension?: string;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  systemPromptExtension: string;
  enabled: boolean;
  isBuiltIn?: boolean;
  isModified?: boolean;
  testCases?: SkillTestCase[];
  stages?: AgentSkillStage[];
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

export interface AppDocument {
  id: string;
  name: string;
  path: string;
  type: string;
  source: 'generated' | 'uploaded';
  associatedChecklistId?: string;
  content?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface DbChatMessage {
  id?: number;
  threadId: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  actionResult?: Record<string, unknown>;
  createdAt: string;
  activeSkillId?: string;
  completedStages?: string[];
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

export interface Loan {
  id?: number;
  name: string;
  type: 'house' | 'car' | 'student';
  principal: number;
  rate: number;
  termYears: number;
  startDate: string;
  category: string;
  merchant?: string;
  monthlyPayment?: number;
  propertyValue?: number;
  downPayment?: number;
  extraMonthlyPayment?: number;
  extraOneTimePayment?: number;
  extraOneTimeMonth?: number;
  createdAt: string;
  enabled?: boolean;
}


