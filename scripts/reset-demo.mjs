// One-off: clears + reseeds demo data so the app is left clean after the
// screenshot/video scripts.
//
// Usage:  node scripts/reset-demo.mjs
// Env:    STRICTLY_SPENDING_URL (default http://localhost:5189)
import { chromium } from 'playwright';

const URL = process.env.STRICTLY_SPENDING_URL || 'http://localhost:5189';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
await page.goto(URL, { waitUntil: 'networkidle' });
await page.click('a[href="/settings"]');
await page.waitForTimeout(400);
const clearBtn = page.locator('button:has-text("Clear demo data")');
if (await clearBtn.isEnabled()) {
  await clearBtn.click();
  await page.waitForTimeout(700);
}
const loadBtn = page.locator('button:has-text("Load demo data")');
if (await loadBtn.isEnabled()) {
  await loadBtn.click();
  await page.waitForTimeout(700);
}
await browser.close();
console.log('done — demo data reseeded');
