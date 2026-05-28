// Records a ~40s demo video of Strictly Spending in demo mode,
// driving through dashboard panels, grouping toggles, tooltip, recurrence
// filter, recategorize dialog, Forecast, Sort, drill, and category discovery.
// Playwright records WebM natively (no ffmpeg required).
//
// Usage:  node scripts/record-demo.mjs
// Env:    SCREENSHOTS_OUT (default ./screenshots), STRICTLY_SPENDING_URL

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const OUT = process.env.SCREENSHOTS_OUT || path.resolve('./screenshots');
const URL = process.env.STRICTLY_SPENDING_URL || 'http://localhost:5189';
const VIEW = { width: 1280, height: 800 };

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: VIEW,
  deviceScaleFactor: 1, // smaller files
  recordVideo: { dir: OUT, size: VIEW },
});
const page = await ctx.newPage();

const wait = (ms) => page.waitForTimeout(ms);

console.log('Setup: seed demo data + enable demo mode');
await page.goto(URL, { waitUntil: 'networkidle' });
await page.click('a[href="/settings"]');
await wait(500);
const loadBtn = page.locator('button:has-text("Load demo data")');
if (await loadBtn.isVisible() && await loadBtn.isEnabled()) {
  await loadBtn.click();
  await wait(800);
}
const demoSwitch = page.locator('label:has-text("real data") input[type="checkbox"]');
if (!(await demoSwitch.isChecked())) {
  await demoSwitch.check({ force: true });
  await wait(300);
}

// --- begin recording sequence ---
console.log('1. Dashboard hero (2s)');
await page.click('a[href="/"]');
await wait(800);
// Force clean state — click YTD in case persisted filter state set something
// else from a previous run.
const startYtd = page.locator('button:has-text("YTD")').first();
if (await startYtd.isVisible().catch(() => false)) {
  await startYtd.click();
  await wait(1400);
}

console.log('1b. Collapse + restore the side panels (Figma-style)');
// Collapse the left filters panel
const hideFilters = page.locator('[aria-label="Hide filters panel"]').first();
if (await hideFilters.isVisible().catch(() => false)) {
  await hideFilters.click();
  await wait(1200);
  // Re-open via the Fab overlay
  const showFilters = page.locator('[aria-label="Show filters"]').first();
  if (await showFilters.isVisible().catch(() => false)) {
    await showFilters.click();
    await wait(900);
  }
}
// Collapse the right top-merchants panel
const hideMerchants = page.locator('[aria-label="Hide top merchants panel"]').first();
if (await hideMerchants.isVisible().catch(() => false)) {
  await hideMerchants.click();
  await wait(1200);
  const showMerchants = page.locator('[aria-label="Show top merchants"]').first();
  if (await showMerchants.isVisible().catch(() => false)) {
    await showMerchants.click();
    await wait(900);
  }
}

console.log('2. Cycle grouping toggles (3s)');
const byAccount = page.locator('button:has-text("By Account")').first();
if (await byAccount.isVisible()) {
  await byAccount.click();
  await wait(1100);
}
const recVsOne = page.locator('button:has-text("Recurring vs One-Time")').first();
if (await recVsOne.isVisible()) {
  await recVsOne.click();
  await wait(1200);
}
const byCat = page.locator('button:has-text("By Category")').first();
if (await byCat.isVisible()) {
  await byCat.click();
  await wait(900);
}

console.log('3. Hover chart bar to show tooltip (2s)');
const bars = page.locator('rect[class*="MuiBarElement"]');
const count = await bars.count();
if (count > 0) {
  // Pick a tall middle bar
  const target = bars.nth(Math.floor(count / 2));
  await target.hover();
  await wait(1800);
}

console.log('4. Recurrence filter to "Recurring" then back (2s)');
const recBtn = page.locator('button:has-text("Recurring")').first();
if (await recBtn.isVisible()) {
  await recBtn.click();
  await wait(1100);
}
// Recurrence "All" is a MUI ToggleButton with value="all" — unambiguous.
const allBtn = page.locator('button[value="all"]').first();
if (await allBtn.isVisible().catch(() => false)) {
  await allBtn.click();
  await wait(900);
}

console.log('5. Click a top merchant → recategorize dialog (3s)');
const firstMerchant = page.locator('table tbody tr').first();
if (await firstMerchant.isVisible()) {
  await firstMerchant.click();
  await wait(2400);
  // close
  await page.keyboard.press('Escape');
  await wait(500);
}

console.log('6. Navigate to Forecast (1s) + toggle a recurring off (3s)');
await page.click('a[href="/forecast"]');
await wait(1400);
// Toggle first recurring switch off — projection drops
const switches = page.locator('input[type="checkbox"]:checked');
const switchCount = await switches.count();
if (switchCount > 1) {
  // Skip first (could be header), toggle the one corresponding to first merchant row
  const targetSwitch = page.locator('table tbody tr input[type="checkbox"]').first();
  if (await targetSwitch.isVisible()) {
    await targetSwitch.click();
    await wait(1500);
    await targetSwitch.click();
    await wait(900);
  }
}

