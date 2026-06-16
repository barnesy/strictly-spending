import { db } from './db';
import type { Account, ParsedTransaction, Transaction, Source } from './types';
import { parseCsv } from './parsers';
import {
  categorize,
  extractMerchantKey,
  inferTypeCategory,
} from './categorize';
import { localAI } from './ai';

export interface ImportPreview {
  filename: string;
  source: Source | null;
  rows: ProcessedRow[];
  warnings: string[];
  error?: string;
  totalCount: number;
  newCount: number;
  duplicateCount: number;
  byCategory: Record<string, number>;
  /** SHA-256 of the file's text; carried so commitPreview can store it on
   *  the ImportBatch row for watch-folder dedup. */
  contentHash?: string;
}

export interface ProcessedRow {
  parsed: ParsedTransaction;
  category: string;
  aiCategory?: string;
  merchantKey: string;
  dedupKey: string;
  duplicate: boolean;
}

function dedupKey(
  accountName: string,
  date: string,
  amount: number,
  description: string,
  seq: number
): string {
  return `${accountName}|${date}|${amount.toFixed(2)}|${description
    .trim()
    .toLowerCase()}|${seq}`;
}

export async function buildPreview(
  filename: string,
  rawText: string,
  contentHash?: string
): Promise<ImportPreview> {
  const parseResult = parseCsv(filename, rawText);
  if ('error' in parseResult) {
    return {
      filename,
      source: null,
      rows: [],
      warnings: [],
      error: parseResult.error,
      totalCount: 0,
      newCount: 0,
      duplicateCount: 0,
      byCategory: {},
    };
  }

  const rules = await db.rules.toArray();

  const potentialKeys: string[] = [];
  const tempSeqCounter = new Map<string, number>();
  for (const p of parseResult.transactions) {
    const bucket = `${p.accountName}|${p.date}|${p.amount.toFixed(2)}|${p.description
      .trim()
      .toLowerCase()}`;
    const seq = tempSeqCounter.get(bucket) ?? 0;
    tempSeqCounter.set(bucket, seq + 1);
    potentialKeys.push(dedupKey(p.accountName, p.date, p.amount, p.description, seq));
  }

  const existingKeys = potentialKeys.length > 0
    ? new Set(
        (await db.transactions.where('dedupKey').anyOf(potentialKeys).toArray()).map((t) => t.dedupKey)
      )
    : new Set<string>();

  const rows: ProcessedRow[] = [];
  const byCategory: Record<string, number> = {};
  const seqCounter = new Map<string, number>(); // dedup-bucket -> next seq
  let newCount = 0;
  let duplicateCount = 0;

  for (const p of parseResult.transactions) {
    const merchantKey = extractMerchantKey(p.description);
    let category = categorize(p.description, merchantKey, p.rawCategory, {
      rules,
    });
    if (category === 'Uncategorized') {
      const inferred = inferTypeCategory(p.amount, p.source, p.rawCategory);
      if (inferred) category = inferred;
    }
    const bucket = `${p.accountName}|${p.date}|${p.amount.toFixed(2)}|${p.description
      .trim()
      .toLowerCase()}`;
    const seq = seqCounter.get(bucket) ?? 0;
    seqCounter.set(bucket, seq + 1);
    const k = dedupKey(p.accountName, p.date, p.amount, p.description, seq);
    const duplicate = existingKeys.has(k);
    if (duplicate) duplicateCount++;
    else newCount++;
    rows.push({
      parsed: p,
      category,
      merchantKey,
      dedupKey: k,
      duplicate,
    });
    byCategory[category] = (byCategory[category] || 0) + 1;
  }

  // Local AI Cross-Reference
  const licenseSetting = await db.settings.get('license');
  const license = licenseSetting?.value as { active: boolean } | undefined;
  if (license?.active && localAI.isLoaded && rows.length > 0) {
    try {
      const allCats = await db.categories.toArray();
      const catNames = allCats.map(c => c.name);
      
      // Filter out duplicates (don't waste AI tokens on duplicate rules, though they might have slight variations, we'll send unique descriptions)
      // Actually, to keep it simple and accurate, we'll just send the non-duplicate ones or all. Let's send non-duplicates.
      const toReview = rows.map((r) => ({
        desc: r.parsed.description,
        ruleCategory: r.category
      }));
      
      const aiResults = await localAI.reviewTransactions(toReview, catNames);
      
      aiResults.forEach((cat, idx) => {
        if (idx < rows.length && catNames.includes(cat)) {
          rows[idx].aiCategory = cat;
        }
      });
    } catch (e) {
      console.error("Local AI categorization failed:", e);
    }
  }

  return {
    filename,
    source: parseResult.source,
    rows,
    warnings: parseResult.warnings,
    totalCount: rows.length,
    newCount,
    duplicateCount,
    byCategory,
    contentHash,
  };
}

