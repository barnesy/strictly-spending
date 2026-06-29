export type WorkflowPhase = 'setup' | 'execution' | 'teardown';

export interface ApiWorkflowStep {
  endpoint: string;
  description: string;
  defaultArgs: any[];
  phase: WorkflowPhase;
}

export interface ApiWorkflow {
  id: string;
  title: string;
  description: string;
  guards?: string[];
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
        defaultArgs: [
          {
            name: "My New Checking",
            type: "checking",
            institution: "Chase",
            source: "playground_test",
            enabled: true
          }
        ],
        phase: 'setup'
      },
      {
        endpoint: 'getAccounts',
        description: 'Verify the account was created and retrieve its assigned ID to use in the next step.',
        defaultArgs: [],
        phase: 'execution'
      },
      {
        endpoint: 'addTransaction',
        description: 'Add an initial transaction to the newly created account. Replace accountId with the ID from the previous step.',
        defaultArgs: [
          {
            accountId: 99999,
            date: "2024-06-15",
            description: "Initial Deposit",
            amount: 1000.00,
            category: "Income",
            source: "playground_test",
            merchantKey: "Deposit",
            userOverridden: true,
            dedupKey: "deposit_123",
            recurrence: "onetime"
          }
        ],
        phase: 'execution'
      },
      {
        endpoint: 'getTransactions',
        description: 'Verify the transactions for the new account (pass the accountId retrieved from getAccounts).',
        defaultArgs: [
          "2024-01-01",
          "2024-12-31",
          { accountId: 99999 }
        ],
        phase: 'execution'
      },
      {
        endpoint: 'deleteAccount',
        description: 'Clean up test data by deleting the account created during setup. Replace the ID with the one retrieved earlier.',
        defaultArgs: [99999],
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
        defaultArgs: ["app:testTaxSettings"],
        phase: 'setup'
      },
      {
        endpoint: 'updateSetting',
        description: 'Update the app:testTaxSettings object with a new deduction value.',
        defaultArgs: [
          "app:testTaxSettings",
          {
            businessDeductions: {
              general: {
                software: 500
              }
            }
          }
        ],
        phase: 'execution'
      },
      {
        endpoint: 'getSettings',
        description: 'Verify the deduction value was successfully updated in the database.',
        defaultArgs: ["app:testTaxSettings"],
        phase: 'execution'
      },
      {
        endpoint: 'updateSetting',
        description: 'Restore the original app:testTaxSettings object that was backed up in the setup phase.',
        defaultArgs: [
          "app:testTaxSettings",
          {}
        ],
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
        defaultArgs: [],
        phase: 'execution'
      },
      {
        endpoint: 'getDashboardAggregates',
        description: 'Retrieve actual spend data to compare against budgets.',
        defaultArgs: [{ demoMode: false }],
        phase: 'execution'
      },
      {
        endpoint: 'putArtifact',
        description: 'Create a markdown artifact containing the budget report.',
        defaultArgs: [
          {
            id: "budget_report_1",
            type: "markdown",
            title: "Monthly Budget Report",
            content: "# Budget Report\n\nYou are under budget by $500 this month.",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z"
          }
        ],
        phase: 'execution'
      },
      {
        endpoint: 'getArtifacts',
        description: 'Verify the budget report artifact was saved.',
        defaultArgs: [],
        phase: 'execution'
      },
      {
        endpoint: 'deleteArtifact',
        description: 'Delete the test budget report artifact.',
        defaultArgs: ["budget_report_1"],
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
        defaultArgs: [{ preset: "lastMonth" }],
        phase: 'execution'
      },
      {
        endpoint: 'spending_anomalies',
        description: 'Next, scan for spending outliers and high-growth categories within that same period.',
        defaultArgs: [],
        phase: 'execution'
      },
      {
        endpoint: 'create_artifact',
        description: 'Finally, synthesize the queried data and anomalies into a comprehensive markdown report for the user.',
        defaultArgs: [
          {
            title: "End of Month Review",
            type: "markdown",
            content: "# End of Month Review\n..."
          }
        ],
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
        defaultArgs: [],
        phase: 'execution'
      },
      {
        endpoint: 'filter_ui',
        description: 'Update the dashboard view to show the user the specific transactions flagged in the audit.',
        defaultArgs: [{ categories: ["Subscriptions"] }],
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
        defaultArgs: [],
        phase: 'execution'
      },
      {
        endpoint: 'navigate',
        description: "Navigate the user to the /sort view where they can quickly review, approve, or override the AI's suggestions.",
        defaultArgs: [{ page: "/sort" }],
        phase: 'execution'
      }
    ]
  },
  {
    id: 'create_pnl_playbook',
    title: 'Create Profit & Loss (P&L) Playbook',
    description: 'An AI Copilot playbook for generating a Profit & Loss statement for a given tax year.',
    guards: ['hasBusiness'],
    steps: [
      {
        endpoint: 'compile_tax_document',
        description: 'Call this tool to automatically compile the user\'s transactions and tax settings into a Business P&L statement artifact.',
        defaultArgs: [
          { documentType: "business_pnl", taxYear: "{{current_year}}" }
        ],
        phase: 'execution'
      }
    ]
  }
];
