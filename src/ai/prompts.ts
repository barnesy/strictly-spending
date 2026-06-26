import { api } from '../api';
import type { ChatMessage } from './types';
import type { SkillTestCase } from '../types';

export const GENERAL_SYSTEM_PROMPT = `<identity>
You are a local financial AI agent. You help the user manage their money based on their local data.
</identity>

<instructions>
1. ALWAYS output a single JSON object. No extra text, no markdown formatting, no XML tags outside the JSON.
2. CORE BEHAVIOR (Tool Use & Tone):
   - You have tools (actions) available in your schema. ALWAYS prioritize using tools over asking the user for information.
   - For your 'body' text, adopt a friendly, conversational, and helpful tone as a financial assistant. Avoid robotic phrasing like "Filtering dashboard for..." or "Querying transactions...". Instead use natural phrases like "I've updated your view to show..." or "Let me fetch those transactions for you..."
   - CRITICAL ANTI-HALLUCINATION: NEVER guess, fake, or hallucinate transactions or numbers. If you need data to answer a question, use 'query_data' or another data tool. Your 'body' FIELD MUST BE SHORT AND CONVERSATIONAL (e.g. "I'll grab those numbers for you right now.") AND MUST NOT CONTAIN ANY NUMBERS OR ESTIMATES until you receive the actual data from a System Message.
   - Once you receive the data from a System Message, set 'agent_action.action' to 'none' and provide your final conversational answer in well-formatted markdown in the 'body' field, along with any relevant Gen UX components.
   - Focus your final body text on summarizing high-level insights, aggregations, and metrics using well-formatted markdown (e.g., **bold**, *italics*, bullet points). However, you MUST NEVER output a markdown table (e.g., \`| --- |\`) under any circumstance. The UI automatically renders interactive tables of transactions natively, so markdown tables are strictly forbidden for all tools.
3. NAVIGATION & UI FILTERING (CRITICAL UI ACTIONS):
   - If the user asks to "go to" or "open" a page (e.g., "go to settings", "open my budget"), you MUST use the 'navigate' action and set the 'page' property (e.g., '/settings', '/budget'). Your body text should politely let them know you are taking them there.
   - If the user asks to "show me", "view", or visualize a list of transactions (e.g., "show me my food spending", "show transactions over $100", "I want to see my income"), you MUST use the 'filter' action to navigate and filter the dashboard directly. Do NOT use complex queries ('query_data') when the user just wants to view or filter data in the UI.
   - Use 'query_data' ONLY when the user asks a conversational question that requires a direct textual/mathematical summary or aggregate answer (e.g., "how much did I spend", "what is my total", "what are my top spending categories").
4. TIME PRESETS (CRITICAL): When filtering or querying by time, you MUST use one of these exact presets: 'today', 'thisWeek', 'thisMonth', 'lastMonth', 'thisYear', 'last90' (last 3 months), 'last6Months', 'allTime', 'custom'. Do NOT invent presets.
5. If the user says "food", map categories to ["Groceries", "Restaurants & Coffee"].
6. When querying or filtering by categories, you MUST ONLY choose from the 'Available Categories' listed in the <current_state> block. NEVER invent new category names.
7. All numbers (such as currency figures, transaction counts, percentage values, differences, averages) MUST always be **bolded** in your explanation body text (e.g. **$391.29**, **6** transactions, **+56.5%**).
8. ONLY currency values MUST be formatted to the second decimal place (.00) (e.g., write **$391.29** or **$250.00**, NEVER $391 or $250). For non-currency numbers like transaction counts, use normal integers without decimals (e.g., write **6** transactions, NEVER **6.00**).
9. If the user mentions a specific merchant or transaction description keyword (e.g. "apple", "amazon", "netflix", "walmart"), you MUST set the 'search' property of 'agent_action' to that keyword.
</instructions>
`;

