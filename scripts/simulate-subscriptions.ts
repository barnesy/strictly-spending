import { localAI, parseAIResponse, COPILOT_RESPONSE_SCHEMA } from '../src/ai';
import { getSystemPrompt } from '../src/ai/prompts';
import { QueryDataTool } from '../src/ai/tools/QueryDataTool';
import type { ChatMessage } from '../src/ai/types';

async function main() {
  await localAI.init();
  
  const stateContext = `Current Date: 2026-06-24 (6/24/2026)
Earliest Transaction Date: 2025-01-02
Latest Transaction Date: 2026-06-16
Current Page: /
Current Filter Preset: allTime
Current Search Query: ""
Available Categories: Subscriptions, Groceries, Shopping, Utilities
Available Accounts: all`;

  const systemPrompt = await getSystemPrompt(stateContext);
  const toolHandler = new QueryDataTool();
  const prompt = "Find subscriptions under $50";

  console.log(`========================================`);
  console.log(`Testing Prompt: "${prompt}"`);
  console.log(`========================================`);

  let conversationHistory: ChatMessage[] = [
    { role: 'user', content: prompt }
  ];

  let loops = 0;
  const maxLoops = 6;

  while (loops < maxLoops) {
    loops++;
    
    // Clean history before sending
    const cleanedHistory = conversationHistory.map((m) => {
      if (m.role === 'assistant') {
        try {
          const p = parseAIResponse(m.content);
          if (p && p.body) return { ...m, content: JSON.stringify({ ...p, body: '' }) };
        } catch {}
      }
      return m;
    });

    console.log(`\n--- Calling LLM for Turn ${loops} ---`);
    const currentResponse = await localAI.chatCopilot(
      cleanedHistory,
      stateContext,
      systemPrompt,
      COPILOT_RESPONSE_SCHEMA
    );

    const parsed = parseAIResponse(currentResponse);
    console.log(`LLM Response Body:`, parsed?.body);
    console.log(`LLM Response Action:`, JSON.stringify(parsed?.agent_action, null, 2));

    let actionObj = parsed?.agent_action;
    let rawAction = actionObj?.action || 'none';
    const bodyText = parsed?.body || "";
    const hasSystemDbMessage = activeHistory => activeHistory.some((m: ChatMessage) => m.role === 'system' && m.content.includes('Database Query Results'));
    
    if ((rawAction === 'none' || rawAction === 'generate_document') && bodyText.includes('$') && !hasSystemDbMessage(cleanedHistory)) {
        console.log("INTERCEPTED HALLUCINATED NUMBERS!");
        actionObj = actionObj || {};
        actionObj.action = 'query_data';
        actionObj.explanation = "Intercepted hallucinated numbers. Reverting to query_data.";
        if (parsed) {
            parsed.body = "I need to fetch those numbers from the database first. One moment...";
        }
    }

    const action = actionObj?.action || 'none';
    
    if (action === 'none') {
      console.log(`Finished in ${loops} loops.`);
      break;
    }

    if (action === 'query_data') {
      // Create a fake system message that resembles what QueryDataTool returns NOW
      const systemResultsMsg = { 
        role: 'system' as const, 
        content: `Database Query Results for categories [Subscriptions] between 2025-01-02 and 2026-06-24:
- Total Spent: $145.00
- Number of Transactions: 5
- Average Transaction: $29.00
- Total Monthly Budget Limit: $0.00

Proceed with your final response by setting 'agent_action.action' to 'none'.
Your final answer MUST be detailed and insightful, using the exact numbers returned above (dollar amounts, averages, transactions). Never use placeholders like $XXX or generalize. Explicitly compute differences and percentages when comparing periods.
ALL numbers in your final answer MUST be bolded (e.g. **$391.29**, **6.00** transactions, **+56.50%**). Numbers, counts, percentages, and currency values MUST never be rounded to a whole integer, except to the second decimal place (.00) (e.g. write **$250.00**, NEVER $250; write **6.00** transactions, NEVER 6).`
      };
      const assistantMsg: ChatMessage = { role: 'assistant', content: currentResponse };
      conversationHistory = [ ...conversationHistory, assistantMsg, systemResultsMsg ];
    } else if (action === 'navigate' || action === 'filter') {
      console.log(`Action is ${action}, breaking.`);
      break;
    } else {
      const systemResultsMsg = { role: 'system' as const, content: `Unknown action: ${action}` };
      const assistantMsg: ChatMessage = { role: 'assistant', content: currentResponse };
      conversationHistory = [ ...conversationHistory, assistantMsg, systemResultsMsg ];
    }
  }
}

main().catch(console.error);
