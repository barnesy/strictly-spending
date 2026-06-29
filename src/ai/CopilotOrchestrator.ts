import { useChatStore, formatModelName } from '../chatStore';
import { useFilters } from '../store';
import { useBudgetStore } from '../budgetStore';
import { localAI, calculateGlobalRunwayData } from './index';
import type { ChatMessage } from './index';
import { toolRegistry } from './tools';
import { executeCopilotCommand } from '../copilotMatcher';
import { queryClient } from '../queryClient';
import { api } from '../api';
import { buildRecurrenceMap } from '../recurrence';
import { AGENT_TOOLS } from './architecture';
import { invoke } from '@tauri-apps/api/core';
import { parseAIResponse } from './utils';
import { API_WORKFLOWS, type ApiWorkflow } from '../apiWorkflows';

export interface OrchestratorContext {
  navigate: (path: string) => void;
  location: { pathname: string };
  signal: AbortSignal;
}

export class CopilotOrchestrator {
  static async routeToPlaybooks(userQuery: string, modelName: string): Promise<ApiWorkflow[]> {
    const catalog = API_WORKFLOWS.map(w => ({ id: w.id, title: w.title, description: w.description }));
    const prompt = `You are a semantic router for an AI agent.
Given the user query, return a JSON object with a "playbook_ids" array containing up to 2 playbook IDs that are highly relevant to helping the user accomplish their goal.
If none are highly relevant, return an empty array.

User Query: "${userQuery}"

Available Playbooks:
${JSON.stringify(catalog, null, 2)}

Example output:
{
  "playbook_ids": ["onboard_new_user"]
}`;

    try {
      const res = await invoke<{ content: string; tool_calls?: any[]; thinking?: string }>('run_copilot_chat', {
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        format: 'json',
        options: { temperature: 0.1 }
      });
      
      const parsed = parseAIResponse(res.content);
      if (parsed && Array.isArray(parsed.playbook_ids)) {
        const ids = new Set(parsed.playbook_ids);
        return API_WORKFLOWS.filter(w => ids.has(w.id));
      }
    } catch (e) {
      console.error("Failed to route playbooks:", e);
    }
    return [];
  }

