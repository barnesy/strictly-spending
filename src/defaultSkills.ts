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
  }
];
