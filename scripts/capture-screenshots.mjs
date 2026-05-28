// Playwright-based screenshot capture for the Strictly Spending app.
// Loads the dev server, seeds demo data, enables demo mode, captures key views.
//
// Usage:
//   node scripts/capture-screenshots.mjs
//
// Override defaults with env vars:
//   SCREENSHOTS_OUT=/path/to/output  (default: ./screenshots)
//   STRICTLY_SPENDING_URL=http://localhost:5189

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const OUT = process.env.SCREENSHOTS_OUT || path.resolve('./screenshots');
const URL = process.env.STRICTLY_SPENDING_URL || 'http://localhost:5189';
const VIEWPORT = { width: 1440, height: 900 };

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
const page = await ctx.newPage();

async function shot(name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log('  →', file);
}

console.log('1) Open app & seed demo data');
await page.goto(URL, { waitUntil: 'networkidle' });
await page.click('a[href="/settings"]');
await page.waitForSelector('text=Demo data');
// Click Load demo data
const loadBtn = page.locator('button:has-text("Load demo data")');
if (await loadBtn.isVisible() && await loadBtn.isEnabled()) {
  await loadBtn.click();
  await page.waitForTimeout(800);
  console.log('  demo data loaded');
} else {
  console.log('  demo data already present');
}

console.log('2) Enable demo mode');
// Find the demo-mode switch by its label text
const demoSwitchLabel = page.locator('label:has-text("real data")');
const demoSwitch = demoSwitchLabel.locator('input[type="checkbox"]');
if (!(await demoSwitch.isChecked())) {
  await demoSwitch.check({ force: true });
  await page.waitForTimeout(300);
}

console.log('3) Capture watch-folder.png from Settings');
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(200);
await shot('watch-folder');

console.log('4) Capture hero.png from Dashboard');
await page.click('a[href="/"]');
await page.waitForSelector('text=Net spend in range', { timeout: 5000 }).catch(() => {});
// fallback: wait for chart
await page.waitForTimeout(1200);
// Reset any drill state — set preset back to YTD via the YTD button
const ytdBtn = page.locator('button:has-text("YTD")').first();
if (await ytdBtn.isVisible()) {
  await ytdBtn.click();
  await page.waitForTimeout(400);
}
await shot('hero');

console.log('5) Capture tooltip.png — hover a chart segment');
// Hover the middle of the chart area
const chart = page.locator('.MuiChartsAxis-bottom').first();
if (await chart.isVisible()) {
  const box = await chart.boundingBox();
  if (box) {
    // Hover into a middle bar
    await page.mouse.move(box.x + box.width / 2, box.y - 100);
    await page.waitForTimeout(500);
  }
}
await shot('tooltip');

console.log('6) Capture recategorize-dialog.png');
// Click first merchant in Top merchants table to open recategorize dialog
const firstMerchant = page.locator('table tbody tr').first();
if (await firstMerchant.isVisible()) {
  await firstMerchant.click();
  await page.waitForTimeout(500);
  await shot('recategorize-dialog');
  // Close the dialog
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

console.log('7) Capture forecast.png');
await page.click('a[href="/forecast"]');
await page.waitForTimeout(1000);
await page.evaluate(() => window.scrollTo(0, 0));
await shot('forecast');

console.log('8) Capture card.png — cropped hero for homepage thumbnail');
await page.click('a[href="/"]');
await page.waitForTimeout(800);
await page.screenshot({
  path: path.join(OUT, 'card.png'),
  clip: { x: 0, y: 0, width: VIEWPORT.width, height: 600 },
});
console.log('  → card.png');

await browser.close();
console.log('\nDone. Files in', OUT);
