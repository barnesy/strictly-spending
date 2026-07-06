const Database = require('better-sqlite3');
const dbPath = require('os').homedir() + '/Library/Application Support/com.strictlyspending.app/spending-viz.sqlite';
const db = new Database(dbPath);

const messages = db.prepare(`SELECT thread_id, role, content, action_result, steps, thinking FROM messages ORDER BY id DESC LIMIT 50`).all();

const relevantThreads = new Set();
for (const msg of messages) {
  if (msg.content && (msg.content.includes("What are my top spending categories this month?") || msg.content.includes("Find any subscriptions under $10"))) {
    relevantThreads.add(msg.thread_id);
  }
}

console.log("Relevant Threads:", Array.from(relevantThreads));

// Sort them so they are in chronological order (descending id was used above, let's reverse to chronological)
messages.reverse();

for (const msg of messages) {
  if (relevantThreads.has(msg.thread_id)) {
    console.log(`\n--- [${msg.role}] ---`);
    if (msg.role === 'user') {
      console.log(msg.content);
    } else {
      console.log('CONTENT:', msg.content ? msg.content.substring(0, 500) : null);
      if (msg.action_result) {
         try { 
             let parsed = JSON.parse(msg.action_result); 
             console.log('ACTION_RESULT:', Object.keys(parsed), JSON.stringify(parsed).substring(0, 200)); 
         } catch(e) { 
             console.log('ACTION_RESULT:', msg.action_result.substring(0, 200)); 
         }
      }
      if (msg.steps) console.log('STEPS:', msg.steps);
      if (msg.thinking) console.log('THINKING:', msg.thinking.substring(0, 500));
    }
  }
}
