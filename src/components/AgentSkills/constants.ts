export interface AgentToolInfo {
  name: string;
  label: string;
  desc: string;
  insertTemplate: string;
}

export const AGENT_TOOLS: AgentToolInfo[] = [
  {
    name: 'filter',
    label: 'Filter Transactions',
    desc: 'Filter transaction list by categories, preset, accounts or search query.',
    insertTemplate: '- Set the "action" to "filter" and specify "categories" (or "accounts", "preset", "search") in your agent_action JSON response.'
  },
  {
    name: 'query_data',
    label: 'Query Database Aggregates',
    desc: 'Calculate financial aggregates (totals, averages, counts) over categories and accounts.',
    insertTemplate: '- Set the "action" to "query_data" in your agent_action response to retrieve math aggregates from the private database.'
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
    name: 'create_artifact',
    label: 'Create Artifact',
    desc: 'Draft and display system prompts, spreadsheet tables, or reports as standalone cards.',
    insertTemplate: '- Set the "action" to "create_artifact" and "type" to "skill" | "markdown" | "spreadsheet" along with "title" and "content".'
  },
  {
    name: 'update_artifact',
    label: 'Update Artifact',
    desc: 'Modify the content, title, or type of an active artifact displayed in the panel.',
    insertTemplate: '- Set the "action" to "update_artifact" and specify the artifact "id" along with the updated "content".'
  },
  {
    name: 'audit_accessibility',
    label: 'Accessibility Audit',
    desc: 'Audit DOM layout landmarks, WCAG heading skips, contrast issues, and ARIA labels.',
    insertTemplate: '- Set the "action" to "audit_accessibility" in your agent_action response to request an accessibility compliance report.'
  },
  {
    name: 'project_runway',
    label: 'Project Runway',
    desc: 'Calculate financial runway and cash projections.',
    insertTemplate: '- Set the "action" to "project_runway" in your agent_action JSON response to compute cash reserves and monthly outflow.'
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
