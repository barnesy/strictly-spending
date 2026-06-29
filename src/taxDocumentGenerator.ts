import Papa from 'papaparse';
import { SCHEDULE_C_CATEGORIES } from './taxUtils';
import type { TaxSettings, ChatArtifact, Transaction, Account } from './types';

export function calculateTaxYearStats(transactions: Transaction[], taxYear: number) {
  const yearTransactions = transactions.filter(t => {
    if (t.date && t.date.length >= 4) {
      return parseInt(t.date.substring(0, 4), 10) === taxYear;
    }
    return new Date(t.date).getFullYear() === taxYear;
  });
  
  let totalIncome = 0;
  let businessExpenses = 0;
  let itemizedDeductions = 0;

  yearTransactions.forEach(t => {
    if (t.category.toLowerCase() === 'income' || t.amount > 0) {
      totalIncome += Math.abs(t.amount);
    } else {
      if (t.isBusiness && t.deductionStatus === 'confirmed') {
        const rate = t.taxCategory ? (SCHEDULE_C_CATEGORIES[t.taxCategory]?.deductionRate ?? 1.0) : 1.0;
        businessExpenses += Math.abs(t.amount) * rate;
      }
      if (!t.isBusiness && t.category.toLowerCase().match(/(charity|medical|dental|vision|tax)/)) {
        itemizedDeductions += Math.abs(t.amount);
      }
    }
  });

  return { totalIncome, businessExpenses, itemizedDeductions, yearTransactions };
}

export function generateBusinessLedgerCsv(transactions: Transaction[], accounts: Account[], taxYear: number): string {
  const { yearTransactions } = calculateTaxYearStats(transactions, taxYear);
  const businessTxns = yearTransactions.filter(t => t.isBusiness && t.deductionStatus === 'confirmed');

  const csvData = businessTxns.map(t => {
    const rate = t.taxCategory ? (SCHEDULE_C_CATEGORIES[t.taxCategory]?.deductionRate ?? 1.0) : 1.0;
    const deductible = Math.abs(t.amount) * rate;
    const catLabel = t.taxCategory ? (SCHEDULE_C_CATEGORIES[t.taxCategory]?.label ?? 'Other') : 'Other';
    const acc = accounts.find(a => a.id === t.accountId);
    
    return {
      Date: t.date,
      Account: acc ? acc.name : 'Unknown',
      Institution: acc ? acc.institution : 'Unknown',
      Description: t.description,
      'IRS Schedule C Category': catLabel,
      'Gross Amount': Math.abs(t.amount),
      'Deduction Rate': `${rate * 100}%`,
      'Deductible Amount': deductible
    };
  });

  return Papa.unparse(csvData);
}

export function generateBusinessPnlCsv(transactions: Transaction[], taxYear: number): string {
  const { yearTransactions } = calculateTaxYearStats(transactions, taxYear);
  const businessTxns = yearTransactions.filter(t => t.isBusiness && t.deductionStatus === 'confirmed');

  const categoryTotals: Record<string, { gross: number; deductible: number }> = {};

  businessTxns.forEach(t => {
    const catLabel = t.taxCategory ? (SCHEDULE_C_CATEGORIES[t.taxCategory]?.label ?? 'Other') : 'Other';
    const rate = t.taxCategory ? (SCHEDULE_C_CATEGORIES[t.taxCategory]?.deductionRate ?? 1.0) : 1.0;
    
    if (!categoryTotals[catLabel]) {
      categoryTotals[catLabel] = { gross: 0, deductible: 0 };
    }
    categoryTotals[catLabel].gross += Math.abs(t.amount);
    categoryTotals[catLabel].deductible += Math.abs(t.amount) * rate;
  });

  const csvData = Object.keys(categoryTotals).map(cat => ({
    'IRS Schedule C Category': cat,
    'Gross Spend': categoryTotals[cat].gross.toFixed(2),
    'Deductible Spend': categoryTotals[cat].deductible.toFixed(2)
  }));

  // Add total row
  const totalGross = Object.values(categoryTotals).reduce((sum, c) => sum + c.gross, 0);
  const totalDeductible = Object.values(categoryTotals).reduce((sum, c) => sum + c.deductible, 0);
  
  csvData.push({
    'IRS Schedule C Category': 'TOTAL EXPENSES',
    'Gross Spend': totalGross.toFixed(2),
    'Deductible Spend': totalDeductible.toFixed(2)
  });

  return Papa.unparse(csvData);
}

