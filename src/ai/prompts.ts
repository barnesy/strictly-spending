import { api } from '../api';
import type { ChatMessage } from './types';
import type { SkillTestCase } from '../types';

// @ts-ignore
import typesRaw from '../types.ts?raw';
// @ts-ignore
import apiRaw from '../api.ts?raw';

export const GENERAL_SYSTEM_PROMPT = `<identity>
You are an expert AI financial agent managing a user's private financial data. 
</identity>

<instructions>
1. TOOL USAGE: Always use native tools to fetch or filter data. Never estimate numbers. Chain tools if needed (e.g., 'query_data' then 'create_artifact').
2. TONE: Be friendly, concise, and focus on summarizing high-level insights.
3. DATA INTEGRITY: Do not provide totals or summaries until you successfully execute a tool to retrieve the data.
4. UI NAVIGATION: Use 'navigate' to move the user (e.g., "/settings"). Use 'filter_ui' to update their dashboard view.
5. GENERATIVE UI: When you use 'query_data', the UI automatically renders charts and tables for the user. Do not repeat raw numbers, lists, or tables in chat. If you were just asked a question, provide a 1-2 sentence high-level insight. If you need to generate a report, proceed to use 'create_artifact' instead of stopping.
6. ARTIFACTS: For long reports, budgets, or extensive plans, use the 'create_artifact' tool instead of outputting walls of text.
7. AGENTIC WORKFLOWS: For complex requests, use your internal reasoning to break the problem into smaller steps. Execute one tool per step, observe the result, and decide on the next action until the overall goal is fully achieved.
8. API PLAYBOOK: When chaining tools together, refer to the <api_playbook> provided below to understand the required sequence and dependencies of verified API workflows.
9. CHARTS AND GRAPHS: When the user asks you to visualize data or draw a chart inside an artifact, you can natively render interactive graphs by outputting an Apache ECharts JSON configuration wrapped in an \`\`\`echarts markdown code block.
10. NEW TOOLS: Use 'manage_loans' to simulate payoffs or track debt. Use 'manage_budgets' to read and update budget caps. Use 'create_auto_rule' to codify your categorization logic into persistent app rules. Use 'read_pdf' to extract text from user-uploaded tax forms and receipts.
</instructions>`;

export const fewShots: ChatMessage[] = []; // ReAct tools don't need these manual JSON few-shots.

export const CURRENT_PROMPT_VERSION = 18;

export async function getSystemPrompt(stateContext: string, overrideSystemPrompt?: string, activePlaybooksJson?: string): Promise<string> {
  const basePrompt = overrideSystemPrompt || GENERAL_SYSTEM_PROMPT;
  
  let enabledExtensions = '';
  try {
    const skills = await api.getSetting<any[]>('app:agentSkills') || [];
    enabledExtensions = skills
      .filter((s) => s.enabled)
      .map((s) => `<skill_extension name="${s.name}">\n${s.systemPromptExtension}\n</skill_extension>`)
      .join('\n\n');
  } catch (err) {
    console.error('Failed to load agent skills from database:', err);
  }

  const extensionsBlock = enabledExtensions ? `\n\n<custom_capabilities>\n${enabledExtensions}\n</custom_capabilities>` : '';
  const stateBlock = `\n\n<current_state>\n${stateContext}\n</current_state>`;
  
  const schemaBlock = `\n\n<database_schema>\n${typesRaw}\n</database_schema>\n\n<api_definitions>\n${apiRaw}\n</api_definitions>`;
  const playbookBlock = activePlaybooksJson 
    ? `\n\n<api_playbook>\n${activePlaybooksJson}\n</api_playbook>` 
    : '';

  return `${basePrompt}${schemaBlock}${playbookBlock}${extensionsBlock}${stateBlock}`;
}

export const BASELINE_TEST_CASES: SkillTestCase[] = [
  {
    prompt: "Show me food spending",
    criteria: "Must map to 'Groceries' and 'Restaurants & Coffee' categories and output action 'filter' with page '/'"
  },

  {
    prompt: "Go to settings",
    criteria: "Must set action to 'navigate' with page set to '/settings'"
  },
  {
    prompt: "reset all filters",
    criteria: "Must reset categories to ['all'], accounts to ['all'], preset to 'allTime', action to 'filter'"
  },
  {
    prompt: "How much did I spend on food last month?",
    criteria: "Must output action 'query_data' with categories mapped to food and preset 'lastMonth'"
  },
  {
    prompt: "Go to budget page",
    criteria: "Must set action to 'navigate' with page set to '/budget'"
  },
  {
    prompt: "What are the top spending categories?",
    criteria: "Must output action 'query_data' with preset 'allTime' and 'all' categories. Must NOT output a markdown table or fake any numbers."
  },
  {
    prompt: "Show me all transactions from Amazon over $50",
    criteria: "Must output action 'filter' with search 'Amazon' and minPrice 50."
  },
  {
    prompt: "Filter by my chase credit card",
    criteria: "Must output action 'filter' with accounts containing 'chase' or similar."
  },
  {
    prompt: "How many times did I go to Starbucks this year?",
    criteria: "Must output action 'query_data' with search 'Starbucks' and preset 'thisYear'."
  },
  {
    prompt: "I want to see my income for the last 6 months",
    criteria: "Must output action 'filter' with categories 'Income' and preset 'last6Months'."
  },
  {
    prompt: "Find any subscriptions under $10",
    criteria: "Must output action 'query_data' with categories 'Subscriptions' and maxPrice 10."
  },
  {
    prompt: "Go to the import data page",
    criteria: "Must output action 'navigate' with page '/import'."
  }
];