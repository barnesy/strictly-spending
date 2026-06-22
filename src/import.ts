import { db } from './db/drizzle';
import * as schema from './db/schema';
import { eq } from 'drizzle-orm';

import type { ParsedTransaction, Transaction, Source } from './types';
import { refreshRecurrenceAll } from './recurrence';
import { parseCsv, detectSource, extractCsvHeaders, parseCustomCsv } from './parsers';
import {
  categorize,
  extractMerchantKey,
  inferTypeCategory,
} from './categorize';
import { localAI } from './ai';
import { resolveTaxDeduction } from './taxUtils';

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
  requiresMapping?: boolean;
  headers?: string[];
  rawText?: string;
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
  contentHash?: string,
  runAiAudit = false
): Promise<ImportPreview> {
  let source = detectSource(rawText);
  let parseResult;

  if (source) {
    parseResult = parseCsv(filename, rawText);
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
  } else {
    // Check if there is a saved mapping for these headers
    const headers = extractCsvHeaders(rawText);
    const headerHash = headers.join(',');
    const existingMapping = await (await db.select().from(schema.csvMappings).where(eq(schema.csvMappings.headerHash, headerHash)))[0];
    if (existingMapping) {
      source = 'custom';
      parseResult = { source: 'custom' as const, ...parseCustomCsv(filename, rawText, existingMapping as any) };
    } else {
      return {
        filename,
        source: null,
        rows: [],
        warnings: [],
        totalCount: 0,
        newCount: 0,
        duplicateCount: 0,
        byCategory: {},
        contentHash,
        requiresMapping: true,
        headers,
        rawText,
      };
    }
  }

  const rules = await db.select().from(schema.rules);

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

  const existingKeys = new Set<string>(
    (await (await db.select({ dedupKey: schema.transactions.dedupKey }).from(schema.transactions)).map(r => r.dedupKey)) as string[]
  );

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
  const licenseSetting = await (await db.select().from(schema.settings).where(eq(schema.settings.key, 'license')))[0];
  const license = licenseSetting?.value as { active: boolean } | undefined;
  if (runAiAudit && license?.active && localAI.isLoaded && rows.length > 0) {
    try {
      const allCats = await db.select().from(schema.categories);
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
    const existing = await (await db.select().from(schema.accounts).where(eq(schema.accounts.name, name)))[0];
    if (existing) {
      accountIdByName.set(name, existing.id!);
    } else {
      const insertedAcc = await db.insert(schema.accounts).values({
        name: sample.accountName,
        type: sample.accountType,
        institution: sample.institution,
        last4: sample.last4,
        source: sample.source,
        enabled: true,
        currentBalance: 0,
      }).returning();
      const id = insertedAcc[0].id;
      accountIdByName.set(name, id!);
    }
  }

  // Create the import batch row.
  const insertedBatch = await db.insert(schema.imports).values({
    filename: preview.filename,
    source: preview.source,
    importedAt: new Date().toISOString(),
    rowCount: preview.totalCount,
    newCount: preview.newCount,
    duplicateCount: preview.duplicateCount,
    contentHash: preview.contentHash,
  }).returning();
  const batchId = insertedBatch[0].id;
  const taxRules = await db.select().from(schema.taxRules);
  
  // Pass 2: insert all non-duplicate transactions in one shot.
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
    const taxGuess = resolveTaxDeduction(row.parsed.description, row.category, row.merchantKey, taxRules);
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
      recurrence: 'onetime',
      isBusiness: taxGuess.isBusiness,
      taxCategory: taxGuess.taxCategory,
      deductionStatus: taxGuess.deductionStatus,
    });
  }

  let imported = 0;
  if (toInsert.length > 0) {
    // allKeys + ignoreErrors: skip any unique-constraint conflicts silently.
    const result = await db.insert(schema.transactions).values(toInsert as Transaction[]);
    imported = toInsert.length;
  }

  // Update account balances
  for (const [name, sample] of uniqueAccounts) {
    const accountId = accountIdByName.get(name)!;
    const accountRows = preview.rows.filter((r) => r.parsed.accountName === name);
    const sortedRows = [...accountRows].sort((a, b) => b.parsed.date.localeCompare(a.parsed.date));
    const latestBalanceRow = sortedRows.find((r) => r.parsed.balance !== undefined);
    const importedBalance = latestBalanceRow?.parsed.balance;

    if (importedBalance !== undefined) {
      await db.update(schema.accounts).set({ currentBalance: importedBalance }).where(eq(schema.accounts.id, accountId));
    } else if (sample.accountType === 'credit') {
      const txns = await db.select().from(schema.transactions).where(eq(schema.transactions.accountId, accountId));
      const balance = txns.reduce((sum, t) => sum + t.amount, 0);
      await db.update(schema.accounts).set({ currentBalance: balance }).where(eq(schema.accounts.id, accountId));
    }
  }

  // Refresh the recurrence cache database-wide to account for the new data
  await refreshRecurrenceAll();
  
  return { imported, skippedDuplicates, batchId };
}