export function generatePersonalDeductionsCsv(transactions: Transaction[], accounts: Account[], taxYear: number): string {
  const { yearTransactions } = calculateTaxYearStats(transactions, taxYear);
  const personalTxns = yearTransactions.filter(t => !t.isBusiness && t.category.toLowerCase().match(/(charity|medical|dental|vision|tax)/));

  const csvData = personalTxns.map(t => {
    const acc = accounts.find(a => a.id === t.accountId);
    return {
      Date: t.date,
      Account: acc ? acc.name : 'Unknown',
      Institution: acc ? acc.institution : 'Unknown',
      Description: t.description,
      Category: t.category,
      Amount: Math.abs(t.amount)
    };
  });

  return Papa.unparse(csvData);
}

export function generateTaxSummaryMarkdown(
  transactions: Transaction[],
  accounts: Account[],
  taxSettings: TaxSettings,
  artifacts: ChatArtifact[],
  activeDocuments: Array<{ id: string; label: string }>
): string {
  const taxYearStats = calculateTaxYearStats(transactions, taxSettings.taxYear || new Date().getFullYear());
  const yearTransactions = taxYearStats.yearTransactions;
  const businessTxns = yearTransactions.filter(t => t.isBusiness && t.deductionStatus === 'confirmed');
  const personalTxns = yearTransactions.filter(t => !t.isBusiness && t.category.toLowerCase().match(/(charity|medical|dental|vision|tax)/));

  const filerStatusLabel: Record<string, string> = {
    single: 'Single',
    married_joint: 'Married Filing Jointly',
    married_separate: 'Married Filing Separately',
    head_household: 'Head of Household'
  };
  const filingStatus = filerStatusLabel[taxSettings.personalInfo?.filingStatus || 'single'] || 'Single';

  const checklistItems = activeDocuments.map(item => {
    const doc = artifacts.find(d => d.associatedChecklistId === item.id);
    return {
      label: item.label,
      status: doc ? 'Uploaded' : 'Missing',
      filename: doc ? doc.title : 'N/A'
    };
  });

  const formatCurrency = (val: number | undefined) => 
    (val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let md = `# Tax Summary Report - ${taxSettings.taxYear}\n\n`;
  md += `**Exported:** ${new Date().toLocaleDateString()}\n`;
  md += `**Source:** Local Database (strictly spending)\n\n`;

  md += `## Tax Financial Overview\n\n`;
  md += `### Income & Estimations\n`;
  md += `- **Gross Personal / W-2 Income:** $${formatCurrency(taxSettings.personalInfo?.w2Income)}\n`;
  if (taxSettings.hasBusiness) {
    md += `- **Gross Business Income:** $${formatCurrency(taxSettings.businessIncome?.grossSales || taxSettings.businessIncome?.forms1099Total || 0)}\n`;
  }
  md += `- **Estimated Tax Payments Paid:** $${formatCurrency(taxSettings.taxPayments?.estimatedPayments)}\n`;
  md += `- **State / LLC Fees Paid:** $${formatCurrency(taxSettings.taxPayments?.stateLocalFees)}\n\n`;

  md += `### Mapped Deductions\n`;
  md += `- **Personal Itemized Deductions:** $${formatCurrency(taxYearStats.itemizedDeductions)}\n`;
  if (taxSettings.hasBusiness) {
    md += `- **Business Schedule C Expenses:** $${formatCurrency(taxYearStats.businessExpenses)}\n`;
    md += `- **Net Business Income:** $${formatCurrency((taxSettings.businessIncome?.grossSales || 0) - taxYearStats.businessExpenses)}\n`;
  }
  md += `\n`;

  md += `## Filer & Entity Profile\n\n`;
  md += `### Personal Profile\n`;
  md += `- **Filing Status:** ${filingStatus}\n`;
  md += `- **Dependents:** ${taxSettings.personalInfo?.dependents || 0}\n\n`;

  if (taxSettings.hasBusiness) {
    md += `### Business / LLC Profile\n`;
    md += `- **DBA / Legal Name:** ${taxSettings.businessIdentity?.dba || 'N/A'}\n`;
    md += `- **Address:** ${taxSettings.businessIdentity?.address || 'N/A'}\n`;
    md += `- **EIN or SSN:** ${taxSettings.businessIdentity?.einSsn || 'N/A'}\n\n`;
  }

  if (taxSettings.hasBusiness && (taxSettings.businessDeductions?.homeOffice || taxSettings.businessDeductions?.vehicle)) {
    md += `## Home Office & Vehicle Declarations\n\n`;
    if (taxSettings.businessDeductions?.homeOffice) {
      const sqFtOffice = taxSettings.businessDeductions.homeOffice.sqFtOffice || 0;
      const sqFtHome = taxSettings.businessDeductions.homeOffice.sqFtHome || 0;
      const ratio = sqFtHome ? ((sqFtOffice / sqFtHome) * 100).toFixed(1) : '0.0';
      md += `### Home Office\n`;
      md += `- **Dedicated Office Area:** ${sqFtOffice} sq ft\n`;
      md += `- **Total Home Area:** ${sqFtHome} sq ft\n`;
      md += `- **Home Office Ratio:** ${ratio}%\n\n`;
    }
    if (taxSettings.businessDeductions?.vehicle) {
      const busMiles = taxSettings.businessDeductions.vehicle.businessMiles || 0;
      const persMiles = taxSettings.businessDeductions.vehicle.personalMiles || 0;
      const ratio = (busMiles + persMiles) ? ((busMiles / (busMiles + persMiles)) * 100).toFixed(1) : '0.0';
      md += `### Vehicle Mileage\n`;
      md += `- **Business Miles Logged:** ${busMiles.toLocaleString()} mi\n`;
      md += `- **Personal Miles Logged:** ${persMiles.toLocaleString()} mi\n`;
      md += `- **Business Use Percentage:** ${ratio}%\n\n`;
    }
  }

  md += `## Document Audit Checklist\n\n`;
  md += `| Document Description | Status | File Name |\n`;
  md += `| :--- | :--- | :--- |\n`;
  checklistItems.forEach(item => {
    md += `| ${item.label} | ${item.status} | \`${item.filename}\` |\n`;
  });
  md += `\n`;

  if (taxSettings.hasBusiness) {
    md += `## Schedule C Business Deductions Ledger (${businessTxns.length} records)\n\n`;
    md += `| Date | Account | Description | IRS Category | Gross Amount | Rate | Deductible |\n`;
    md += `| :--- | :--- | :--- | :--- | ---: | ---: | ---: |\n`;
    businessTxns.forEach(t => {
      const rate = t.taxCategory ? (SCHEDULE_C_CATEGORIES[t.taxCategory]?.deductionRate ?? 1.0) : 1.0;
      const deductible = Math.abs(t.amount) * rate;
      const catLabel = t.taxCategory ? (SCHEDULE_C_CATEGORIES[t.taxCategory]?.label ?? 'Other') : 'Other';
      const acc = accounts.find(a => a.id === t.accountId);
      md += `| ${t.date} | ${acc ? acc.name : 'Unknown'} | ${t.description} | ${catLabel} | $${Math.abs(t.amount).toFixed(2)} | ${(rate * 100)}% | $${deductible.toFixed(2)} |\n`;
    });
    md += `| **TOTAL** | | | | **$${businessTxns.reduce((sum, t) => sum + Math.abs(t.amount), 0).toFixed(2)}** | | **$${taxYearStats.businessExpenses.toFixed(2)}** |\n\n`;
  }

  md += `## Itemized Personal Deductions Ledger (${personalTxns.length} records)\n\n`;
  md += `| Date | Account | Description | Spend Category | Amount |\n`;
  md += `| :--- | :--- | :--- | :--- | ---: |\n`;
  personalTxns.forEach(t => {
    const acc = accounts.find(a => a.id === t.accountId);
    md += `| ${t.date} | ${acc ? acc.name : 'Unknown'} | ${t.description} | ${t.category} | $${Math.abs(t.amount).toFixed(2)} |\n`;
  });
  md += `| **TOTAL** | | | | **$${taxYearStats.itemizedDeductions.toFixed(2)}** |\n`;

  return md;
}

export function generateComprehensiveCsv(
  transactions: Transaction[],
  accounts: Account[],
  taxSettings: TaxSettings,
  artifacts: ChatArtifact[],
  activeDocuments: Array<{ id: string; label: string }>
): string {
  const taxYearStats = calculateTaxYearStats(transactions, taxSettings.taxYear || new Date().getFullYear());
  const yearTransactions = taxYearStats.yearTransactions;
  const businessTxns = yearTransactions.filter(t => t.isBusiness && t.deductionStatus === 'confirmed');
  const personalTxns = yearTransactions.filter(t => !t.isBusiness && t.category.toLowerCase().match(/(charity|medical|dental|vision|tax)/));

  const filerStatusLabel: Record<string, string> = {
    single: 'Single',
    married_joint: 'Married Filing Jointly',
    married_separate: 'Married Filing Separately',
    head_household: 'Head of Household'
  };
  const filingStatus = filerStatusLabel[taxSettings.personalInfo?.filingStatus || 'single'] || 'Single';

  const lines: string[][] = [
    ['--- TAX PACKAGE GENERAL PROFILE ---'],
    ['Tax Year', String(taxSettings.taxYear)],
    ['Filing Status', filingStatus],
    ['Number of Dependents', String(taxSettings.personalInfo?.dependents || 0)],
    ['Gross Personal / W-2 Income', String(taxSettings.personalInfo?.w2Income || 0)],
    ['Estimated Tax Payments Paid', String(taxSettings.taxPayments?.estimatedPayments || 0)],
    ['State / LLC Fees Paid', String(taxSettings.taxPayments?.stateLocalFees || 0)],
    [],
  ];

  if (taxSettings.hasBusiness) {
    lines.push(
      ['--- BUSINESS LLC PROFILE ---'],
      ['DBA / Legal Name', taxSettings.businessIdentity?.dba || 'N/A'],
      ['Business Address', taxSettings.businessIdentity?.address || 'N/A'],
      ['EIN or SSN', taxSettings.businessIdentity?.einSsn || 'N/A'],
      ['Gross Sales / Receipts', String(taxSettings.businessIncome?.grossSales || 0)],
      ['Forms 1099 Total', String(taxSettings.businessIncome?.forms1099Total || 0)],
      ['Other Income', String(taxSettings.businessIncome?.otherIncome || 0)],
      ['Home Office sq ft', String(taxSettings.businessDeductions?.homeOffice?.sqFtOffice || 0)],
      ['Total Home sq ft', String(taxSettings.businessDeductions?.homeOffice?.sqFtHome || 0)],
      ['Vehicle Business Miles', String(taxSettings.businessDeductions?.vehicle?.businessMiles || 0)],
      ['Vehicle Personal Miles', String(taxSettings.businessDeductions?.vehicle?.personalMiles || 0)],
      []
    );
  }

  lines.push(
    ['--- DOCUMENT AUDIT CHECKLIST STATUS ---'],
    ['Document Title', 'Status', 'File Name']
  );

  activeDocuments.forEach(item => {
    const doc = artifacts.find(d => d.associatedChecklistId === item.id);
    lines.push([item.label, doc ? 'Uploaded' : 'Missing', doc ? doc.title : 'N/A']);
  });
  lines.push([]);

  lines.push(
    ['--- COMPILED DEDUCTIONS LEDGER ---'],
    ['Ledger Type', 'Date', 'Account', 'Merchant/Description', 'IRS or Spend Category', 'Gross Amount', 'Rate', 'Deductible Amount']
  );

  businessTxns.forEach(t => {
    const rate = t.taxCategory ? (SCHEDULE_C_CATEGORIES[t.taxCategory]?.deductionRate ?? 1.0) : 1.0;
    const deductible = Math.abs(t.amount) * rate;
    const catLabel = t.taxCategory ? (SCHEDULE_C_CATEGORIES[t.taxCategory]?.label ?? 'Other') : 'Other';
    const acc = accounts.find(a => a.id === t.accountId);
    lines.push([
      'Business Schedule C',
      t.date,
      acc ? acc.name : 'Unknown',
      t.description,
      catLabel,
      String(Math.abs(t.amount)),
      `${rate * 100}%`,
      String(deductible)
    ]);
  });

  personalTxns.forEach(t => {
    const acc = accounts.find(a => a.id === t.accountId);
    lines.push([
      'Personal Itemized',
      t.date,
      acc ? acc.name : 'Unknown',
      t.description,
      t.category,
      String(Math.abs(t.amount)),
      '100%',
      String(Math.abs(t.amount))
    ]);
  });

  return Papa.unparse(lines);
}
