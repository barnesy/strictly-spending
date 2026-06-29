export interface AgentToolInfo {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

export const AGENT_TOOLS: AgentToolInfo[] = [
  {
    type: "function",
    function: {
      name: "create_artifact",
      description: "Create a rich document (artifact) such as a markdown report or budget plan. Use this for long responses or extensive formatted plans instead of outputting large walls of text in the chat.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "The title of the artifact" },
          type: { type: "string", enum: ["markdown", "spreadsheet", "skill"], description: "The type of the artifact" },
          content: { type: "string", description: "The complete content of the artifact. For markdown, this should be valid markdown text." },
          identifier: { type: "string", description: "An optional unique identifier for the artifact. If updating an existing artifact, use its identifier." },
          summary: { type: "string", description: "A 1-3 sentence summary of the artifact content for quick reference." }
        },
        required: ["title", "type", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_artifact",
      description: "Update an existing artifact. Use this when you need to modify or rewrite a previously generated artifact.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The unique identifier of the artifact to update." },
          content: { type: "string", description: "The updated complete content of the artifact." },
          confirmed: { type: "boolean", description: "Set to true ONLY if the user has already explicitly confirmed the update." },
          summary: { type: "string", description: "An updated 1-3 sentence summary of the artifact content." }
        },
        required: ["id", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query_data",
      description: "Query and calculate financial aggregates (totals, averages, counts). If you omit 'categories', it will automatically return the total spend AND a breakdown of ALL categories. Use this as your primary tool for gathering financial data.",
      parameters: {
        type: "object",
        properties: {
          categories: { type: "array", items: { type: "string" }, description: "Categories to query, e.g. ['Groceries']" },
          accounts: { type: "array", items: { type: "string" } },
          search: { type: "string", description: "Keyword search, e.g. 'Amazon'" },
          preset: { 
            type: "string", 
            enum: ["ytd", "last30", "last90", "thisMonth", "lastMonth", "allTime", "custom", "current"] 
          },
          customStart: { type: "string" },
          customEnd: { type: "string" },
          minPrice: { type: "number" },
          maxPrice: { type: "number" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "filter_ui",
      description: "Filter the dashboard UI to show specific transactions. Use this when the user just wants to see or view transactions without needing you to do math.",
      parameters: {
        type: "object",
        properties: {
          categories: { type: "array", items: { type: "string" } },
          accounts: { type: "array", items: { type: "string" } },
          search: { type: "string" },
          preset: { 
            type: "string", 
            enum: ["ytd", "last30", "last90", "thisMonth", "lastMonth", "allTime", "custom", "current"] 
          },
          minPrice: { type: "number" },
          maxPrice: { type: "number" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "navigate",
      description: "Navigate the user to a specific page in the app.",
      parameters: {
        type: "object",
        properties: {
          page: { type: "string", description: "The route to navigate to, e.g. '/settings', '/budget'" }
        },
        required: ["page"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "request_user_choice",
      description: "Render clickable buttons in the chat stream to ask the user to choose an option (e.g. scoping like YTD vs Last Month). Execution pauses until the user clicks an option.",
      parameters: {
        type: "object",
        properties: {
          options: { type: "array", items: { type: "string" }, description: "The list of text choices to show the user." }
        },
        required: ["options"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "request_user_confirmation",
      description: "Ask the user to confirm a critical or destructive action (e.g., delete artifact). Execution pauses until confirmed.",
      parameters: {
        type: "object",
        properties: {
          options: { type: "array", items: { type: "string" }, description: "Optional explicitly named options like ['Yes, Delete', 'Cancel']" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "request_user_form",
      description: "Render multi-field inputs for complex user parameters or onboarding. Execution pauses until submitted.",
      parameters: {
        type: "object",
        properties: {
          options: { type: "array", items: { type: "string" }, description: "The list of text fields to show the user." }
        },
        required: ["options"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "export_transactions",
      description: "Export transactions to CSV or PDF.",
      parameters: {
        type: "object",
        properties: {
          format: { type: "string", enum: ["csv", "pdf"] },
          customStart: { type: "string" },
          customEnd: { type: "string" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_tax_settings",
      description: "Update the user's global tax settings.",
      parameters: {
        type: "object",
        properties: {
          taxData: { type: "object", description: "The new tax settings data." },
          confirmed: { type: "boolean", description: "Set to true ONLY if the user has already explicitly confirmed the update." }
        },
        required: ["taxData"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_deduction_status",
      description: "Bulk update transaction tax deduction status.",
      parameters: {
        type: "object",
        properties: {
          isBusiness: { type: "boolean" },
          taxCategory: { type: "string" },
          deductionStatus: { type: "string" },
          filter: { type: "object" },
          confirmed: { type: "boolean", description: "Set to true ONLY if the user has already explicitly confirmed the update." }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "categorize_transactions",
      description: "Automatically categorize all uncategorized transactions.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "subscription_alerts",
      description: "Scan transactions for subscription price spikes, duplicates, and overlaps.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "spending_anomalies",
      description: "Scan transactions for unusual spending outliers and high-growth categories.",
      parameters: {
        type: "object",
        properties: {
          categories: { type: "array", items: { type: "string" } }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "audit_accessibility",
      description: "Run an accessibility audit on the current dashboard page.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "project_runway",
      description: "Calculate global financial runway based on cash, debt, and outflow.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  }
];
