import { db } from './db/drizzle';
import * as schema from './db/schema';
import { eq, ne, inArray, between, desc, asc } from 'drizzle-orm';

import { useDataStore } from './dataStore';
import { SCHEDULE_C_CATEGORIES } from './taxUtils';
import type { Transaction } from './types';

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

  const store = useDataStore.getState();
  const allCats = store.isInitialized ? store.categories : await db.select().from(schema.categories);
  const allAccts = store.isInitialized ? store.accounts : await db.select().from(schema.accounts);
  const allTxns = store.isInitialized ? store.transactions : await db.select().from(schema.transactions);

  const rawSettings = await (await db.select().from(schema.settings).where(eq(schema.settings.key, 'app:taxSettings')))[0];
  const taxSettings = (rawSettings?.value as { hasBusiness?: boolean }) || { hasBusiness: false };
  const hasBusinessMode = !!taxSettings.hasBusiness;

  const categoryTypes: Record<string, string> = {};
  for (const c of allCats) {
    categoryTypes[c.name.toLowerCase()] = c.type;
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

    const isCategoryMatched = resolvedCats.some(c => c.toLowerCase() === t.category.toLowerCase());
    if (!isCategoryMatched) return false;

    // Filter out personal transactions from business P&L
    const isRevenue = t.category.toLowerCase() === 'income' || t.amount > 0;
    if (hasBusinessMode && !isRevenue) {
      return t.isBusiness === true && t.deductionStatus === 'confirmed';
    }

    return true;
  });

  const categorySpendMap = new Map<string, number>();
  for (const t of matchedTxns) {
    const isRevenue = t.category.toLowerCase() === 'income' || t.amount > 0;
    let groupKey = t.category;
    let amt = isRevenue ? t.amount : -t.amount;

    if (hasBusinessMode && !isRevenue) {
      const scId = t.taxCategory || 'other';
      const scInfo = SCHEDULE_C_CATEGORIES[scId];
      groupKey = scInfo ? scInfo.label : 'Other Expenses';
      const rate = scInfo ? scInfo.deductionRate : 1.0;
      amt = amt * rate;
    }

    categorySpendMap.set(groupKey, (categorySpendMap.get(groupKey) || 0) + amt);
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
    const isRevenueGroup = catName.toLowerCase() === 'income' || !SCHEDULE_C_CATEGORIES[catName] && matchedTxns.some(t => t.category === catName && (t.category.toLowerCase() === 'income' || t.amount > 0));
    if (catName.toLowerCase() === 'transfers') continue;

    if (isRevenueGroup) {
      totalRevenue += amt;
      tableRows.push(`| [${catName}](doc://${spreadsheetDocId}#tab=${encodeURIComponent(catName)}) | [$${amt.toFixed(2)}](doc://${spreadsheetDocId}#tab=${encodeURIComponent(catName)}) |`);
    }
  }

  tableRows.push(`| [**Total Revenue**](doc://${spreadsheetDocId}#tab=All) | [**$${totalRevenue.toFixed(2)}**](doc://${spreadsheetDocId}#tab=All) |`);
  tableRows.push('| | |');
  tableRows.push('| **OPERATING EXPENSES** | |');

  for (const [catName, amt] of sortedCategories) {
    const isRevenueGroup = catName.toLowerCase() === 'income' || !SCHEDULE_C_CATEGORIES[catName] && matchedTxns.some(t => t.category === catName && (t.category.toLowerCase() === 'income' || t.amount > 0));
    if (catName.toLowerCase() === 'transfers') continue;

    if (!isRevenueGroup) {
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
  const categoryTxnsMap = new Map<string, Transaction[]>();
  for (const t of matchedTxns) {
    if (t.category.toLowerCase() === 'transfers') continue;
    
    let groupKey = t.category;
    const isRevenue = t.category.toLowerCase() === 'income' || t.amount > 0;
    if (hasBusinessMode && !isRevenue) {
      const scId = t.taxCategory || 'other';
      const scInfo = SCHEDULE_C_CATEGORIES[scId];
      groupKey = scInfo ? scInfo.label : 'Other Expenses';
    }

    if (!categoryTxnsMap.has(groupKey)) {
      categoryTxnsMap.set(groupKey, []);
    }
    categoryTxnsMap.get(groupKey)!.push(t);
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

    const isRevenueGroup = catName.toLowerCase() === 'income' || txns.every(t => t.category.toLowerCase() === 'income' || t.amount > 0);
    
    let sumVal = 0;
    for (const t of txns) {
      const isTxRevenue = t.category.toLowerCase() === 'income' || t.amount > 0;
      let amt = isTxRevenue ? t.amount : -t.amount;
      if (hasBusinessMode && !isTxRevenue) {
        const scId = t.taxCategory || 'other';
        const scInfo = SCHEDULE_C_CATEGORIES[scId];
        const rate = scInfo ? scInfo.deductionRate : 1.0;
        amt = amt * rate;
      }
      sumVal += amt;
    }

    appendixSections.push(`### Category: [${catName}](doc://${spreadsheetDocId}#tab=${encodeURIComponent(catName)}) (Total: $${sumVal.toFixed(2)})`);
    appendixSections.push('');

    if (hasBusinessMode && !isRevenueGroup) {
      appendixSections.push('| Date | Description | Standard Category | Original Amount | Deduction Rate | Computation Value |');
      appendixSections.push('| :--- | :--- | :--- | ---: | ---: | ---: |');
    } else {
      appendixSections.push('| Date | Description | Original Amount | Computation Value |');
      appendixSections.push('| :--- | :--- | ---: | ---: |');
    }

    for (const t of txns) {
      const isTxRevenue = t.category.toLowerCase() === 'income' || t.amount > 0;
      let compVal = isTxRevenue ? t.amount : -t.amount;
      let rateText = '';
      
      if (hasBusinessMode && !isTxRevenue) {
        const scId = t.taxCategory || 'other';
        const scInfo = SCHEDULE_C_CATEGORIES[scId];
        const rate = scInfo ? scInfo.deductionRate : 1.0;
        compVal = compVal * rate;
        rateText = `${(rate * 100).toFixed(0)}%`;
      }

      if (hasBusinessMode && !isTxRevenue) {
        appendixSections.push(`| ${t.date} | ${t.description} | ${t.category} | $${t.amount.toFixed(2)} | ${rateText} | $${compVal.toFixed(2)} |`);
      } else {
        appendixSections.push(`| ${t.date} | ${t.description} | $${t.amount.toFixed(2)} | $${compVal.toFixed(2)} |`);
      }
    }
    appendixSections.push('');
  }

  const pnlReportMarkdown = `# Profit & Loss Statement (YTD)
**Period:** ${start} to ${end}
**Basis:** Cash
${hasBusinessMode ? '**Structure:** IRS Schedule C Tax Deduction Compliant\n' : ''}
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

  const csvLines: string[] = hasBusinessMode
    ? ['ID,Date,Standard Category,Schedule C Category,Description,Original Amount,Deduction Rate,Computation Value,Account']
    : ['ID,Date,Category,Description,Original Amount,Computation Value,Account'];

  const sortedAllTxns = [...matchedTxns].filter(t => t.category.toLowerCase() !== 'transfers').sort((a, b) => a.date.localeCompare(b.date));
  for (const t of sortedAllTxns) {
    const isTxRevenue = t.category.toLowerCase() === 'income' || t.amount > 0;
    let compVal = isTxRevenue ? t.amount : -t.amount;
    let rateText = '100%';
    let scLabel = '';
    
    if (hasBusinessMode && !isTxRevenue) {
      const scId = t.taxCategory || 'other';
      const scInfo = SCHEDULE_C_CATEGORIES[scId];
      const rate = scInfo ? scInfo.deductionRate : 1.0;
      compVal = compVal * rate;
      rateText = `${(rate * 100).toFixed(0)}%`;
      scLabel = scInfo ? scInfo.label : 'Other Expenses';
    }
    
    const accountName = accountNameMap[t.accountId] || `Account ${t.accountId}`;
    
    const escapeCsv = (val: string) => {
      const cleaned = val.replace(/"/g, '""');
      return cleaned.includes(',') || cleaned.includes('"') || cleaned.includes('\n') ? `"${cleaned}"` : cleaned;
    };

    if (hasBusinessMode) {
      csvLines.push(`${t.id},${t.date},${escapeCsv(t.category)},${escapeCsv(scLabel)},${escapeCsv(t.description)},${t.amount.toFixed(2)},${rateText},${compVal.toFixed(2)},${escapeCsv(accountName)}`);
    } else {
      csvLines.push(`${t.id},${t.date},${escapeCsv(t.category)},${escapeCsv(t.description)},${t.amount.toFixed(2)},${compVal.toFixed(2)},${escapeCsv(accountName)}`);
    }
  }
  const pnlSpreadsheetCsv = csvLines.join('\n');

  return {
    pnlReportMarkdown,
    pnlSpreadsheetCsv
  };
}

export interface BalanceSheetParams {
  start: string;
  end: string;
  resolvedAccts: number[];
  markdownDocId: string;
  spreadsheetDocId: string;
}

export async function generateBalanceSheetData(params: BalanceSheetParams) {
  const {
    start,
    end,
    resolvedAccts,
    spreadsheetDocId
  } = params;

  const store = useDataStore.getState();
  const allAccts = store.isInitialized ? store.accounts : await db.select().from(schema.accounts);
  const allTxns = store.isInitialized ? store.transactions : await db.select().from(schema.transactions);

  const rawSettings = await (await db.select().from(schema.settings).where(eq(schema.settings.key, 'app:taxSettings')))[0];
  const taxSettings = (rawSettings?.value as { hasBusiness?: boolean }) || { hasBusiness: false };
  const hasBusinessMode = !!taxSettings.hasBusiness;

  const activeAccounts = allAccts.filter(a => a.id !== undefined && resolvedAccts.includes(a.id));

  const accountBalances = activeAccounts.map(acc => {
    let balanceAtEnd = acc.currentBalance || 0;
    const txnsAfterEnd = allTxns.filter(t => t.accountId === acc.id && t.date > end);
    for (const t of txnsAfterEnd) {
      balanceAtEnd -= t.amount;
    }
    return {
      ...acc,
      balanceAtEnd
    };
  });

  const assetAccounts = accountBalances.filter(a => a.type === 'checking' || a.type === 'savings');
  const liabilityAccounts = accountBalances.filter(a => a.type === 'credit');

  const totalAssets = assetAccounts.reduce((sum, a) => sum + a.balanceAtEnd, 0);
  const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + Math.abs(a.balanceAtEnd), 0);

  // Compute YTD Net Income for Retained Earnings
  const pnlTxns = allTxns.filter(t => {
    if (t.date < start || t.date > end) return false;
    if (!resolvedAccts.includes(t.accountId)) return false;

    const isRevenue = t.category.toLowerCase() === 'income' || t.amount > 0;
    if (hasBusinessMode && !isRevenue) {
      return t.isBusiness === true && t.deductionStatus === 'confirmed';
    }
    return true;
  });

  let totalRevenue = 0;
  let totalExpenses = 0;
  for (const t of pnlTxns) {
    if (t.category.toLowerCase() === 'transfers') continue;
    const isRevenue = t.category.toLowerCase() === 'income' || t.amount > 0;
    let amt = isRevenue ? t.amount : -t.amount;
    if (hasBusinessMode && !isRevenue) {
      const scId = t.taxCategory || 'other';
      const scInfo = SCHEDULE_C_CATEGORIES[scId];
      const rate = scInfo ? scInfo.deductionRate : 1.0;
      amt = amt * rate;
    }
    if (isRevenue) {
      totalRevenue += amt;
    } else {
      totalExpenses += amt;
    }
  }
  const netIncome = totalRevenue - totalExpenses;
  const totalEquity = totalAssets - totalLiabilities;
  const ownersCapital = totalEquity - netIncome;

  const tableRows: string[] = [
    '| Account / Category | Balance |',
    '| :--- | ---: |',
    '| **ASSETS** | |'
  ];

  for (const acc of assetAccounts) {
    tableRows.push(`| [${acc.name} (Asset)](doc://${spreadsheetDocId}#account=${acc.id}) | $${acc.balanceAtEnd.toFixed(2)} |`);
  }
  tableRows.push(`| **Total Assets** | **$${totalAssets.toFixed(2)}** |`);
  tableRows.push('| | |');
  tableRows.push('| **LIABILITIES** | |');

  for (const acc of liabilityAccounts) {
    tableRows.push(`| [${acc.name} (Credit Card)](doc://${spreadsheetDocId}#account=${acc.id}) | $${Math.abs(acc.balanceAtEnd).toFixed(2)} |`);
  }
  tableRows.push(`| **Total Liabilities** | **$${totalLiabilities.toFixed(2)}** |`);
  tableRows.push('| | |');
  tableRows.push('| **EQUITY** | |');
  tableRows.push(`| Owner's Capital / Retained Earnings | $${ownersCapital.toFixed(2)} |`);
  tableRows.push(`| YTD Net Income (Profit/Loss) | $${netIncome.toFixed(2)} |`);
  tableRows.push(`| **Total Equity** | **$${totalEquity.toFixed(2)}** |`);
  tableRows.push('| | |');
  tableRows.push('| **TOTAL LIABILITIES & EQUITY** | |');
  tableRows.push(`| **Total Liabilities & Equity** | **$${(totalLiabilities + totalEquity).toFixed(2)}** |`);

  const csvLines: string[] = ['Account Name,Account Type,Institution,Last 4,Current Balance,Balance At End Date'];
  for (const acc of accountBalances) {
    csvLines.push(`"${acc.name}","${acc.type}","${acc.institution}","${acc.last4 || ''}",${(acc.currentBalance || 0).toFixed(2)},${acc.balanceAtEnd.toFixed(2)}`);
  }
  const balanceSheetCsv = csvLines.join('\n');

  const balanceSheetMarkdown = `# Balance Sheet
**Period Ended:** ${end}
**Basis:** Cash
${hasBusinessMode ? '**Structure:** IRS Schedule C Tax Deduction Compliant\n' : ''}
> [!NOTE]
> This balance sheet provides a point-in-time snapshot of the assets, liabilities, and equity of your business at the end of the specified period.

${tableRows.join('\n')}
`;

  return {
    balanceSheetMarkdown,
    balanceSheetCsv
  };
}

export interface LedgerParams {
  start: string;
  end: string;
  resolvedAccts: number[];
  markdownDocId: string;
  spreadsheetDocId: string;
}

export async function generateLedgerData(params: LedgerParams) {
  const {
    start,
    end,
    resolvedAccts,
  } = params;

  const store = useDataStore.getState();
  const allAccts = store.isInitialized ? store.accounts : await db.select().from(schema.accounts);
  const allTxns = store.isInitialized ? store.transactions : await db.select().from(schema.transactions);

  const accountNameMap: Record<number, string> = {};
  for (const a of allAccts) {
    if (a.id !== undefined) {
      accountNameMap[a.id] = a.name;
    }
  }

  const matchedTxns = allTxns
    .filter(t => {
      if (t.date < start || t.date > end) return false;
      return resolvedAccts.includes(t.accountId);
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const tableRows: string[] = [
    '| Date | Account | Description | Category | Amount | Business/Personal | Tax Category | Status |',
    '| :--- | :--- | :--- | :--- | ---: | :--- | :--- | :--- |'
  ];

  for (const t of matchedTxns) {
    const accName = accountNameMap[t.accountId] || `Account ${t.accountId}`;
    const taxCatLabel = t.taxCategory ? (SCHEDULE_C_CATEGORIES[t.taxCategory]?.label || t.taxCategory) : '';
    const bizText = t.isBusiness === true ? 'Business' : t.isBusiness === false ? 'Personal' : 'Unclassified';
    tableRows.push(`| ${t.date} | ${accName} | ${t.description} | ${t.category} | $${t.amount.toFixed(2)} | ${bizText} | ${taxCatLabel} | ${t.deductionStatus || ''} |`);
  }

  const ledgerMarkdown = `# General Ledger
**Period:** ${start} to ${end}

> [!NOTE]
> Chronological ledger of all transactions across selected accounts during the specified period.

Total Transactions: **${matchedTxns.length}**

${tableRows.join('\n')}
`;

  const csvLines: string[] = ['ID,Date,Account,Description,Category,Amount,Is Business,Tax Category,Deduction Status'];
  for (const t of matchedTxns) {
    const accName = accountNameMap[t.accountId] || `Account ${t.accountId}`;
    const taxCatLabel = t.taxCategory ? (SCHEDULE_C_CATEGORIES[t.taxCategory]?.label || t.taxCategory) : '';
    const bizText = t.isBusiness === true ? 'TRUE' : t.isBusiness === false ? 'FALSE' : '';
    
    const escapeCsv = (val: string) => {
      const cleaned = val.replace(/"/g, '""');
      return cleaned.includes(',') || cleaned.includes('"') || cleaned.includes('\n') ? `"${cleaned}"` : cleaned;
    };
    
    csvLines.push(`${t.id},${t.date},${escapeCsv(accName)},${escapeCsv(t.description)},${escapeCsv(t.category)},${t.amount.toFixed(2)},${bizText},${escapeCsv(taxCatLabel)},${t.deductionStatus || ''}`);
  }
  const ledgerCsv = csvLines.join('\n');

  return {
    ledgerMarkdown,
    ledgerCsv
  };
}

export async function generateExpenseSummaryData(params: LedgerParams) {
  const {
    start,
    end,
    resolvedAccts,
    spreadsheetDocId
  } = params;

  const store = useDataStore.getState();
  const allTxns = store.isInitialized ? store.transactions : await db.select().from(schema.transactions);

  const matchedTxns = allTxns.filter(t => {
    if (t.date < start || t.date > end) return false;
    if (!resolvedAccts.includes(t.accountId)) return false;
    if (t.category.toLowerCase() === 'income' || t.amount >= 0) return false;
    return t.isBusiness === true && t.deductionStatus === 'confirmed';
  });

  const categoryMap = new Map<string, { originalTotal: number; deductibleTotal: number; count: number }>();
  for (const t of matchedTxns) {
    const scId = t.taxCategory || 'other';
    const scInfo = SCHEDULE_C_CATEGORIES[scId];
    const label = scInfo ? scInfo.label : 'Other Expenses';
    const rate = scInfo ? scInfo.deductionRate : 1.0;
    const amt = -t.amount;
    const dedAmt = amt * rate;

    const current = categoryMap.get(label) || { originalTotal: 0, deductibleTotal: 0, count: 0 };
    categoryMap.set(label, {
      originalTotal: current.originalTotal + amt,
      deductibleTotal: current.deductibleTotal + dedAmt,
      count: current.count + 1
    });
  }

  const tableRows: string[] = [
    '| Schedule C Category | Count | Total Spent | Deduction Rate | Deductible Amount |',
    '| :--- | ---: | ---: | ---: | ---: |'
  ];

  let totalSpent = 0;
  let totalDeductible = 0;
  const sorted = Array.from(categoryMap.entries()).sort((a, b) => b[1].originalTotal - a[1].originalTotal);
  for (const [label, data] of sorted) {
    const scInfo = Object.values(SCHEDULE_C_CATEGORIES).find(x => x.label === label);
    const rateText = scInfo ? `${(scInfo.deductionRate * 100).toFixed(0)}%` : '100%';
    totalSpent += data.originalTotal;
    totalDeductible += data.deductibleTotal;
    tableRows.push(`| [${label}](doc://${spreadsheetDocId}#tab=${encodeURIComponent(label)}) | ${data.count} | $${data.originalTotal.toFixed(2)} | ${rateText} | $${data.deductibleTotal.toFixed(2)} |`);
  }

  tableRows.push(`| **Total Business Expenses** | **${matchedTxns.length}** | **$${totalSpent.toFixed(2)}** | | **$${totalDeductible.toFixed(2)}** |`);

  const summaryMarkdown = `# Business Expense & Deduction Summary
**Period:** ${start} to ${end}
**Basis:** Cash
**Structure:** IRS Schedule C Deduction Compliant

> [!NOTE]
> Summary of business deductions grouped by IRS Schedule C category. Only includes transactions marked as **Business** and **Confirmed**.

${tableRows.join('\n')}
`;

  const csvLines = ['Schedule C Category,Transaction Count,Total Spent,Deductible Amount'];
  for (const [label, data] of sorted) {
    csvLines.push(`"${label}",${data.count},${data.originalTotal.toFixed(2)},${data.deductibleTotal.toFixed(2)}`);
  }
  const summaryCsv = csvLines.join('\n');

  return {
    summaryMarkdown,
    summaryCsv
  };
}
