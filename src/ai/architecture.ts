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
          associatedChecklistId: { type: "string", description: "If the user provides a checklist ID (e.g. for tax documents), pass it here to link the artifact to the UI." },
          sourceFile: { type: "string", description: "The local path of the original file this artifact is based on, if applicable." },
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
          id: { type: "string", description: "The unique identifier of the artifact to update. DO NOT pass the title. Look at the 'Available Artifacts' list in your state and copy the exact string after 'ID:'." },
          content: { type: "string", description: "The updated complete content of the artifact." },
          confirmed: { type: "boolean", description: "Set to true ONLY if the user has already explicitly confirmed the update." },
          summary: { type: "string", description: "An updated 1-3 sentence summary of the artifact content." }
        },
        required: ["id", "content", "confirmed"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_artifact",
      description: "Read the full content of a specific artifact. Use this before attempting to update an artifact so you know its current state.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The unique identifier of the artifact to read. DO NOT pass the title. Look at the 'Available Artifacts' list in your state and copy the exact string after 'ID:'." }
        },
        required: ["id"]
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
      name: "manage_tax_settings",
      description: "Retrieve or update the user's global tax settings, tax deductions, and business tax statuses.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["get", "update"] },
          taxData: { type: "object", description: "The new tax settings data. Required for 'update' action." },
          confirmed: { type: "boolean", description: "Set to true ONLY if the user has already explicitly confirmed the update." }
        },
        required: ["action", "confirmed"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "manage_loans",
      description: "Manage, fetch, or create loans. Use this tool when the user asks about their loans, needs loan info for forecasting, or requests to add/update a loan.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["get", "create", "update", "delete"] },
          loanId: { type: "number" },
          loanData: { type: "object", description: "Loan details needed for creation or updates." },
          confirmed: { type: "boolean", description: "Set to true ONLY if the user has already explicitly confirmed creation/update/deletion." }
        },
        required: ["action", "confirmed"]
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
        },
        required: ["confirmed"]
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
  },
  {
    type: "function",
    function: {
      name: "compile_tax_document",
      description: "Securely generate and save a tax document using local raw database data without hitting LLM context limits. ALWAYS use this tool instead of 'create_artifact' when asked to generate a tax document, P&L, ledger, or tax summary.",
      parameters: {
        type: "object",
        properties: {
          documentType: { 
            type: "string", 
            enum: ["business_pnl", "business_ledger", "deduction_expense_summary", "tax_summary"],
            description: "The type of tax document to generate."
          },
          taxYear: { type: "number", description: "The tax year to generate for. If omitted, defaults to the previous year. Only specify if the user explicitly asks for a specific year." },
          associatedChecklistId: { type: "string", description: "If the user provides a checklist ID (e.g. 'business_pnl'), pass it here to link the generated artifact to the UI." },
          ignoreWarnings: { type: "boolean", description: "Set to true to bypass categorization warnings and force the generation of the document even if the ledger is mostly uncategorized or empty." }
        },
        required: ["documentType"]
      }
    }
  }
];
