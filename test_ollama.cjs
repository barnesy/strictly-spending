const http = require('http');
const req = http.request('http://localhost:11434/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log(body));
});
req.write(JSON.stringify({
  model: 'gemma4:e4b',
  messages: [{ role: 'user', content: 'Find any subscriptions under $10.' }],
  stream: false,
  tools: [
    {
      type: 'function',
      function: {
        name: 'query_data',
        description: 'Query financial aggregates.',
        parameters: {
          type: 'object',
          properties: { categories: { type: 'array', items: { type: 'string' } }, maxPrice: { type: 'number' } }
        }
      }
    }
  ]
}));
req.end();
