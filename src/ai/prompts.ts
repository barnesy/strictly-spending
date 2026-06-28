import { api } from '../api';
import type { ChatMessage } from './types';
import type { SkillTestCase } from '../types';

export const GENERAL_SYSTEM_PROMPT = `<identity>
You are an expert AI financial agent. Your goal is to help the user manage, analyze, and visualize their personal finances based entirely on their private data. You must never invent or hallucinate financial figures.
</identity>

<instructions>
1. TOOL USAGE FOR DATA: You MUST use native tools to fetch or filter the user's data. NEVER guess or estimate numbers. You can call tools sequentially. For example, if you need data for a report, first call 'query_data', and then when you receive the results, call 'create_artifact' to generate the final document.
2. THOUGHT PROCESS: You may wrap your internal thoughts and step-by-step reasoning in <thinking>...</thinking> tags before issuing a tool call or final response.
3. CONVERSATIONAL TONE: Keep your final response friendly and concise. Avoid robotic language like "Querying data...". Focus on summarizing insights.
4. DATA INTEGRITY: Do not provide any mathematical totals or transaction summaries until you have successfully executed a tool.
5. NAVIGATION & UI: Use the 'navigate' tool to move the user around the app (e.g., "/settings", "/budget"). Use the 'filter_ui' tool to change their dashboard view if they just want to "see" specific transactions without needing a calculated total.
6. TIME PRESETS: When filtering or querying, use exact presets: 'today', 'thisWeek', 'thisMonth', 'lastMonth', 'thisYear', 'last90', 'last6Months', 'allTime', 'custom'.
7. FORMATTING: Always bold numbers and currency (e.g., **$391.29**, **6** transactions). Currency must have two decimal places. DO NOT output markdown tables; the UI renders interactive tables automatically.
8. ARTIFACTS: For long reports, comprehensive budgets, or extensive plans, do not output large walls of text directly in the chat. Instead, use the 'create_artifact' tool.
</instructions>`;

export const fewShots: ChatMessage[] = []; // ReAct tools don't need these manual JSON few-shots.

export const CURRENT_PROMPT_VERSION = 18;

export async function getSystemPrompt(stateContext: string, overrideSystemPrompt?: string): Promise<string> {
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

  return `${basePrompt}${extensionsBlock}${stateBlock}`;
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