export async function commitPreview(preview: ImportPreview): Promise<{
  imported: number;
  skippedDuplicates: number;
  batchId: number;
}> {
  if (preview.error || !preview.source) {
    throw new Error(preview.error || 'No source detected');
  }

  // Pass 1: Resolve all accounts up front (one query per unique account).
  const uniqueAccounts = new Map<string, ParsedTransaction>();
  for (const row of preview.rows) {
    if (!uniqueAccounts.has(row.parsed.accountName)) {
      uniqueAccounts.set(row.parsed.accountName, row.parsed);
    }
  }
  const accountIdByName = new Map<string, number>();
  for (const [name, sample] of uniqueAccounts) {
    const existing = await db.accounts.where('name').equals(name).first();
    if (existing) {
      accountIdByName.set(name, existing.id!);
    } else {
      const id = (await db.accounts.add({
        name: sample.accountName,
        type: sample.accountType,
        institution: sample.institution,
        last4: sample.last4,
        source: sample.source,
        enabled: true,
        currentBalance: 0,
      } as Account)) as number;
      accountIdByName.set(name, id);
    }
  }

  // Create the import batch row.
  const batchId = (await db.imports.add({
    filename: preview.filename,
    source: preview.source,
    importedAt: new Date().toISOString(),
    rowCount: preview.totalCount,
    newCount: preview.newCount,
    duplicateCount: preview.duplicateCount,
    contentHash: preview.contentHash,
  })) as number;

  // Pass 2: bulkAdd all non-duplicate transactions in one shot.
  const toInsert: Omit<Transaction, 'id'>[] = [];
  let skippedDuplicates = 0;
  const seenKeys = new Set<string>();
  for (const row of preview.rows) {
    if (row.duplicate) {
      skippedDuplicates++;
      continue;
    }
    // Guard against intra-batch dedup collisions (same key appearing twice in this file).
    if (seenKeys.has(row.dedupKey)) {
      skippedDuplicates++;
      continue;
    }
    seenKeys.add(row.dedupKey);
    toInsert.push({
      accountId: accountIdByName.get(row.parsed.accountName)!,
      date: row.parsed.date,
      description: row.parsed.description,
      amount: row.parsed.amount,
      rawCategory: row.parsed.rawCategory,
      category: row.category,
      source: row.parsed.source,
      merchantKey: row.merchantKey,
      userOverridden: false,
      dedupKey: row.dedupKey,
      importBatchId: batchId,
    });
  }

  let imported = 0;
  if (toInsert.length > 0) {
    // allKeys + ignoreErrors: skip any unique-constraint conflicts silently.
    const result = await db.transactions.bulkAdd(toInsert as Transaction[], {
      allKeys: true,
    });
    imported = result.length;
  }

  // Update account balances
  for (const [name, sample] of uniqueAccounts) {
    const accountId = accountIdByName.get(name)!;
    const accountRows = preview.rows.filter((r) => r.parsed.accountName === name);
    const sortedRows = [...accountRows].sort((a, b) => b.parsed.date.localeCompare(a.parsed.date));
    const latestBalanceRow = sortedRows.find((r) => r.parsed.balance !== undefined);
    const importedBalance = latestBalanceRow?.parsed.balance;

    if (importedBalance !== undefined) {
      await db.accounts.update(accountId, { currentBalance: importedBalance });
    } else if (sample.accountType === 'credit') {
      const txns = await db.transactions.where('accountId').equals(accountId).toArray();
      const balance = txns.reduce((sum, t) => sum + t.amount, 0);
      await db.accounts.update(accountId, { currentBalance: balance });
    }
  }

  return { imported, skippedDuplicates, batchId };
}
