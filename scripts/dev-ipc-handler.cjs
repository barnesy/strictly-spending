const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const fs = require('node:fs');

function getDbPath() {
  const appData = process.env.APPDATA || '';
  const primary = path.join(appData, 'com.strictlyspending.finance', 'spending-viz.sqlite');
  const legacy = path.join(appData, 'com.strictlyspending.app', 'spending-viz.sqlite');
  if (fs.existsSync(legacy) && !fs.existsSync(primary)) {
    return legacy;
  }
  return fs.existsSync(primary) ? primary : legacy;
}

function getDb() {
  return new DatabaseSync(getDbPath());
}

function buildWhereClause(filters = {}) {
  let where = '1=1';
  const params = [];

  if (filters.startDate) {
    where += ' AND date >= ?';
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    where += ' AND date <= ?';
    params.push(filters.endDate);
  }
  if (Array.isArray(filters.enabledAccountIds)) {
    if (filters.enabledAccountIds.length > 0) {
      const ph = filters.enabledAccountIds.map(() => '?').join(',');
      where += ` AND account_id IN (${ph})`;
      params.push(...filters.enabledAccountIds);
    } else {
      where += ' AND 1 = 0';
    }
  }
  if (filters.disabledCategories && filters.disabledCategories.length > 0) {
    const ph = filters.disabledCategories.map(() => '?').join(',');
    where += ` AND category NOT IN (${ph})`;
    params.push(...filters.disabledCategories);
  }
  if (filters.transactionType) {
    if (filters.transactionType === 'income') {
      where += " AND (category IN (SELECT name FROM categories WHERE type = 'income') OR (amount > 0 AND category NOT IN (SELECT name FROM categories WHERE type = 'transfer')))";
    } else if (filters.transactionType === 'spend') {
      where += " AND amount < 0 AND category NOT IN (SELECT name FROM categories WHERE type IN ('transfer', 'income'))";
    } else if (filters.transactionType === 'transfer') {
      where += " AND category IN (SELECT name FROM categories WHERE type = 'transfer')";
    }
  } else if (filters.spendOnly) {
    where += " AND amount < 0 AND category NOT IN (SELECT name FROM categories WHERE type IN ('transfer', 'income'))";
  }
  if (filters.recurrenceFilter === 'recurring') {
    where += " AND recurrence = 'recurring'";
  } else if (filters.recurrenceFilter === 'onetime') {
    where += " AND (recurrence IS NULL OR recurrence != 'recurring')";
  }
  if (filters.searchQuery) {
    where += " AND (description LIKE ? OR merchant_key LIKE ?)";
    params.push(`%${filters.searchQuery}%`, `%${filters.searchQuery}%`);
  }
  if (typeof filters.minPrice === 'number') {
    where += " AND ABS(amount) >= ?";
    params.push(filters.minPrice);
  }
  if (typeof filters.maxPrice === 'number') {
    where += " AND ABS(amount) <= ?";
    params.push(filters.maxPrice);
  }
  if (filters.demoMode) {
    where += " AND source = 'demo'";
  } else {
    where += " AND source != 'demo'";
  }

  return { where, params };
}

