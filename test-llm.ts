import { GENERAL_SYSTEM_PROMPT, BASELINE_TEST_CASES, parseAIResponse, COPILOT_RESPONSE_SCHEMA } from './src/ai';

const OLLAMA_URL = 'http://localhost:11434/api/chat';
const MODEL = 'llama3.2:1b';

const dummyState = `Current Date: 2026-06-14 (Sunday)
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

async function testLLM() {
  const fullSystemPrompt = `${GENERAL_SYSTEM_PROMPT}\n\n<current_state>\n${dummyState}\n</current_state>`;
  
  for (let i = 0; i < BASELINE_TEST_CASES.length; i++) {
    const tc = BASELINE_TEST_CASES[i];
    console.log(`\n================================`);
    console.log(`TEST CASE ${i + 1}: ${tc.prompt}`);
    console.log(`CRITERIA: ${tc.criteria}`);
    console.log(`--------------------------------`);
    
    try {
      const response = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: fullSystemPrompt },
            { role: 'user', content: tc.prompt }
          ],
          format: COPILOT_RESPONSE_SCHEMA,
          stream: false,
          options: { temperature: 0.2, num_predict: 1024 }
        })
      });
      
      const data = await response.json();
      const content = data.message?.content || '';
      
      const parsed = parseAIResponse(content);
      if (parsed) {
        console.log(`\n✅ PARSED JSON SUCCESS:`);
        console.log(JSON.stringify(parsed, null, 2));
      } else {
        console.log(`\n❌ PARSED JSON FAILED`);
        console.log(`RAW OUTPUT:\n${content}`);
      }
    } catch (err) {
      console.error('Error running test case:', err);
    }
  }
}

testLLM().catch(console.error);
