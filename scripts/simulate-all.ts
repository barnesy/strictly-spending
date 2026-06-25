import { localAI, parseAIResponse, COPILOT_RESPONSE_SCHEMA } from '../src/ai';
import { getSystemPrompt } from '../src/ai/prompts';
import { QueryDataTool } from '../src/ai/tools/QueryDataTool';
import type { ChatMessage } from '../src/ai/types';

const promptsToTest = [
  "Show me food spending",
  "Create an expense report for everything I spent on Groceries for the last 3 months",
  "How much did I spend on food last month?",
  "Find any subscriptions under $10",
  "What are my top spending categories?",
  "Go to settings",
  "Compare my shopping spending last month versus the month before."
];

async function main() {
  await localAI.init();
  
  const stateContext = `Current Date: 2026-06-24 (6/24/2026)
Earliest Transaction Date: 2025-01-02
Latest Transaction Date: 2026-06-16
Current Page: /
Current Filter Preset: allTime
Current Search Query: ""
Available Categories: Subscriptions, Groceries, Shopping
Available Accounts: all`;

  const systemPrompt = await getSystemPrompt(stateContext);
  const toolHandler = new QueryDataTool();

  for (const prompt of promptsToTest) {
    console.log(`\n========================================`);
    console.log(`Testing Prompt: "${prompt}"`);
    console.log(`========================================`);

    let conversationHistory: ChatMessage[] = [
      { role: 'user', content: prompt }
    ];

    let loops = 0;
    const maxLoops = 4;
    const actionsTaken: string[] = [];

    while (loops < maxLoops) {
      loops++;
      const cleanedHistory = conversationHistory.map((m) => {
        if (m.role === 'assistant') {
          try {
            const p = parseAIResponse(m.content);
            if (p && p.body) return { ...m, content: JSON.stringify({ ...p, body: '' }) };
          } catch {}
        }
        return m;
      });

      const activeHistory = loops === maxLoops
        ? [
            ...cleanedHistory,
            {
              role: 'system' as const,
              content: `This is the final turn. Explain results strictly using numbers. Set 'agent_action.action' to 'none'.`
            }
          ]
        : cleanedHistory;

      const currentResponse = await localAI.chatCopilot(
        activeHistory,
        stateContext,
        systemPrompt,
        COPILOT_RESPONSE_SCHEMA
      );

      const parsed = parseAIResponse(currentResponse);
      let actionObj = parsed?.agent_action;
      
      let rawAction = actionObj?.action || 'none';
      const bodyText = parsed?.body || "";
      const hasSystemDbMessage = activeHistory.some((m: ChatMessage) => m.role === 'system' && m.content.includes('Database Query Results'));
      
      if ((rawAction === 'none' || rawAction === 'generate_document') && bodyText.includes('$') && !hasSystemDbMessage) {
          actionObj = actionObj || {};
          actionObj.action = 'query_data';
          actionObj.explanation = "Intercepted hallucinated numbers. Reverting to query_data.";
          
          if (parsed) {
             parsed.body = "I need to fetch those numbers from the database first. One moment...";
          }
      }

      const action = actionObj?.action || 'none';
      actionsTaken.push(action);

      console.log(`  Loop ${loops}: action = ${action}`);

      if (action === 'none') {
        break;
      }

      if (action === 'query_data') {
        const systemResultsMsg = { 
          role: 'system' as const, 
          content: `Database Query Results for categories [] between 2025-01-02 and 2026-06-16:\n- Total Spent: $150.00\n- Number of Transactions: 3\nRecent Transactions:\n- Store: $50`
        };
        const assistantMsg: ChatMessage = { role: 'assistant', content: currentResponse };
        conversationHistory = [ ...conversationHistory, assistantMsg, systemResultsMsg ];
      } else if (action === 'navigate' || action === 'filter') {
        break;
      } else {
        const systemResultsMsg = { role: 'system' as const, content: `Unknown action: ${action}` };
        const assistantMsg: ChatMessage = { role: 'assistant', content: currentResponse };
        conversationHistory = [ ...conversationHistory, assistantMsg, systemResultsMsg ];
      }
    }

    console.log(`Result: Completed in ${loops} turns. Sequence: [${actionsTaken.join(' -> ')}]`);
  }
}

main().catch(console.error);
