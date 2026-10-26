#!/usr/bin/env node
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const MCP_PROTOCOL_VERSION = '2024-11-05';

function resolveDbPath(customPath) {
  if (customPath) return customPath;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db-path' && args[i + 1]) {
      return args[i + 1];
    }
  }
  if (process.env.STRICTLY_SPENDING_DB_PATH) {
    return process.env.STRICTLY_SPENDING_DB_PATH;
  }
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'com.strictlyspending.app', 'spending-viz.sqlite');
  }
  if (process.platform === 'darwin' && process.env.HOME) {
    return path.join(process.env.HOME, 'Library', 'Application Support', 'com.strictlyspending.app', 'spending-viz.sqlite');
  }
  if (process.env.HOME) {
    return path.join(process.env.HOME, '.local', 'share', 'com.strictlyspending.app', 'spending-viz.sqlite');
  }
  return 'spending-viz.sqlite';
}

const SCHEDULE_C_MAP = {
  advertising: ['Advertising (Line 8)', 1.0],
  carTruck: ['Car & Truck Expenses (Line 9)', 1.0],
  car_truck: ['Car & Truck Expenses (Line 9)', 1.0],
  commissions: ['Commissions & Fees (Line 10)', 1.0],
  contractLabor: ['Contract Labor (Line 11)', 1.0],
  contract_labor: ['Contract Labor (Line 11)', 1.0],
  depreciation: ['Depreciation (Line 13)', 1.0],
  insurance: ['Insurance - Other than Health (Line 15)', 1.0],
  interest: ['Interest - Mortgage/Other (Line 16)', 1.0],
  legalProfessional: ['Legal & Professional Services (Line 17)', 1.0],
  legal_professional: ['Legal & Professional Services (Line 17)', 1.0],
  officeExpense: ['Office Expense & Software (Line 18)', 1.0],
  office_expense: ['Office Expense & Software (Line 18)', 1.0],
  office_expenses: ['Office Expense & Software (Line 18)', 1.0],
  rentLease: ['Rent or Lease (Line 20)', 1.0],
  rent_lease: ['Rent or Lease (Line 20)', 1.0],
  repairsMaintenance: ['Repairs & Maintenance (Line 21)', 1.0],
  repairs_maintenance: ['Repairs & Maintenance (Line 21)', 1.0],
  supplies: ['Supplies (Line 22)', 1.0],
  taxesLicenses: ['Taxes & Licenses (Line 23)', 1.0],
  taxes_licenses: ['Taxes & Licenses (Line 23)', 1.0],
  travel: ['Travel (Line 24a)', 1.0],
  meals: ['Deductible Meals (Line 24b - 50%)', 0.5],
  utilities: ['Utilities (Line 25)', 1.0],
  other: ['Other Business Expenses (Line 27a)', 1.0],
};

function scheduleCInfo(slug) {
  return SCHEDULE_C_MAP[slug] || SCHEDULE_C_MAP.other;
}

function inferScheduleCCandidate(description = '', category = '') {
  const d = String(description).toLowerCase();
  const c = String(category).toLowerCase();
  if (/(stripe|paypal|square|shopify)/.test(d)) return 'commissions';
  if (/(github|aws|amazon web|vercel|openai|chatgpt|anthropic|claude|cursor|google cloud|figma|slack|zoom\.us|adobe|jetbrains|supabase|cloudflare|namecheap|godaddy)/.test(d)) {
    return 'officeExpense';
  }
  if (/(upwork|fiverr|toptal)/.test(d)) return 'contractLabor';
  if (/(turbotax|h&r block|taxact|freetaxusa|cpa)/.test(d)) return 'legalProfessional';
  if (/(staples|office depot|officemax)/.test(d)) return 'supplies';
  if (c === 'travel') return 'travel';
  if (c === 'taxes') return 'taxesLicenses';
  return null;
}