  static async run(
    userMsg: ChatMessage,
    context: OrchestratorContext
  ): Promise<void> {
    const chatStore = useChatStore.getState();
    const { addMessage, startStreamingMessage, appendStreamingToken, finalizeStreamingMessage, messages } = chatStore;
    const { signal, navigate, location } = context;

    startStreamingMessage([], undefined, false);

    const filters = useFilters.getState();
    const categories = await queryClient.fetchQuery({ queryKey: ['categories'], queryFn: api.getCategories });
    const accounts = await queryClient.fetchQuery({ queryKey: ['accounts'], queryFn: api.getAccounts });
    const transactions = await queryClient.fetchQuery({ queryKey: ['transactions', undefined], queryFn: () => api.getTransactions() });
    const recurrenceMapObj = await queryClient.fetchQuery({ queryKey: ['recurrence', filters.demoMode], queryFn: () => buildRecurrenceMap(filters.demoMode) });
    const recurrenceMap = new Map(Object.entries(recurrenceMapObj));
    const budgets = await queryClient.fetchQuery({ queryKey: ['budgets'], queryFn: api.getBudgets });
    const dataStore = { categories, accounts, transactions, recurrenceMap, budgets };

    const runwayData = await calculateGlobalRunwayData();

    const stateContext = `Current Date: ${new Date().toISOString().slice(0, 10)} (${new Date().toLocaleDateString()})
Earliest Transaction Date: ${filters.earliestTransactionDate || 'None'}
Latest Transaction Date: ${filters.latestTransactionDate || 'None'}
Current Page: ${location.pathname}
Current Filter Preset: ${filters.preset}
Current Search Query: "${filters.searchQuery}"
Available Categories: ${dataStore.categories.map((c) => c.name).join(', ')}
Available Accounts: ${dataStore.accounts.map((a) => a.name).join(', ')}

Global Cash Runway:
${JSON.stringify(runwayData, null, 2)}`;

    // Evict older messages to prevent context window overflow, keeping last 100 for long workflows
    const maxHistoryLength = 100;
    let conversationHistory = messages.length > maxHistoryLength 
      ? [...messages.slice(messages.length - maxHistoryLength), userMsg]
      : [...messages, userMsg];
    let loops = 0;
    const maxLoops = 15;
    const currentSteps: any[] = [];
    let lastQueryState: any = null;
    let lastExecutedAction: string = '';
    const localAIModel = localAI;
    const modelName = formatModelName(localAIModel.modelName);

    while (loops < maxLoops) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      loops++;
      const isLastLoop = loops === maxLoops;

      if (loops === 1) {
        currentSteps.push({ type: 'process', status: 'running', text: `Routing semantic intent...` });
        const activePlaybooks = await this.routeToPlaybooks(userMsg.content, localAIModel.modelName);
        const overrideSystemPrompt = await import('./prompts').then(m => m.getSystemPrompt(stateContext, undefined, JSON.stringify(activePlaybooks, null, 2)));
        // We will pass overrideSystemPrompt below
        (this as any)._cachedSystemPrompt = overrideSystemPrompt;
      }

      if (loops === maxLoops) {
        currentSteps.push({ type: 'process', status: 'running', text: `Reached operation limit.` });
        await finalizeStreamingMessage(
          "I have reached my execution limit, but I am still working. Would you like me to continue?",
          null,
          currentSteps,
          undefined,
          undefined,
          undefined,
          undefined,
          true // isAborted
        );
        break;
      }

      const activeHistory = conversationHistory;

      console.log("BEFORE CHAT COPILOT LOOP ITERATION", loops);
      currentSteps.push({ type: 'process', status: 'running', text: `Running ${modelName}...` });
      let currentResponse = '';
      let chatResult: { content: string; tool_calls?: any[]; thinking?: string } | null = null;

      try {
        chatResult = await localAIModel.chatCopilot(
          activeHistory,
          stateContext,
          (this as any)._cachedSystemPrompt, // override system prompt
          undefined, // no schema
          (chunk) => { appendStreamingToken(chunk); },
          signal,
          false,
          AGENT_TOOLS
        );
        currentResponse = chatResult.content || '';
        // Thinking is kept native, no longer wrapped in XML
      } catch (err: any) {
        console.error("CHAT COPILOT THREW ERROR", err);
        if (err.name === 'AbortError') throw err;
        throw new Error(`LLM Error: ${err.message}`);
      }
      
      console.log("AFTER CHAT COPILOT, RESULT:", chatResult);

      // Check if provider returned a native tool call
      let actionObj: any = null;
      let parsedMessage: any = null;
      
      // Extract XML artifact natively from stream response
      const artifactMatch = currentResponse.match(/<artifact\s+identifier="([^"]+)"\s+title="([^"]+)"(?:\s+type="([^"]+)")?>([\s\S]*?)<\/artifact>/);
      if (artifactMatch) {
        const identifier = artifactMatch[1];
        const title = artifactMatch[2];
        const type = artifactMatch[3] || 'markdown';
        const content = artifactMatch[4].trim();

        // Strip the artifact from the chat UI
        currentResponse = currentResponse.replace(artifactMatch[0], '').trim();

        // Synthesize the action object so it runs through the standard pipeline
        actionObj = {
          action: 'create_artifact',
          identifier,
          title,
          type,
          content
        };
      } else if (chatResult && chatResult.tool_calls && Array.isArray(chatResult.tool_calls) && chatResult.tool_calls.length > 0) {
        parsedMessage = { tool_calls: chatResult.tool_calls };
        const call = chatResult.tool_calls[0].function || chatResult.tool_calls[0];
        
        let parsedArgs = call.arguments || {};
        if (typeof parsedArgs === 'string') {
          try {
            parsedArgs = JSON.parse(parsedArgs);
          } catch (e) {
            console.error("Failed to parse tool arguments string", e);
            parsedArgs = {}; // Prevent spreading a string if parse fails
          }
        }

        actionObj = {
          action: call.name,
          ...parsedArgs
        };
      }

      if (!actionObj) {
        // If no tool call is detected, we assume the LLM just responded with a message.
        let dynamicTitle = 'Response';
        if (lastExecutedAction === 'query_data') dynamicTitle = 'Financial Summary';
        else if (lastExecutedAction === 'categorize_transactions') dynamicTitle = 'Categorization Results';
        else if (lastExecutedAction === 'subscription_alerts') dynamicTitle = 'Subscription Scan';
        else if (lastExecutedAction === 'spending_anomalies') dynamicTitle = 'Anomaly Detection';
        else if (lastExecutedAction === 'filter_ui' || lastExecutedAction === 'filter' || lastExecutedAction === 'navigate') dynamicTitle = 'Navigation & Filters';
        else if (lastExecutedAction === 'create_artifact' || lastExecutedAction === 'update_artifact') dynamicTitle = 'Document Drafted';
        else if (lastExecutedAction === 'generate_document') dynamicTitle = 'Document Generated';

        await finalizeStreamingMessage(
          currentResponse,
          null,
          currentSteps,
          undefined,
          dynamicTitle as any
        );
        break;
      }

      const action = actionObj.action;
      lastExecutedAction = action;
      let humanReadableAction = action;
      if (action === 'query_data') humanReadableAction = 'Analyzing financial data';
      else if (action === 'filter_ui' || action === 'filter' || action === 'navigate') humanReadableAction = 'Adjusting view filters';
      else if (action === 'create_artifact' || action === 'update_artifact') humanReadableAction = 'Drafting artifact';
      else if (action === 'generate_document') humanReadableAction = 'Generating document';
      else if (action === 'categorize_transactions') humanReadableAction = 'Categorizing transactions';
      else if (action === 'subscription_alerts') humanReadableAction = 'Checking subscriptions';
      else if (action === 'spending_anomalies') humanReadableAction = 'Analyzing anomalies';
      else if (action === 'manage_loans') humanReadableAction = 'Managing loans';
      else if (action === 'manage_tax_settings') humanReadableAction = 'Managing tax settings';

      currentSteps.push({ type: 'tool_execution', toolName: action, arguments: actionObj, status: 'running', text: `Tool Call: ${humanReadableAction}...` });

      let actionResult: any = null;
      let systemResultsMsg: ChatMessage | null = null;
      const toolHandler = toolRegistry.get(action);

      if (toolHandler) {
        const budgetStore = useBudgetStore.getState();
        const result = await toolHandler.execute(actionObj, { filters, dataStore, budgetStore, lastQueryState });
        
        if (result.lastQueryState) {
          lastQueryState = result.lastQueryState;
        }

        if (result.feedbackError) {
          systemResultsMsg = { role: 'tool', content: result.feedbackError };
          lastExecutedAction = '';
        } else {
          actionResult = result.actionResult;
          
          // Invalidate TanStack query cache since the LLM tools may have mutated data
          await queryClient.invalidateQueries();

          if (action === 'create_artifact' || action === 'update_artifact') {
             systemResultsMsg = null;
          } else {
             systemResultsMsg = result.systemResultsMsg ? { role: 'tool', content: result.systemResultsMsg } : null;
          }
        }
      } else {
         if (action === 'dom_update') {
           executeCopilotCommand(actionObj, { navigate, location } as any);
           actionResult = { action, success: true };
           systemResultsMsg = { role: 'system', content: "DOM clicked." };
         } else if (action === 'navigate' || action === 'filter' || action === 'filter_ui') {
           const ctx = {
             navigate,
             currentPath: location.pathname,
             categories: dataStore.categories,
             accounts: dataStore.accounts,
             setPreset: filters.setPreset,
             setCustomRange: filters.setCustomRange,
             setDisabledCategories: filters.setDisabledCategories,
             setEnabledAccounts: filters.setEnabledAccounts,
             setSearchQuery: filters.setSearchQuery,
             setMinPrice: filters.setMinPrice,
             setMaxPrice: filters.setMaxPrice
           };
           executeCopilotCommand(actionObj, ctx);
           actionResult = { action };
           
           // For navigation, we just end the turn
           await finalizeStreamingMessage(
             currentResponse,
             actionResult,
             currentSteps,
             undefined,
             undefined,
             undefined,
             undefined,
             undefined,
             undefined,
             chatResult?.thinking
           );
           break;
         } else {
           systemResultsMsg = { role: 'system', content: `Unknown action: ${action}` };
         }
      }
      if (!parsedMessage && actionObj) {
        // Synthesize standard tool_calls if we used the Gemma fallback
        const { action: fnName, ...args } = actionObj;
        parsedMessage = {
          tool_calls: [{ function: { name: fnName, arguments: args } }]
        };
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: currentResponse,
        thinking: chatResult?.thinking,
        tool_calls: parsedMessage?.tool_calls,
        actionResult,
        steps: [...currentSteps]
      };

      if (systemResultsMsg) {
        // Pass tool responses back cleanly as tool messages
        console.log("LOOP ITERATION - Pushing systemResultsMsg", systemResultsMsg);
        const contentStr = typeof systemResultsMsg.content === 'string' ? systemResultsMsg.content : JSON.stringify(systemResultsMsg.content);
        systemResultsMsg.content = systemResultsMsg.role === 'tool' ? contentStr : `Tool '${action}' returned:\n${contentStr}`;

        // We MUST finalize the intermediate assistant message before adding the tool message 
        // so the UI preserves the thinking steps and tool execution context.
        await finalizeStreamingMessage(
          currentResponse,
          actionResult,
          currentSteps,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          chatResult?.thinking
        );

        await addMessage(systemResultsMsg);
        conversationHistory = [
          ...conversationHistory,
          assistantMsg,
          systemResultsMsg
        ];
        
        // Start streaming for the next loop
        startStreamingMessage(currentSteps, undefined, true);
      } else {
        await finalizeStreamingMessage(
          currentResponse,
          actionResult,
          currentSteps,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          chatResult?.thinking
        );
        break;
      }
    }
  }
}
