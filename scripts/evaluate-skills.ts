import fs from 'fs';
import path from 'path';
import { DEFAULT_SKILLS } from '../src/defaultSkills';
import { localAI } from '../src/ai/localAI';
import { getSystemPrompt, GENERAL_SYSTEM_PROMPT } from '../src/ai/prompts';
import { parseAIResponse } from '../src/ai/utils';
import { EVALUATOR_RESPONSE_SCHEMA, COPILOT_RESPONSE_SCHEMA } from '../src/ai/types';

const DUMMY_STATE = `Current Date: 2026-06-14 (Sunday)
Earliest Transaction Date: 2025-01-01
Latest Transaction Date: 2026-06-12
Current Page: /
Current Filter Preset: allTime
Available Categories: Groceries, Utilities, Travel, Restaurants & Coffee, Subscriptions, Shopping
Available Accounts: Checking, Savings, Credit Card
Currently Disabled Categories: None
Currently Enabled Accounts: Checking, Savings, Credit Card
Current Cash Balance: $12000.00
Current Credit CC Debt: $2000.00
Net Cash starting reserves: $10000.00
Current Monthly Outflow: $1000.00
Calculated Budget Runway: 10.0 months`;

async function evaluateWithLLM(prompt: string, skillSystemPrompt: string, output: string, criteria: string) {
  const evalSystemPrompt = `You are a strict QA validation agent. Your task is to evaluate a local financial AI assistant's completion against a specified test prompt, system instructions, and target validation criteria.
  
Respond ONLY with a JSON object of the following format:
{
  "success": true or false,
  "score": integer between 0 and 100 representing how well it satisfied the criteria,
  "reasoning": "A concise single-sentence explanation of why the output passed or failed, noting any missing details."
}`;

  const evalUserPrompt = `Test Prompt:
"${prompt}"

Active Skill prompt instructions:
"${skillSystemPrompt}"

Actual Model Output received (as JSON stringified sequence of turns):
"${output}"

Target Evaluation Criteria:
"${criteria}"

Task:
Determine if the Actual Model Output fully satisfies the Target Evaluation Criteria.
If yes, return {"success": true, "score": 100, "reasoning": "All criteria met."}.
If no, return {"success": false, "score": 0 to 80, "reasoning": "Explain what is missing."}.`;

  try {
    const rawEval = await localAI.chatCopilot(
      [{ role: 'user', content: evalUserPrompt }],
      'Current Page: /evaluator',
      evalSystemPrompt,
      EVALUATOR_RESPONSE_SCHEMA
    );
    const parsed = parseAIResponse(rawEval);
    if (parsed && typeof parsed.success === 'boolean') {
      return { success: parsed.success, score: parsed.score || 0, reasoning: parsed.reasoning || '' };
    }
    const hasSuccess = rawEval.toLowerCase().includes('"success": true');
    return { success: hasSuccess, score: hasSuccess ? 100 : 0, reasoning: 'Fallback eval parsing' };
  } catch (err: any) {
    return { success: false, score: 0, reasoning: `Evaluator failed: ${err.message}` };
  }
}