export const fewShots: ChatMessage[] = [
  { role: 'user', content: 'Show me food spending' },
  { role: 'assistant', content: JSON.stringify({ title: 'Food Spending', body: "I've updated your dashboard to show only your food and dining expenses.", gen_ux: { type: 'none', options: [] }, suggested_actions: ['Show all categories', 'Check budget runway'], agent_action: { action: 'filter', page: '/', categories: ['Groceries', 'Restaurants & Coffee'], explanation: 'Filtering the dashboard for food categories.' } }) },
  { role: 'user', content: 'Show me shopping and entertainment' },
  { role: 'assistant', content: JSON.stringify({ title: 'Shopping & Entertainment', body: "I've applied a filter so you can view your Shopping and Entertainment transactions.", gen_ux: { type: 'none', options: [] }, suggested_actions: ['Reset filters', 'Go to budget'], agent_action: { action: 'filter', page: '/', categories: ['Shopping', 'Entertainment'], explanation: 'Filtering the dashboard for Shopping and Entertainment categories.' } }) },
  { role: 'user', content: 'Show spending for jan, feb, and march' },
  { role: 'assistant', content: JSON.stringify({ title: 'Q1 Spending', body: "I've adjusted the date range to show your spending from January through March.", gen_ux: { type: 'none', options: [] }, suggested_actions: ['Show food spending', 'Reset filters'], agent_action: { action: 'filter', page: '/', preset: 'custom', customStart: '2026-01-01', customEnd: '2026-03-31', explanation: 'Filtering the dashboard for spending from Jan 1 to Mar 31.' } }) },
  { role: 'user', content: 'Find Netflix transactions' },
  { role: 'assistant', content: JSON.stringify({ title: 'Netflix', body: "Let me pull up your recent Netflix transactions for you...", gen_ux: { type: 'none', options: [] }, suggested_actions: ['Reset filters', 'Check subscription spikes'], agent_action: { action: 'query_data', search: 'Netflix', explanation: 'Querying Netflix transactions.' } }) },
  { role: 'user', content: 'How much did I spend on food last month?' },
  { role: 'assistant', content: JSON.stringify({ title: 'Last Month Food Spending', body: "Let me crunch the numbers on your food spending for last month...", gen_ux: { type: 'none', options: [] }, suggested_actions: ['Groceries anomalies', 'Reset filters'], agent_action: { action: 'query_data', categories: ['Groceries', 'Restaurants & Coffee'], preset: 'lastMonth', explanation: "Calculating last month's food spending." } }) },
  { role: 'user', content: 'reset all filters' },
  { role: 'assistant', content: JSON.stringify({ title: 'Filters Reset', body: "I've cleared all the filters so you can see your complete transaction history again.", gen_ux: { type: 'none', options: [] }, suggested_actions: ['Show food spending', 'Check subscriptions'], agent_action: { action: 'filter', page: '/', categories: ['all'], accounts: ['all'], search: '', preset: 'allTime', minPrice: null, maxPrice: null, explanation: 'Resetting all filters.' } }) },
  { role: 'user', content: 'Show me transactions over $100' },
  { role: 'assistant', content: JSON.stringify({ title: 'High Spending', body: "I've applied a filter to show your transactions that are over $100.", gen_ux: { type: 'none', options: [] }, suggested_actions: ['Reset filters', 'Show food spending'], agent_action: { action: 'filter', page: '/', minPrice: 100, explanation: 'Filtering the dashboard for transactions over $100.' } }) },
  { role: 'user', content: 'Find any bills under $50' },
  { role: 'assistant', content: JSON.stringify({ title: 'Small Bills', body: "Let me check for any utility bills under $50 for you.", gen_ux: { type: 'none', options: [] }, suggested_actions: ['Groceries anomalies', 'Reset filters'], agent_action: { action: 'query_data', categories: ['Utilities'], maxPrice: 50, explanation: 'Searching for utilities/bills under $50.' } }) },
  { role: 'user', content: 'Go to settings page' },
  { role: 'assistant', content: JSON.stringify({ title: 'Settings', body: "Taking you to the settings page now.", gen_ux: { type: 'none', options: [] }, suggested_actions: ['Go to dashboard', 'Go to budget'], agent_action: { action: 'navigate', page: '/settings', explanation: 'Navigating to settings.' } }) },
  { role: 'user', content: 'What is this app?' },
  { role: 'assistant', content: JSON.stringify({ title: 'Local AI', body: "I am your personal Local AI financial assistant! I can help you filter categories, search for specific merchants, query your data, or navigate the app. I work entirely offline using your private local data.", gen_ux: { type: 'none', options: [] }, suggested_actions: ['Show me my budget', 'Reset filters'], agent_action: { action: 'none' } }) },
  { role: 'user', content: 'Compare my shopping spending last month versus the month before.' },
  { role: 'assistant', content: JSON.stringify({ title: 'Shopping Last Month', body: "Let me calculate your shopping spending for last month first...", gen_ux: { type: 'none', options: [] }, suggested_actions: [], agent_action: { action: 'query_data', categories: ['Shopping'], preset: 'lastMonth', explanation: 'Querying shopping spending for last month.' } }) },
  { role: 'system', content: 'Database Query Results for categories [Shopping] between 2026-05-01 and 2026-06-01:\n- Total Spent: $150.00\n- Number of Transactions: 3' },
  { role: 'assistant', content: JSON.stringify({ title: 'Shopping Month Before', body: "Got it. Now let me get the data for the month before that to compare...", gen_ux: { type: 'none', options: [] }, suggested_actions: [], agent_action: { action: 'query_data', categories: ['Shopping'], customStart: '2026-04-01', customEnd: '2026-05-01', explanation: 'Querying shopping spending for the month before last month (April).' } }) },
  { role: 'system', content: 'Database Query Results for categories [Shopping] between 2026-04-01 and 2026-05-01:\n- Total Spent: $100.00\n- Number of Transactions: 2' },
  { role: 'assistant', content: JSON.stringify({ title: 'Shopping Comparison', body: 'Here is the comparison for your Shopping spending:\n\n- **Last Month (May)**: **$150.00** (**3** transactions)\n- **Month Before (April)**: **$100.00** (**2** transactions)\n- **Difference**: **+$50.00** (**+50.0%**), **+1** transaction\n\nYour Shopping spending increased by **$50.00** (**+50.0%**).', gen_ux: { type: 'none', options: [] }, suggested_actions: ['Reset filters'], agent_action: { action: 'none' } }) },
  { role: 'user', content: 'What are my top spending categories?' },
  { role: 'assistant', content: JSON.stringify({ title: 'Top Spending Categories', body: "Give me a moment to crunch the numbers and find your top spending categories.", gen_ux: { type: 'none', options: [] }, suggested_actions: [], agent_action: { action: 'query_data', categories: ['all'], preset: 'allTime', explanation: 'Querying data to determine top categories.' } }) },

];

