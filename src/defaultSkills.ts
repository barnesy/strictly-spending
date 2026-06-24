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
    description: 'Queries financial accounts and generates a detailed Schedule C Business General Ledger.',
    systemPromptExtension: `- To generate a business General Ledger document:
  1. Stage 1: You MUST immediately set 'agent_action.action' to 'query_data' with 'categories' set to ["all"] and 'preset' set to "ytd". Fetch the raw transactions list to compile the ledger entries.
  2. Stage 2: Once data is returned, set 'agent_action.action' to 'generate_document', specify 'documentType' as "business_ledger", and write the General Ledger inside 'documentContent' as a structured markdown table.
- Set 'body' to a brief summary explaining you generated the General Ledger.`,
    enabled: true,
    isBuiltIn: true,
    stages: [
      { title: 'Query transactions', requiredAction: 'query_data' },
      { title: 'Generate General Ledger', requiredAction: 'generate_document' }
    ],
    testCases: [
      {
        prompt: "generate general ledger for tax",
        criteria: "Must call query_data in Stage 1, then generate_document in Stage 2 with documentType 'business_ledger'."
      }
    ]
  },
  {
    id: 'builtin:debt_optimizer',
    name: 'Debt Payoff Optimizer',
    description: 'Calculates the optimal debt payoff strategy using Snowball and Avalanche methods.',
    systemPromptExtension: `- To optimize debt payoff:
  1. Set 'agent_action.action' to 'debt_optimization'.
  2. The system will return a formatted message with total debt and both payoff methods.
  3. In your response, summarize the methods and ask the user which one they prefer.`,
    enabled: true,
    isBuiltIn: true,
    stages: [{ title: 'Optimize Debt', requiredAction: 'debt_optimization' }],
    testCases: [{ prompt: "What is the fastest way to pay off my debt?", criteria: "Must call debt_optimization action." }]
  },
  {
    id: 'builtin:cash_flow',
    name: 'Cash Flow Predictor',
    description: 'Calculates the Safe to Spend cash amount by subtracting upcoming recurring bills from liquid cash.',
    systemPromptExtension: `- To predict cash flow:
  1. Set 'agent_action.action' to 'cashflow_prediction'.
  2. The system will return current cash, upcoming bills, and Safe to Spend amount.
  3. Explain the Safe to Spend amount to the user.`,
    enabled: true,
    isBuiltIn: true,
    stages: [{ title: 'Predict Cash Flow', requiredAction: 'cashflow_prediction' }],
    testCases: [{ prompt: "Will I overdraft if I spend $500?", criteria: "Must call cashflow_prediction action." }]
  },
  {
    id: 'builtin:scenario_forecaster',
    name: 'Scenario Forecaster',
    description: 'Performs what-if forecasting by adjusting income or budget to see the impact on financial runway.',
    systemPromptExtension: `- To forecast a scenario:
  1. Parse the user's requested changes into 'incomeAdjustment' or 'budgetAdjustment' (e.g. if they say "what if I save $500 more", budgetAdjustment is -500).
  2. Set 'agent_action.action' to 'scenario_forecasting' with these parameters.
  3. Summarize the new runway in your response.`,
    enabled: true,
    isBuiltIn: true,
    stages: [{ title: 'Forecast Scenario', requiredAction: 'scenario_forecasting' }],
    testCases: [{ prompt: "What if my rent goes up by $300?", criteria: "Must call scenario_forecasting action." }]
  },
  {
    id: 'builtin:goal_tracker',
    name: 'Goal Tracker',
    description: 'Projects how many months it will take to reach a financial goal based on historical savings rates.',
    systemPromptExtension: `- To track a savings goal:
  1. Extract the target dollar amount.
  2. Set 'agent_action.action' to 'goal_tracking' with 'targetAmount'.
  3. The system will calculate the timeline. Summarize it for the user.`,
    enabled: true,
    isBuiltIn: true,
    stages: [{ title: 'Track Goal', requiredAction: 'goal_tracking' }],
    testCases: [{ prompt: "How long until I save $10000?", criteria: "Must call goal_tracking action." }]
  },
  {
    id: 'builtin:tax_estimator',
    name: 'Tax Estimator',
    description: 'Estimates 1099 self-employment tax burden based on business transactions and deductions.',
    systemPromptExtension: `- To estimate taxes:
  1. Set 'agent_action.action' to 'tax_estimation'.
  2. The system will return net business income and estimated tax burden.
  3. Explain the estimate to the user, reminding them it is just an estimate.`,
    enabled: true,
    isBuiltIn: true,
    stages: [{ title: 'Estimate Taxes', requiredAction: 'tax_estimation' }],
    testCases: [{ prompt: "How much will I owe in taxes?", criteria: "Must call tax_estimation action." }]
  }
];