function csvEscape(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function buildTaxPackage(db, taxYear, includePending = true, outputDir = null) {
  const availableYearsRows = db.prepare(
    "SELECT DISTINCT CAST(SUBSTR(date, 1, 4) AS INTEGER) AS yr FROM transactions WHERE source != 'demo' AND LENGTH(date) >= 4 ORDER BY yr DESC"
  ).all();
  const availableYears = availableYearsRows.map(r => r.yr).filter(y => y > 1990 && y < 2100);
  const resolvedYear = taxYear || availableYears[0] || new Date().getFullYear();

  const accounts = db.prepare('SELECT id, name, type, institution, last4, source, enabled, current_balance FROM accounts').all();
  const accMap = new Map(accounts.map(a => [a.id, a]));

  const startDate = `${resolvedYear}-01-01`;
  const endDate = `${resolvedYear}-12-31`;
  const rows = db.prepare(
    `SELECT id, account_id, date, description, amount, category, is_business, tax_category, deduction_status
     FROM transactions
     WHERE source != 'demo' AND date BETWEEN ? AND ?
     ORDER BY date ASC, id ASC`
  ).all(startDate, endDate);

  let totalIncome = 0;
  let confirmedBusinessGross = 0;
  let confirmedBusinessDeductible = 0;
  let candidateBusinessGross = 0;
  let candidateBusinessDeductible = 0;
  let personalDeductionsTotal = 0;

  const scheduleCMap = new Map();
  const businessRows = [];
  const candidateRows = [];
  const personalRows = [];

  for (const t of rows) {
    const catLow = String(t.category || '').trim().toLowerCase();
    if (catLow === 'transfer' || catLow === 'transfers') continue;
    if (t.amount > 0 || catLow === 'income') {
      totalIncome += Math.abs(t.amount);
      continue;
    }

    const gross = Math.abs(t.amount);
    const acc = accMap.get(t.account_id);
    const accName = acc ? acc.name : 'Unknown Account';
    const accInst = acc ? acc.institution : 'Unknown';
    const isBus = Boolean(t.is_business);
    const status = t.deduction_status || 'pending';

    if (isBus && status !== 'rejected') {
      const [label, rate] = scheduleCInfo(t.tax_category);
      const deductible = round2(gross * rate);
      const entry = scheduleCMap.get(label) || { count: 0, gross: 0, rate, deductible: 0 };
      entry.count += 1;
      entry.gross += gross;
      entry.deductible += deductible;
      scheduleCMap.set(label, entry);
      confirmedBusinessGross += gross;
      confirmedBusinessDeductible += deductible;
      businessRows.push({
        id: t.id,
        date: t.date,
        account: accName,
        institution: accInst,
        description: t.description,
        spendCategory: t.category,
        scheduleCCategory: label,
        taxCategorySlug: t.tax_category || 'other',
        status: status === 'pending' ? 'tagged_business' : status,
        grossAmount: round2(gross),
        deductionRate: rate,
        deductibleAmount: deductible,
      });
    } else if (status !== 'rejected') {
      const inferredSlug = inferScheduleCCandidate(t.description, t.category);
      if (inferredSlug) {
        const [label, rate] = scheduleCInfo(inferredSlug);
        const deductible = round2(gross * rate);
        candidateBusinessGross += gross;
        candidateBusinessDeductible += deductible;
        if (includePending) {
          const entry = scheduleCMap.get(label) || { count: 0, gross: 0, rate, deductible: 0 };
          entry.count += 1;
          entry.gross += gross;
          entry.deductible += deductible;
          scheduleCMap.set(label, entry);
        }
        candidateRows.push({
          id: t.id,
          date: t.date,
          account: accName,
          institution: accInst,
          description: t.description,
          spendCategory: t.category,
          suggestedScheduleCCategory: label,
          suggestedTaxCategorySlug: inferredSlug,
          status: 'candidate',
          grossAmount: round2(gross),
          deductionRate: rate,
          deductibleAmount: deductible,
        });
      } else {
        const dLow = String(t.description || '').toLowerCase();
        if (/(charity|medical|health|dental|vision|tax)/.test(catLow) || /(charity|donation|property tax)/.test(dLow)) {
          personalDeductionsTotal += gross;
          personalRows.push({
            id: t.id,
            date: t.date,
            account: accName,
            institution: accInst,
            description: t.description,
            category: t.category,
            amount: round2(gross),
          });
        }
      }
    }
  }

  let pnlCsv = 'IRS Schedule C Category,Transaction Count,Gross Spend,Deduction Rate,Net Deductible Spend\n';
  let totalPnlCount = 0;
  let totalPnlGross = 0;
  let totalPnlDeductible = 0;
  const scheduleCBreakdown = [];

  for (const [label, entry] of [...scheduleCMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    totalPnlCount += entry.count;
    totalPnlGross += entry.gross;
    totalPnlDeductible += entry.deductible;
    pnlCsv += `${csvEscape(label)},${entry.count},${entry.gross.toFixed(2)},${Math.round(entry.rate * 100)}%,${entry.deductible.toFixed(2)}\n`;
    scheduleCBreakdown.push({
      scheduleCCategory: label,
      transactionCount: entry.count,
      grossSpend: round2(entry.gross),
      deductionRate: entry.rate,
      netDeductibleSpend: round2(entry.deductible),
    });
  }
  pnlCsv += `TOTAL SCHEDULE C EXPENSES,${totalPnlCount},${totalPnlGross.toFixed(2)},,${totalPnlDeductible.toFixed(2)}\n`;

  let ledgerCsv = 'Transaction ID,Date,Account,Institution,Description,Spend Category,IRS Schedule C Category,Status,Gross Amount,Deduction Rate,Deductible Amount\n';
  for (const item of businessRows) {
    ledgerCsv += `${item.id},${csvEscape(item.date)},${csvEscape(item.account)},${csvEscape(item.institution)},${csvEscape(item.description)},${csvEscape(item.spendCategory)},${csvEscape(item.scheduleCCategory)},${csvEscape(item.status)},${item.grossAmount.toFixed(2)},${Math.round(item.deductionRate * 100)}%,${item.deductibleAmount.toFixed(2)}\n`;
  }
  if (includePending) {
    for (const item of candidateRows) {
      ledgerCsv += `${item.id},${csvEscape(item.date)},${csvEscape(item.account)},${csvEscape(item.institution)},${csvEscape(item.description)},${csvEscape(item.spendCategory)},${csvEscape(item.suggestedScheduleCCategory)},candidate,${item.grossAmount.toFixed(2)},${Math.round(item.deductionRate * 100)}%,${item.deductibleAmount.toFixed(2)}\n`;
    }
  }

  let personalCsv = 'Transaction ID,Date,Account,Institution,Description,Category,Amount\n';
  for (const item of personalRows) {
    personalCsv += `${item.id},${csvEscape(item.date)},${csvEscape(item.account)},${csvEscape(item.institution)},${csvEscape(item.description)},${csvEscape(item.category)},${item.amount.toFixed(2)}\n`;
  }

  let md = `# Tax Summary & Schedule C Report (${resolvedYear})\n\n`;
  md += `- **Tax Year:** ${resolvedYear}\n`;
  md += `- **Total Recorded Deposits / Income:** $${totalIncome.toFixed(2)}\n`;
  md += `- **Confirmed Schedule C Business Deductions:** $${confirmedBusinessDeductible.toFixed(2)} (Gross: $${confirmedBusinessGross.toFixed(2)})\n`;
  md += `- **Candidate / Unreviewed Business Deductions:** $${candidateBusinessDeductible.toFixed(2)} (Gross: $${candidateBusinessGross.toFixed(2)})\n`;
  md += `- **Combined Schedule C Deductions:** $${totalPnlDeductible.toFixed(2)}\n`;
  md += `- **Itemized Personal Deductions (Medical/Charity/Tax):** $${personalDeductionsTotal.toFixed(2)}\n\n`;

  md += `## IRS Schedule C Profit & Loss Breakdown\n\n`;
  md += `| IRS Schedule C Category | Txns | Gross Spend | Rate | Net Deductible |\n`;
  md += `| :--- | ---: | ---: | ---: | ---: |\n`;
  for (const row of scheduleCBreakdown) {
    md += `| ${row.scheduleCCategory} | ${row.transactionCount} | $${row.grossSpend.toFixed(2)} | ${Math.round(row.deductionRate * 100)}% | $${row.netDeductibleSpend.toFixed(2)} |\n`;
  }
  md += `| **TOTAL SCHEDULE C** | **${totalPnlCount}** | **$${totalPnlGross.toFixed(2)}** | | **$${totalPnlDeductible.toFixed(2)}** |\n\n`;

  const savedFiles = [];
  if (outputDir && String(outputDir).trim()) {
    const dir = String(outputDir).trim();
    fs.mkdirSync(dir, { recursive: true });
    const pnlPath = path.join(dir, `Schedule_C_PnL_${resolvedYear}.csv`);
    fs.writeFileSync(pnlPath, pnlCsv, 'utf8');
    savedFiles.push(pnlPath);

    const ledgerPath = path.join(dir, `Business_Expense_Ledger_${resolvedYear}.csv`);
    fs.writeFileSync(ledgerPath, ledgerCsv, 'utf8');
    savedFiles.push(ledgerPath);

    const personalPath = path.join(dir, `Personal_Deductions_${resolvedYear}.csv`);
    fs.writeFileSync(personalPath, personalCsv, 'utf8');
    savedFiles.push(personalPath);

    const mdPath = path.join(dir, `Tax_Summary_Report_${resolvedYear}.md`);
    fs.writeFileSync(mdPath, md, 'utf8');
    savedFiles.push(mdPath);
  }

  return {
    taxYear: resolvedYear,
    availableTaxYears: availableYears,
    summary: {
      totalIncome: round2(totalIncome),
      confirmedBusinessGross: round2(confirmedBusinessGross),
      confirmedBusinessDeductible: round2(confirmedBusinessDeductible),
      candidateBusinessGross: round2(candidateBusinessGross),
      candidateBusinessDeductible: round2(candidateBusinessDeductible),
      combinedScheduleCDeductible: round2(totalPnlDeductible),
      personalItemizedDeductions: round2(personalDeductionsTotal),
      confirmedBusinessTransactionCount: businessRows.length,
      candidateBusinessTransactionCount: candidateRows.length,
      personalDeductionTransactionCount: personalRows.length,
    },
    scheduleCBreakdown,
    confirmedBusinessTransactions: businessRows,
    candidateBusinessTransactions: candidateRows,
    personalDeductionTransactions: personalRows,
    documents: {
      scheduleCPnlCsv: pnlCsv,
      businessLedgerCsv: ledgerCsv,
      personalDeductionsCsv: personalCsv,
      taxSummaryMarkdown: md,
    },
    savedFiles,
  };
}

function buildAccountCashflow(db, filterAccountId = null) {
  const accounts = db.prepare("SELECT id, name, type, institution, last4, source, enabled, current_balance FROM accounts WHERE source != 'demo' AND COALESCE(enabled, 1) = 1 ORDER BY name").all();
  const cutoff90 = new Date(Date.now() - 90 * 86400 * 1000).toISOString().slice(0, 10);

  const reports = [];
  for (const acc of accounts) {
    if (filterAccountId !== null && filterAccountId !== undefined && Number(acc.id) !== Number(filterAccountId)) {
      continue;
    }
    const rows = db.prepare(
      "SELECT amount, category, COALESCE(recurrence, 'none') AS recurrence FROM transactions WHERE source != 'demo' AND account_id = ? AND date >= ?"
    ).all(acc.id, cutoff90);

    let income90d = 0;
    let recurringBills90d = 0;
    let variableSpend90d = 0;
    let transfersOut90d = 0;
    let transfersIn90d = 0;

    for (const r of rows) {
      const catLow = String(r.category || '').trim().toLowerCase();
      if (catLow === 'transfer' || catLow === 'transfers') {
        if (r.amount < 0) transfersOut90d += Math.abs(r.amount);
        else transfersIn90d += r.amount;
      } else if (r.amount > 0 || catLow === 'income') {
        income90d += Math.abs(r.amount);
      } else if (r.recurrence && r.recurrence !== 'none') {
        recurringBills90d += Math.abs(r.amount);
      } else {
        variableSpend90d += Math.abs(r.amount);
      }
    }

    const monthlyIncome = round2(income90d / 3);
    const monthlyTransfersIn = round2(transfersIn90d / 3);
    const monthlyRecurringBills = round2(recurringBills90d / 3);
    const monthlyVariableSpend = round2(variableSpend90d / 3);
    const monthlySavingsOrTransfersOut = round2(transfersOut90d / 3);
    const netMonthlyRemainder = round2(
      monthlyIncome + monthlyTransfersIn - monthlyRecurringBills - monthlyVariableSpend - monthlySavingsOrTransfersOut
    );
    const startBal = Number(acc.current_balance) || 0;

    reports.push({
      accountId: acc.id,
      name: acc.name,
      institution: acc.institution,
      type: acc.type,
      currentBalance: round2(startBal),
      monthlyIncome,
      monthlyTransfersIn,
      monthlyRecurringBills,
      monthlyVariableSpend,
      monthlySavingsOrTransfersOut,
      netMonthlyRemainder,
      trajectory: netMonthlyRemainder >= 0 ? 'growing' : 'depleting',
      projectedBalance1Month: round2(startBal + netMonthlyRemainder),
      projectedBalance3Months: round2(startBal + netMonthlyRemainder * 3),
      projectedBalance6Months: round2(startBal + netMonthlyRemainder * 6),
      projectedBalance12Months: round2(startBal + netMonthlyRemainder * 12),
    });
  }

  return { trailingWindowDays: 90, accounts: reports };
}

function handleMcpRequestWithDb(db, req) {
  const method = req?.method || '';
  const id = req?.id;
  if (id === undefined || id === null || method.startsWith('notifications/')) {
    return null;
  }

  try {
    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { resources: {}, tools: {}, prompts: {} },
          serverInfo: { name: 'strictly-spending', version: '0.2.0' },
          instructions:
            'Strictly Spending personal finance & Schedule C tax MCP server. Read resources under strictly:// or call tools to query transactions, generate ready-to-file tax documents (CSV & Markdown), analyze per-account cashflow, categorize merchants, or control the live app UI.',
        },
      };
    }

    if (method === 'ping') {
      return { jsonrpc: '2.0', id, result: {} };
    }

    if (method === 'resources/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          resources: [
            { uri: 'strictly://summary/overview', name: 'Financial Overview & Cash Runway', mimeType: 'application/json' },
            { uri: 'strictly://accounts', name: 'Bank & Credit Accounts', mimeType: 'application/json' },
            { uri: 'strictly://categories', name: 'Spend & Income Categories', mimeType: 'application/json' },
            { uri: 'strictly://budgets', name: 'Monthly Category Budgets', mimeType: 'application/json' },
            { uri: 'strictly://loans', name: 'Loans & Mortgages', mimeType: 'application/json' },
            { uri: 'strictly://rules', name: 'Categorization Rules', mimeType: 'application/json' },
            { uri: 'strictly://tax/summary', name: 'Schedule C & Personal Tax Summary', mimeType: 'application/json' },
          ],
        },
      };
    }

    if (method === 'resources/read') {
      const uri = req?.params?.uri || '';
      let payload;
      if (uri === 'strictly://accounts') {
        payload = db.prepare('SELECT id, name, type, institution, last4, source, enabled, current_balance AS currentBalance FROM accounts ORDER BY name').all();
      } else if (uri === 'strictly://categories') {
        payload = db.prepare('SELECT id, name, color, type, sort_order AS sortOrder, default_recurrence AS defaultRecurrence FROM categories ORDER BY sort_order').all();
      } else if (uri === 'strictly://budgets') {
        payload = db.prepare('SELECT category, monthly_amount AS monthlyAmount, user_set AS userSet FROM budgets ORDER BY category').all();
      } else if (uri === 'strictly://loans') {
        payload = db.prepare('SELECT * FROM loans').all();
      } else if (uri === 'strictly://rules') {
        payload = db.prepare('SELECT * FROM rules ORDER BY priority DESC, id ASC').all();
      } else if (uri === 'strictly://tax/summary') {
        const pkg = buildTaxPackage(db, null, true, null);
        payload = {
          taxYear: pkg.taxYear,
          availableTaxYears: pkg.availableTaxYears,
          summary: pkg.summary,
          scheduleCBreakdown: pkg.scheduleCBreakdown,
          candidateBusinessTransactions: pkg.candidateBusinessTransactions,
          personalDeductionTransactions: pkg.personalDeductionTransactions,
        };
      } else {
        const cashRow = db.prepare("SELECT COALESCE(SUM(current_balance), 0) AS v FROM accounts WHERE source != 'demo' AND COALESCE(enabled, 1) = 1 AND type IN ('checking', 'savings')").get();
        const ccRow = db.prepare("SELECT COALESCE(SUM(ABS(MIN(0, current_balance))), 0) AS v FROM accounts WHERE source != 'demo' AND COALESCE(enabled, 1) = 1 AND type = 'credit'").get();
        const uncatRow = db.prepare("SELECT COUNT(*) AS c FROM transactions WHERE source != 'demo' AND category = 'Uncategorized'").get();
        payload = {
          liquidCash: round2(cashRow?.v || 0),
          creditCardDebt: round2(ccRow?.v || 0),
          uncategorizedTransactionCount: uncatRow?.c || 0,
        };
      }
      return {
        jsonrpc: '2.0',
        id,
        result: {
          contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(payload, null, 2) }],
        },
      };
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'query_transactions',
              description: 'Query transactions with optional filters for date range, category, merchant search, account ID, and business flag.',
              inputSchema: {
                type: 'object',
                properties: {
                  start_date: { type: 'string' },
                  end_date: { type: 'string' },
                  category: { type: 'string' },
                  search: { type: 'string' },
                  account_id: { type: 'integer' },
                  is_business: { type: 'boolean' },
                  limit: { type: 'integer' },
                },
              },
            },
            {
              name: 'get_spending_summary',
              description: 'Compute total spend, total income, net cashflow, per-category breakdown, and top merchants over a date range.',
              inputSchema: {
                type: 'object',
                properties: {
                  start_date: { type: 'string' },
                  end_date: { type: 'string' },
                },
                required: ['start_date', 'end_date'],
              },
            },
            {
              name: 'generate_tax_documents',
              description: 'Produce complete tax documents and summaries from the ledger for a given tax year (Schedule C P&L CSV, Business Expense Ledger CSV, Personal Itemized Deductions CSV, and Tax Summary Markdown report). Optionally writes files to output_dir.',
              inputSchema: {
                type: 'object',
                properties: {
                  tax_year: { type: 'integer' },
                  include_pending: { type: 'boolean' },
                  output_dir: { type: 'string' },
                },
              },
            },
            {
              name: 'update_tax_classification',
              description: 'Mark transactions as Business (Schedule C) or Personal deductions by transaction IDs, category, or account ID.',
              inputSchema: {
                type: 'object',
                properties: {
                  transaction_ids: { type: 'array', items: { type: 'integer' } },
                  category: { type: 'string' },
                  account_id: { type: 'integer' },
                  tax_year: { type: 'integer' },
                  is_business: { type: 'boolean' },
                  tax_category: { type: 'string' },
                },
                required: ['is_business'],
              },
            },
            {
              name: 'get_account_cashflow',
              description: 'Analyze monthly inflows, recurring bills, variable spend, savings transfers, net monthly remainder, and 12-month projected balance trajectory for one or all bank accounts.',
              inputSchema: {
                type: 'object',
                properties: {
                  account_id: { type: 'integer' },
                },
              },
            },
            {
              name: 'control_app_ui',
              description: 'Navigate the open Strictly Spending app to a page or apply live filters on screen.',
              inputSchema: {
                type: 'object',
                properties: {
                  page: { type: 'string' },
                  preset: { type: 'string' },
                  month: { type: 'string' },
                  search_query: { type: 'string' },
                  transaction_type: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          ],
        },
      };
    }

    if (method === 'tools/call') {
      const name = req?.params?.name || '';
      const args = req?.params?.arguments || {};
      let out;

      if (name === 'generate_tax_documents') {
        out = buildTaxPackage(db, args.tax_year || null, args.include_pending ?? true, args.output_dir || null);
      } else if (name === 'get_account_cashflow') {
        out = buildAccountCashflow(db, args.account_id);
      } else if (name === 'query_transactions') {
        const startDate = args.start_date || '2000-01-01';
        const endDate = args.end_date || '2099-12-31';
        const limit = Math.min(Math.max(Number(args.limit) || 100, 1), 500);
        let sql = "SELECT * FROM transactions WHERE source != 'demo' AND date BETWEEN ? AND ?";
        const bind = [startDate, endDate];
        if (args.category) {
          sql += ' AND LOWER(category) = LOWER(?)';
          bind.push(args.category);
        }
        if (args.search) {
          sql += ' AND (LOWER(description) LIKE ? OR LOWER(merchant_key) LIKE ?)';
          const pat = `%${String(args.search).toLowerCase()}%`;
          bind.push(pat, pat);
        }
        if (typeof args.account_id === 'number') {
          sql += ' AND account_id = ?';
          bind.push(args.account_id);
        }
        if (typeof args.is_business === 'boolean') {
          sql += ' AND is_business = ?';
          bind.push(args.is_business ? 1 : 0);
        }
        sql += ` ORDER BY date DESC, id DESC LIMIT ${limit}`;
        const rows = db.prepare(sql).all(...bind);
        out = { count: rows.length, transactions: rows };
      } else if (name === 'get_spending_summary') {
        const rows = db.prepare(
          `SELECT category, COUNT(*) AS transactionCount,
                  ROUND(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 2) AS spend,
                  ROUND(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 2) AS income
           FROM transactions
           WHERE source != 'demo' AND date BETWEEN ? AND ? AND LOWER(category) NOT IN ('transfer', 'transfers')
           GROUP BY category ORDER BY spend DESC`
        ).all(args.start_date, args.end_date);
        out = { startDate: args.start_date, endDate: args.end_date, byCategory: rows };
      } else if (name === 'update_tax_classification') {
        const isBus = args.is_business ? 1 : 0;
        const taxCat = args.is_business ? (args.tax_category || 'other') : null;
        let updated = 0;
        if (Array.isArray(args.transaction_ids) && args.transaction_ids.length > 0) {
          const stmt = db.prepare("UPDATE transactions SET is_business = ?, tax_category = ?, deduction_status = 'confirmed' WHERE id = ?");
          for (const tid of args.transaction_ids) {
            updated += stmt.run(isBus, taxCat, tid).changes;
          }
        }
        out = { updatedTransactions: updated, isBusiness: Boolean(args.is_business), taxCategory: taxCat };
      } else if (name === 'control_app_ui') {
        const cmdPayload = {
          id: Date.now(),
          page: args.page || null,
          preset: args.preset || null,
          month: args.month || null,
          searchQuery: args.search_query ?? null,
          transactionType: args.transaction_type || null,
          message: args.message || null,
        };
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('mcp_ui_command', ?)").run(JSON.stringify(cmdPayload));
        out = { status: 'dispatched', command: cmdPayload };
      } else {
        throw new Error(`Unknown tool: ${name}`);
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
          isError: false,
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  } catch (err) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: `Error: ${err.message || String(err)}` }],
        isError: true,
      },
    };
  }
}

function handleMcpJsonRpc(req, customDbPath) {
  const dbPath = resolveDbPath(customDbPath);
  const db = new DatabaseSync(dbPath);
  try {
    return handleMcpRequestWithDb(db, req);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  const dbPath = resolveDbPath();
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.toLowerCase().startsWith('content-length:')) return;
    try {
      const parsed = JSON.parse(trimmed);
      const resp = handleMcpJsonRpc(parsed, dbPath);
      if (resp) {
        process.stdout.write(JSON.stringify(resp) + '\n');
      }
    } catch (e) {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: `Parse error: ${e.message}` },
        }) + '\n'
      );
    }
  });
}

module.exports = { handleMcpJsonRpc, resolveDbPath };
