import type { AgentSkill } from './types';

export const DEFAULT_SKILLS: AgentSkill[] = [
  {
    id: 'builtin:runway',
    name: 'Financial Runway & Cash Projection',
    description: 'Uses the project_runway tool to calculate budget runway based on cash reserves, CC debt, and monthly outflow.',
    systemPromptExtension: `- When asked about financial runway, cash rundown, or CC debt:
  1. Stage 1: You MUST set 'agent_action.action' to 'project_runway'. Do NOT perform calculations or output tables in the body during Stage 1.
  2. Stage 2: Once the runway metrics are returned, output the starting cash reserves, monthly outflow, and runway months in a clean markdown table.
  3. If the user asks for a simulation (e.g. "What if I get $30k more cash?"), adjust the returned base numbers mathematically.`,
    enabled: true,
    isBuiltIn: true,
    stages: [
      { title: 'Project Runway', requiredAction: 'project_runway' }
    ],
    testCases: [
      {
        prompt: "How much runway do I have?",
        criteria: "Must call the project_runway action in Stage 1, and in Stage 2 format the runway metrics in a markdown table."
      },
      {
        prompt: "If I get 30k of income how much runway would I have if I raise the budget by $1000/month",
        criteria: "Must call project_runway in Stage 1, and in Stage 2 mathematically adjust the provided numbers in a markdown table (e.g. 20 months)."
      }
    ]
  },
  {
    id: 'builtin:categorization',
    name: 'Manual Transaction Categorization',
    description: 'Uses local AI to auto-categorize uncategorized transactions chunk-by-chunk.',
    systemPromptExtension: `- When asked to auto-categorize, sort, organize, classify, or run AI review/categorization on remaining, new, or uncategorized transactions (e.g. phrases like "auto-categorize", "auto categorize", "AI categorize", "sort transactions using AI", "classify remaining transactions", "run categorization"):
  1. Stage 1: You MUST set 'agent_action.action' to 'categorize_transactions'. Do NOT explain results, suggest rules, or do math in the body field during Stage 1.
  2. Stage 2: Once the database updates are completed and the system returns the count of processed transactions, summarize the categorization results clearly in the body. Cite the exact count of categorized transactions.`,
    enabled: true,
    isBuiltIn: true,
    stages: [
      { title: 'Categorize Transactions', requiredAction: 'categorize_transactions' }
    ],
    testCases: [
      {
        prompt: "AI categorize remaining transactions",
        criteria: "Must call the categorize_transactions action in Stage 1."
      },
      {
        prompt: "please auto-categorize all uncategorized items",
        criteria: "Must call categorize_transactions to initiate the AI review."
      }
    ]
  },
  {
    id: 'builtin:pnl',
    name: 'Generate Profit & Loss Statement',
    description: 'Queries financial data and generates a business Profit and Loss statement, saving it to the Documents tab.',
    systemPromptExtension: `- To generate a business Profit and Loss (P&L) document, you must follow a multi-step sequence:
  1. Stage 1: You MUST immediately set 'agent_action.action' to 'query_data' with 'categories' set to ["all"] and 'preset' set to "ytd". This is required to fetch the raw transaction data. Do NOT generate the document content in Stage 1.
  2. Stage 2: Once the database query results are returned, you MUST set 'agent_action.action' to 'generate_document', specify 'documentType' as "business_pnl", and write the Profit and Loss statement in 'documentContent' based on the queried data.

In Stage 2, you MUST write the Profit and Loss document in 'documentContent' and a short conversational explanation in 'body'.
- Set 'body' to a brief summary message, e.g.: "I have successfully generated your Profit & Loss statement YTD. It has been saved to the Documents tab."
- Write the actual Profit & Loss document inside 'agent_action.documentContent'. Make the document concise. DO NOT repeat sections. STOP generating once you summarize. Do NOT write the document in 'body'.
- Do NOT start 'agent_action.documentContent' with a '{' or as a JSON object. Start it directly with the markdown heading: "# Profit & Loss Statement".

The markdown content of the P&L document in 'documentContent' MUST be structured exactly as a markdown table with an appendix containing the transaction math computation details:
# Profit & Loss Statement (YTD)
**Period:** [Start Date] to [End Date] (from the query results)
**Basis:** Cash

| Line Item / Category | Amount |
| :--- | ---: |
| **REVENUE** | |
| Income | $[Income Amount] |
| **Total Revenue** | **$[Income Amount]** |
| | |
| **OPERATING EXPENSES** | |
| [Category Name] | $[Category Amount] |
...
| **Total Operating Expenses** | **$[Total Spent Amount]** |
| | |
| **NET SUMMARY** | |
| **Net Income** | **$[Net Income Amount]** |

---
## Transaction Computation Details
This appendix contains all associated transactions that make up the computation of the summary numbers above. Group the transactions under their respective category with headers displaying the total (e.g. "### Category: [Category Name] (Total: $[Total Category Sum])").
For each category, list the transactions in a table:
| Date | Description | Original Amount | Computation Value |
| :--- | :--- | ---: | ---: |
| [Date] | [Merchant Description] | $[Original Amt] | $[Comp Value] |`,
    enabled: true,
    isBuiltIn: true,
    stages: [
      { title: 'Query Data', requiredAction: 'query_data' },
      { title: 'Generate Document', requiredAction: 'generate_document' }
    ],
    testCases: [
      {
        prompt: "generate business P&L",
        criteria: "Must call the query_data action in Stage 1 with categories set to ['all'] and preset set to 'ytd'."
      },
      {
        prompt: "help me create a P&L for my business",
        criteria: "Must call query_data in Stage 1, then generate_document in Stage 2 with documentType 'business_pnl'."
      }
    ]
  },
  {
    id: 'builtin:balance_sheet',
    name: 'Generate Balance Sheet',
    description: 'Queries asset, liability, and equity accounts to generate a business Balance Sheet.',
    systemPromptExtension: `- To generate a business Balance Sheet document:
  1. Stage 1: You MUST immediately set 'agent_action.action' to 'query_data' with 'categories' set to ["all"] and 'preset' set to "ytd". Fetch the raw transaction history to compute bank/account asset balances.
  2. Stage 2: Once data is returned, set 'agent_action.action' to 'generate_document', specify 'documentType' as "business_balance_sheet", and write the Balance Sheet inside 'documentContent' as a beautiful markdown table.
- Set 'body' to a brief summary explaining you generated the Balance Sheet.`,
    enabled: true,
    isBuiltIn: true,
    stages: [
      { title: 'Query balances', requiredAction: 'query_data' },
      { title: 'Generate Balance Sheet', requiredAction: 'generate_document' }
    ],
    testCases: [
      {
        prompt: "create a balance sheet for my LLC",
        criteria: "Must call query_data in Stage 1, then generate_document in Stage 2 with documentType 'business_balance_sheet'."
      }
    ]
  },
  {
    id: 'builtin:ledger',
    name: 'Generate General Ledger',
    description: 'Generates a chronological report of all transactions for tax auditing.',
    systemPromptExtension: `- To generate a General Ledger statement:
  1. Stage 1: You MUST immediately set 'agent_action.action' to 'query_data' with 'categories' set to ["all"] and 'preset' set to "ytd".
  2. Stage 2: Set 'agent_action.action' to 'generate_document', specify 'documentType' as "business_ledger", and format the transactions chronologically as a markdown table in 'documentContent'.`,
    enabled: true,
    isBuiltIn: true,
    stages: [
      { title: 'Query transactions', requiredAction: 'query_data' },
      { title: 'Generate Ledger', requiredAction: 'generate_document' }
    ],
    testCases: [
      {
        prompt: "make a general ledger for this year",
        criteria: "Must call query_data in Stage 1, then generate_document in Stage 2 with documentType 'business_ledger'."
      }
    ]
  },
  {
    id: 'builtin:expense_summary',
    name: 'Generate Expense Summary',
    description: 'Generates a detailed summary of business expenses grouped by standard spend and Schedule C category.',
    systemPromptExtension: `- To generate a business Expense Summary:
  1. Stage 1: You MUST immediately set 'agent_action.action' to 'query_data' with 'categories' set to ["all"] and 'preset' set to "ytd".
  2. Stage 2: Set 'agent_action.action' to 'generate_document', specify 'documentType' as "deduction_expense_summary", and format the summary of expenses grouped by category in 'documentContent'.`,
    enabled: true,
    isBuiltIn: true,
    stages: [
      { title: 'Query transactions', requiredAction: 'query_data' },
      { title: 'Generate Expense Summary', requiredAction: 'generate_document' }
    ],
    testCases: [
      {
        prompt: "generate an expense summary",
        criteria: "Must call query_data in Stage 1, then generate_document in Stage 2 with documentType 'deduction_expense_summary'."
      }
    ]
  },
  {
    id: 'builtin:mileage_log',
    name: 'Generate Mileage Log',
    description: 'Compiles a travel and mileage log from vehicle and business trip transactions.',
    systemPromptExtension: `- To generate a Mileage Log:
  1. Stage 1: You MUST set 'agent_action.action' to 'query_data' with 'categories' set to ["all"] and 'preset' set to "ytd" (or filter for Car & Truck / Travel).
  2. Stage 2: Set 'agent_action.action' to 'generate_document', specify 'documentType' as "deduction_mileage_log", and format the business travel logs as a markdown table in 'documentContent'.`,
    enabled: true,
    isBuiltIn: true,
    stages: [
      { title: 'Query travel data', requiredAction: 'query_data' },
      { title: 'Generate Mileage Log', requiredAction: 'generate_document' }
    ],
    testCases: [
      {
        prompt: "compile a mileage log",
        criteria: "Must call query_data in Stage 1, then generate_document in Stage 2 with documentType 'deduction_mileage_log'."
      }
    ]
  },
  {
    id: 'builtin:assets',
    name: 'Generate Asset & Depreciation Log',
    description: 'Creates a log of high-value purchases and equipment depreciations.',
    systemPromptExtension: `- To generate an Asset & Depreciation Log:
  1. Stage 1: You MUST set 'agent_action.action' to 'query_data' with 'categories' set to ["all"] and 'preset' set to "ytd".
  2. Stage 2: Set 'agent_action.action' to 'generate_document', specify 'documentType' as "deduction_assets", and format the assets and equipment list as a table in 'documentContent'.`,
    enabled: true,
    isBuiltIn: true,
    stages: [
      { title: 'Query equipment transactions', requiredAction: 'query_data' },
      { title: 'Generate Asset Log', requiredAction: 'generate_document' }
    ],
    testCases: [
      {
        prompt: "generate asset purchases log",
        criteria: "Must call query_data in Stage 1, then generate_document in Stage 2 with documentType 'deduction_assets'."
      }
    ]
  },
  {
    id: 'builtin:payments_estimated',
    name: 'Generate Estimated Tax Payments Voucher',
    description: 'Calculates business earnings and builds an Estimated Tax Payments reference voucher (1040-ES).',
    systemPromptExtension: `- To generate an Estimated Tax Payments (1040-ES) reference voucher:
  1. Stage 1: You MUST set 'agent_action.action' to 'query_data' with 'categories' set to ["all"] and 'preset' set to "ytd" to analyze net profit/loss.
  2. Stage 2: Set 'agent_action.action' to 'generate_document', specify 'documentType' as "payments_estimated", and calculate self-employment estimated tax payments, formatting the voucher in 'documentContent'.`,
    enabled: true,
    isBuiltIn: true,
    stages: [
      { title: 'Query earnings data', requiredAction: 'query_data' },
      { title: 'Generate Estimated Tax Voucher', requiredAction: 'generate_document' }
    ],
    testCases: [
      {
        prompt: "create estimated tax payments voucher",
        criteria: "Must call query_data in Stage 1, then generate_document in Stage 2 with documentType 'payments_estimated'."
      }
    ]
  },
  {
    id: 'builtin:w2_w3',
    name: 'Generate W-2/W-3 Employee Payroll Summary',
    description: 'Compiles employee wage payments and withholding transactions.',
    systemPromptExtension: `- To generate a W-2/W-3 Employee Payroll Summary:
  1. Stage 1: You MUST set 'agent_action.action' to 'query_data' with 'categories' set to ["all"] and 'preset' set to "ytd".
  2. Stage 2: Set 'agent_action.action' to 'generate_document', specify 'documentType' as "deduction_w2_w3", and format the employee payroll wages and deductions in 'documentContent'.`,
    enabled: true,
    isBuiltIn: true,
    stages: [
      { title: 'Query payroll transactions', requiredAction: 'query_data' },
      { title: 'Generate W-2/W-3 Summary', requiredAction: 'generate_document' }
    ],
    testCases: [
      {
        prompt: "create W-2 employee summary",
        criteria: "Must call query_data in Stage 1, then generate_document in Stage 2 with documentType 'deduction_w2_w3'."
      }
    ]
  },
  {
    id: 'builtin:1099_issued',
    name: 'Generate 1099-NEC Issued Log',
    description: 'Queries independent contractor payments exceeding $600 to compile a 1099-NEC filing log.',
    systemPromptExtension: `- To generate a 1099-NEC Issued Log:
  1. Stage 1: You MUST set 'agent_action.action' to 'query_data' with 'categories' set to ["all"] and 'preset' set to "ytd" (or filter for contractLabor).
  2. Stage 2: Set 'agent_action.action' to 'generate_document', specify 'documentType' as "deduction_1099_issued", and format independent contractors who were paid over $600 in 'documentContent'.`,
    enabled: true,
    isBuiltIn: true,
    stages: [
      { title: 'Query contractor payments', requiredAction: 'query_data' },
      { title: 'Generate 1099 Issued Log', requiredAction: 'generate_document' }
    ],
    testCases: [
      {
        prompt: "generate 1099-NEC issued log",
        criteria: "Must call query_data in Stage 1, then generate_document in Stage 2 with documentType 'deduction_1099_issued'."
      }
    ]
  }
];
