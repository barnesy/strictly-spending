export interface AITool {
  name: string;
  description: string;
}

export const AVAILABLE_TOOLS: AITool[] = [
  {
    name: 'query_data',
    description: "Use this to fetch transactions, spending, category totals, budgets, or answer any questions about the user's spending data."
  },
  {
    name: 'categorize_transactions',
    description: 'Use this to auto-categorize uncategorized transactions using the local AI model.'
  },
  {
    name: 'subscription_alerts',
    description: 'Use this to scan recurring payments for duplicates, price spikes, or overlapping subscriptions.'
  },
  {
    name: 'spending_anomalies',
    description: "Use this to scan for outliers or category spending spikes. Do NOT use this to query spending totals or compare spending across periods (use 'query_data' for totals)."
  },
  {
    name: 'project_runway',
    description: 'Use this to check cash reserves, monthly outflow, and calculate months of runway.'
  },
  {
    name: 'update_tax_settings',
    description: "Use this to update the user's tax settings and form fields based on their chat input."
  },
  {
    name: 'generate_document',
    description: "Use this to save a generated document to the file system. Output the raw document text in 'documentContent', and specify the type of document in 'documentType'."
  },
  {
    name: 'audit_accessibility',
    description: 'Use this to audit the web app accessibility score.'
  },
  {
    name: 'update_deduction_status',
    description: 'Use this to update the business status (isBusiness), Schedule C category (taxCategory), or deduction status (deductionStatus) of transactions in bulk or for specific criteria (by account, category, merchant description, or transaction ID).'
  },
  {
    name: 'debt_optimization',
    description: 'Use this to analyze active loans and provide Snowflake and Avalanche payoff methods.'
  },
  {
    name: 'cashflow_prediction',
    description: 'Use this to calculate current Safe to Spend limits after subtracting upcoming recurring bills.'
  },
  {
    name: 'scenario_forecasting',
    description: 'Use this to adjust the budget and forecast the updated runway.'
  },
  {
    name: 'goal_tracking',
    description: 'Use this to project how many months it will take to hit a target savings goal.'
  },
  {
    name: 'tax_estimation',
    description: 'Use this to estimate self-employment 1099 tax burden based on business net income.'
  },
  {
    name: 'navigate',
    description: "Use this to navigate to a specific page (e.g. '/settings', '/budget'). Set 'page' to the route."
  },
  {
    name: 'filter',
    description: "Use this to apply filters and navigate to the dashboard. Use when the user asks to 'show me' specific categories, merchants, or time periods. Provide 'categories', 'preset', 'search', etc."
  },
  {
    name: 'none',
    description: "Use this for basic conversational chat and to write your final conversational answer in the 'body' field."
  }
];

export function getToolsXmlBlock(): string {
  const toolsList = AVAILABLE_TOOLS.map(t => `- ${t.name}: ${t.description}`).join('\n');
  return `<allowed_actions>\n${toolsList}\n</allowed_actions>`;
}
