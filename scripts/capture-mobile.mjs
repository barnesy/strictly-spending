// Mobile-viewport screenshot capture for reviewing responsive layout.
// Seeds demo data, enables demo mode, then captures key views at 375px.
//
// Usage: node scripts/capture-mobile.mjs
//   STRICTLY_SPENDING_URL=http://localhost:5173 (default)
//   SCREENSHOTS_OUT=./mobile-screenshots (default)

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const OUT = process.env.SCREENSHOTS_OUT || path.resolve('./mobile-screenshots');
const URL = process.env.STRICTLY_SPENDING_URL || 'http://localhost:5173';
const VIEWPORT = { width: 375, height: 812 }; // iPhone X/SE-ish

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_BIN ||
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const ctx = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();

async function shot(name, full = false) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: full });
  console.log('  →', file);
}

// On mobile the nav is behind a hamburger drawer. Open it, click the link, wait.
async function navTo(href) {
  const burger = page.locator('button[aria-label="Open navigation menu"]');
  if (await burger.isVisible()) {
    await burger.click();
    await page.waitForTimeout(350); // drawer slide-in
  }
  await page.click(`a[href="${href}"]`);
  await page.waitForTimeout(700);
}

console.log('1) Open app & seed demo data');
await page.goto(URL, { waitUntil: 'networkidle' });
await navTo('/settings');
await page.waitForSelector('text=Demo data', { timeout: 8000 }).catch(() => {});
const loadBtn = page.locator('button:has-text("Load demo data")');
if ((await loadBtn.count()) && (await loadBtn.isEnabled())) {
  await loadBtn.click();
  await page.waitForTimeout(1000);
  console.log('  demo data loaded');
} else {
  console.log('  demo data already present');
}

console.log('2) Enable demo mode');
const demoSwitch = page
  .locator('label:has-text("real data")')
  .locator('input[type="checkbox"]');
if ((await demoSwitch.count()) && !(await demoSwitch.isChecked())) {
  await demoSwitch.check({ force: true });
  await page.waitForTimeout(300);
}

console.log('3) Drawer open (nav menu)');
await page.locator('button[aria-label="Open navigation menu"]').click();
await page.waitForTimeout(400);
await shot('nav-drawer-open');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

console.log('4) Dashboard');
await navTo('/');
await page.waitForTimeout(1200);
await shot('dashboard');

console.log('5) Sort (category grid)');
await navTo('/sort');
await page.waitForTimeout(900);
await shot('sort', true);

console.log('6) Transactions (stacked filters + table)');
await navTo('/transactions');
await page.waitForTimeout(900);
await shot('transactions');

console.log('7) Forecast');
await navTo('/forecast');
await page.waitForTimeout(900);
await shot('forecast', true);

console.log('8) Import');
await navTo('/import');
await page.waitForTimeout(700);
await shot('import');

await browser.close();
console.log('\nDone. Files in', OUT);
