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
Available Categories: Subscriptions, Groceries
Available Accounts: all`;

  const systemPrompt = await getSystemPrompt(stateContext);
  const toolHandler = new QueryDataTool();

  let conversationHistory: ChatMessage[] = [
    { role: 'user', content: 'Create an expense report for everything I spent on Groceries for the last 3 months' }
  ];

  let loops = 0;
  const maxLoops = 4;

  console.log("=== STARTING ORCHESTRATOR LOOP ===");

  while (loops < maxLoops) {
    loops++;
    console.log(`\n--- Loop ${loops} ---`);

    const cleanedHistory = conversationHistory.map((m) => {
      if (m.role === 'assistant') {
        try {
          const p = parseAIResponse(m.content);
          if (p && p.body) return { ...m, content: JSON.stringify({ ...p, body: '' }) };
        } catch {}
      }
      return m;
    });

    const currentResponse = await localAI.chatCopilot(
      cleanedHistory,
      stateContext,
      systemPrompt,
      COPILOT_RESPONSE_SCHEMA
    );
    const parsed = parseAIResponse(currentResponse);
    let actionObj = parsed?.agent_action;
    let action = actionObj?.action || 'none';
    const bodyText = parsed?.body || "";
    const hasSystemDbMessage = conversationHistory.some(m => m.role === 'system' && m.content.includes('Database Query Results'));
    
    if ((action === 'none' || action === 'generate_document') && bodyText.includes('$') && !hasSystemDbMessage) {
        actionObj = actionObj || {};
        actionObj.action = 'query_data';
        actionObj.explanation = "Intercepted hallucinated numbers. Reverting to query_data.";
        action = 'query_data';
    }

    console.log(`Action chosen: ${action}`);
    console.log(`Explanation: ${parsed?.body || parsed?.agent_action?.explanation || 'N/A'}`);

    if (action === 'none') {
      console.log("LLM decided to stop (action: none). Final body:");
      console.log(parsed?.body);
      break;
    }

    const toolHandler = new QueryDataTool(); // You should really import toolRegistry but this is fine for now if it's only query_data
    if (action === 'query_data') {
      console.log(`Executing query_data with args:`, JSON.stringify(actionObj));
      
      const mockContext: any = {
        filters: {
          preset: 'allTime',
          earliestTransactionDate: '2025-01-02',
          latestTransactionDate: '2026-06-16'
        },
        dataStore: {
          categories: [{name: 'Subscriptions', type: 'spend'}, {name: 'Groceries', type: 'spend'}],
          accounts: [],
          budgets: [],
          merchantOverrides: [],
          transactions: []
        }
      };

      // @ts-ignore
      const result = await toolHandler.execute(actionObj, mockContext);
      
      const systemResultsMsg = { 
        role: 'system' as const, 
        content: result.systemResultsMsg || 'Query completed'
      };
      
      console.log("System returns:", systemResultsMsg.content);

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: currentResponse
      };

      conversationHistory = [
        ...conversationHistory,
        assistantMsg,
        systemResultsMsg
      ];
    } else {
      console.log(`Unknown or unhandled action: ${action}`);
      break;
    }
  }

  console.log(`\n=== LOOP FINISHED IN ${loops} TURNS ===`);
}

main().catch(console.error);
