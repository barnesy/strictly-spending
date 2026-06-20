import { db } from './db';
import { buildRecurrenceMap } from './recurrence';
import { buildForecast } from './forecast';
import { useBudgetStore } from './budgetStore';

export interface PnlParams {
  start: string;
  end: string;
  resolvedCats: string[];
  resolvedAccts: number[];
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  markdownDocId: string;
  spreadsheetDocId: string;
}

export async function generatePnlData(params: PnlParams) {
  const {
    start,
    end,
    resolvedCats,
    resolvedAccts,
    search,
    minPrice,
    maxPrice,
    spreadsheetDocId
  } = params;

  const allCats = await db.categories.toArray();
  const allAccts = await db.accounts.toArray();
  const allTxns = await db.transactions.toArray();

  const categoryTypes: Record<string, string> = {};
  for (const c of allCats) {
    categoryTypes[c.name.toLowerCase()] = c.type;
  }

  const budgets = await db.budgets.toArray();
  const overrides = await db.merchantOverrides.toArray();
  const recurrenceMap = buildRecurrenceMap(allTxns, overrides);
  const forecast = buildForecast(allTxns, recurrenceMap, allCats);
  const recurring = forecast.filter((f) => f.kind === 'recurring');

  const budgetStore = useBudgetStore.getState();
  const excludedMerchants = budgetStore.excludedMerchants;
  const excludedBudgetCategories = budgetStore.excludedBudgetCategories;

  let monthlyBudget = 0;
  for (const catName of resolvedCats) {
    const catNameLower = catName.toLowerCase();
    if (!excludedBudgetCategories.has(catName)) {
      const b = budgets.find(x => x.category.toLowerCase() === catNameLower);
      if (b) {
        monthlyBudget += b.monthlyAmount;
      }
    }
    const catRecurring = recurring.filter(
      r => r.category.toLowerCase() === catNameLower && !excludedMerchants.has(r.merchantKey)
    );
    const recurringSum = catRecurring.reduce((sum, r) => sum + r.monthlyEstimate, 0);
    monthlyBudget += recurringSum;
  }

  const matchedTxns = allTxns.filter(t => {
    if (t.date < start || t.date > end) return false;
    if (!resolvedAccts.includes(t.accountId)) return false;

    if (search) {
      const q = search.toLowerCase();
      if (!t.description.toLowerCase().includes(q) && !t.merchantKey.toLowerCase().includes(q)) {
        return false;
      }
    }

    if (minPrice !== undefined) {
      if (Math.abs(t.amount) < minPrice) return false;
    }
    if (maxPrice !== undefined) {
      if (Math.abs(t.amount) > maxPrice) return false;
    }

    return resolvedCats.some(c => c.toLowerCase() === t.category.toLowerCase());
  });

  const categorySpendMap = new Map<string, number>();
  for (const t of matchedTxns) {
    categorySpendMap.set(t.category, (categorySpendMap.get(t.category) || 0) + (t.category.toLowerCase() === 'income' ? t.amount : -t.amount));
  }

  // Pre-calculate tables
  let totalRevenue = 0;
  let totalExpenses = 0;
  const sortedCategories = Array.from(categorySpendMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  
  const tableRows: string[] = [
    '| Line Item / Category | Amount |',
    '| :--- | ---: |',
    '| **REVENUE** | |'
  ];

  for (const [catName, amt] of sortedCategories) {
    const catType = categoryTypes[catName.toLowerCase()] || 'spend';
    if (catName.toLowerCase() === 'transfers') continue;

    if (catType === 'income') {
      totalRevenue += amt;
      tableRows.push(`| [${catName}](doc://${spreadsheetDocId}#tab=${encodeURIComponent(catName)}) | [$${amt.toFixed(2)}](doc://${spreadsheetDocId}#tab=${encodeURIComponent(catName)}) |`);
    }
  }

  tableRows.push(`| [**Total Revenue**](doc://${spreadsheetDocId}#tab=All) | [**$${totalRevenue.toFixed(2)}**](doc://${spreadsheetDocId}#tab=All) |`);
  tableRows.push('| | |');
  tableRows.push('| **OPERATING EXPENSES** | |');

  for (const [catName, amt] of sortedCategories) {
    const catType = categoryTypes[catName.toLowerCase()] || 'spend';
    if (catName.toLowerCase() === 'transfers') continue;

    if (catType !== 'income') {
      totalExpenses += amt;
      tableRows.push(`| [${catName}](doc://${spreadsheetDocId}#tab=${encodeURIComponent(catName)}) | [$${amt.toFixed(2)}](doc://${spreadsheetDocId}#tab=${encodeURIComponent(catName)}) |`);
    }
  }

  tableRows.push(`| [**Total Operating Expenses**](doc://${spreadsheetDocId}#tab=All) | [**$${totalExpenses.toFixed(2)}**](doc://${spreadsheetDocId}#tab=All) |`);
  tableRows.push('| | |');

  const netIncome = totalRevenue - totalExpenses;
  const netIncomeText = netIncome >= 0 
    ? `**$${netIncome.toFixed(2)}**` 
    : `**($${Math.abs(netIncome).toFixed(2)})**`;

  tableRows.push('| **NET SUMMARY** | |');
  tableRows.push(`| [**Net Income (Profit/Loss)**](doc://${spreadsheetDocId}#tab=All) | [${netIncomeText}](doc://${spreadsheetDocId}#tab=All) |`);

  // Build groups of transactions per category
  const categoryTxnsMap = new Map<string, any[]>();
  for (const t of matchedTxns) {
    if (t.category.toLowerCase() === 'transfers') continue;
    if (!categoryTxnsMap.has(t.category)) {
      categoryTxnsMap.set(t.category, []);
    }
    categoryTxnsMap.get(t.category)!.push(t);
  }

  const appendixSections: string[] = [
    '---',
    '## Transaction Computation Details',
    'This appendix contains all associated transactions that make up the computation of the summary numbers above.',
    ''
  ];

  const sortedCatNames = Array.from(categoryTxnsMap.keys()).sort((a, b) => a.localeCompare(b));
  for (const catName of sortedCatNames) {
    const txns = categoryTxnsMap.get(catName)!.sort((a, b) => a.date.localeCompare(b.date));
    if (txns.length === 0) continue;

    const isIncome = catName.toLowerCase() === 'income';
    const sumVal = txns.map(t => isIncome ? t.amount : -t.amount).reduce((sum, v) => sum + v, 0);

    appendixSections.push(`### Category: [${catName}](doc://${spreadsheetDocId}#tab=${encodeURIComponent(catName)}) (Total: $${sumVal.toFixed(2)})`);
    appendixSections.push('');
    appendixSections.push('| Date | Description | Original Amount | Computation Value |');
    appendixSections.push('| :--- | :--- | ---: | ---: |');

    for (const t of txns) {
      const compVal = isIncome ? t.amount : -t.amount;
      appendixSections.push(`| ${t.date} | ${t.description} | $${t.amount.toFixed(2)} | $${compVal.toFixed(2)} |`);
    }
    appendixSections.push('');
  }

  const pnlReportMarkdown = `# Profit & Loss Statement (YTD)
**Period:** ${start} to ${end}
**Basis:** Cash

> [!NOTE]
> This summary report is linked directly to a detailed reference spreadsheet. You can click on any category name or amount in the tables below to jump directly to the transaction details for that category.

${tableRows.join('\n')}

${appendixSections.join('\n')}
`;

  // Build CSV content
  const accountNameMap: Record<number, string> = {};
  for (const a of allAccts) {
    if (a.id !== undefined) {
      accountNameMap[a.id] = a.name;
    }
  }

  const csvLines: string[] = ['ID,Date,Category,Description,Original Amount,Computation Value,Account'];
  const sortedAllTxns = [...matchedTxns].filter(t => t.category.toLowerCase() !== 'transfers').sort((a, b) => a.date.localeCompare(b.date));
  for (const t of sortedAllTxns) {
    const isIncome = t.category.toLowerCase() === 'income';
    const compVal = isIncome ? t.amount : -t.amount;
    const accountName = accountNameMap[t.accountId] || `Account ${t.accountId}`;
    
    const escapeCsv = (val: string) => {
      const cleaned = val.replace(/"/g, '""');
      return cleaned.includes(',') || cleaned.includes('"') || cleaned.includes('\n') ? `"${cleaned}"` : cleaned;
    };

    csvLines.push(`${t.id},${t.date},${escapeCsv(t.category)},${escapeCsv(t.description)},${t.amount.toFixed(2)},${compVal.toFixed(2)},${escapeCsv(accountName)}`);
  }
  const pnlSpreadsheetCsv = csvLines.join('\n');

  return {
    pnlReportMarkdown,
    pnlSpreadsheetCsv
  };
}