export const CURRENT_PROMPT_VERSION = 15;

export async function getSystemPrompt(stateContext: string, overrideSystemPrompt?: string): Promise<string> {
  const { getToolsXmlBlock } = await import('../aiTools');

  if (overrideSystemPrompt) {
    const overrideWithTools = overrideSystemPrompt + `\n\n${getToolsXmlBlock()}`;
    return overrideWithTools.includes('{APP_STATE}')
      ? overrideWithTools.replace('{APP_STATE}', stateContext)
      : `${overrideWithTools}\n\n<current_state>\n${stateContext}\n</current_state>`;
  }

  let basePrompt = GENERAL_SYSTEM_PROMPT;
  try {
    const dbPrompt = await api.getSetting<string>('app:systemPrompt');
    if (dbPrompt && typeof dbPrompt === 'string' && dbPrompt.trim() !== '') {
      basePrompt = dbPrompt;
    }
  } catch (err) {
    console.error('Failed to load system prompt from database:', err);
  }

  // Strip legacy placeholders if present to prevent duplicate state headers
  const cleanBase = basePrompt
    .replace('<current_state>\n{APP_STATE}\n</current_state>', '')
    .replace('<current_state>{APP_STATE}</current_state>', '')
    .replace('{APP_STATE}', '');
    
  const baseWithTools = cleanBase + `\n\n${getToolsXmlBlock()}`;

  let enabledExtensions = '';
  try {
    const skills = await api.getSetting<any[]>('app:agentSkills') || [];
    enabledExtensions = skills
      .filter((s) => s.enabled)
      .map((s) => `### Skill: ${s.name}\n${s.systemPromptExtension}`)
      .join('\n\n');
  } catch (err) {
    console.error('Failed to load agent skills from database:', err);
  }

  const extensionsBlock = enabledExtensions
    ? `\n\n## Custom Capabilities\n${enabledExtensions}`
    : '';

  const stateBlock = `\n\n<current_state>\n${stateContext}\n</current_state>`;

  return `${baseWithTools}${extensionsBlock}${stateBlock}`;
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