console.log('7. Plant Uncategorized rows + Sort segment (Enter / 1 / Cmd-Z)');
// Uncategorize 6 demo merchants so the Sort queue has something to triage.
await page.evaluate(async () => {
  await new Promise((resolve) => {
    const req = indexedDB.open('spending-viz');
    req.onsuccess = () => {
      const db = req.result;
      const rtx = db.transaction('transactions', 'readonly');
      const all = [];
      const cur = rtx.objectStore('transactions').openCursor();
      cur.onsuccess = (e) => {
        const c = e.target.result;
        if (c) { if (c.value.source === 'demo') all.push(c.value); c.continue(); }
        else {
          const byKey = new Map();
          for (const t of all) {
            const k = t.merchantKey || '';
            if (!k) continue;
            if (!byKey.has(k)) byKey.set(k, []);
            byKey.get(k).push(t);
          }
          const ranked = [...byKey.entries()]
            .map(([k, txns]) => ({ k, txns, total: txns.reduce((s, t) => s + Math.abs(t.amount), 0) }))
            .filter((g) => g.txns[0].amount < 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 6);
          const wtx = db.transaction('transactions', 'readwrite');
          const store = wtx.objectStore('transactions');
          for (const g of ranked) {
            for (const t of g.txns) {
              store.put({ ...t, category: 'Uncategorized', userOverridden: false });
            }
          }
          wtx.oncomplete = resolve;
        }
      };
    };
  });
});
// Reload so Dexie liveQuery picks up the raw IDB writes
await page.reload({ waitUntil: 'networkidle' });
await wait(700);
await page.click('a[href="/sort"]');
await wait(1500);
// Accept the suggested category (Enter), then a number key, then Cmd-Z
await page.keyboard.press('Enter');
await wait(900);
await page.keyboard.press('1');
await wait(900);
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
await wait(1200);

console.log('8. Back to Dashboard');
await page.click('a[href="/"]');
await wait(1000);

console.log('9. Drill into a single month');
// Click an X-axis tick label — MUI X Charts renders these as <text> with
// class .MuiChartsAxis-tickLabel. onAxisClick fires from the chart band
// containing them. Pick the 3rd label (March) for a deterministic drill.
const tickLabels = page.locator('.MuiChartsAxis-bottom .MuiChartsAxis-tickLabel');
const tickCount = await tickLabels.count();
if (tickCount >= 3) {
  await tickLabels.nth(2).click({ force: true });
  await wait(1800);
} else if (tickCount > 0) {
  await tickLabels.first().click({ force: true });
  await wait(1800);
}

console.log('10. Category discovery — turn off all then toggle 2 back on');
// Categories panel has its own "None" button (case-insensitive)
const catNone = page.locator('button:has-text("None")').last();
if (await catNone.isVisible().catch(() => false)) {
  await catNone.click();
  await wait(900);
}
// Toggle Groceries on
const groceries = page.locator('label:has-text("Groceries") input[type="checkbox"]').first();
if (await groceries.isVisible().catch(() => false)) {
  await groceries.click();
  await wait(700);
}
// Toggle Restaurants & Coffee on
const rests = page.locator('label:has-text("Restaurants") input[type="checkbox"]').first();
if (await rests.isVisible().catch(() => false)) {
  await rests.click();
  await wait(1200);
}

console.log('11. Reset to YTD + all categories — clean closing frame');
const catAll = page.locator('button:has-text("All")').last();
if (await catAll.isVisible().catch(() => false)) {
  await catAll.click();
  await wait(600);
}
// Click the YTD preset to clear the drill and return to year-to-date
const ytdBtn = page.locator('button:has-text("YTD")').first();
if (await ytdBtn.isVisible().catch(() => false)) {
  await ytdBtn.click();
  await wait(1800);
}

// --- end sequence ---

await ctx.close();
await browser.close();

// Cleanup: open a one-shot context (no recording) and reseed demo data so
// we don't leave the populated app with stray Uncategorized rows from step 7.
const cleanupBrowser = await chromium.launch({ headless: true });
const cleanupCtx = await cleanupBrowser.newContext({ viewport: VIEW });
const cleanupPage = await cleanupCtx.newPage();
await cleanupPage.goto(URL, { waitUntil: 'networkidle' });
await cleanupPage.click('a[href="/settings"]');
await cleanupPage.waitForTimeout(400);
cleanupPage.on('dialog', (d) => d.accept());
const clearBtn = cleanupPage.locator('button:has-text("Clear demo data")');
if (await clearBtn.isEnabled()) {
  await clearBtn.click();
  await cleanupPage.waitForTimeout(700);
}
const loadAgain = cleanupPage.locator('button:has-text("Load demo data")');
if (await loadAgain.isEnabled()) {
  await loadAgain.click();
  await cleanupPage.waitForTimeout(700);
}
await cleanupBrowser.close();
console.log('  cleanup: demo data reseeded fresh');

// Playwright writes a randomly-named .webm in OUT. Rename to demo.webm.
const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.webm'));
const newest = files
  .map((f) => ({ f, mtime: fs.statSync(path.join(OUT, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)[0];

if (newest) {
  const dest = path.join(OUT, 'demo.webm');
  fs.renameSync(path.join(OUT, newest.f), dest);
  const { size } = fs.statSync(dest);
  console.log(`\nDone → ${dest} (${(size / 1024 / 1024).toFixed(1)} MB)`);
} else {
  console.log('No video file written.');
}
