const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  await page.setViewportSize({ width: 1728, height: 992 });
  await page.goto('http://localhost:5173/forecast', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/Users/barnesy/.gemini/antigravity-ide/brain/fd6dcede-b301-4bf5-8272-fec529fe026b/forecast-debug.png' });
  await browser.close();
})();
