export type ChatMessage = { role: 'system'|'user'|'assistant', content: string };

export class LocalAI {
  public isLoaded = false;
  private modelName = 'llama3.2:1b';

  async init(progressCallback?: (progress: string) => void) {
    try {
      progressCallback?.("Checking connection to Ollama server...");
      const response = await fetch('http://localhost:11434/api/tags');
      if (!response.ok) {
        throw new Error('Ollama server is not running.');
      }
      
      const data = await response.json();
      const hasModel = data.models?.some(
        (m: any) => m.name.startsWith(this.modelName) || m.name === this.modelName || m.name.startsWith('llama3.2')
      );
      
      if (!hasModel) {
        this.isLoaded = false;
        throw new Error(`Model '${this.modelName}' is not installed in Ollama. Please download the model.`);
      }
      
      this.isLoaded = true;
      progressCallback?.("AI ready!");
    } catch (e: any) {
      this.isLoaded = false;
      throw e;
    }
  }

  async pullModel(progressCallback?: (progress: number, status: string) => void): Promise<void> {
    const response = await fetch('http://localhost:11434/api/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: this.modelName }),
    });

    if (!response.ok) {
      throw new Error(`Failed to pull model: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('ReadableStream not supported in this browser.');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last incomplete line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const progressInfo = JSON.parse(line);
          if (progressInfo.status === 'success') {
            this.isLoaded = true;
            progressCallback?.(100, 'success');
            return;
          }
          
          if (progressInfo.total) {
            const pct = Math.round((progressInfo.completed / progressInfo.total) * 100);
            progressCallback?.(pct, progressInfo.status || 'downloading');
          } else {
            progressCallback?.(0, progressInfo.status || 'initializing');
          }
        } catch (e) {
          console.error('Failed to parse pull progress line:', e);
        }
      }
    }
    
    this.isLoaded = true;
  }

  async reviewTransactions(
    transactions: { desc: string; ruleCategory: string }[],
    availableCategories: string[]
  ): Promise<string[]> {
    if (!this.isLoaded) throw new Error("Local AI not initialized.");

    const prompt = `You are a financial categorization auditor running locally. 
Review the following transaction descriptions and the category assigned to them by a simple rule engine.
Respond with a JSON object containing a "results" array of strings, where each string is the BEST category for the transaction at the exact same index. 
You MUST choose from the following Available Categories EXACTLY (do not invent new ones):
${availableCategories.map(c => `- ${c}`).join('\n')}

Transactions:
${transactions.map((t, i) => `${i+1}. Desc: "${t.desc}" | Rule Guessed: "${t.ruleCategory}"`).join('\n')}

Example valid JSON output:
{
  "results": ["Dining", "Transportation", "Shopping"]
}
`;

    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        messages: [{ role: 'user', content: prompt }],
        format: 'json',
        options: { temperature: 0.1 }
      })
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
    const data = await response.json();
    const content = data.message?.content || '{"results":[]}';

    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.results) && parsed.results.length === transactions.length) {
        return parsed.results;
      }
      return transactions.map(t => t.ruleCategory);
    } catch {
      return transactions.map(t => t.ruleCategory);
    }
  }

  async chatCopilot(messages: ChatMessage[], stateContext: string): Promise<string> {
    if (!this.isLoaded) throw new Error("Local AI not initialized.");

    const systemPrompt = `You are the Strictly Spending Copilot, an AI assistant running locally.
You help the user navigate and filter their spending data.

Current App State:
${stateContext}

CRITICAL INSTRUCTIONS:
- If the user asks you to filter, search, show spending/transactions, or navigate, you MUST output a SINGLE JSON command block representing the entire filter state.
- You MUST NOT output multiple JSON command blocks, nor wrap JSON blocks inside list items or bullet points.
- You MUST NOT output any conversational text or explanation before or after the JSON command block. Output ONLY the JSON block itself.
- If the user asks a general question that is NOT a request to filter, search, show, or navigate (e.g. "How does this work?"), reply normally with conversational text.

HOW TO FILTER CORRECTLY:
1. **Merchant Search ("search")**:
   - Use this field ONLY when the user references specific store names, business names, websites, brands, apps, or merchant names (e.g. "Netflix", "Amazon", "Walmart", "Costco", "Spotify", "Uber", "Lyft", "Starbucks").
   - Example user query: "Show me Netflix spending" or "Where is my Amazon transactions?"
   - Correct JSON: { "action": "filter", "page": "/", "search": "Netflix", "explanation": "Showing Netflix spending." }
   - WARNING: Do NOT reply with plain text like "Showing Netflix spending." or "Here are your Netflix transactions." You MUST output the JSON block!

2. **Category Filters ("categories")**:
   - Use this field for general spending categories or concepts (e.g. "food spending", "dining out", "utility bills", "rent", "entertainment").
   - Map high-level concepts to the Available Categories in the App State (e.g. "food" -> ["Groceries", "Restaurants & Coffee"]).
   - **Combined requests**: If the user asks for multiple categories, concepts, or filters in a single query (e.g., "show me food, subscriptions, and entertainment"), you MUST combine all matched categories into the single "categories" array (e.g., ["Groceries", "Restaurants & Coffee", "Subscriptions", "Entertainment"]). Do NOT create multiple JSON blocks.
   - Do NOT use the "search" field for categories or general concepts. Keep the "search" field empty or omit it.
   - WARNING: Do NOT put account names (such as "Demo: Credit Card" or "Demo: Checking") into this array.
   - Example user query: "Show me food spending"
   - Correct JSON: { "action": "filter", "page": "/", "categories": ["Groceries", "Restaurants & Coffee"], "explanation": "I've filtered the dashboard to show your food spending." }

3. **Account Filters ("accounts")**:
   - Use this when the user asks to filter by specific card/account name (e.g. "Chase Visa", "Capital One", "Demo: Credit Card").
   - WARNING: Do NOT put category names (such as "Groceries" or "Utilities") into this array.
   - Example user query: "Show me Demo: Credit Card spending"
   - Correct JSON: { "action": "filter", "page": "/", "accounts": ["Demo: Credit Card"], "explanation": "Showing Demo Credit Card spending." }

4. **Date Range Filters ("preset")**:
   - Use this field to filter transactions in time. Map natural language time requests to these exact preset values:
     - "last month", "previous month" -> "lastMonth"
     - "this month", "current month" -> "thisMonth"
     - "last 30 days", "past 30 days", "past month" -> "last30"
     - "last 90 days", "past 3 months" -> "last90"
     - "year to date", "this year", "ytd" -> "ytd"
     - "all time", "everything", "history" -> "allTime"
   - Example user query: "Show me food from last month"
   - Correct JSON: { "action": "filter", "page": "/", "categories": ["Groceries", "Restaurants & Coffee"], "preset": "lastMonth", "explanation": "Showing food spending from last month." }

SUPPORTED JSON FORMATS:
- Filter Categories only:
{ "action": "filter", "page": "/", "categories": ["Groceries", "Restaurants & Coffee"], "explanation": "I've filtered the dashboard to show your food spending." }

- Filter Merchant Search only:
{ "action": "filter", "page": "/", "search": "Netflix", "explanation": "Showing Netflix spending." }

- Navigate page only:
{ "action": "navigate", "page": "/settings", "explanation": "Navigating to the settings page." }

- Combined Categories and Date Range Preset:
{ "action": "filter", "page": "/", "categories": ["Groceries", "Restaurants & Coffee", "Entertainment"], "preset": "lastMonth", "explanation": "Showing food and entertainment spending from last month." }

HOW TO HANDLE MULTIPLE FILTER REQUESTS & CONTEXT TRANSITIONS:
- **Default (Replace)**: By default, a new filter query should REPLACE the previous category and merchant filters. Do NOT keep previous filters unless the user explicitly indicates they want to combine/compound them (using words like "also", "and", "add", "as well", "additionally").
- **Compounding ("also" / "and")**: If the user uses compounding language (e.g. "also utilities", "and add rent", "show utilities as well"):
  - Inspect the 'Currently Disabled Categories' in the App State to find which categories are currently ACTIVE (i.e. NOT listed in 'Currently Disabled Categories').
  - Merge the currently active categories with the newly requested categories, and output the combined list in the "categories" array.
- **Narrowing/Implied Conditionals ("only" / "just" / subset refines)**: If the user refines their search to a narrower category (e.g., asking for "groceries" after filtering by "food"):
  - Understand that they want to narrow the focus. Reduce the active categories down to just the subset requested (e.g. return only ["Groceries"]).

Valid pages: / (Dashboard), /transactions, /settings, /import
Valid presets: ytd, last30, last90, thisMonth, lastMonth, allTime

Note: ALWAYS use "page": "/" by default when filtering. Only use "/transactions" if the user explicitly asks for a "list of transactions" or "transaction log".

EXAMPLES:
User: Show me food spending
Assistant: { "action": "filter", "page": "/", "categories": ["Groceries", "Restaurants & Coffee"], "explanation": "I've filtered the dashboard to show your food spending." }

User: Show me utilities spending
Assistant: { "action": "filter", "page": "/", "categories": ["Utilities"], "explanation": "Showing utilities spending instead." }

User: Also show rent spending
Assistant: { "action": "filter", "page": "/", "categories": ["Utilities", "Rent"], "explanation": "Added rent spending to the filter." }

User: Filter my groceries also
Assistant: { "action": "filter", "page": "/", "categories": ["Groceries"], "explanation": "Filtered down to groceries only." }

User: Show me Netflix spending
Assistant: { "action": "filter", "page": "/", "search": "Netflix", "explanation": "Showing Netflix spending." }

User: Find Amazon purchases
Assistant: { "action": "filter", "page": "/", "search": "Amazon", "explanation": "Showing Amazon purchases." }

User: Can you show me food and subscriptions and entertainment
Assistant: { "action": "filter", "page": "/", "categories": ["Groceries", "Restaurants & Coffee", "Subscriptions", "Entertainment"], "explanation": "Showing food, subscriptions, and entertainment spending." }

User: let me see what I spent on food and entertainment last month
Assistant: { "action": "filter", "page": "/", "categories": ["Groceries", "Restaurants & Coffee", "Entertainment"], "preset": "lastMonth", "explanation": "Showing food and entertainment spending from last month." }

User: Go to settings
Assistant: { "action": "navigate", "page": "/settings", "explanation": "Navigating to settings." }

User: How are you?
Assistant: I am doing great! I can help you filter your spending or navigate the app.`;

    const fullMessages = [ { role: 'system', content: systemPrompt }, ...messages ];

    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        messages: fullMessages,
        stream: false,
        options: { temperature: 0.2 }
      })
    });

    if (!response.ok) throw new Error(`Ollama chat error: ${response.statusText}`);
    const data = await response.json();
    return data.message?.content || '';
  }
}

export const localAI = new LocalAI();