async function handleIpc(cmd, args = {}) {
  const db = getDb();
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS csv_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        header_hash TEXT,
        headers TEXT,
        date_column TEXT,
        description_column TEXT,
        amount_column TEXT,
        debit_column TEXT,
        credit_column TEXT,
        balance_column TEXT,
        account_name TEXT,
        account_type TEXT,
        institution TEXT,
        account_column TEXT,
        account_mappings TEXT
      );
    `);
    try { db.exec("ALTER TABLE csv_mappings ADD COLUMN account_column TEXT;"); } catch {}
    try { db.exec("ALTER TABLE csv_mappings ADD COLUMN account_mappings TEXT;"); } catch {}
    try { db.exec("ALTER TABLE transactions ADD COLUMN is_pending BOOLEAN NOT NULL DEFAULT 0;"); } catch {}
    try {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_transactions_category_date ON transactions(category, date DESC);
        CREATE INDEX IF NOT EXISTS idx_transactions_merchant_date ON transactions(merchant_key, date DESC);
        CREATE INDEX IF NOT EXISTS idx_transactions_source_recurrence ON transactions(source, recurrence);
      `);
    } catch {}

    switch (cmd) {
      // --- CSV Mappings ---
      case 'get_csv_mappings': {
        const rows = db.prepare('SELECT id, name, header_hash, headers, date_column, description_column, amount_column, debit_column, credit_column, balance_column, account_name, account_type, institution, account_column, account_mappings FROM csv_mappings').all();
        return rows.map(r => ({
          id: r.id,
          name: r.name,
          headerHash: r.header_hash,
          headers: typeof r.headers === 'string' ? JSON.parse(r.headers || '[]') : (r.headers || []),
          dateColumn: r.date_column,
          descriptionColumn: r.description_column,
          amountColumn: r.amount_column,
          debitColumn: r.debit_column,
          creditColumn: r.credit_column,
          balanceColumn: r.balance_column,
          accountName: r.account_name,
          accountType: r.account_type,
          institution: r.institution,
          accountColumn: r.account_column,
          accountMappings: typeof r.account_mappings === 'string' ? JSON.parse(r.account_mappings || '{}') : (r.account_mappings || {}),
        }));
      }

      case 'add_csv_mapping': {
        const { item } = args;
        const res = db.prepare(`
          INSERT INTO csv_mappings (name, header_hash, headers, date_column, description_column, amount_column, debit_column, credit_column, balance_column, account_name, account_type, institution, account_column, account_mappings)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          item.name, item.headerHash, JSON.stringify(item.headers || []),
          item.dateColumn, item.descriptionColumn, item.amountColumn || null,
          item.debitColumn || null, item.creditColumn || null, item.balanceColumn || null,
          item.accountName, item.accountType, item.institution,
          item.accountColumn || null, JSON.stringify(item.accountMappings || {})
        );
        return res.lastInsertRowid;
      }

      case 'put_csv_mapping': {
        const { item } = args;
        db.prepare(`
          INSERT OR REPLACE INTO csv_mappings (id, name, header_hash, headers, date_column, description_column, amount_column, debit_column, credit_column, balance_column, account_name, account_type, institution, account_column, account_mappings)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          item.id || null, item.name, item.headerHash, JSON.stringify(item.headers || []),
          item.dateColumn, item.descriptionColumn, item.amountColumn || null,
          item.debitColumn || null, item.creditColumn || null, item.balanceColumn || null,
          item.accountName, item.accountType, item.institution,
          item.accountColumn || null, JSON.stringify(item.accountMappings || {})
        );
        return null;
      }

      case 'update_csv_mapping': {
        const { id, updates } = args;
        db.prepare(`
          UPDATE csv_mappings SET name=?, header_hash=?, headers=?, date_column=?, description_column=?, amount_column=?, debit_column=?, credit_column=?, balance_column=?, account_name=?, account_type=?, institution=?, account_column=?, account_mappings=?
          WHERE id = ?
        `).run(
          updates.name, updates.headerHash, JSON.stringify(updates.headers || []),
          updates.dateColumn, updates.descriptionColumn, updates.amountColumn || null,
          updates.debitColumn || null, updates.creditColumn || null, updates.balanceColumn || null,
          updates.accountName, updates.accountType, updates.institution,
          updates.accountColumn || null, JSON.stringify(updates.accountMappings || {}),
          id
        );
        return null;
      }

      case 'delete_csv_mapping': {
        const { id } = args;
        db.prepare('DELETE FROM csv_mappings WHERE id = ?').run(id);
        return null;
      }

      case 'clear_csv_mappings': {
        db.prepare('DELETE FROM csv_mappings').run();
        return null;
      }

      // --- Accounts ---
      case 'get_accounts': {
        const rows = db.prepare('SELECT id, name, type, institution, last4, source, enabled, current_balance FROM accounts').all();
        return rows.map(r => ({
          id: r.id,
          name: r.name,
          type: r.type,
          institution: r.institution,
          last4: r.last4,
          source: r.source,
          enabled: Boolean(r.enabled),
          currentBalance: r.current_balance
        }));
      }

      case 'add_account': {
        const item = args.item;
        const info = db.prepare('INSERT INTO accounts (name, type, institution, last4, source, enabled, current_balance) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          item.name, item.type, item.institution, item.last4 || null, item.source, item.enabled ? 1 : 0, item.currentBalance || 0
        );
        return Number(info.lastInsertRowid);
      }

      case 'update_account': {
        const { id, updates } = args;
        db.prepare('UPDATE accounts SET name = ?, type = ?, institution = ?, last4 = ?, source = ?, enabled = ?, current_balance = ? WHERE id = ?').run(
          updates.name, updates.type, updates.institution, updates.last4 || null, updates.source, updates.enabled ? 1 : 0, updates.currentBalance || 0, id
        );
        return null;
      }

      case 'delete_account': {
        db.prepare('DELETE FROM accounts WHERE id = ?').run(args.id);
        return null;
      }

      case 'clear_accounts': {
        db.prepare('DELETE FROM accounts').run();
        return null;
      }

      // --- Categories ---
      case 'get_categories': {
        const rows = db.prepare('SELECT id, name, color, type, sort_order, default_recurrence FROM categories ORDER BY sort_order ASC').all();
        return rows.map(r => ({
          id: r.id,
          name: r.name,
          color: r.color,
          type: r.type,
          sortOrder: r.sort_order,
          defaultRecurrence: r.default_recurrence
        }));
      }

      case 'add_category': {
        const item = args.item;
        const info = db.prepare('INSERT INTO categories (name, color, type, sort_order, default_recurrence) VALUES (?, ?, ?, ?, ?)').run(
          item.name, item.color, item.type, item.sortOrder || 0, item.defaultRecurrence || 'onetime'
        );
        return Number(info.lastInsertRowid);
      }

      case 'update_category': {
        const { id, updates } = args;
        db.prepare('UPDATE categories SET name = ?, color = ?, type = ?, sort_order = ?, default_recurrence = ? WHERE id = ?').run(
          updates.name, updates.color, updates.type, updates.sortOrder || 0, updates.defaultRecurrence || 'onetime', id
        );
        return null;
      }

      case 'delete_category': {
        db.prepare('DELETE FROM categories WHERE id = ?').run(args.id);
        return null;
      }

      case 'clear_categories': {
        db.prepare('DELETE FROM categories').run();
        return null;
      }

      // --- Rules ---
      case 'get_rules': {
        const rows = db.prepare('SELECT id, pattern, category, priority, created_at FROM rules ORDER BY priority DESC').all();
        return rows.map(r => ({
          id: r.id,
          pattern: r.pattern,
          category: r.category,
          priority: r.priority,
          createdAt: r.created_at
        }));
      }

      case 'add_rule': {
        const item = args.item;
        const now = new Date().toISOString();
        const pat = (item.pattern || '').trim();
        const existing = db.prepare('SELECT id FROM rules WHERE LOWER(pattern) = LOWER(?)').get(pat);
        if (existing) {
          db.prepare('UPDATE rules SET pattern = ?, category = ?, priority = ?, created_at = ? WHERE id = ?').run(
            pat, item.category, item.priority || 50, item.createdAt || now, existing.id
          );
          return Number(existing.id);
        }
        const info = db.prepare('INSERT INTO rules (pattern, category, priority, created_at) VALUES (?, ?, ?, ?)').run(
          pat, item.category, item.priority || 50, item.createdAt || now
        );
        return Number(info.lastInsertRowid);
      }

      case 'update_rule': {
        const { id, updates } = args;
        db.prepare('UPDATE rules SET pattern = ?, category = ?, priority = ? WHERE id = ?').run(
          updates.pattern, updates.category, updates.priority, id
        );
        return null;
      }

      case 'delete_rule': {
        db.prepare('DELETE FROM rules WHERE id = ?').run(args.id);
        return null;
      }

      case 'clear_rules': {
        db.prepare('DELETE FROM rules').run();
        return null;
      }

      // --- Budgets ---
      case 'get_budgets': {
        const rows = db.prepare('SELECT category, monthly_amount, user_set FROM budgets').all();
        return rows.map(r => ({
          category: r.category,
          monthlyAmount: r.monthly_amount,
          userSet: Boolean(r.user_set),
        }));
      }

      case 'put_budget': {
        const { item } = args;
        db.prepare(`
          INSERT INTO budgets (category, monthly_amount, user_set)
          VALUES (?, ?, ?)
          ON CONFLICT(category) DO UPDATE SET
            monthly_amount = excluded.monthly_amount,
            user_set = excluded.user_set
        `).run(
          item.category, item.monthlyAmount, item.userSet ? 1 : 0
        );
        return null;
      }

      case 'bulk_put_budgets': {
        const list = args.budgets || args.items || [];
        const stmt = db.prepare(`
          INSERT INTO budgets (category, monthly_amount, user_set)
          VALUES (?, ?, ?)
          ON CONFLICT(category) DO UPDATE SET
            monthly_amount = excluded.monthly_amount,
            user_set = excluded.user_set
        `);
        for (const item of list) {
          stmt.run(item.category, item.monthlyAmount, item.userSet ? 1 : 0);
        }
        return null;
      }

      case 'clear_budgets': {
        db.prepare('DELETE FROM budgets').run();
        return null;
      }

      // --- Settings ---
      case 'get_settings': {
        const rows = db.prepare('SELECT key, value FROM settings').all();
        return rows.map(r => {
          let parsed = r.value;
          if (typeof r.value === 'string') {
            try { parsed = JSON.parse(r.value); } catch {}
          }
          return {
            key: r.key,
            value: parsed
          };
        });
      }

      case 'get_setting': {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(args.key);
        if (!row || row.value == null) return null;
        if (typeof row.value === 'string') {
          try { return JSON.parse(row.value); } catch { return row.value; }
        }
        return row.value;
      }

      case 'set_setting':
      case 'put_setting': {
        const setting = args.setting || args.item || args;
        const key = setting.key;
        const value = typeof setting.value === 'string' ? setting.value : JSON.stringify(setting.value ?? '');
        db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
          key, value
        );
        return null;
      }

      case 'delete_setting': {
        db.prepare('DELETE FROM settings WHERE key = ?').run(args.key);
        return null;
      }

      // --- Merchant Overrides ---
      case 'get_merchant_overrides': {
        const rows = db.prepare('SELECT merchant_key, recurrence FROM merchant_overrides').all();
        return rows.map(r => ({
          merchantKey: r.merchant_key,
          recurrence: r.recurrence
        }));
      }

      case 'put_merchant_override': {
        const { item } = args;
        db.prepare('INSERT INTO merchant_overrides (merchant_key, recurrence) VALUES (?, ?) ON CONFLICT(merchant_key) DO UPDATE SET recurrence = excluded.recurrence').run(
          item.merchantKey, item.recurrence
        );
        return null;
      }

      case 'delete_merchant_override': {
        db.prepare('DELETE FROM merchant_overrides WHERE merchant_key = ?').run(args.merchantKey);
        return null;
      }

      case 'clear_merchant_overrides': {
        db.prepare('DELETE FROM merchant_overrides').run();
        return null;
      }


      // --- Loans ---
      case 'get_loans': {
        const rows = db.prepare('SELECT id, name, type, principal, rate, term_years, start_date, category, merchant, monthly_payment, property_value, down_payment, extra_monthly_payment, extra_one_time_payment, extra_one_time_month, created_at, enabled FROM loans').all();
        return rows.map(r => ({
          id: r.id,
          name: r.name,
          type: r.type,
          principal: r.principal,
          rate: r.rate,
          termYears: r.term_years,
          startDate: r.start_date,
          category: r.category,
          merchant: r.merchant,
          monthlyPayment: r.monthly_payment,
          propertyValue: r.property_value,
          downPayment: r.down_payment,
          extraMonthlyPayment: r.extra_monthly_payment,
          extraOneTimePayment: r.extra_one_time_payment,
          extraOneTimeMonth: r.extra_one_time_month,
          createdAt: r.created_at,
          enabled: r.enabled === null ? true : Boolean(r.enabled),
        }));
      }

      case 'add_loan': {
        const { item } = args;
        const res = db.prepare(`
          INSERT INTO loans (name, type, principal, rate, term_years, start_date, category, merchant, monthly_payment, property_value, down_payment, extra_monthly_payment, extra_one_time_payment, extra_one_time_month, created_at, enabled)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          item.name, item.type, item.principal, item.rate, item.termYears, item.startDate,
          item.category, item.merchant || null, item.monthlyPayment || null, item.propertyValue || null,
          item.downPayment || null, item.extraMonthlyPayment || null, item.extraOneTimePayment || null,
          item.extraOneTimeMonth || null, item.createdAt, item.enabled === false ? 0 : 1
        );
        return res.lastInsertRowid;
      }

      case 'put_loan': {
        const { item } = args;
        db.prepare(`
          INSERT OR REPLACE INTO loans (id, name, type, principal, rate, term_years, start_date, category, merchant, monthly_payment, property_value, down_payment, extra_monthly_payment, extra_one_time_payment, extra_one_time_month, created_at, enabled)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          item.id || null, item.name, item.type, item.principal, item.rate, item.termYears, item.startDate,
          item.category, item.merchant || null, item.monthlyPayment || null, item.propertyValue || null,
          item.downPayment || null, item.extraMonthlyPayment || null, item.extraOneTimePayment || null,
          item.extraOneTimeMonth || null, item.createdAt, item.enabled === false ? 0 : 1
        );
        return null;
      }

      case 'update_loan': {
        const { id, updates } = args;
        db.prepare(`
          UPDATE loans SET
            name = ?, type = ?, principal = ?, rate = ?, term_years = ?, start_date = ?, category = ?,
            merchant = ?, monthly_payment = ?, property_value = ?, down_payment = ?, extra_monthly_payment = ?,
            extra_one_time_payment = ?, extra_one_time_month = ?, created_at = ?, enabled = ?
          WHERE id = ?
        `).run(
          updates.name, updates.type, updates.principal, updates.rate, updates.termYears, updates.startDate,
          updates.category, updates.merchant || null, updates.monthlyPayment || null, updates.propertyValue || null,
          updates.downPayment || null, updates.extraMonthlyPayment || null, updates.extraOneTimePayment || null,
          updates.extraOneTimeMonth || null, updates.createdAt, updates.enabled === false ? 0 : 1,
          id
        );
        return null;
      }

      case 'delete_loan': {
        db.prepare('DELETE FROM loans WHERE id = ?').run(args.id);
        return null;
      }

      case 'clear_loans': {
        db.prepare('DELETE FROM loans').run();
        return null;
      }

      // --- Transactions & Analytics ---
      case 'get_transaction_bounds': {
        const demoMode = args.demoMode || false;
        const query = demoMode
          ? "SELECT MIN(date) as min_date, MAX(date) as max_date FROM transactions WHERE source = 'demo'"
          : "SELECT MIN(date) as min_date, MAX(date) as max_date FROM transactions WHERE source != 'demo'";
        const row = db.prepare(query).get();
        return [row?.min_date || null, row?.max_date || null];
      }

      case 'get_uncategorized_count': {
        const demoMode = args.demoMode || false;
        const query = demoMode
          ? "SELECT COUNT(*) as c FROM transactions WHERE category = 'Uncategorized' AND source = 'demo'"
          : "SELECT COUNT(*) as c FROM transactions WHERE category = 'Uncategorized' AND source != 'demo'";
        const row = db.prepare(query).get();
        return row?.c || 0;
      }

      case 'get_transaction_count': {
        const { where, params } = buildWhereClause(args.filters);
        const sql = `SELECT COUNT(*) as c FROM transactions WHERE ${where}`;
        const row = db.prepare(sql).get(...params);
        return row?.c || 0;
      }

      case 'get_dashboard_aggregates': {
        const baseFilters = { ...(args.filters || {}), spendOnly: false, transactionType: undefined };
        const { where, params } = buildWhereClause(baseFilters);

        const spendRow = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE ${where} AND amount < 0 AND category NOT IN (SELECT name FROM categories WHERE type IN ('transfer', 'income'))`).get(...params);
        const incomeRow = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE ${where} AND (category IN (SELECT name FROM categories WHERE type = 'income') OR (amount > 0 AND category NOT IN (SELECT name FROM categories WHERE type = 'transfer')))`).get(...params);
        
        const { where: acctWhere, params: acctParams } = buildWhereClause(args.filters || {});
        let acctSql = `SELECT account_id, COALESCE(SUM(ABS(amount)), 0) as total FROM transactions WHERE ${acctWhere} GROUP BY account_id`;
        const acctRows = db.prepare(acctSql).all(...acctParams);
        
        const accountTotals = {};
        for (const r of acctRows) {
          accountTotals[r.account_id] = r.total;
        }

        return {
          totalSpend: Math.abs(spendRow?.total || 0),
          totalIncome: incomeRow?.total || 0,
          accountTotals
        };
      }

      case 'get_transactions_paginated': {
        const limit = args.limit || 50;
        const offset = args.offset || 0;
        const { where, params } = buildWhereClause(args.filters);

        const sql = `SELECT id, account_id, date, description, amount, raw_category, category, source, merchant_key, user_overridden, dedup_key, import_batch_id, recurrence, recurrence_override, is_business, tax_category, deduction_status, COALESCE(is_pending, 0) as is_pending FROM transactions WHERE ${where} ORDER BY date DESC LIMIT ? OFFSET ?`;
        const rows = db.prepare(sql).all(...params, limit, offset);
        return rows.map(r => ({
          id: r.id,
          accountId: r.account_id,
          date: r.date,
          description: r.description,
          amount: r.amount,
          rawCategory: r.raw_category,
          category: r.category,
          source: r.source,
          merchantKey: r.merchant_key,
          userOverridden: Boolean(r.user_overridden),
          dedupKey: r.dedup_key,
          importBatchId: r.import_batch_id,
          recurrence: r.recurrence || 'none',
          recurrenceOverride: r.recurrence_override,
          isBusiness: Boolean(r.is_business),
          taxCategory: r.tax_category,
          deductionStatus: r.deduction_status,
          isPending: Boolean(r.is_pending)
        }));
      }

      case 'get_day_history_transactions': {
        const day = Number(args.day || 1);
        const windowDays = Number(args.windowDays ?? args.window_days ?? 0);
        const targetMonth = args.targetMonth ? Number(args.targetMonth) : (args.target_month ? Number(args.target_month) : null);
        const minDay = Math.max(1, day - windowDays);
        const maxDay = Math.min(31, day + windowDays);

        const baseFilters = { ...(args.filters || {}), startDate: undefined, endDate: undefined };
        const { where, params } = buildWhereClause(baseFilters);

        let sql = `SELECT id, account_id, date, description, amount, raw_category, category, source, merchant_key, user_overridden, dedup_key, import_batch_id, recurrence, recurrence_override, is_business, tax_category, deduction_status, COALESCE(is_pending, 0) as is_pending FROM transactions WHERE CAST(SUBSTR(date, 9, 2) AS INTEGER) BETWEEN ? AND ? AND ${where}`;
        const allParams = [minDay, maxDay, ...params];

        if (targetMonth) {
          sql += ' AND CAST(SUBSTR(date, 6, 2) AS INTEGER) = ?';
          allParams.push(targetMonth);
        }

        sql += ' ORDER BY date DESC, id DESC LIMIT 5000';
        const rows = db.prepare(sql).all(...allParams);
        return rows.map(r => ({
          id: r.id,
          accountId: r.account_id,
          date: r.date,
          description: r.description,
          amount: r.amount,
          rawCategory: r.raw_category,
          category: r.category,
          source: r.source,
          merchantKey: r.merchant_key,
          userOverridden: Boolean(r.user_overridden),
          dedupKey: r.dedup_key,
          importBatchId: r.import_batch_id,
          recurrence: r.recurrence || 'none',
          recurrenceOverride: r.recurrence_override,
          isBusiness: Boolean(r.is_business),
          taxCategory: r.tax_category,
          deductionStatus: r.deduction_status,
          isPending: Boolean(r.is_pending)
        }));
      }

      case 'get_transactions': {
        let sql = 'SELECT id, account_id, date, description, amount, raw_category, category, source, merchant_key, user_overridden, dedup_key, import_batch_id, recurrence, recurrence_override, is_business, tax_category, deduction_status, COALESCE(is_pending, 0) as is_pending FROM transactions WHERE 1=1';
        const params = [];
        if (args.startDate) {
          sql += ' AND date >= ?';
          params.push(args.startDate);
        }
        if (args.endDate) {
          sql += ' AND date <= ?';
          params.push(args.endDate);
        }
        const mKey = args.merchantKey || args.merchant_key;
        if (mKey) {
          sql += ' AND merchant_key = ?';
          params.push(mKey);
        }
        if (args.category) {
          sql += ' AND category = ?';
          params.push(args.category);
        }
        const accId = args.accountId ?? args.account_id;
        if (accId != null) {
          sql += ' AND account_id = ?';
          params.push(accId);
        }
        const dedStatus = args.deductionStatus || args.deduction_status;
        if (dedStatus) {
          sql += ' AND deduction_status = ?';
          params.push(dedStatus);
        }
        sql += ' ORDER BY date DESC';
        const rows = db.prepare(sql).all(...params);
        return rows.map(r => ({
          id: r.id,
          accountId: r.account_id,
          date: r.date,
          description: r.description,
          amount: r.amount,
          rawCategory: r.raw_category,
          category: r.category,
          source: r.source,
          merchantKey: r.merchant_key,
          userOverridden: Boolean(r.user_overridden),
          dedupKey: r.dedup_key,
          importBatchId: r.import_batch_id,
          recurrence: r.recurrence || 'none',
          recurrenceOverride: r.recurrence_override,
          isBusiness: Boolean(r.is_business),
          taxCategory: r.tax_category,
          deductionStatus: r.deduction_status,
          isPending: Boolean(r.is_pending)
        }));
      }

      case 'get_top_merchants': {
        const { where, params } = buildWhereClause(args.filters || {});
        const isIncome = args.filters?.transactionType === 'income';
        const orderClause = isIncome ? 'ORDER BY total DESC' : 'ORDER BY total ASC';
        const amountFilter = isIncome ? 'AND amount > 0' : 'AND amount < 0';
        const sql = `SELECT merchant_key, COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt FROM transactions WHERE ${where} ${amountFilter} GROUP BY merchant_key ${orderClause} LIMIT 100`;
        const rows = db.prepare(sql).all(...params);
        return rows.map(r => ({
          merchantKey: r.merchant_key,
          total: r.total,
          count: r.cnt
        }));
      }

      case 'get_spend_chart_data': {
        const { where, params } = buildWhereClause(args.filters || {});
        const groupBy = args.groupBy || 'category';
        let groupCol = 'category';
        if (groupBy === 'account') groupCol = 'CAST(account_id AS TEXT)';
        else if (groupBy === 'merchant') groupCol = 'merchant_key';
        else if (groupBy === 'recurrence') groupCol = 'recurrence';
        else if (groupBy === 'all') groupCol = "'all'";

        const isIncome = args.filters?.transactionType === 'income';
        const isAll = args.filters?.transactionType === 'all';
        const amountCondition = (isIncome || isAll) ? '' : 'amount < 0 AND ';

        const sql = `SELECT strftime('%Y-%m', date) as month, COALESCE(${groupCol}, '') as key, COALESCE(SUM(amount), 0) as total FROM transactions WHERE ${amountCondition}${where} GROUP BY month, key`;
        const rows = db.prepare(sql).all(...params);
        return rows.map(r => ({
          month: r.month,
          key: r.key,
          total: r.total
        }));
      }

      case 'get_income_chart_data': {
        const baseFilters = { ...(args.filters || {}), spendOnly: false, transactionType: undefined };
        const { where, params } = buildWhereClause(baseFilters);
        const sql = `SELECT strftime('%Y-%m', date) as month, 'income' as key, COALESCE(SUM(amount), 0) as total FROM transactions WHERE (category IN (SELECT name FROM categories WHERE type = 'income') OR (amount > 0 AND category NOT IN (SELECT name FROM categories WHERE type = 'transfer'))) AND ${where} GROUP BY month`;
        const rows = db.prepare(sql).all(...params);
        return rows.map(r => ({
          month: r.month,
          key: r.key,
          total: r.total
        }));
      }

      case 'get_consolidated_recurring_merchants': {
        const isDemo = args.isDemo || false;
        const accId = args.accountId ?? args.account_id;
        const now = new Date();
        const cutoff = new Date(now.getTime() - 60 * 86400000).toISOString().split('T')[0];
        const sourceCond = isDemo ? "source = 'demo'" : "source != 'demo'";
        let sql = `SELECT merchant_key, category, SUM(ABS(amount)) as total, COUNT(*) as count FROM transactions WHERE amount < 0 AND date >= ? AND COALESCE(recurrence_override, recurrence, 'recurring') != 'onetime' AND category IN (SELECT name FROM categories WHERE default_recurrence = 'recurring') AND ${sourceCond}`;
        const params = [cutoff];
        if (accId != null) {
          sql += ' AND account_id = ?';
          params.push(accId);
        }
        sql += ' GROUP BY merchant_key, category';
        const rows = db.prepare(sql).all(...params);
        const results = rows.map(r => ({
          merchantKey: r.merchant_key,
          category: r.category,
          monthlyAverage: r.total / (r.count > 0 ? r.count : 1)
        }));
        results.sort((a, b) => b.monthlyAverage - a.monthlyAverage);
        return results;
      }

      case 'get_category_trailing_averages': {
        const isDemo = args.isDemo || false;
        const accId = args.accountId ?? args.account_id;
        const now = new Date();
        const cutoff = new Date(now.getTime() - 90 * 86400000).toISOString().split('T')[0];
        const sourceCond = isDemo ? "source = 'demo'" : "source != 'demo'";
        let sql = `SELECT category, SUM(ABS(amount)) as total FROM transactions WHERE amount < 0 AND date >= ? AND category IN (SELECT name FROM categories WHERE type = 'spend') AND ${sourceCond}`;
        const params = [cutoff];
        if (accId != null) {
          sql += ' AND account_id = ?';
          params.push(accId);
        }
        sql += ' GROUP BY category';
        const rows = db.prepare(sql).all(...params);
        return rows.map(r => ({
          category: r.category,
          average: r.total / 3.0
        }));
      }

      case 'last_month_actual_spend': {
        const isDemo = Boolean(args.isDemo ?? args.is_demo ?? false);
        const accId = args.accountId ?? args.account_id;
        const now = new Date();
        const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        const startStr = `${prevMonthStart.getFullYear()}-${String(prevMonthStart.getMonth() + 1).padStart(2, '0')}-01`;
        const endStr = `${prevMonthEnd.getFullYear()}-${String(prevMonthEnd.getMonth() + 1).padStart(2, '0')}-${String(prevMonthEnd.getDate()).padStart(2, '0')}`;
        const sourceCond = isDemo ? "source = 'demo'" : "source != 'demo'";
        let sql = `SELECT COALESCE(SUM(ABS(amount)), 0.0) as total FROM transactions WHERE date BETWEEN ? AND ? AND amount < 0 AND category IN (SELECT name FROM categories WHERE type = 'spend') AND ${sourceCond}`;
        const params = [startStr, endStr];
        if (accId != null) {
          sql += ' AND account_id = ?';
          params.push(accId);
        }
        const row = db.prepare(sql).get(...params);
        return row?.total || 0;
      }

      case 'get_unique_merchants': {
        const isDemo = args.isDemo || false;
        const sourceCond = isDemo ? "source = 'demo'" : "source != 'demo'";
        const sql = `SELECT DISTINCT merchant_key FROM transactions WHERE merchant_key != '' AND ${sourceCond} ORDER BY merchant_key ASC`;
        const rows = db.prepare(sql).all();
        return rows.map(r => r.merchant_key);
      }

      case 'get_merchant_groups': {
        const demoMode = args.demoMode || false;
        const sourceCond = demoMode ? "source = 'demo'" : "source != 'demo'";
        const sql = `SELECT merchant_key, category, COUNT(*) as count, SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) as spend, MIN(date) as earliest, MAX(date) as latest FROM transactions WHERE ${sourceCond} GROUP BY merchant_key, category`;
        const rows = db.prepare(sql).all();
        const groups = new Map();
        for (const r of rows) {
          const key = r.merchant_key || 'Unknown';
          if (!groups.has(key)) {
            groups.set(key, {
              merchantKey: key,
              totalSpend: 0,
              totalTransactions: 0,
              categories: {},
              mostCommonCategory: '',
              earliestDate: r.earliest,
              latestDate: r.latest
            });
          }
          const g = groups.get(key);
          g.totalSpend += (r.spend || 0);
          g.totalTransactions += (r.count || 0);
          g.categories[r.category] = r.count;
          if (r.earliest < g.earliestDate) g.earliestDate = r.earliest;
          if (r.latest > g.latestDate) g.latestDate = r.latest;
        }
        for (const g of groups.values()) {
          let maxCount = -1;
          let bestCat = 'Uncategorized';
          for (const [cat, count] of Object.entries(g.categories)) {
            if (count > maxCount) {
              maxCount = count;
              bestCat = cat;
            }
          }
          g.mostCommonCategory = bestCat;
        }
        return Array.from(groups.values());
      }

      case 'get_sort_queue': {
        const demoMode = args.demoMode || false;
        const sourceCondition = demoMode ? "source = 'demo'" : "source != 'demo'";
        const txns = db.prepare(`SELECT id, account_id, date, description, amount, raw_category, category, source, merchant_key, user_overridden, dedup_key, import_batch_id, recurrence, recurrence_override, is_business, tax_category, deduction_status, COALESCE(is_pending, 0) as is_pending FROM transactions WHERE category = 'Uncategorized' AND ${sourceCondition}`).all();
        
        const rules = db.prepare('SELECT pattern, category, priority FROM rules ORDER BY priority DESC').all();
        const catRows = db.prepare('SELECT name FROM categories').all();
        const validCategories = new Set(catRows.map(c => c.name));

        const KNOWN_BRANDS = [
          'the home depot', 'home depot', 'the ups store', 'ups store',
          'racetrac', 'chevron', 'quiktrip', 'circle k', 'citgo', 'shell',
          'dunkin', 'xero', 'amc', 'starbucks', 'walmart', 'target',
          'publix', 'kroger', 'trader joe', 'whole foods', 'mcdonald',
          'chick fil a', 'waffle house', 'marathon', 'valero', 'exxon',
          'speedway', 'costco', 'sams club', 'apple', 'google', 'amazon',
          'netflix', 'spotify', 'hulu', 'disney', 'uber', 'lyft',
          'cvs', 'walgreens', 'zelle', 'venmo', 'paypal', 'robinhood',
          'coinbase', 'fidelity', 'vanguard', 'schwab', 'truist', 'chase'
        ];
        const NOISE_WORDS = new Set([
          'trn', 'id', 'des', 'indn', 'co', 'ref', 'conf', 'confirmation',
          'date', 'time', 'et', 'est', 'edt', 'pmt', 'ach', 'pos', 'ppd',
          'web', 'tel', 'seq', 'orig', 'bnf', 'srf', 'mobile', 'purchase',
          'debit', 'card', 'withdrwl', 'withdrawal', 'recurring', 'online',
          'banking', 'from', 'to', 'chk', 'sav', 'acct', 'account', 'type',
          'al', 'ak', 'az', 'ar', 'ca', 'ct', 'de', 'fl', 'ga', 'hi', 'il',
          'in', 'ia', 'ks', 'ky', 'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms',
          'mo', 'mt', 'ne', 'nv', 'nh', 'nj', 'nm', 'ny', 'nc', 'nd', 'oh',
          'ok', 'or', 'pa', 'ri', 'sc', 'sd', 'tn', 'tx', 'ut', 'vt', 'va',
          'wa', 'wv', 'wi', 'wy'
        ]);

        const normalizeStem = (rawKey, description) => {
          const src = (rawKey && rawKey.trim()) ? rawKey : (description || '');
          const cleaned = src.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
          const padded = ` ${cleaned} `;
          for (const brand of KNOWN_BRANDS) {
            if (padded.includes(` ${brand} `)) return brand;
          }
          const words = cleaned.split(/\s+/).filter(w => {
            if (w.length < 2) return false;
            if (/^x+$/.test(w) || w.startsWith('xx')) return false;
            if (/\d/.test(w)) return false;
            return !NOISE_WORDS.has(w);
          });
          if (words.length > 0) return words.slice(0, 3).join(' ');
          const fallback = (rawKey || '').replace(/_/g, ' ').trim().toLowerCase();
          return fallback || (description || '').trim().toLowerCase();
        };

        // Historical categorized merchant stems
        const histRows = db.prepare(`
          SELECT merchant_key, description, category, COUNT(*) as cnt
          FROM transactions
          WHERE category != 'Uncategorized' AND ${sourceCondition}
          GROUP BY merchant_key, category
          ORDER BY cnt DESC
        `).all();
        const historicalCategories = new Map();
        for (const hr of histRows) {
          if (hr.merchant_key && !historicalCategories.has(hr.merchant_key)) {
            historicalCategories.set(hr.merchant_key, hr.category);
          }
          const stem = normalizeStem(hr.merchant_key, hr.description);
          if (stem && !historicalCategories.has(stem)) {
            historicalCategories.set(stem, hr.category);
          }
        }

        const heuristicCategory = (text, netSum) => {
          const padded = ` ${text.toLowerCase()} `;
          const hasAny = (kws) => kws.some(kw => padded.includes(kw.includes(' ') ? kw : ` ${kw} `) || padded.includes(kw));
          if (validCategories.has('Transfers') && hasAny([
            'wire', 'xfer', 'transfer', 'zelle', 'venmo', 'cash app', 'robinhood',
            'coinbase', 'fidelity', 'vanguard', 'schwab', 'autopay', 'credit card pmt',
            'online pmt', 'bill pay', 'payment thank you', 'online transfer', 'check'
          ])) return 'Transfers';
          if (netSum > 0 && validCategories.has('Income') && hasAny([
            'payroll', 'direct dep', 'salary', 'dividend', 'interest', 'tax refund',
            'irs treas', 'paycheck', 'deposit'
          ])) return 'Income';

          const table = [
            ['Groceries', ['publix', 'kroger', 'whole foods', 'trader joe', 'aldi', 'costco', 'sams club', 'safeway', 'wegmans', 'sprouts', 'instacart', 'food lion', 'piggly wiggly', 'supermarket', 'grocery', 'market']],
            ['Restaurants & Coffee', ['starbucks', 'dunkin', 'mcdonald', 'chick fil a', 'chipotle', 'panera', 'wendys', 'taco bell', 'burger king', 'subway', 'dominos', 'pizza', 'cafe', 'coffee', 'bakery', 'grill', 'kitchen', 'bistro', 'tavern', 'restaurant', 'doordash', 'ubereats', 'grubhub', 'waffle house', 'sweetgreen', 'cava', 'shake shack', 'popeyes', 'zaxby', 'bojangles']],
            ['Transportation', ['chevron', 'shell', 'exxon', 'mobil', 'racetrac', 'quiktrip', 'wawa', 'sheetz', 'speedway', 'marathon', 'valero', 'citgo', 'circle k', 'sunoco', 'uber', 'lyft', 'parking', 'parkmobile', 'peach pass', 'sunpass', 'ezpass', 'toll', 'marta', 'delta', 'united', 'southwest', 'autozone', 'jiffy lube', 'discount tire']],
            ['Utilities', ['georgia power', 'duke energy', 'fpl', 'comcast', 'xfinity', 'att', 'verizon', 't mobile', 'tmobile', 'spectrum', 'cox', 'google fiber', 'electric', 'gas south', 'scana', 'sanitation', 'utility', 'water']],
            ['Subscriptions', ['netflix', 'spotify', 'hulu', 'disney', 'icloud', 'youtube', 'openai', 'chatgpt', 'claude', 'anthropic', 'github', 'cursor', 'adobe', 'microsoft', 'dropbox', 'nytimes', 'patreon', 'substack', 'xero', 'quickbooks', 'audible', 'kindle']],
            ['Shopping', ['amazon', 'amzn', 'target', 'walmart', 'home depot', 'lowes', 'ikea', 'best buy', 'etsy', 'ebay', 'wayfair', 'tj maxx', 'marshalls', 'ross', 'nordstrom', 'macys', 'kohls', 'old navy', 'nike', 'lululemon', 'chewy', 'petco', 'petsmart', 'ups store', 'fedex', 'usps']],
            ['Health', ['cvs', 'walgreens', 'rite aid', 'pharmacy', 'medical', 'dental', 'dentist', 'doctor', 'clinic', 'hospital', 'urgent care', 'quest diag', 'labcorp', 'optometry', 'vision', 'therapy', 'fitness', 'peloton', 'ymca']],
            ['Entertainment', ['amc', 'regal', 'cinemark', 'cinema', 'movie', 'ticketmaster', 'stubhub', 'seatgeek', 'steam', 'playstation', 'xbox', 'nintendo', 'golf', 'bowling', 'museum', 'zoo', 'aquarium']],
            ['Insurance', ['geico', 'state farm', 'progressive', 'allstate', 'usaa', 'liberty mutual', 'farmers', 'insurance']],
            ['Housing', ['mortgage', 'rent', 'hoa', 'property mgmt', 'apartments']],
            ['Taxes', ['internal revenue', 'dept of rev', 'property tax', 'county tax']],
            ['Fees & Interest', ['overdraft', 'late charge', 'interest charge', 'service charge', 'wire fee', 'atm fee', 'annual fee', 'maintenance fee']],
          ];
          for (const [cat, kws] of table) {
            if (validCategories.has(cat) && hasAny(kws)) return cat;
          }
          return null;
        };

        const byKey = new Map();
        for (const r of txns) {
          const t = {
            id: r.id,
            accountId: r.account_id,
            date: r.date,
            description: r.description,
            amount: r.amount,
            rawCategory: r.raw_category,
            category: r.category,
            source: r.source,
            merchantKey: r.merchant_key,
            userOverridden: Boolean(r.user_overridden),
            dedupKey: r.dedup_key,
            importBatchId: r.import_batch_id,
            recurrence: r.recurrence || 'none',
            recurrenceOverride: r.recurrence_override,
            isBusiness: Boolean(r.is_business),
            taxCategory: r.tax_category,
            deductionStatus: r.deduction_status,
            isPending: Boolean(r.is_pending)
          };
          const stem = normalizeStem(r.merchant_key, r.description);
          if (!byKey.has(stem)) byKey.set(stem, []);
          byKey.get(stem).push(t);
        }

        const cards = [];
        for (const [merchantKey, list] of byKey.entries()) {
          list.sort((a, b) => b.date.localeCompare(a.date));
          const totalAbs = list.reduce((sum, t) => sum + Math.abs(t.amount), 0);
          const netSum = list.reduce((sum, t) => sum + t.amount, 0);

          let suggestedCategory = null;
          // 1. Rules
          for (const rule of rules) {
            const pat = rule.pattern.toLowerCase();
            if (merchantKey.toLowerCase().includes(pat) || list.some(t => t.description.toLowerCase().includes(pat))) {
              if (validCategories.has(rule.category)) {
                suggestedCategory = rule.category;
                break;
              }
            }
          }
          // 2. Historical categorized transactions
          if (!suggestedCategory) {
            const hist = historicalCategories.get(merchantKey) || list.map(t => historicalCategories.get(t.merchantKey)).find(Boolean);
            if (hist && validCategories.has(hist)) {
              suggestedCategory = hist;
            }
          }
          // 3. Heuristics
          if (!suggestedCategory) {
            const combined = `${merchantKey} ${list[0]?.description || ''}`;
            suggestedCategory = heuristicCategory(combined, netSum);
          }

          cards.push({
            merchantKey,
            txns: list,
            totalAbs,
            sampleTxns: list.slice(0, 10),
            recurrence: null,
            suggestedCategory,
            amountSign: netSum >= 0 ? 'income' : 'spend'
          });
        }
        cards.sort((a, b) => b.totalAbs - a.totalAbs);
        return cards;
      }

      // --- Transaction Mutations ---
      case 'add_transaction': {
        const item = args.item;
        const info = db.prepare('INSERT INTO transactions (account_id, date, description, amount, raw_category, category, source, merchant_key, user_overridden, dedup_key, import_batch_id, recurrence, recurrence_override, is_business, tax_category, deduction_status, is_pending) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          item.accountId, item.date, item.description, item.amount, item.rawCategory || null, item.category, item.source, item.merchantKey, item.userOverridden ? 1 : 0, item.dedupKey, item.importBatchId || null, item.recurrence || 'none', item.recurrenceOverride || null, item.isBusiness ? 1 : 0, item.taxCategory || null, item.deductionStatus || null, item.isPending ? 1 : 0
        );
        return Number(info.lastInsertRowid);
      }

      case 'bulk_add_transactions': {
        const items = args.transactions || args.items || [];
        const stmt = db.prepare('INSERT INTO transactions (account_id, date, description, amount, raw_category, category, source, merchant_key, user_overridden, dedup_key, import_batch_id, recurrence, recurrence_override, is_business, tax_category, deduction_status, is_pending) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(dedup_key) DO NOTHING');
        let added = 0;
        for (const item of items) {
          const res = stmt.run(
            item.accountId, item.date, item.description, item.amount, item.rawCategory || null, item.category, item.source, item.merchantKey, item.userOverridden ? 1 : 0, item.dedupKey, item.importBatchId || null, item.recurrence || 'none', item.recurrenceOverride || null, item.isBusiness ? 1 : 0, item.taxCategory || null, item.deductionStatus || null, item.isPending ? 1 : 0
          );
          if (res.changes > 0) added++;
        }
        return added;
      }

      case 'update_transaction': {
        const { id, updates } = args;
        db.prepare('UPDATE transactions SET account_id = ?, date = ?, description = ?, amount = ?, raw_category = ?, category = ?, source = ?, merchant_key = ?, user_overridden = ?, dedup_key = ?, import_batch_id = ?, recurrence = ?, recurrence_override = ?, is_business = ?, tax_category = ?, deduction_status = ?, is_pending = ? WHERE id = ?').run(
          updates.accountId, updates.date, updates.description, updates.amount, updates.rawCategory || null, updates.category, updates.source, updates.merchantKey, updates.userOverridden ? 1 : 0, updates.dedupKey, updates.importBatchId || null, updates.recurrence || 'none', updates.recurrenceOverride || null, updates.isBusiness ? 1 : 0, updates.taxCategory || null, updates.deductionStatus || null, updates.isPending ? 1 : 0, id
        );
        return null;
      }

      case 'bulk_update_transactions': {
        const items = args.transactions || args.items || [];
        const stmt = db.prepare('UPDATE transactions SET account_id = ?, date = ?, description = ?, amount = ?, raw_category = ?, category = ?, source = ?, merchant_key = ?, user_overridden = ?, dedup_key = ?, import_batch_id = ?, recurrence = ?, recurrence_override = ?, is_business = ?, tax_category = ?, deduction_status = ?, is_pending = ? WHERE id = ?');
        for (const updates of items) {
          stmt.run(
            updates.accountId, updates.date, updates.description, updates.amount, updates.rawCategory || null, updates.category, updates.source, updates.merchantKey, updates.userOverridden ? 1 : 0, updates.dedupKey, updates.importBatchId || null, updates.recurrence || 'none', updates.recurrenceOverride || null, updates.isBusiness ? 1 : 0, updates.taxCategory || null, updates.deductionStatus || null, updates.isPending ? 1 : 0, updates.id
          );
        }
        return null;
      }

      case 'delete_transaction': {
        db.prepare('DELETE FROM transactions WHERE id = ?').run(args.id);
        return null;
      }

      case 'clear_transactions': {
        db.prepare('DELETE FROM transactions').run();
        return null;
      }

      // --- Scenarios API ---
      case 'get_scenarios': {
        db.exec(`CREATE TABLE IF NOT EXISTS scenarios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          starting_balance REAL DEFAULT 0,
          base_income REAL DEFAULT 0,
          tax_rate REAL DEFAULT 0,
          recurring_budget REAL DEFAULT 0,
          variable_budget REAL DEFAULT 0,
          savings_budget REAL DEFAULT 0,
          investment_growth_rate REAL DEFAULT 7.0,
          extra_loan_payment REAL DEFAULT 0,
          divert_extra_to_savings BOOLEAN DEFAULT 0,
          loan_strategy TEXT,
          goals TEXT,
          destinations TEXT,
          income_streams TEXT,
          include_home_equity BOOLEAN DEFAULT 1,
          home_property_value REAL,
          home_appreciation_rate REAL
        )`);
        try { db.exec(`ALTER TABLE scenarios ADD COLUMN destinations TEXT`); } catch (_) {}
        try { db.exec(`ALTER TABLE scenarios ADD COLUMN income_streams TEXT`); } catch (_) {}
        try { db.exec(`ALTER TABLE scenarios ADD COLUMN include_home_equity BOOLEAN DEFAULT 1`); } catch (_) {}
        try { db.exec(`ALTER TABLE scenarios ADD COLUMN home_property_value REAL`); } catch (_) {}
        try { db.exec(`ALTER TABLE scenarios ADD COLUMN home_appreciation_rate REAL`); } catch (_) {}

        const rows = db.prepare('SELECT * FROM scenarios').all();
        return rows.map(r => ({
          id: r.id,
          name: r.name,
          startingBalance: r.starting_balance,
          baseIncome: r.base_income,
          taxRate: r.tax_rate,
          recurringBudget: r.recurring_budget,
          variableBudget: r.variable_budget,
          savingsBudget: r.savings_budget,
          investmentGrowthRate: r.investment_growth_rate,
          extraLoanPayment: r.extra_loan_payment,
          divertExtraToSavings: Boolean(r.divert_extra_to_savings),
          loanStrategy: r.loan_strategy,
          goals: r.goals ? JSON.parse(r.goals) : [],
          destinations: r.destinations ? JSON.parse(r.destinations) : [],
          incomeStreams: r.income_streams ? JSON.parse(r.income_streams) : [],
          includeHomeEquity: r.include_home_equity !== null && r.include_home_equity !== undefined ? Boolean(r.include_home_equity) : true,
          homePropertyValue: r.home_property_value ?? undefined,
          homeAppreciationRate: r.home_appreciation_rate ?? undefined,
        }));
      }

      case 'create_scenario': {
        const s = args.scenario || {};
        const info = db.prepare(`INSERT INTO scenarios (name, starting_balance, base_income, tax_rate, recurring_budget, variable_budget, savings_budget, investment_growth_rate, extra_loan_payment, divert_extra_to_savings, loan_strategy, goals, destinations, income_streams, include_home_equity, home_property_value, home_appreciation_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          s.name,
          s.startingBalance || 0,
          s.baseIncome || 0,
          s.taxRate || 0,
          s.recurringBudget || 0,
          s.variableBudget || 0,
          s.savingsBudget || 0,
          s.investmentGrowthRate || 7,
          s.extraLoanPayment || 0,
          s.divertExtraToSavings ? 1 : 0,
          s.loanStrategy || null,
          JSON.stringify(s.goals || []),
          JSON.stringify(s.destinations || []),
          JSON.stringify(s.incomeStreams || []),
          s.includeHomeEquity !== undefined ? (s.includeHomeEquity ? 1 : 0) : 1,
          s.homePropertyValue !== undefined ? s.homePropertyValue : null,
          s.homeAppreciationRate !== undefined ? s.homeAppreciationRate : null
        );
        return info.lastInsertRowid;
      }

      case 'update_scenario': {
        const s = args.scenario || {};
        db.prepare(`UPDATE scenarios SET name=?, starting_balance=?, base_income=?, tax_rate=?, recurring_budget=?, variable_budget=?, savings_budget=?, investment_growth_rate=?, extra_loan_payment=?, divert_extra_to_savings=?, loan_strategy=?, goals=?, destinations=?, income_streams=?, include_home_equity=?, home_property_value=?, home_appreciation_rate=? WHERE id=?`).run(
          s.name,
          s.startingBalance || 0,
          s.baseIncome || 0,
          s.taxRate || 0,
          s.recurringBudget || 0,
          s.variableBudget || 0,
          s.savingsBudget || 0,
          s.investmentGrowthRate || 7,
          s.extraLoanPayment || 0,
          s.divertExtraToSavings ? 1 : 0,
          s.loanStrategy || null,
          JSON.stringify(s.goals || []),
          JSON.stringify(s.destinations || []),
          JSON.stringify(s.incomeStreams || []),
          s.includeHomeEquity !== undefined ? (s.includeHomeEquity ? 1 : 0) : 1,
          s.homePropertyValue !== undefined ? s.homePropertyValue : null,
          s.homeAppreciationRate !== undefined ? s.homeAppreciationRate : null,
          s.id
        );
        return null;
      }

      case 'delete_scenario': {
        db.prepare(`DELETE FROM scenarios WHERE id=?`).run(args.id);
        return null;
      }

      // --- Loans API ---
      case 'get_loans': {
        db.exec(`CREATE TABLE IF NOT EXISTS loans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          principal REAL NOT NULL,
          rate REAL NOT NULL,
          term_years REAL NOT NULL,
          start_date TEXT NOT NULL,
          category TEXT NOT NULL,
          merchant TEXT,
          monthly_payment REAL,
          property_value REAL,
          down_payment REAL,
          extra_monthly_payment REAL,
          extra_one_time_payment REAL,
          extra_one_time_month INTEGER,
          created_at TEXT DEFAULT (datetime('now')),
          enabled BOOLEAN DEFAULT 1
        )`);
        const rows = db.prepare('SELECT * FROM loans').all();
        return rows.map(r => ({
          id: r.id,
          name: r.name,
          type: r.type,
          principal: r.principal,
          rate: r.rate,
          termYears: r.term_years,
          startDate: r.start_date,
          category: r.category,
          merchant: r.merchant,
          monthlyPayment: r.monthly_payment,
          propertyValue: r.property_value,
          downPayment: r.down_payment,
          extraMonthlyPayment: r.extra_monthly_payment,
          extraOneTimePayment: r.extra_one_time_payment,
          extraOneTimeMonth: r.extra_one_time_month,
          createdAt: r.created_at,
          enabled: Boolean(r.enabled)
        }));
      }

      case 'add_loan':
      case 'put_loan': {
        const l = args.item || {};
        const info = db.prepare(`INSERT INTO loans (name, type, principal, rate, term_years, start_date, category, merchant, monthly_payment, property_value, down_payment, extra_monthly_payment, extra_one_time_payment, extra_one_time_month, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          l.name, l.type, l.principal, l.rate, l.termYears, l.startDate, l.category, l.merchant || null, l.monthlyPayment || null, l.propertyValue || null, l.downPayment || null, l.extraMonthlyPayment || null, l.extraOneTimePayment || null, l.extraOneTimeMonth || null, l.enabled !== false ? 1 : 0
        );
        return info.lastInsertRowid;
      }

      case 'update_loan': {
        const l = args.updates || {};
        db.prepare(`UPDATE loans SET name=?, type=?, principal=?, rate=?, term_years=?, start_date=?, category=?, merchant=?, monthly_payment=?, property_value=?, down_payment=?, extra_monthly_payment=?, extra_one_time_payment=?, extra_one_time_month=?, enabled=? WHERE id=?`).run(
          l.name, l.type, l.principal, l.rate, l.termYears, l.startDate, l.category, l.merchant || null, l.monthlyPayment || null, l.propertyValue || null, l.downPayment || null, l.extraMonthlyPayment || null, l.extraOneTimePayment || null, l.extraOneTimeMonth || null, l.enabled !== false ? 1 : 0, args.id
        );
        return null;
      }

      case 'delete_loan': {
        db.prepare(`DELETE FROM loans WHERE id=?`).run(args.id);
        return null;
      }

      // --- Forecast / Projection API ---
      case 'calculate_projection': {
        const p = args.params || {};
        const months = p.months || 24;
        let balance = p.starting_balance || 0;
        
        const rawDestinations = Array.isArray(p.destinations) ? p.destinations : [];
        const hasDestinations = rawDestinations.length > 0;
        const simulatedDestinations = rawDestinations.map(d => ({
          name: d.name,
          balance: Number(d.starting_balance || 0),
          allocation: Number(d.monthly_allocation || 0),
          annualGrowthRate: Number(d.annual_growth_rate || 0),
          enabled: d.enabled !== false,
        }));

        let invested = hasDestinations
          ? simulatedDestinations.filter(d => d.enabled).reduce((sum, d) => sum + d.balance, 0)
          : (p.starting_investment_balance || 0);

        // Fetch loans from DB for dev mode projection
        const dbLoans = db.prepare('SELECT id, name, type, principal, rate, monthly_payment, property_value, category, merchant, enabled FROM loans').all()
          .filter(l => l.enabled !== 0 && l.enabled !== false)
          .map(l => ({
            ...l,
            principal: Number(l.principal || 0),
            rate: Number(l.rate || 0),
            monthly_payment: Number(l.monthly_payment || 0),
            property_value: Number(l.property_value || 0),
          }));

        // Link with actual accounts if balance exists (e.g., Rocket Mortgage)
        const accounts = db.prepare('SELECT id, name, type, current_balance FROM accounts').all();
        for (const loan of dbLoans) {
          const matchingAcc = accounts.find(a =>
            a.name === loan.name ||
            (loan.merchant && a.name.toLowerCase().includes(loan.merchant.toLowerCase())) ||
            (loan.type === 'house' && a.type === 'mortgage')
          );
          if (matchingAcc && matchingAcc.current_balance != null) {
            loan.principal = Math.abs(matchingAcc.current_balance);
          }
        }

        const houseLoan = dbLoans.find(l => l.type === 'house' || /housing|mortgage/i.test(l.category || ''));
        const basePropertyValue = p.home_property_value !== undefined
          ? Number(p.home_property_value)
          : (houseLoan?.property_value || 500000);
        const appreciationRate = Number(p.home_appreciation_rate || 0);
        const includeHomeEquity = p.include_home_equity !== false;

        const points = [];
        const now = new Date();
        let cumulativeRemainder = 0;
        const gapSet = new Set(Array.isArray(p.income_gaps) ? p.income_gaps : []);
        const windfalls = Array.isArray(p.windfalls) ? p.windfalls : [];
        const goals = Array.isArray(p.goals) ? p.goals : [];
        const goalBalances = new Map();

        for (let i = 0; i < months; i++) {
          const monthIdx1 = i + 1;
          const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
          const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
          let income = gapSet.has(monthIdx1) ? 0 : (p.base_income || 0);
          for (const w of windfalls) {
            if (Number(w.month_index) === monthIdx1) {
              income += Number(w.amount || 0);
            }
          }
          const recurring = p.recurring_budget || 0;
          const variable = p.variable_budget || 0;

          let monthGoalContributions = 0;
          const achievedGoals = [];
          for (const g of goals) {
            const bal = goalBalances.get(g.name) || 0;
            const targetAmt = Number(g.target_amount || 0);
            const monthlyContrib = Number(g.monthly_contribution || 0);
            if (bal < targetAmt && monthlyContrib > 0) {
              const contrib = Math.min(monthlyContrib, targetAmt - bal);
              const nextBal = bal + contrib;
              goalBalances.set(g.name, nextBal);
              monthGoalContributions += contrib;
              if (nextBal >= targetAmt) achievedGoals.push(g.name);
            }
          }

          // Destinations
          let monthDestBalances = [];
          let savingsSpend = 0;
          if (hasDestinations) {
            for (const dest of simulatedDestinations) {
              if (dest.enabled) {
                const monthlyRate = (dest.annualGrowthRate / 100) / 12;
                dest.balance = dest.balance * (1 + monthlyRate) + dest.allocation;
                savingsSpend += dest.allocation;
              }
              monthDestBalances.push({ name: dest.name, balance: dest.balance });
            }
            invested = monthDestBalances.reduce((s, x) => s + x.balance, 0);
          } else {
            savingsSpend = p.savings_budget || 0;
            const monthlyRate = ((p.investment_growth_rate || 7) / 100) / 12;
            invested = (invested + savingsSpend) * (1 + monthlyRate);
          }

          // Loans calculation (minimum payments are already inside recurring_budget; only deduct extra payments from remainder)
          let monthLoanPayments = 0;
          let monthTotalDebt = 0;
          let monthMortgageDebt = 0;
          const monthLoans = [];
          for (const loan of dbLoans) {
            const isHouseLoan = loan.type === 'house' || /housing|mortgage/i.test(loan.category || '');
            if (loan.principal <= 0) {
              monthLoans.push({ id: loan.id, name: loan.name, balance: 0 });
              continue;
            }
            const monthlyRate = (loan.rate / 100) / 12;
            const interest = loan.principal * monthlyRate;
            const basePayment = loan.monthly_payment > 0 ? loan.monthly_payment : (loan.principal * 0.02 + interest);
            const extraPayment = (p.global_extra_loan_payment && dbLoans.length > 0)
              ? (p.global_extra_loan_payment / dbLoans.length)
              : 0;
            const totalPayment = basePayment + extraPayment;
            const principalPayment = Math.min(loan.principal, Math.max(0, totalPayment - interest));
            loan.principal = Math.max(0, loan.principal - principalPayment);
            // Only extra loan payments reduce cashflow remainder beyond recurring_budget
            monthLoanPayments += Math.min(extraPayment, principalPayment);
            monthTotalDebt += loan.principal;
            if (isHouseLoan) {
              monthMortgageDebt += loan.principal;
            }
            monthLoans.push({ id: loan.id, name: loan.name, balance: loan.principal });
          }

          // Home equity calculation
          const monthlyAppreciation = (appreciationRate / 100) / 12;
          const currentPropertyValue = Math.round(basePropertyValue * Math.pow(1 + monthlyAppreciation, i + 1));
          const homeEquity = Math.max(0, currentPropertyValue - monthMortgageDebt);
          const nonMortgageDebt = Math.max(0, monthTotalDebt - monthMortgageDebt);
          const netWorth = Math.round(includeHomeEquity
            ? (balance + invested + homeEquity - nonMortgageDebt)
            : (balance + invested - monthTotalDebt));
          const liquidNetWorth = Math.round(balance + invested - monthTotalDebt);

          const netCashflow = income - (recurring + variable + savingsSpend + monthLoanPayments + monthGoalContributions);
          balance += netCashflow;
          cumulativeRemainder += netCashflow;

          points.push({
            month_index: monthIdx1,
            month_label: label,
            starting_balance: balance - netCashflow,
            income: income,
            recurring_spend: recurring,
            variable_spend: variable,
            savings_spend: savingsSpend,
            loan_payments: monthLoanPayments,
            total_debt: monthTotalDebt,
            loans: monthLoans,
            goal_contributions: monthGoalContributions,
            achieved_goals: achievedGoals,
            remainder: netCashflow,
            cumulative_remainder: cumulativeRemainder,
            ending_balance: balance,
            investment_balance: invested,
            destination_balances: monthDestBalances,
            home_equity: Math.round(homeEquity),
            property_value: Math.round(currentPropertyValue),
            mortgage_debt: Math.round(monthMortgageDebt),
            net_worth: netWorth,
            liquid_net_worth: liquidNetWorth,
          });
        }
        return points;
      }

      // --- SimpleFIN API ---
      case 'simplefin_get_config': {
        const row = db.prepare("SELECT value FROM settings WHERE key = 'simplefin_config'").get();
        if (!row?.value) {
          return { accessUrl: '', claimedAt: null, lastSyncedAt: null };
        }
        const parsed = JSON.parse(row.value);
        return {
          accessUrl: parsed.access_url || parsed.accessUrl || '',
          claimedAt: parsed.claimed_at || parsed.claimedAt || null,
          lastSyncedAt: parsed.last_synced_at || parsed.lastSyncedAt || null
        };
      }

      case 'simplefin_save_config': {
        const cfg = args.config;
        const val = JSON.stringify({
          access_url: cfg.accessUrl,
          claimed_at: cfg.claimedAt,
          last_synced_at: cfg.lastSyncedAt
        });
        db.prepare("INSERT INTO settings (key, value) VALUES ('simplefin_config', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(val);
        return null;
      }

      case 'simplefin_get_accounts': {
        const row = db.prepare("SELECT value FROM settings WHERE key = 'simplefin_config'").get();
        if (row && row.value) {
          try {
            const parsed = JSON.parse(row.value);
            const accessUrl = parsed.access_url || parsed.accessUrl;
            if (accessUrl) {
              const u = new URL(accessUrl);
              const username = decodeURIComponent(u.username);
              const password = decodeURIComponent(u.password);
              const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
              const fetchUrl = `${u.origin}${u.pathname}/accounts?version=2&pending=1`;

              const res = await fetch(fetchUrl, {
                headers: {
                  'Authorization': authHeader,
                  'User-Agent': 'StrictlySpending/1.0'
                }
              });

              if (res.ok) {
                const sfinData = await res.json();
                const orgMap = {};
                for (const c of (sfinData.connections || [])) {
                  const cid = c.conn_id || c.id;
                  if (cid) orgMap[cid] = c.org_name || c.name || 'Bank';
                }

                for (const acc of (sfinData.accounts || [])) {
                  const org = acc.org_name || (acc.conn_id && orgMap[acc.conn_id]) || acc.org?.name || 'Bank';
                  const bal = acc.balance ? parseFloat(acc.balance) : 0;
                  db.prepare(`
                    INSERT INTO simplefin_accounts (account_id, org_name, name, currency, balance, strictly_account_id)
                    VALUES (?, ?, ?, ?, ?, NULL)
                    ON CONFLICT(account_id) DO UPDATE SET
                      org_name = COALESCE(excluded.org_name, simplefin_accounts.org_name),
                      name = excluded.name,
                      currency = excluded.currency,
                      balance = excluded.balance
                  `).run(acc.id, org, acc.name, acc.currency || 'USD', bal);
                }
              }
            }
          } catch (e) {
            console.warn('[simplefin_get_accounts] live fetch error:', e.message);
          }
        }

        const rows = db.prepare('SELECT id, account_id, org_name, name, currency, balance, strictly_account_id FROM simplefin_accounts ORDER BY name ASC').all();
        return rows.map(r => ({
          id: r.id,
          accountId: r.account_id,
          orgName: r.org_name,
          name: r.name,
          currency: r.currency,
          balance: r.balance,
          strictlyAccountId: r.strictly_account_id
        }));
      }

      case 'simplefin_map_account': {
        const { accountId, strictlyAccountId } = args;
        db.prepare('UPDATE simplefin_accounts SET strictly_account_id = ? WHERE account_id = ?').run(
          strictlyAccountId, accountId
        );
        return null;
      }

      case 'simplefin_sync_transactions': {
        const row = db.prepare("SELECT value FROM settings WHERE key = 'simplefin_config'").get();
        if (!row || !row.value) {
          throw new Error('SimpleFIN is not configured');
        }
        const parsed = JSON.parse(row.value);
        const accessUrl = parsed.access_url || parsed.accessUrl;
        if (!accessUrl) {
          throw new Error('SimpleFIN access URL missing');
        }

        const u = new URL(accessUrl);
        const username = decodeURIComponent(u.username);
        const password = decodeURIComponent(u.password);
        const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
        const fetchUrl = `${u.origin}${u.pathname}/accounts?version=2&pending=1&start-date=0`;

        const res = await fetch(fetchUrl, {
          headers: {
            'Authorization': authHeader,
            'User-Agent': 'StrictlySpending/1.0'
          }
        });

        if (!res.ok) {
          throw new Error(`SimpleFIN API error: ${res.status}`);
        }

        const sfinData = await res.json();
        const warnings = [];
        for (const err of (sfinData.errlist || [])) {
          warnings.push(`${err.code}: ${err.msg}`);
        }

        const accountMappings = db.prepare('SELECT account_id, strictly_account_id FROM simplefin_accounts WHERE strictly_account_id IS NOT NULL').all();
        const accountMap = {};
        for (const am of accountMappings) {
          accountMap[am.account_id] = am.strictly_account_id;
        }

        const rules = db.prepare('SELECT pattern, category FROM rules ORDER BY priority DESC').all().map(r => ({
          pattern: r.pattern.toLowerCase(),
          category: r.category
        }));

        let addedCount = 0;
        let accountsSynced = 0;

        // Load existing transactions by account for semantic dedup and pending->settled transition
        const existingTxns = db.prepare('SELECT id, account_id, date, CAST(ROUND(amount * 100) AS INTEGER) as amt_cents, description as desc_raw, LOWER(TRIM(description)) as desc_norm, category, user_overridden, dedup_key, COALESCE(is_pending, 0) as is_pending FROM transactions').all();
        const existingByAccount = new Map();
        for (const r of existingTxns) {
          if (!existingByAccount.has(r.account_id)) existingByAccount.set(r.account_id, []);
          existingByAccount.get(r.account_id).push({
            id: r.id,
            date: r.date,
            amountCents: r.amt_cents,
            descRaw: r.desc_raw,
            descNorm: r.desc_norm,
            category: r.category,
            userOverridden: Boolean(r.user_overridden),
            dedupKey: r.dedup_key,
            isPending: Boolean(r.is_pending),
            claimed: false
          });
        }

        const insertTxnStmt = db.prepare(`
          INSERT OR IGNORE INTO transactions (
            account_id, date, description, amount, raw_category, category, source,
            merchant_key, user_overridden, dedup_key, recurrence, is_business, is_pending
          ) VALUES (?, ?, ?, ?, ?, ?, 'simplefin', ?, 0, ?, 'onetime', 0, ?)
        `);

        function sfinDescriptionsMatch(descA, descB) {
          const normA = (descA || '').toLowerCase().trim();
          const normB = (descB || '').toLowerCase().trim();
          if (normA === normB) return true;
          if (normA.includes(normB) || normB.includes(normA)) return true;
          if ((normA.includes('qt') || normA.includes('quiktrip')) && (normB.includes('qt') || normB.includes('quiktrip'))) return true;
          const STOP_WORDS = new Set(['des', 'indn', 'purchase', 'mobile', 'web', 'ppd', 'the', 'and', 'for', 'crd', 'confirmation', 'payment', 'transfer', 'id', 'inc', 'llc', 'com', 'store']);
          const wordsA = normA.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
          const wordsB = normB.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
          return wordsA.some(w => wordsB.includes(w));
        }

        function isGenericSettledDescription(descNorm) {
          const d = (descNorm || '').trim().toLowerCase();
          return [
            'return', 'debit card return', 'online transfer', 'truist online transfer',
            'online from truist recurring', 'truist online recurring', 'transfer',
            'mail telephone order', 'point of sale debit', 'pos debit', 'checkcard', 'purchase'
          ].includes(d);
        }

        function isPendingToSettledMatch(pendingDate, pendingCents, pendingDesc, settledDate, settledCents, settledDesc, settledRawDesc) {
          const daysDiff = Math.round((new Date(settledDate).getTime() - new Date(pendingDate).getTime()) / 86400000);
          if (isNaN(daysDiff) || daysDiff < -1 || daysDiff > 5) return false;
          if ((pendingCents < 0) !== (settledCents < 0)) return false;

          const descMatches = sfinDescriptionsMatch(pendingDesc, settledDesc) || sfinDescriptionsMatch(pendingDesc, settledRawDesc);
          if (descMatches) {
            if (pendingCents === settledCents) return true;
            if (pendingCents < 0 && settledCents < 0) {
              const pAbs = Math.abs(pendingCents);
              const sAbs = Math.abs(settledCents);
              const diff = sAbs - pAbs;
              if (diff > 0 && diff <= Math.max(5000, pAbs)) return true;
              if (pAbs <= 200 && sAbs > pAbs) return true;
            }
          } else if (daysDiff >= 0 && daysDiff <= 4 && pendingCents === settledCents) {
            return true;
          }
          return false;
        }

        // Deduplicate primary accounts by strictlyAccountId
        const primaryAccounts = new Map();
        for (const acc of (sfinData.accounts || [])) {
          const bal = acc.balance !== undefined && acc.balance !== null ? parseFloat(acc.balance) : null;
          const avail = acc.available_balance !== undefined && acc.available_balance !== null ? parseFloat(acc.available_balance) : null;
          db.prepare('UPDATE simplefin_accounts SET balance = COALESCE(?, balance), available_balance = COALESCE(?, available_balance), balance_date = COALESCE(?, balance_date) WHERE account_id = ?')
            .run(isNaN(bal) ? null : bal, isNaN(avail) ? null : avail, acc.balance_date ?? null, acc.id);

          const strictlyId = accountMap[acc.id];
          if (!strictlyId) {
            warnings.push(`Account '${acc.name}' is not mapped to Strictly Spending. Skipped.`);
            continue;
          }
          const existing = primaryAccounts.get(strictlyId);
          if (!existing || (acc.transactions || []).length > (existing.transactions || []).length) {
            primaryAccounts.set(strictlyId, acc);
          }
        }

        for (const [strictlyId, acc] of primaryAccounts.entries()) {
          accountsSynced++;
          if (acc.balance !== undefined && acc.balance !== null) {
            const b = parseFloat(acc.balance);
            if (!isNaN(b)) {
              db.prepare('UPDATE accounts SET current_balance = ? WHERE id = ?').run(b, strictlyId);
            }
          }

          const liveSfinKeys = new Set();
          const incomingByBucket = new Map();
          let minLiveDate = null;

          for (const t of (acc.transactions || [])) {
            const sfinKey = `simplefin_${t.id}`;
            liveSfinKeys.add(sfinKey);
            const amt = parseFloat(t.amount);
            if (!isNaN(amt)) {
              const epoch = (t.posted && t.posted > 0) ? t.posted : (t.transacted_at || Math.floor(Date.now() / 1000));
              const d = new Date(epoch * 1000).toISOString().slice(0, 10);
              if (!minLiveDate || d < minLiveDate) minLiveDate = d;
              const cents = Math.round(amt * 100);
              const bKey = `${d}|${cents}`;
              if (!incomingByBucket.has(bKey)) incomingByBucket.set(bKey, new Set());
              incomingByBucket.get(bKey).add(sfinKey);
            }
          }

          const transitionMinDate = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);

          if (!existingByAccount.has(strictlyId)) existingByAccount.set(strictlyId, []);
          const accountCandidates = existingByAccount.get(strictlyId);

          for (const t of (acc.transactions || [])) {
            const epoch = (t.posted && t.posted > 0) ? t.posted : (t.transacted_at || Math.floor(Date.now() / 1000));
            const date = new Date(epoch * 1000).toISOString().slice(0, 10);
            const tIsPending = Boolean(t.pending) || !(t.posted && t.posted > 0);
            const amt = parseFloat(t.amount);
            if (isNaN(amt)) continue;

            const amtCents = Math.round(amt * 100);
            const dedupKey = `simplefin_${t.id}`;
            const desc = t.payee && t.payee.trim() ? t.payee : (t.description || 'Transaction');
            const descNorm = desc.toLowerCase().trim();
            const rawDescNorm = (t.description || '').toLowerCase().trim();

            const merchantKey = desc.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const memoCat = t.memo && t.memo.trim() ? t.memo : 'Uncategorized';
            let finalCat = memoCat;
            if (finalCat === 'Uncategorized') {
              const dl = desc.toLowerCase();
              if (dl.includes('transfer') || dl.includes('txfr')) {
                finalCat = 'Transfers';
              } else {
                for (const rule of rules) {
                  if (dl.includes(rule.pattern) || merchantKey.includes(rule.pattern)) {
                    finalCat = rule.category;
                    break;
                  }
                }
              }
            }

            // Pass 1: Exact SimpleFIN ID match
            let matched = accountCandidates.find(c => !c.claimed && c.dedupKey === dedupKey);

            // Pass 2: Same (date, amountCents) fuzzy match
            if (!matched) {
              const bSet = incomingByBucket.get(`${date}|${amtCents}`);
              matched = accountCandidates.find(c =>
                !c.claimed &&
                c.date === date &&
                c.amountCents === amtCents &&
                !(bSet && bSet.has(c.dedupKey)) &&
                (sfinDescriptionsMatch(c.descNorm, descNorm) || sfinDescriptionsMatch(c.descNorm, rawDescNorm))
              );
            }

            if (matched) {
              matched.claimed = true;
              if (matched.dedupKey !== dedupKey || matched.isPending !== tIsPending) {
                db.prepare('UPDATE transactions SET dedup_key = ?, is_pending = ? WHERE id = ?')
                  .run(dedupKey, tIsPending ? 1 : 0, matched.id);
                matched.dedupKey = dedupKey;
                matched.isPending = tIsPending;
              }
              continue;
            }

            // Pass 3: Pending -> Settled Transition in place
            if (!tIsPending) {
              const pendingMatch = accountCandidates.find(c => {
                if (c.claimed || c.id === 0) return false;
                const isVanishedSfin = c.dedupKey.startsWith('simplefin_') && !liveSfinKeys.has(c.dedupKey) && c.date >= transitionMinDate;
                if (!c.isPending && !isVanishedSfin) return false;
                return isPendingToSettledMatch(c.date, c.amountCents, c.descNorm, date, amtCents, descNorm, rawDescNorm);
              });

              if (pendingMatch) {
                pendingMatch.claimed = true;
                const keepCandDesc = isGenericSettledDescription(descNorm) && !isGenericSettledDescription(pendingMatch.descNorm);
                const resolvedDesc = keepCandDesc ? pendingMatch.descRaw : desc;
                const resolvedMerchantKey = resolvedDesc.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const resolvedCat = (pendingMatch.userOverridden || (pendingMatch.category !== 'Uncategorized' && finalCat === 'Uncategorized'))
                  ? pendingMatch.category
                  : finalCat;

                db.prepare('UPDATE transactions SET date = ?, description = ?, amount = ?, merchant_key = ?, category = ?, dedup_key = ?, is_pending = 0 WHERE id = ?')
                  .run(date, resolvedDesc, amt, resolvedMerchantKey, resolvedCat, dedupKey, pendingMatch.id);

                pendingMatch.date = date;
                pendingMatch.amountCents = amtCents;
                pendingMatch.descRaw = resolvedDesc;
                pendingMatch.descNorm = resolvedDesc.toLowerCase().trim();
                pendingMatch.category = resolvedCat;
                pendingMatch.dedupKey = dedupKey;
                pendingMatch.isPending = false;
                continue;
              }
            }

            accountCandidates.push({
              id: 0,
              date,
              amountCents: amtCents,
              descRaw: desc,
              descNorm,
              category: finalCat,
              userOverridden: false,
              dedupKey,
              isPending: tIsPending,
              claimed: true
            });

            const info = insertTxnStmt.run(
              strictlyId, date, desc, amt, memoCat, finalCat, merchantKey, dedupKey, tIsPending ? 1 : 0
            );
            if (info.changes > 0) {
              addedCount++;
            }
          }

          // Pass 4: Reconcile remaining unclaimed vanished pending rows whose settled counterpart is already in DB
          const snapshot = accountCandidates.map(c => ({ ...c }));
          for (const cand of accountCandidates) {
            if (cand.claimed || cand.id === 0) continue;
            const isVanishedSfin = cand.dedupKey.startsWith('simplefin_') && !liveSfinKeys.has(cand.dedupKey) && cand.date >= transitionMinDate;
            if (!cand.isPending && !isVanishedSfin) continue;

            const matchedSettled = snapshot.find(other => {
              if (other.id === cand.id || other.id === 0 || other.isPending) return false;
              const otherIsLiveSettled = liveSfinKeys.has(other.dedupKey);
              const otherIsLaterGenericSettled = other.id > cand.id && other.date > cand.date &&
                isGenericSettledDescription(other.descNorm) && !isGenericSettledDescription(cand.descNorm);
              return (otherIsLiveSettled || otherIsLaterGenericSettled) &&
                isPendingToSettledMatch(cand.date, cand.amountCents, cand.descNorm, other.date, other.amountCents, other.descNorm, other.descNorm);
            });

            if (matchedSettled) {
              if (isGenericSettledDescription(matchedSettled.descNorm) && !isGenericSettledDescription(cand.descNorm)) {
                const resolvedDesc = cand.descRaw;
                const resolvedMerchantKey = resolvedDesc.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const resolvedCat = (cand.userOverridden || (cand.category !== 'Uncategorized' && (matchedSettled.category === 'Uncategorized' || matchedSettled.category === 'Income')))
                  ? cand.category
                  : matchedSettled.category;
                db.prepare('UPDATE transactions SET description = ?, merchant_key = ?, category = ?, is_pending = 0 WHERE id = ?')
                  .run(resolvedDesc, resolvedMerchantKey, resolvedCat, matchedSettled.id);
              }
              db.prepare('DELETE FROM transactions WHERE id = ?').run(cand.id);
              cand.claimed = true;
            } else if (cand.isPending && isVanishedSfin) {
              db.prepare('DELETE FROM transactions WHERE id = ?').run(cand.id);
              cand.claimed = true;
            }
          }
        }

        const now = new Date().toISOString();
        parsed.last_synced_at = now;
        db.prepare("INSERT INTO settings (key, value) VALUES ('simplefin_config', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(parsed));

        return {
          added: addedCount,
          accountsSynced,
          lastSyncedAt: now,
          warnings
        };
      }

      case 'clear_imports': {
        db.prepare('DELETE FROM imports').run();
        return null;
      }

      case 'build_recurrence_map': {
        const isDemo = Boolean(args.isDemo ?? args.is_demo ?? false);
        const accId = args.accountId ?? args.account_id;
        const sourceCond = isDemo ? "source = 'demo'" : "source != 'demo'";
        let sql = `SELECT id, date, amount, category, merchant_key, recurrence, recurrence_override FROM transactions WHERE ${sourceCond}`;
        const params = [];
        if (accId != null) {
          sql += ' AND account_id = ?';
          params.push(accId);
        }
        sql += ' ORDER BY date ASC';
        const txns = db.prepare(sql).all(...params);
        const overrides = db.prepare('SELECT merchant_key, recurrence FROM merchant_overrides').all();
        const overrideMap = new Map(overrides.map(o => [o.merchant_key, o.recurrence]));

        const byMerchant = new Map();
        for (const t of txns) {
          if (t.merchant_key) {
            if (!byMerchant.has(t.merchant_key)) byMerchant.set(t.merchant_key, []);
            byMerchant.get(t.merchant_key).push(t);
          }
        }

        function daysBetweenDates(a, b) {
          return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
        }

        function computePriceHike(spendTxns) {
          if (!spendTxns || spendTxns.length === 0) return {};
          const lastAmount = Math.abs(spendTxns[spendTxns.length - 1].amount);
          if (spendTxns.length < 2) return { lastAmount };
          const priorSlice = spendTxns.slice(Math.max(0, spendTxns.length - 4), spendTxns.length - 1);
          if (priorSlice.length === 0) return { lastAmount };
          const priorAmount = priorSlice.reduce((s, t) => s + Math.abs(t.amount), 0) / priorSlice.length;
          const delta = lastAmount - priorAmount;
          if (priorAmount > 1 && delta >= 1 && (delta / priorAmount) >= 0.03 && (delta / priorAmount) <= 1.5) {
            return {
              lastAmount,
              priorAmount,
              priceHikeDelta: delta,
              priceHikePct: (delta / priorAmount) * 100,
            };
          }
          return { lastAmount, priorAmount };
        }

        function detectMerchantRecurrence(spendTxns) {
          const hikeFields = computePriceHike(spendTxns);
          if (spendTxns.length < 3) {
            return {
              kind: 'none',
              count: spendTxns.length,
              meanIntervalDays: 0,
              meanAmount: 0,
              estMonthlyCost: 0,
              lastDate: spendTxns.length > 0 ? spendTxns[spendTxns.length - 1].date : null,
              source: 'auto',
              ...hikeFields,
            };
          }

          const intervals = [];
          for (let i = 1; i < spendTxns.length; i++) {
            intervals.push(daysBetweenDates(spendTxns[i - 1].date, spendTxns[i].date));
          }
          const mean = intervals.reduce((s, x) => s + x, 0) / intervals.length;
          const variance = intervals.reduce((s, x) => s + (x - mean) ** 2, 0) / intervals.length;
          const stddev = Math.sqrt(variance);

          const meanAmt = spendTxns.reduce((s, t) => s + Math.abs(t.amount), 0) / spendTxns.length;
          const amtVariance = spendTxns.reduce((s, t) => s + (Math.abs(t.amount) - meanAmt) ** 2, 0) / spendTxns.length;
          const amtStddev = Math.sqrt(amtVariance);
          const isStableAmount = amtStddev <= (meanAmt * 0.3) + 5.0;

          let kind = 'none';
          if (isStableAmount) {
            if (mean >= 25 && mean <= 35 && stddev <= 7) kind = 'monthly';
            else if (mean >= 12 && mean <= 17 && stddev <= 5) kind = 'biweekly';
            else if (mean >= 5 && mean <= 9 && stddev <= 3) kind = 'weekly';
            else if (mean >= 330 && mean <= 400 && stddev <= 40) kind = 'annual';
          }

          const recentSpend = spendTxns.slice(-3);
          const meanAmount = recentSpend.reduce((s, t) => s + Math.abs(t.amount), 0) / recentSpend.length;
          let estMonthlyCost = 0;
          if (kind === 'monthly') estMonthlyCost = meanAmount;
          else if (kind === 'biweekly') estMonthlyCost = meanAmount * (30 / 14);
          else if (kind === 'weekly') estMonthlyCost = meanAmount * (30 / 7);
          else if (kind === 'annual') estMonthlyCost = meanAmount / 12;

          return {
            kind,
            count: spendTxns.length,
            meanIntervalDays: mean,
            meanAmount,
            estMonthlyCost,
            lastDate: spendTxns[spendTxns.length - 1].date,
            source: 'auto',
            ...hikeFields,
          };
        }

        const result = {};
        for (const [merchantKey, mTxns] of byMerchant.entries()) {
          const recurringTxns = mTxns.filter(t => t.recurrence === 'recurring');
          if (recurringTxns.length === 0) continue;

          const spendTxns = mTxns.filter(t => t.amount < 0);
          let finalInfo = detectMerchantRecurrence(spendTxns);

          if (overrideMap.has(merchantKey)) {
            const ovKind = overrideMap.get(merchantKey);
            let estMonthlyCost = finalInfo.estMonthlyCost;
            if (ovKind !== finalInfo.kind && finalInfo.meanAmount > 0) {
              if (ovKind === 'monthly') estMonthlyCost = finalInfo.meanAmount;
              else if (ovKind === 'biweekly') estMonthlyCost = finalInfo.meanAmount * (30 / 14);
              else if (ovKind === 'weekly') estMonthlyCost = finalInfo.meanAmount * (30 / 7);
              else if (ovKind === 'annual') estMonthlyCost = finalInfo.meanAmount / 12;
              else if (ovKind === 'none') estMonthlyCost = 0;
            }
            finalInfo = {
              ...finalInfo,
              kind: ovKind,
              estMonthlyCost,
              source: 'override',
            };
          }

          if (finalInfo.kind === 'none') {
            if (spendTxns.length === 0) {
              continue;
            }
            finalInfo.kind = 'monthly';
            const recentSpend = spendTxns.slice(-3);
            const meanAmount = recentSpend.reduce((s, t) => s + Math.abs(t.amount), 0) / recentSpend.length;
            finalInfo.meanAmount = meanAmount;
            finalInfo.estMonthlyCost = meanAmount;
          }

          finalInfo.count = recurringTxns.length;
          const lastTxn = spendTxns.length > 0 ? spendTxns[spendTxns.length - 1] : recurringTxns[recurringTxns.length - 1];
          finalInfo.lastDate = lastTxn ? lastTxn.date : null;

          result[merchantKey] = finalInfo;
        }

        return result;
      }

      case 'refresh_recurrence_all': {
        return { updated: 0 };
      }

      // --- AI & Safe Mode ---
      case 'is_safe_mode': {
        return Boolean(process.env.STRICTLY_SPENDING_SAFE_MODE);
      }

      case 'check_ollama_status': {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 400);
          const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: controller.signal });
          clearTimeout(timeout);
          return { installed: true, running: res.ok };
        } catch {
          return { installed: false, running: false };
        }
      }

      // --- Chat Threads ---
      case 'get_threads': {
        const rows = db.prepare('SELECT id, title, created_at, updated_at FROM threads ORDER BY updated_at DESC').all();
        return rows.map(r => ({
          id: r.id,
          title: r.title,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }));
      }

      case 'put_thread': {
        const { item } = args;
        db.prepare('INSERT OR REPLACE INTO threads (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
          item.id, item.title, item.createdAt, item.updatedAt
        );
        return null;
      }

      case 'delete_thread': {
        const { id } = args;
        db.prepare('DELETE FROM threads WHERE id = ?').run(id);
        return null;
      }

      case 'delete_thread_messages': {
        const { threadId } = args;
        db.prepare('DELETE FROM messages WHERE thread_id = ?').run(threadId);
        return null;
      }

      // --- Chat Messages ---
      case 'get_messages': {
        const rows = db.prepare('SELECT id, thread_id, role, content, action_result, created_at, active_skill_id, completed_stages, steps, token_usage, purpose, thinking FROM messages ORDER BY id ASC').all();
        return rows.map(r => {
          let actionResult = null;
          let completedStages = null;
          let steps = null;
          let tokenUsage = null;
          try { if (r.action_result) actionResult = JSON.parse(r.action_result); } catch {}
          try { if (r.completed_stages) completedStages = JSON.parse(r.completed_stages); } catch {}
          try { if (r.steps) steps = JSON.parse(r.steps); } catch {}
          try { if (r.token_usage) tokenUsage = JSON.parse(r.token_usage); } catch {}

          return {
            id: r.id,
            threadId: r.thread_id,
            role: r.role,
            content: r.content || '',
            actionResult,
            createdAt: r.created_at,
            activeSkillId: r.active_skill_id,
            completedStages,
            steps,
            tokenUsage,
            purpose: r.purpose,
            thinking: r.thinking
          };
        });
      }

      case 'add_message': {
        const { item } = args;
        const info = db.prepare('INSERT INTO messages (thread_id, role, content, action_result, created_at, active_skill_id, completed_stages, steps, token_usage, purpose, thinking) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          item.threadId,
          item.role,
          item.content || '',
          item.actionResult ? JSON.stringify(item.actionResult) : null,
          item.createdAt,
          item.activeSkillId || null,
          item.completedStages ? JSON.stringify(item.completedStages) : null,
          item.steps ? JSON.stringify(item.steps) : null,
          item.tokenUsage ? JSON.stringify(item.tokenUsage) : null,
          item.purpose || null,
          item.thinking || null
        );
        return info.lastInsertRowid;
      }

      case 'put_message': {
        const { item } = args;
        db.prepare('INSERT OR REPLACE INTO messages (thread_id, role, content, action_result, created_at, active_skill_id, completed_stages, steps, token_usage, purpose, thinking, id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          item.threadId,
          item.role,
          item.content || '',
          item.actionResult ? JSON.stringify(item.actionResult) : null,
          item.createdAt,
          item.activeSkillId || null,
          item.completedStages ? JSON.stringify(item.completedStages) : null,
          item.steps ? JSON.stringify(item.steps) : null,
          item.tokenUsage ? JSON.stringify(item.tokenUsage) : null,
          item.purpose || null,
          item.thinking || null,
          item.id || null
        );
        return null;
      }

      case 'delete_message': {
        const { id } = args;
        db.prepare('DELETE FROM messages WHERE id = ?').run(id);
        return null;
      }

      // --- Artifacts ---
      case 'get_artifacts': {
        const rows = db.prepare('SELECT id, type, title, content, explanation, summary, created_at, updated_at, path, source, associated_checklist_id FROM artifacts ORDER BY updated_at DESC').all();
        return rows.map(r => ({
          id: r.id,
          type: r.type,
          title: r.title,
          content: r.content,
          explanation: r.explanation,
          summary: r.summary,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          path: r.path,
          source: r.source,
          associatedChecklistId: r.associated_checklist_id
        }));
      }

      case 'get_artifact_versions': {
        const { artifactId } = args;
        const rows = db.prepare('SELECT id, artifact_id, content, summary, created_at FROM artifact_versions WHERE artifact_id = ? ORDER BY created_at DESC').all(artifactId);
        return rows.map(r => ({
          id: r.id,
          artifactId: r.artifact_id,
          content: r.content,
          summary: r.summary,
          createdAt: r.created_at
        }));
      }

      case 'put_artifact': {
        const { item } = args;
        db.prepare('INSERT OR REPLACE INTO artifacts (id, type, title, content, explanation, summary, created_at, updated_at, path, source, associated_checklist_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          item.id, item.type, item.title, item.content, item.explanation, item.summary, item.createdAt, item.updatedAt, item.path, item.source, item.associatedChecklistId
        );
        return null;
      }

      case 'update_artifact': {
        const { id, updates } = args;
        db.prepare('UPDATE artifacts SET type=?, title=?, content=?, explanation=?, summary=?, created_at=?, updated_at=?, path=?, source=?, associated_checklist_id=? WHERE id = ?').run(
          updates.type, updates.title, updates.content, updates.explanation, updates.summary, updates.createdAt, updates.updatedAt, updates.path, updates.source, updates.associatedChecklistId, id
        );
        return null;
      }

      case 'delete_artifact': {
        const { id } = args;
        db.prepare('DELETE FROM artifacts WHERE id = ?').run(id);
        return null;
      }

      // --- AI Chat execution ---
      case 'run_copilot_chat': {
        const { model, messages, format, tools, options } = args;
        try {
          const reqBody = {
            model,
            messages,
            stream: false,
            options: options || {}
          };
          if (format) reqBody.format = format;
          if (tools) reqBody.tools = tools;

          const res = await fetch('http://127.0.0.1:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody)
          });
          if (!res.ok) {
            throw new Error(`Ollama returned status ${res.status}`);
          }
          const data = await res.json();
          return {
            content: data.message?.content || '',
            tool_calls: data.message?.tool_calls || null,
            thinking: data.message?.thinking || null
          };
        } catch (e) {
          throw new Error(`Ollama connection error: ${e.message || String(e)}. Make sure Ollama is running on http://127.0.0.1:11434.`);
        }
      }

      case 'run_gemini_chat': {
        const { model, messages, apiKey, format, tools, options } = args;
        if (!apiKey) {
          throw new Error('Gemini API key is required. Please set it in Settings.');
        }
        const reqBody = {
          model: model || 'gemini-1.5-flash',
          messages,
          stream: false
        };
        if (format) reqBody.response_format = format;
        if (tools) reqBody.tools = tools;
        if (options?.temperature !== undefined) reqBody.temperature = options.temperature;

        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(reqBody)
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Gemini error: ${errText}`);
        }
        const data = await res.json();
        const choice = data.choices?.[0]?.message;
        return {
          content: choice?.content || '',
          tool_calls: choice?.tool_calls || null,
          thinking: null
        };
      }

      case 'get_transaction': {
        const r = db.prepare('SELECT id, account_id, date, description, amount, raw_category, category, source, merchant_key, user_overridden, dedup_key, import_batch_id, recurrence, recurrence_override, is_business, tax_category, deduction_status, COALESCE(is_pending, 0) as is_pending FROM transactions WHERE id = ?').get(args.id);
        if (!r) return null;
        return {
          id: r.id,
          accountId: r.account_id,
          date: r.date,
          description: r.description,
          amount: r.amount,
          rawCategory: r.raw_category,
          category: r.category,
          source: r.source,
          merchantKey: r.merchant_key,
          userOverridden: Boolean(r.user_overridden),
          dedupKey: r.dedup_key,
          importBatchId: r.import_batch_id,
          recurrence: r.recurrence || 'none',
          recurrenceOverride: r.recurrence_override,
          isBusiness: Boolean(r.is_business),
          taxCategory: r.tax_category,
          deductionStatus: r.deduction_status,
          isPending: Boolean(r.is_pending)
        };
      }

      case 'get_category_transaction_counts': {
        const demoCond = args.demoMode ? "source = 'demo'" : "source != 'demo'";
        const rows = db.prepare(`SELECT category, COUNT(*) as cnt FROM transactions WHERE ${demoCond} GROUP BY category`).all();
        const counts = {};
        for (const r of rows) counts[r.category] = r.cnt;
        return counts;
      }

      case 'get_rule_match_counts': {
        const demoCond = args.demoMode ? "source = 'demo'" : "source != 'demo'";
        const rules = db.prepare('SELECT id, pattern FROM rules').all();
        const txns = db.prepare(`SELECT description, merchant_key FROM transactions WHERE ${demoCond}`).all();
        const counts = {};
        for (const rule of rules) {
          const pat = (rule.pattern || '').toLowerCase();
          counts[rule.id] = pat
            ? txns.filter(t => (t.description || '').toLowerCase().includes(pat) || (t.merchant_key || '').toLowerCase().includes(pat)).length
            : 0;
        }
        return counts;
      }

      case 'preview_rule_matches': {
        const pat = (args.pattern || '').toLowerCase().trim();
        const demoCond = args.demoMode ? "source = 'demo'" : "source != 'demo'";
        if (!pat) return { matchCount: 0, sampleMerchants: [] };
        const rows = db.prepare(`SELECT description, merchant_key FROM transactions WHERE ${demoCond} AND (LOWER(description) LIKE ? OR LOWER(merchant_key) LIKE ?)`).all(`%${pat}%`, `%${pat}%`);
        const merchants = Array.from(new Set(rows.map(r => r.merchant_key || r.description))).slice(0, 10);
        return { matchCount: rows.length, sampleMerchants: merchants };
      }

      case 'recategorize_all': {
        const rules = db.prepare('SELECT pattern, category FROM rules ORDER BY priority DESC').all();
        const txns = db.prepare('SELECT id, description, merchant_key, category, user_overridden FROM transactions').all();
        const updateStmt = db.prepare('UPDATE transactions SET category = ? WHERE id = ?');
        let updated = 0;
        for (const t of txns) {
          if (t.user_overridden && !args.forceUserRules) continue;
          const desc = (t.description || '').toLowerCase();
          const mKey = (t.merchant_key || '').toLowerCase();
          for (const r of rules) {
            const pat = (r.pattern || '').toLowerCase();
            if (pat && (desc.includes(pat) || mKey.includes(pat))) {
              if (t.category !== r.category) {
                updateStmt.run(r.category, t.id);
                updated++;
              }
              break;
            }
          }
        }
        return updated;
      }

      case 'get_imports': {
        db.exec(`CREATE TABLE IF NOT EXISTS imports (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL, source TEXT NOT NULL, account_id INTEGER NOT NULL, imported_at TEXT NOT NULL, row_count INTEGER NOT NULL, added_count INTEGER NOT NULL, skipped_count INTEGER NOT NULL)`);
        const rows = db.prepare('SELECT id, filename, source, account_id, imported_at, row_count, added_count, skipped_count FROM imports ORDER BY imported_at DESC').all();
        return rows.map(r => ({
          id: r.id,
          filename: r.filename,
          source: r.source,
          accountId: r.account_id,
          importedAt: r.imported_at,
          rowCount: r.row_count,
          addedCount: r.added_count,
          skippedCount: r.skipped_count
        }));
      }

      case 'add_import': {
        const item = args.item || {};
        const info = db.prepare('INSERT INTO imports (filename, source, account_id, imported_at, row_count, added_count, skipped_count) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          item.filename, item.source, item.accountId, item.importedAt || new Date().toISOString(), item.rowCount || 0, item.addedCount || 0, item.skippedCount || 0
        );
        return Number(info.lastInsertRowid);
      }

      case 'delete_import': {
        db.prepare('DELETE FROM imports WHERE id = ?').run(args.id);
        return null;
      }

      case 'get_tax_rules': {
        db.exec(`CREATE TABLE IF NOT EXISTS tax_rules (id TEXT PRIMARY KEY, pattern TEXT NOT NULL, match_type TEXT, account_id INTEGER, spend_category TEXT, tax_category TEXT NOT NULL, business_percentage REAL DEFAULT 100)`);
        const rows = db.prepare('SELECT id, pattern, match_type, account_id, spend_category, tax_category, business_percentage FROM tax_rules').all();
        return rows.map(r => ({
          id: r.id,
          pattern: r.pattern,
          matchType: r.match_type,
          accountId: r.account_id,
          spendCategory: r.spend_category,
          taxCategory: r.tax_category,
          businessPercentage: r.business_percentage ?? 100
        }));
      }

      case 'put_tax_rule': {
        const item = args.item || {};
        db.prepare('INSERT OR REPLACE INTO tax_rules (id, pattern, match_type, account_id, spend_category, tax_category, business_percentage) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          item.id || String(Date.now()), item.pattern, item.matchType || null, item.accountId ?? null, item.spendCategory || null, item.taxCategory, item.businessPercentage ?? 100
        );
        return null;
      }

      case 'delete_tax_rule': {
        db.prepare('DELETE FROM tax_rules WHERE id = ?').run(args.id);
        return null;
      }

      case 'mine_rule_suggestions': {
        const isDemo = Boolean(args.demoMode);
        const sourceCondition = isDemo ? "source = 'demo'" : "source != 'demo'";
        const candidates = db.prepare(`
          SELECT merchant_key, category, COUNT(*) as cnt, MAX(description) as sample_desc
          FROM transactions
          WHERE user_overridden = 1
            AND category != 'Uncategorized'
            AND merchant_key != ''
            AND ${sourceCondition}
          GROUP BY merchant_key, category
          HAVING cnt >= 2
          ORDER BY cnt DESC
        `).all();
        const rules = db.prepare('SELECT pattern, category FROM rules').all();
        return candidates
          .filter(c => {
            const patLower = (c.merchant_key || '').toLowerCase();
            return !rules.some(r => {
              const rPat = (r.pattern || '').toLowerCase();
              return rPat === patLower || (patLower.includes(rPat) && r.category === c.category);
            });
          })
          .map(c => ({
            pattern: c.merchant_key,
            category: c.category,
            overridesCount: c.cnt,
            sampleDescription: c.sample_desc
          }));
      }

      case 'get_mcp_server_info': {
        const dbPath = getDbPath();
        const os = require('node:os');
        const fs = require('node:fs');
        const nets = os.networkInterfaces();
        const localUrls = [];
        for (const addrs of Object.values(nets)) {
          for (const addr of (addrs || [])) {
            if (addr.family === 'IPv4' && !addr.internal) {
              localUrls.push(`http://${addr.address}:5173`);
            }
          }
        }
        const repoRoot = path.resolve(__dirname, '..');
        const releaseExe = path.join(repoRoot, 'src-tauri', 'target', 'release', process.platform === 'win32' ? 'app.exe' : 'app');
        const debugExe = path.join(repoRoot, 'src-tauri', 'target', 'debug', process.platform === 'win32' ? 'app.exe' : 'app');
        const mcpScriptPath = path.join(__dirname, 'mcp-server.cjs');

        let command = process.execPath;
        let mcpArgs = [mcpScriptPath, '--db-path', dbPath];
        if (fs.existsSync(releaseExe)) {
          command = releaseExe;
          mcpArgs = ['--mcp', '--db-path', dbPath];
        } else if (fs.existsSync(debugExe)) {
          command = debugExe;
          mcpArgs = ['--mcp', '--db-path', dbPath];
        }

        return {
          executablePath: command,
          dbPath,
          localUrls,
          configJson: JSON.stringify({
            mcpServers: {
              'strictly-spending': {
                command,
                args: mcpArgs
              }
            }
          }, null, 2)
        };
      }

      default:
        console.warn('Unhandled dev IPC command:', cmd);
        return null;
    }
  } finally {
    db.close();
  }
}

module.exports = { handleIpc };
