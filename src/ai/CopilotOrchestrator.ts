import { useChatStore, formatModelName } from '../chatStore';

import { useFilters } from '../store';
import { useBudgetStore } from '../budgetStore';
import { localAI, parseAIResponse, calculateGlobalRunwayData, COPILOT_RESPONSE_SCHEMA } from './index';
import type { ChatMessage } from './index';
import { toolRegistry } from './tools';
import { executeCopilotCommand } from '../copilotMatcher';
import { queryClient } from '../queryClient';
import { api } from '../api';
import { buildRecurrenceMap } from '../recurrence';

export interface OrchestratorContext {
  navigate: (path: string) => void;
  location: { pathname: string };
  signal: AbortSignal;
}

export class CopilotOrchestrator {
  static async classifyIntent(prompt: string, skills: any[]): Promise<any | null> {
    if (!skills || skills.length === 0) return null;
    
    // Fallback: fast keyword heuristic first to avoid latency on simple things
    const normPrompt = prompt.toLowerCase();
    const pnlMatch = skills.find(s => s.id === 'builtin:pnl' || s.name.toLowerCase().includes('profit'));
    if (pnlMatch && (normPrompt.includes('p&l') || normPrompt.includes('profit and loss') || normPrompt.includes('profit & loss') || normPrompt.includes('income statement'))) {
      return pnlMatch;
    }

    const runwayMatch = skills.find(s => s.id === 'builtin:runway' || s.name.toLowerCase().includes('runway'));
    if (runwayMatch && (normPrompt.includes('runway') || normPrompt.includes('rundown') || normPrompt.includes('cash projection'))) {
      return runwayMatch;
    }

    // Fast LLM intent check
    const skillList = skills.map(s => `- ID: ${s.id}, Name: ${s.name}, Desc: ${s.description}`).join('\n');
    const systemMsg = `You are a Semantic Intent Router. Match the user's prompt to one of the following skills:\n${skillList}\n\nIf the prompt matches a skill's intent, output its exact ID. If no skill matches, output "none". DO NOT OUTPUT ANYTHING ELSE. ONLY THE EXACT ID OR "none".`;
    
    try {
      const response = await localAI.chatCopilot(
        [{ role: 'user', content: prompt }],
        "System State Context not needed for intent routing.",
        systemMsg,
        {
           type: "object",
           properties: { skillId: { type: "string" } },
           required: ["skillId"]
        }
      );
      const parsed = parseAIResponse(response);
      const id = parsed?.skillId || response.trim();
      if (id === 'none') return null;
      return skills.find(s => s.id === id) || null;
    } catch {
      return null;
    }
  }

