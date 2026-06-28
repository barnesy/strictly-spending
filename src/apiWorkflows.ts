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
        defaultArgs: '[\n  {\n    "name": "My New Checking",\n    "type": "checking",\n    "institution": "Chase",\n    "source": "custom",\n    "enabled": true\n  }\n]',
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
        defaultArgs: '[\n  {\n    "accountId": 1,\n    "date": "2024-06-15",\n    "description": "Initial Deposit",\n    "amount": 1000.00,\n    "category": "Income",\n    "source": "custom",\n    "merchantKey": "Deposit",\n    "userOverridden": true,\n    "dedupKey": "deposit_123",\n    "recurrence": "onetime"\n  }\n]',
        phase: 'execution'
      },
      {
        endpoint: 'getTransactions',
        description: 'Verify the transactions for the new account (pass the accountId retrieved from getAccounts).',
        defaultArgs: '[\n  "2024-01-01",\n  "2024-12-31",\n  { "accountId": 1 }\n]',
        phase: 'execution'
      },
      {
        endpoint: 'deleteAccount',
        description: 'Clean up test data by deleting the account created during setup. Replace the ID with the one retrieved earlier.',
        defaultArgs: '[\n  1\n]',
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
        description: 'Retrieve the current app:taxSettings object to inspect existing deductions (Setup: Backup existing state).',
        defaultArgs: '[]',
        phase: 'setup'
      },
      {
        endpoint: 'updateSetting',
        description: 'Update the app:taxSettings object with a new deduction value.',
        defaultArgs: '[\n  "app:taxSettings",\n  {\n    "businessDeductions": {\n      "general": {\n        "software": 500\n      }\n    }\n  }\n]',
        phase: 'execution'
      },
      {
        endpoint: 'getSettings',
        description: 'Verify the deduction value was successfully updated in the database.',
        defaultArgs: '[]',
        phase: 'execution'
      },
      {
        endpoint: 'updateSetting',
        description: 'Restore the original app:taxSettings object that was backed up in the setup phase.',
        defaultArgs: '[\n  "app:taxSettings",\n  {}\n]',
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
  }
];
