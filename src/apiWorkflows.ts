export type WorkflowPhase = 'setup' | 'execution' | 'teardown';

export interface ApiWorkflowStep {
  endpoint: string;
  description: string;
  defaultArgs: string;
  phase: WorkflowPhase;
}

export interface ApiWorkflow {
  id: string;
  title: string;
  description: string;
  steps: ApiWorkflowStep[];
}

export const API_WORKFLOWS: ApiWorkflow[] = [
  {
    id: 'onboard_new_user',
    title: 'Onboard New User (Account & Transactions)',
    description: 'A standard workflow for adding a new financial account and populating it with initial transactions.',
    steps: [
      {
        endpoint: 'addAccount',
        description: 'Create a new checking or credit account.',
        defaultArgs: '[\n  {\n    "name": "My New Checking",\n    "type": "checking",\n    "institution": "Chase",\n    "source": "playground_test",\n    "enabled": true\n  }\n]',
        phase: 'setup'
      },
      {
        endpoint: 'getAccounts',
        description: 'Verify the account was created and retrieve its assigned ID to use in the next step.',
        defaultArgs: '[]',
        phase: 'execution'
      },
      {
        endpoint: 'addTransaction',
        description: 'Add an initial transaction to the newly created account. Replace accountId with the ID from the previous step.',
        defaultArgs: '[\n  {\n    "accountId": 99999,\n    "date": "2024-06-15",\n    "description": "Initial Deposit",\n    "amount": 1000.00,\n    "category": "Income",\n    "source": "playground_test",\n    "merchantKey": "Deposit",\n    "userOverridden": true,\n    "dedupKey": "deposit_123",\n    "recurrence": "onetime"\n  }\n]',
        phase: 'execution'
      },
      {
        endpoint: 'getTransactions',
        description: 'Verify the transactions for the new account (pass the accountId retrieved from getAccounts).',
        defaultArgs: '[\n  "2024-01-01",\n  "2024-12-31",\n  { "accountId": 99999 }\n]',
        phase: 'execution'
      },
      {
        endpoint: 'deleteAccount',
        description: 'Clean up test data by deleting the account created during setup. Replace the ID with the one retrieved earlier.',
        defaultArgs: '[\n  99999\n]',
        phase: 'teardown'
      }
    ]
  },
  {
    id: 'update_tax_settings',
    title: 'Update Business Tax Deductions',
    description: 'Modifies the user\'s tax settings and applies new rules to specific transactions.',
    steps: [
      {
        endpoint: 'getSettings',
        description: 'Retrieve the current app:testTaxSettings object to inspect existing deductions (Setup: Backup existing state).',
        defaultArgs: '[\n  "app:testTaxSettings"\n]',
        phase: 'setup'
      },
      {
        endpoint: 'updateSetting',
        description: 'Update the app:testTaxSettings object with a new deduction value.',
        defaultArgs: '[\n  "app:testTaxSettings",\n  {\n    "businessDeductions": {\n      "general": {\n        "software": 500\n      }\n    }\n  }\n]',
        phase: 'execution'
      },
      {
        endpoint: 'getSettings',
        description: 'Verify the deduction value was successfully updated in the database.',
        defaultArgs: '[\n  "app:testTaxSettings"\n]',
        phase: 'execution'
      },
      {
        endpoint: 'updateSetting',
        description: 'Restore the original app:testTaxSettings object that was backed up in the setup phase.',
        defaultArgs: '[\n  "app:testTaxSettings",\n  {}\n]',
        phase: 'teardown'
      }
    ]
  },
  {
    id: 'generate_budget_report',
    title: 'Generate Budget Report Artifact',
    description: 'Queries budget data and generates a markdown artifact to display to the user.',
    steps: [
      {
        endpoint: 'getBudgets',
        description: 'Retrieve all configured budgets.',
        defaultArgs: '[]',
        phase: 'execution'
      },
      {
        endpoint: 'getDashboardAggregates',
        description: 'Retrieve actual spend data to compare against budgets.',
        defaultArgs: '[\n  { "demoMode": false }\n]',
        phase: 'execution'
      },
      {
        endpoint: 'putArtifact',
        description: 'Create a markdown artifact containing the budget report.',
        defaultArgs: '[\n  {\n    "id": "budget_report_1",\n    "type": "markdown",\n    "title": "Monthly Budget Report",\n    "content": "# Budget Report\\n\\nYou are under budget by $500 this month.",\n    "createdAt": "2024-01-01T00:00:00.000Z",\n    "updatedAt": "2024-01-01T00:00:00.000Z"\n  }\n]',
        phase: 'execution'
      },
      {
        endpoint: 'getArtifacts',
        description: 'Verify the budget report artifact was saved.',
        defaultArgs: '[]',
        phase: 'execution'
      },
      {
        endpoint: 'deleteArtifact',
        description: 'Delete the test budget report artifact.',
        defaultArgs: '[\n  "budget_report_1"\n]',
        phase: 'teardown'
      }
    ]
  },
  {
    id: 'end_of_month_review',
    title: 'End-of-Month Review Playbook',
    description: 'An AI Copilot playbook for conducting an end-of-month financial review, finding anomalies, and generating a report.',
    steps: [
      {
        endpoint: 'query_data',
        description: 'First, retrieve aggregate data for the last month to understand high-level spending patterns.',
        defaultArgs: '[\n  { "preset": "lastMonth" }\n]',
        phase: 'execution'
      },
      {
        endpoint: 'spending_anomalies',
        description: 'Next, scan for spending outliers and high-growth categories within that same period.',
        defaultArgs: '[]',
        phase: 'execution'
      },
      {
        endpoint: 'create_artifact',
        description: 'Finally, synthesize the queried data and anomalies into a comprehensive markdown report for the user.',
        defaultArgs: '[\n  {\n    "title": "End of Month Review",\n    "type": "markdown",\n    "content": "# End of Month Review\\n..."\n  }\n]',
        phase: 'execution'
      }
    ]
  },
  {
    id: 'subscription_audit',
    title: 'Subscription Audit Playbook',
    description: 'An AI Copilot playbook to help users identify, review, and manage their recurring subscriptions.',
    steps: [
      {
        endpoint: 'subscription_alerts',
        description: 'Run the subscription scanner to detect price spikes, duplicates, or overlapping subscriptions.',
        defaultArgs: '[]',
        phase: 'execution'
      },
      {
        endpoint: 'filter_ui',
        description: 'Update the dashboard view to show the user the specific transactions flagged in the audit.',
        defaultArgs: '[\n  { "categories": ["Subscriptions"] }\n]',
        phase: 'execution'
      }
    ]
  },
  {
    id: 'categorization_triage',
    title: 'Categorization Triage Playbook',
    description: 'An AI Copilot playbook for automatically categorizing uncategorized transactions and guiding the user to review them.',
    steps: [
      {
        endpoint: 'categorize_transactions',
        description: 'Invoke the local AI model to propose categories for all currently uncategorized transactions.',
        defaultArgs: '[]',
        phase: 'execution'
      },
      {
        endpoint: 'navigate',
        description: "Navigate the user to the /sort view where they can quickly review, approve, or override the AI's suggestions.",
        defaultArgs: '[\n  { "page": "/sort" }\n]',
        phase: 'execution'
      }
    ]
  },
  {
    id: 'generate_tax_document',
    title: 'Generate Tax Document Playbook',
    description: 'An AI Copilot playbook for generating tax documents like Profit & Loss statements, general ledgers, or expense summaries without unnecessarily querying settings.',
    steps: [
      {
        endpoint: 'compile_tax_document',
        description: 'Invoke the compile_tax_document tool to directly generate the requested tax document. If the user does not specify a year, default to the most recently completed calendar year (e.g. last year). Do NOT attempt to query tax settings first, as the compile_tax_document tool automatically falls back to reasonable defaults.',
        defaultArgs: '[\n  { "documentType": "business_pnl", "taxYear": 2024 }\n]',
        phase: 'execution'
      }
    ]
  }
];
