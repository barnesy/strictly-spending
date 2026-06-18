// multi_nav_scenario.js
function url() {
  return "http://localhost:5173/";
}

async function action(page) {
  // Navigate to Budget
  await page.waitForSelector('a[href="/budget"]');
  await page.click('a[href="/budget"]');
  await page.waitForTimeout ? await page.waitForTimeout(300) : await new Promise(r => setTimeout(r, 300));

  // Open "Manage" menu
  await page.waitForSelector('#manage-nav-button');
  await page.click('#manage-nav-button');
  await page.waitForTimeout ? await page.waitForTimeout(300) : await new Promise(r => setTimeout(r, 300));

  // Click "Rules" link in menu
  await page.waitForSelector('a[href="/rules"]');
  await page.click('a[href="/rules"]');
  await page.waitForTimeout ? await page.waitForTimeout(300) : await new Promise(r => setTimeout(r, 300));

  // Open "Manage" menu again
  await page.waitForSelector('#manage-nav-button');
  await page.click('#manage-nav-button');
  await page.waitForTimeout ? await page.waitForTimeout(300) : await new Promise(r => setTimeout(r, 300));

  // Click "Categories" link in menu
  await page.waitForSelector('a[href="/categories"]');
  await page.click('a[href="/categories"]');
  await page.waitForTimeout ? await page.waitForTimeout(300) : await new Promise(r => setTimeout(r, 300));
}

async function back(page) {
  // Revert back to Dashboard
  await page.waitForSelector('a[href="/"]');
  await page.click('a[href="/"]');
  await page.waitForTimeout ? await page.waitForTimeout(300) : await new Promise(r => setTimeout(r, 300));
}

module.exports = { url, action, back };
