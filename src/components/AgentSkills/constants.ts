export interface AgentToolInfo {
  name: string;
  label: string;
  desc: string;
  insertTemplate: string;
}

export const AGENT_TOOLS: AgentToolInfo[] = [
  {
    name: 'query_data',
    label: 'Query Database Aggregates',
    desc: 'Calculate financial aggregates (totals, averages, counts) over categories and accounts.',
    insertTemplate: '- Set the "action" to "query_data" in your agent_action response to retrieve math aggregates from the private database.'
  },
  {
    name: 'categorize_transactions',
    label: 'Auto-Categorization',
    desc: 'Auto-categorize uncategorized transactions using the local AI model.',
    insertTemplate: '- Set the "action" to "categorize_transactions" in your agent_action response to classify transaction records.'
  },
  {
    name: 'subscription_alerts',
    label: 'Subscription Auditing',
    desc: 'Scan recurring payments for price spikes, duplicate charges, or billing date anomalies.',
    insertTemplate: '- Set the "action" to "subscription_alerts" in your agent_action response to audit subscription records.'
  },
  {
    name: 'spending_anomalies',
    label: 'Anomalies Detector',
    desc: 'Identify transaction outliers or budget overrun spikes in spending category histories.',
    insertTemplate: '- Set the "action" to "spending_anomalies" in your agent_action response to highlight outliers for the user.'
  },
  {
    name: 'project_runway',
    label: 'Project Runway',
    desc: 'Calculate financial runway and cash projections.',
    insertTemplate: '- Set the "action" to "project_runway" in your agent_action JSON response to compute cash reserves and monthly outflow.'
  },
  {
    name: 'update_tax_settings',
    label: 'Update Tax Settings',
    desc: "Update the user's tax settings and form fields based on their chat input.",
    insertTemplate: '- Set the "action" to "update_tax_settings" in your agent_action response to edit tax details.'
  },
  {
    name: 'generate_document',
    label: 'Generate Document',
    desc: 'Save a generated document (P&L, Balance Sheet, General Ledger, or Expense Summary) to the file system.',
    insertTemplate: '- Set the "action" to "generate_document", specify "documentType" and write the markdown in "documentContent".'
  },
  {
    name: 'audit_accessibility',
    label: 'Accessibility Audit',
    desc: 'Audit DOM layout landmarks, WCAG heading skips, contrast issues, and ARIA labels.',
    insertTemplate: '- Set the "action" to "audit_accessibility" in your agent_action response to request an accessibility compliance report.'
  },
  {
    name: 'update_deduction_status',
    label: 'Update Deduction Status',
    desc: 'Update business status, Schedule C category, or deduction status of transactions in bulk.',
    insertTemplate: '- Set the "action" to "update_deduction_status", configure "isBusiness", "taxCategory", and deduction filters.'
  },
  {
    name: 'dom_update',
    label: 'DOM Element Clicks',
    desc: 'Execute interactive navigations and clicks via CSS selectors (e.g. #import-csv-btn).',
    insertTemplate: '- Set the "action" to "dom_update" and provide the target CSS selector in "domSelector" to click elements.'
  },
  {
    name: 'navigate',
    label: 'Page Navigation',
    desc: 'Direct the UI to navigate to a page (e.g. /, /budget, /settings, /import, /agent-skills).',
    insertTemplate: '- Set the "action" to "navigate" and specify "page" (e.g. "/budget") in your agent_action JSON response.'
  },
  {
    name: 'filter',
    label: 'Filter Transactions',
    desc: 'Filter transaction list by categories, preset, accounts or search query.',
    insertTemplate: '- Set the "action" to "filter" and specify "categories" (or "accounts", "preset", "search") in your agent_action JSON response.'
  },
  {
    name: 'none',
    label: 'No Operation (Default)',
    desc: 'Set when giving text-only responses, data tables, and math calculations without UI updates.',
    insertTemplate: '- Set the "action" to "none" in your agent_action JSON response to perform text analysis without trigger events.'
  }
];

export const GEN_UX_COMPONENTS = [
  {
    name: 'choices',
    label: 'Gen UX: Interactive Choices',
    desc: 'Render clickable buttons in the chat stream to guide scoping (e.g. YTD vs Last Month).',
    insertTemplate: '- Set "gen_ux" to {"type": "choices", "options": ["Choice A", "Choice B"]} to offer interactive buttons.'
  },
  {
    name: 'confirmation',
    label: 'Gen UX: Confirmation',
    desc: 'Ask the user to confirm a critical or destructive action (e.g., delete artifact).',
    insertTemplate: '- Set "gen_ux" to {"type": "confirmation", "options": []} to display confirm/cancel buttons.'
  },
  {
    name: 'form',
    label: 'Gen UX: Form Inputs',
    desc: 'Render multi-field inputs for complex user parameters or onboarding.',
    insertTemplate: '- Set "gen_ux" to {"type": "form", "options": []} to invoke structured input forms.'
  },
  {
    name: 'none_ux',
    label: 'Gen UX: None (Standard Text)',
    desc: 'Default for standard markdown text, tables, and normal chat conversations.',
    insertTemplate: '- Set "gen_ux" to {"type": "none", "options": []} when no interactive UI components are required.'
  }
];