async function main() {
  console.log("Starting Skills Evaluation...");
  
  if (!localAI.isLoaded) {
    await localAI.init();
  }
  
  const results: any[] = [];
  let successCount = 0;
  let totalCount = 0;

  for (const skill of DEFAULT_SKILLS) {
    if (!skill.testCases || skill.testCases.length === 0) continue;
    
    console.log(`\nEvaluating Skill: ${skill.name} (${skill.id})`);
    
    for (const testCase of skill.testCases) {
      totalCount++;
      const startTime = Date.now();
      
      let overridePromptText = `${GENERAL_SYSTEM_PROMPT}\n\n## Active Skill Instructions:\n${skill.systemPromptExtension}`;
      
      let conversationHistory: any[] = [{ role: 'user', content: testCase.prompt }];
      let currentCompletedStages: string[] = [];
      let loops = 0;
      const maxLoops = 4;
      let fullTranscript = "";
      
      while (loops < maxLoops) {
        loops++;
        let skillPrompt = `[SKILL ACTIVE: ${skill.name}]\n${skill.description}\n\nINSTRUCTIONS:\n${skill.systemPromptExtension}`;

        if (skill.stages && skill.stages.length > 0) {
           const uncompletedStages = skill.stages.filter(s => !currentCompletedStages.includes(s.title));
           if (uncompletedStages.length > 0) {
             const currentStage = uncompletedStages[0];
             skillPrompt += `\n\nCURRENT STAGE: ${currentStage.title}\n\nWhen you have completed this stage's goals, output "STAGE_COMPLETE: ${currentStage.title}" in your body.`;
           } else {
             skillPrompt += `\n\nALL STAGES COMPLETED. Summarize final results.`;
           }
        }

        const isLastLoop = loops === maxLoops;
        const activeHistory = isLastLoop ? [
           ...conversationHistory,
           { role: 'system', content: `This is the final turn. Set 'agent_action.action' to 'none'.` }
        ] : conversationHistory;

        let currentResponse = '';
        try {
          currentResponse = await localAI.chatCopilot(
            activeHistory,
            DUMMY_STATE,
            skillPrompt,
            COPILOT_RESPONSE_SCHEMA
          );
        } catch (err: any) {
          console.error("LLM Error:", err.message);
          break;
        }
        
        let actionObj: any = null;
        try {
          const parsed = parseAIResponse(currentResponse);
          actionObj = parsed?.agent_action;

          // INTERCEPTOR (Simulate)
          const rawAction = actionObj?.action || 'none';
          const bodyText = parsed?.body || "";
          if ((rawAction === 'none' || rawAction === 'generate_document') && bodyText.includes('$')) {
              actionObj = actionObj || {};
              actionObj.action = 'query_data';
          }

          if (parsed?.body) {
             const match = parsed.body.match(/STAGE_COMPLETE:\s*([^\n]+)/);
             if (match && match[1]) {
                const stageName = match[1].trim();
                if (!currentCompletedStages.includes(stageName)) {
                   currentCompletedStages.push(stageName);
                }
             }
          }
        } catch {}

        fullTranscript += `Turn ${loops}: ${currentResponse}\n\n`;
        const action = actionObj?.action || 'none';

        conversationHistory.push({ role: 'assistant', content: currentResponse });

        if (action === 'none') {
           break;
        } else if (action === 'query_data') {
           conversationHistory.push({ role: 'system', content: 'Database Query Results:\n- Total Revenue: $5000\n- Operating Expenses: $2000\n- Net Income: $3000' });
        } else if (action === 'project_runway') {
           conversationHistory.push({ role: 'system', content: 'Project Runway Results:\n- Cash Balance: $12000.00\n- Monthly Outflow: $1000.00\n- Calculated Runway: 12.0 months' });
        } else if (action === 'cashflow_prediction') {
           conversationHistory.push({ role: 'system', content: 'Cashflow Prediction:\n- Current Cash: $12000\n- Upcoming Bills: $2000\n- Safe to Spend: $10000' });
        } else if (action === 'scenario_forecasting') {
           conversationHistory.push({ role: 'system', content: 'Scenario Forecaster:\n- Adjusted Runway: 14.5 months' });
        } else if (action === 'goal_tracking') {
           conversationHistory.push({ role: 'system', content: 'Goal Tracking:\n- Target Amount: $10000\n- Current Savings Rate: $500/mo\n- Projected Time: 20 months' });
        } else if (action === 'tax_estimation') {
           conversationHistory.push({ role: 'system', content: 'Tax Estimation:\n- Estimated Burden: $1250\n- Effective Rate: 25%' });
        } else {
           // Assume other actions succeed immediately
           conversationHistory.push({ role: 'system', content: `Action ${action} completed.` });
        }
      }
      
      const evalResult = await evaluateWithLLM(testCase.prompt, skill.systemPromptExtension || "", fullTranscript, testCase.criteria);
      
      const latencyMs = Date.now() - startTime;
      if (evalResult.success) successCount++;

      console.log(`  Test [${totalCount}]: "${testCase.prompt}"`);
      console.log(`    => Result: ${evalResult.success ? 'PASS' : 'FAIL'}`);
      console.log(`    => Reasoning: ${evalResult.reasoning}`);
      
      results.push({
        skillId: skill.id,
        prompt: testCase.prompt,
        criteria: testCase.criteria,
        success: evalResult.success,
        score: evalResult.score,
        reasoning: evalResult.reasoning,
        transcript: fullTranscript,
        latencyMs
      });
    }
  }

  const successRate = Math.round((successCount / totalCount) * 100);
  console.log(`\nEvaluation complete. Success Rate: ${successCount}/${totalCount} (${successRate}%)`);
  
  const outputPath = path.join(process.cwd(), 'skills-evaluation-results.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    totalTests: totalCount,
    successCount,
    successRate: `${successRate}%`,
    results
  }, null, 2));
}

main().catch(console.error);