  static async run(
    userMsg: ChatMessage,
    context: OrchestratorContext
  ): Promise<void> {
    const chatStore = useChatStore.getState();
    const { addMessage, startStreamingMessage, appendStreamingToken, updateStreamingMetadata, finalizeStreamingMessage, messages } = chatStore;
    const { signal, navigate, location } = context;

    if (chatStore.directLlmMode) {
      startStreamingMessage([], 'explanation');

      const cleanedHistory = messages.map((m) => {
        if (m.role === 'assistant') {
          try {
            const parsed = parseAIResponse(m.content);
            if (parsed && parsed.body) {
              return { ...m, content: parsed.body };
            }
          } catch {}
        }
        return m;
      });

      const conversationHistory = [...cleanedHistory, userMsg];
      const localAIModel = localAI;
      let currentResponse = '';

      try {
        currentResponse = await localAIModel.chatCopilot(
          conversationHistory,
          "Direct LLM Mode Active.",
          undefined,
          null,
          (chunk) => {
            appendStreamingToken(chunk);
          },
          signal,
          true
        );
      } catch (err: any) {
        if (err.name === 'AbortError') throw err;
        throw new Error(`LLM Error: ${err.message}`);
      }

      await finalizeStreamingMessage(
        currentResponse,
        null,
        [],
        { prompt: 0, completion: 0, total: 0 },
        'explanation'
      );
      return;
    }

    // Use already cached agent skills
    const allSkills = chatStore.agentSkills || [];

    const filters = useFilters.getState();
    const categories = await queryClient.fetchQuery({ queryKey: ['categories'], queryFn: api.getCategories });
    const accounts = await queryClient.fetchQuery({ queryKey: ['accounts'], queryFn: api.getAccounts });
    const transactions = await queryClient.fetchQuery({ queryKey: ['transactions', undefined], queryFn: () => api.getTransactions() });
    const recurrenceMapObj = await queryClient.fetchQuery({ queryKey: ['recurrence', filters.demoMode], queryFn: () => buildRecurrenceMap(filters.demoMode) });
    const recurrenceMap = new Map(Object.entries(recurrenceMapObj));
    const dataStore = { categories, accounts, transactions, recurrenceMap };

    let currentSkillId: string | undefined = undefined;
    let currentCompletedStages: string[] = [];

    const matchedSkill = await CopilotOrchestrator.classifyIntent(userMsg.content, allSkills);
    if (matchedSkill) {
      currentSkillId = matchedSkill.id;
      currentCompletedStages = [];
    } else {
      const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant' && m.activeSkillId);
      const activeSkill = allSkills.find(s => s.id === lastAssistantMsg?.activeSkillId);
      let lastAction = 'none';
      if (lastAssistantMsg) {
        try {
          const parsed = parseAIResponse(lastAssistantMsg.content);
          lastAction = parsed?.agent_action?.action || 'none';
        } catch {}
      }
      
      const hasUncompletedStages = activeSkill && activeSkill.stages && activeSkill.stages.length > 0 &&
        lastAssistantMsg?.completedStages && lastAssistantMsg.completedStages.length < activeSkill.stages.length;
        
      const isStillRunningActions = activeSkill && lastAction !== 'none';
      
      if (hasUncompletedStages || isStillRunningActions) {
        currentSkillId = lastAssistantMsg?.activeSkillId;
        currentCompletedStages = lastAssistantMsg?.completedStages || [];
      } else {
        currentSkillId = undefined;
        currentCompletedStages = [];
      }
    }

    const runwayData = await calculateGlobalRunwayData();

    const stateContext = `Current Date: ${new Date().toISOString().slice(0, 10)} (${new Date().toLocaleDateString()})
Earliest Transaction Date: ${filters.earliestTransactionDate || 'None'}
Latest Transaction Date: ${filters.latestTransactionDate || 'None'}
Current Page: ${location.pathname}
Current Filter Preset: ${filters.preset}
Current Search Query: "${filters.searchQuery}"
Available Categories: ${dataStore.categories.map((c) => c.name).join(', ')}
Available Accounts: ${dataStore.accounts.map((a) => a.name).join(', ')}`;

    let conversationHistory = [...messages, userMsg];
    let loops = 0;
    const currentSteps: string[] = [];

    let totalPrompt = 0;
    let totalCompletion = 0;

    // Shared execution state across loop
    let lastQueryState: any = null;

    const initialActiveSkill = currentSkillId ? allSkills.find(s => s.id === currentSkillId) : null;
    const maxLoops = initialActiveSkill ? 6 : 2; // Skills can have multiple stages, basic queries get strictly 2 loops

    while (loops < maxLoops) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      loops++;
      const activeSkill = currentSkillId ? allSkills.find(s => s.id === currentSkillId) : null;
      const isLastLoop = loops === maxLoops;

      startStreamingMessage(currentSteps, 'tool_select', loops > 1);

      const cleanedHistory = conversationHistory.map((m) => {
        if (m.role === 'assistant') {
          try {
            const p = parseAIResponse(m.content);
            if (p && p.body) return { ...m, content: JSON.stringify({ ...p, body: '' }) };
          } catch {}
        }
        return m;
      });

      const activeHistory = isLastLoop
        ? [
            ...cleanedHistory,
            {
              role: 'system' as const,
              content: `This is the final turn. Explain results strictly using numbers. Set 'agent_action.action' to 'none'.`
            }
          ]
        : cleanedHistory;

      let skillPrompt = activeSkill ? `[SKILL ACTIVE: ${activeSkill.name}]\n${activeSkill.description}\n\nINSTRUCTIONS:\n${activeSkill.prompt}` : '';

      if (activeSkill && activeSkill.stages && activeSkill.stages.length > 0) {
         // Stage logic
         const uncompletedStages = activeSkill.stages.filter((s: any) => !currentCompletedStages.includes(s.name));
         if (uncompletedStages.length > 0) {
           const currentStage = uncompletedStages[0];
           skillPrompt += `\n\nCURRENT STAGE: ${currentStage.name}\n${currentStage.instructions}\n\nWhen you have completed this stage's goals, output "STAGE_COMPLETE: ${currentStage.name}" in your body.`;
         } else {
           skillPrompt += `\n\nALL STAGES COMPLETED. Summarize final results.`;
         }
      }

      const localAIModel = localAI;
      const modelName = formatModelName(localAIModel.modelName);
      currentSteps.push(`Running ${modelName}...`);

      let currentResponse = '';
      try {
        currentResponse = await localAIModel.chatCopilot(
          activeHistory,
          stateContext,
          skillPrompt,
          COPILOT_RESPONSE_SCHEMA,
          (chunk) => { appendStreamingToken(chunk); },
          signal
        );
      } catch (err: any) {
        if (err.name === 'AbortError') throw err;
        throw new Error(`LLM Error: ${err.message}`);
      }

      // Check usage from localAI directly instead of parsed wrapper
      totalPrompt += 0;
      totalCompletion += 0;

      let actionObj: any = null;
      let actionResult: any = null;
      let systemResultsMsg: ChatMessage | null = null;

      try {
        const parsed = parseAIResponse(currentResponse);
        actionObj = parsed?.agent_action;

        // POST-PROCESSING INTERCEPTOR
        // If LLM hallucinated data without querying first, intercept and force query_data
        const rawAction = actionObj?.action || 'none';
        const bodyText = parsed?.body || "";
        const hasSystemDbMessage = activeHistory.some((m: ChatMessage) => m.role === 'system' && m.content.includes('Database Query Results'));
        
        const hasHallucinatedNumbers = bodyText.includes('$') || bodyText.includes('| ---');

        if (rawAction === 'none' && hasHallucinatedNumbers && !hasSystemDbMessage) {
            actionObj = actionObj || {};
            actionObj.action = 'query_data';
            actionObj.explanation = "Intercepted hallucinated numbers. Reverting to query_data.";
            
            // Scrub the hallucinated body so it doesn't render alongside the query_data UI card
            if (parsed) {
               parsed.body = "I need to fetch those numbers from the database first. One moment...";
               currentResponse = JSON.stringify(parsed);
            }
        } else if (rawAction !== 'none' && hasHallucinatedNumbers && !hasSystemDbMessage) {
            // Intercept if the model called a valid action (like spending_anomalies) but hallucinated a markdown table in the body
            if (parsed) {
               parsed.body = "I'll run that tool for you now. Here are the results:";
               currentResponse = JSON.stringify(parsed);
            }
        }

        if (parsed?.body) {
           const match = parsed.body.match(/STAGE_COMPLETE:\s*([^\n]+)/);
           if (match && match[1]) {
              const stageName = match[1].trim();
              if (!currentCompletedStages.includes(stageName)) {
                 currentCompletedStages.push(stageName);
                 currentSteps.push(`Completed Stage: ${stageName}`);
              }
           }
        }
      } catch {
        // syntax error
      }

      const action = actionObj?.action || 'none';
      if (action === 'none') {
        await finalizeStreamingMessage(
          currentResponse,
          actionResult,
          currentSteps,
          { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
          'explanation',
          currentSkillId,
          currentCompletedStages
        );
        break;
      }

      currentSteps.push(`Executing action: ${action}`);

      const toolHandler = toolRegistry.get(action);
      if (toolHandler) {
        const budgetStore = useBudgetStore.getState();
        const result = await toolHandler.execute(actionObj, { filters, dataStore, budgetStore, lastQueryState });
        
        if (result.lastQueryState) {
          lastQueryState = result.lastQueryState;
        }

        if (result.feedbackError) {
          systemResultsMsg = { role: 'system', content: result.feedbackError };
        } else {
          actionResult = result.actionResult;
          systemResultsMsg = result.systemResultsMsg ? { role: 'system', content: result.systemResultsMsg } : null;
        }
      } else {
         // handle dom_update, navigate, etc.
         if (action === 'dom_update') {
           executeCopilotCommand(actionObj, { navigate, location } as any);
           actionResult = { action, success: true };
           systemResultsMsg = { role: 'system', content: "DOM clicked." };
         } else if (action === 'navigate' || action === 'filter') {
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
           await finalizeStreamingMessage(
             currentResponse,
             actionResult,
             currentSteps,
             { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
             'explanation',
             currentSkillId,
             currentCompletedStages
           );
           break;
         } else {
           systemResultsMsg = { role: 'system', content: `Unknown action: ${action}` };
         }
      }

      await finalizeStreamingMessage(
        currentResponse,
        actionResult,
        currentSteps,
        { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
        'tool_select',
        currentSkillId,
        currentCompletedStages
      );

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: currentResponse,
        actionResult,
        steps: [...currentSteps],
        tokenUsage: { prompt: totalPrompt, completion: totalCompletion, total: totalPrompt + totalCompletion },
        purpose: 'tool_select',
        activeSkillId: currentSkillId,
        completedStages: currentCompletedStages
      };

      if (systemResultsMsg) {
        await addMessage(systemResultsMsg);
        conversationHistory = [
          ...conversationHistory,
          assistantMsg,
          systemResultsMsg
        ];
      } else {
        break;
      }
    }
  }
}
