// Capture the Sort view in action.
//
// 1. Open app, seed demo data, enable demo mode.
// 2. Mark ~8 demo merchants as Uncategorized (in IndexedDB) so the queue
//    has cards to show.
// 3. Capture sort.png (the populated state).
// 4. Restore the demo data so the app is left clean.
//
// Usage:  node scripts/capture-sort.mjs
// Env:    SCREENSHOTS_OUT (default ./screenshots), STRICTLY_SPENDING_URL

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const OUT = process.env.SCREENSHOTS_OUT || path.resolve('./screenshots');
const URL = process.env.STRICTLY_SPENDING_URL || 'http://localhost:5189';
const VIEW = { width: 1280, height: 900 };

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// Surface browser errors so we don't silently capture a broken UI.
page.on('pageerror', (e) => console.log('  pageerror:', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  console.error:', m.text());
});

console.log('1. Open app + seed demo data + demo mode on');
await page.goto(URL, { waitUntil: 'networkidle' });
await page.click('a[href="/settings"]');
await page.waitForTimeout(500);
const loadBtn = page.locator('button:has-text("Load demo data")');
if (await loadBtn.isVisible() && await loadBtn.isEnabled()) {
  await loadBtn.click();
  await page.waitForTimeout(800);
}
const demoSwitch = page.locator('label:has-text("real data") input[type="checkbox"]');
if (!(await demoSwitch.isChecked())) {
  await demoSwitch.check({ force: true });
  await page.waitForTimeout(400);
}

console.log('2. Uncategorize 8 demo merchants via IndexedDB');
// Pick 8 distinct merchant keys with the highest dollar impact, mark all
// their txns as Uncategorized.
const touched = await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('spending-viz');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const tx = db.transaction(['transactions'], 'readwrite');
  const store = tx.objectStore('transactions');

  // Collect all demo txns
  const all = await new Promise((resolve) => {
    const out = [];
    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (cursor.value.source === 'demo') out.push(cursor.value);
        cursor.continue();
      } else {
        resolve(out);
      }
    };
  });

  // Group by merchantKey, sort by total |amount| desc
  const byKey = new Map();
  for (const t of all) {
    const k = t.merchantKey || '';
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(t);
  }
  const ranked = [...byKey.entries()]
    .map(([k, txns]) => ({ k, txns, total: txns.reduce((s, t) => s + Math.abs(t.amount), 0) }))
    .sort((a, b) => b.total - a.total);

  // Skip Income (we want Spend cards). Take first 8 spend merchants.
  const chosen = ranked.filter((g) => g.txns[0].amount < 0).slice(0, 8);
  const touchedIds = [];
  for (const g of chosen) {
    for (const t of g.txns) {
      touchedIds.push(t.id);
      store.put({ ...t, category: 'Uncategorized', userOverridden: false });
    }
  }
  await new Promise((resolve) => { tx.oncomplete = resolve; });
  return { merchants: chosen.length, txns: touchedIds.length, touchedIds };
});
console.log(`  uncategorized ${touched.merchants} merchants / ${touched.txns} txns`);

console.log('3. Reload page so Dexie picks up the raw-IDB writes');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);

console.log('4. Navigate to /sort + screenshot');
await page.click('a[href="/sort"]');
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(OUT, 'sort.png'), fullPage: false });
console.log('  →', path.join(OUT, 'sort.png'));

// Optional second shot: hit "1" to show the slide-off animation in motion.
// Skipping for now; the static screenshot is the case-study deliverable.

console.log('4. Restore categories (run recategorize)');
await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('spending-viz');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // We don't have the original categories saved; the cleanest restore is to
  // run the in-app recategorize. Trigger a global rule re-run via the JS API.
  // Use a transaction to set userOverridden=false on all demo txns then let
  // the app re-run categorization on next load. For the screenshot script,
  // just clear demo data + reseed is more reliable. Skip — the next demo
  // seed call will re-add deterministically.
  db.close();
});
// Cleanest restore: clear demo data, reseed.
await page.click('a[href="/settings"]');
await page.waitForTimeout(400);
const clearBtn = page.locator('button:has-text("Clear demo data")');
if (await clearBtn.isEnabled()) {
  // The Clear dialog uses confirm(); intercept it.
  page.on('dialog', (d) => d.accept());
  await clearBtn.click();
  await page.waitForTimeout(800);
}
const loadAgain = page.locator('button:has-text("Load demo data")');
if (await loadAgain.isEnabled()) {
  await loadAgain.click();
  await page.waitForTimeout(800);
}
console.log('  restored: demo data reseeded fresh');

await browser.close();
console.log('Done.');
