import { api } from '../api';

import type { ParsedTransaction, Transaction, Source } from '../types';
import { refreshRecurrenceAll } from './recurrence';
import { parseCsv, detectSource, extractCsvHeaders, parseCustomCsv } from '../parsers';
import {
  categorize,
  extractMerchantKey,
  inferTypeCategory,
} from './categorize';
import { resolveTaxDeduction } from '../tax/taxUtils';

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
  targetAccountId?: number;
  targetAccountName?: string;
  targetAccountMap?: Record<string, number>;
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

export function normalizeDescriptionForDedup(desc: string): string {
  return (desc || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getSignificantWords(s: string): string[] {
  const STOP_WORDS = new Set([
    'des', 'indn', 'purchase', 'mobile', 'web', 'ppd', 'the', 'and', 'for',
    'crd', 'confirmation', 'payment', 'transfer', 'id', 'inc', 'llc', 'com', 'store'
  ]);
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
}

export function descriptionsMatch(descA: string, descB: string): boolean {
  const normA = (descA || '').toLowerCase().trim();
  const normB = (descB || '').toLowerCase().trim();
  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;

  // Specific brand abbreviations (e.g. QT vs QuikTrip)
  if (
    (normA.includes('qt') || normA.includes('quiktrip')) &&
    (normB.includes('qt') || normB.includes('quiktrip'))
  ) {
    return true;
  }

  const wordsA = getSignificantWords(descA);
  const wordsB = getSignificantWords(descB);
  return wordsA.some(w => wordsB.includes(w));
}

export interface ExistingSemanticCandidate {
  description: string;
  dedupKey?: string;
  claimed: number;
}

export function buildExistingSemanticCounts(
  txns: { accountId?: number; date?: string; amount?: number; description?: string; dedupKey?: string }[],
  accounts: { id?: number; name: string; source?: string }[]
): Map<string, ExistingSemanticCandidate[]> {
  const map = new Map<string, ExistingSemanticCandidate[]>();
  const accById = new Map<number, { name: string; source?: string }>();
  for (const acc of accounts) {
    if (acc.id) accById.set(acc.id, { name: acc.name.toLowerCase(), source: acc.source });
  }
  for (const t of txns) {
    if (t.amount === undefined || typeof t.amount !== 'number' || !t.date || !t.description) {
      continue;
    }
    const candidate: ExistingSemanticCandidate = {
      description: t.description,
      dedupKey: t.dedupKey,
      claimed: 0,
    };
    const amtStr = t.amount.toFixed(2);

    if (t.accountId !== undefined) {
      const idKey = `${t.accountId}|${t.date}|${amtStr}`;
      if (!map.has(idKey)) map.set(idKey, []);
      map.get(idKey)!.push(candidate);

      const accInfo = accById.get(t.accountId);
      if (accInfo) {
        const nameKey = `${accInfo.name}|${t.date}|${amtStr}`;
        if (!map.has(nameKey)) map.set(nameKey, []);
        map.get(nameKey)!.push(candidate);

        if (accInfo.source) {
          const sourceKey = `${accInfo.source}|${t.date}|${amtStr}`;
          if (!map.has(sourceKey)) map.set(sourceKey, []);
          map.get(sourceKey)!.push(candidate);
        }
      }
    }

    // Global date + amount key for cross-account semantic matching
    const globalKey = `*|${t.date}|${amtStr}`;
    if (!map.has(globalKey)) map.set(globalKey, []);
    map.get(globalKey)!.push(candidate);
  }
  return map;
}

export function checkRowDuplicate(
  p: ParsedTransaction,
  effectiveAccountName: string,
  targetAccountId: number | undefined,
  seq: number,
  existingKeys: Set<string>,
  existingSemanticMap: Map<string, ExistingSemanticCandidate[]>,
  targetAccountSource?: string
): { dedupKey: string; duplicate: boolean } {
  const k = dedupKey(effectiveAccountName, p.date, p.amount, p.description, seq);

  if (existingKeys.has(k)) {
    return { dedupKey: k, duplicate: true };
  }

  const amtStr = typeof p.amount === 'number' ? p.amount.toFixed(2) : Number(p.amount || 0).toFixed(2);
  const targetIdKey = targetAccountId ? `${targetAccountId}|${p.date}|${amtStr}` : null;
  const targetNameKey = `${effectiveAccountName.toLowerCase()}|${p.date}|${amtStr}`;
  const targetSourceKey = (targetAccountSource || p.source) ? `${targetAccountSource || p.source}|${p.date}|${amtStr}` : null;
  const globalKey = `*|${p.date}|${amtStr}`;

  // Prioritize account-specific match, then source match, then global date+amount match
  const candidatePools = [
    targetIdKey ? existingSemanticMap.get(targetIdKey) : undefined,
    existingSemanticMap.get(targetNameKey),
    targetSourceKey ? existingSemanticMap.get(targetSourceKey) : undefined,
    existingSemanticMap.get(globalKey),
  ];

  for (const pool of candidatePools) {
    if (!pool || pool.length === 0) continue;
    const matched = pool.find(
      c => c.claimed === 0 && descriptionsMatch(p.description, c.description)
    );
    if (matched) {
      matched.claimed++;
      return { dedupKey: k, duplicate: true };
    }
  }

  return { dedupKey: k, duplicate: false };
}

export async function buildPreview(
  filename: string,
  rawText: string,
  contentHash?: string,
  runAiAudit = false
): Promise<ImportPreview> {
  let source = detectSource(rawText);
  let parseResult;
  let targetAccountMap: Record<string, number> | undefined = undefined;

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
    const mappings = await api.getCsvMappings();
    const existingMapping = mappings.find(m => m.headerHash === headerHash);
    if (existingMapping) {
      source = 'custom';
      parseResult = { source: 'custom' as const, ...parseCustomCsv(filename, rawText, existingMapping as any) };
      targetAccountMap = {};
      if (existingMapping.accountMappings) {
        for (const [k, v] of Object.entries(existingMapping.accountMappings)) {
          if (v.accountId) {
            targetAccountMap[v.accountName] = v.accountId;
            targetAccountMap[k] = v.accountId;
          }
        }
      }
      // Auto-match any unmapped accounts to existing accounts
      try {
        const existingAccounts = await api.getAccounts();
        for (const p of parseResult.transactions) {
          const key = p.fileAccountName || p.accountName;
          if (!targetAccountMap[key]) {
            const best = findBestMatchingAccount(key, existingAccounts);
            if (best?.id) {
              targetAccountMap[key] = best.id;
              targetAccountMap[p.accountName] = best.id;
            }
          }
        }
      } catch (err) {
        console.warn('Could not auto-match accounts:', err);
      }
      if (Object.keys(targetAccountMap).length === 0) {
        targetAccountMap = undefined;
      }
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

  const [rules, allTxnsForDedup, allAccounts, allImports] = await Promise.all([
    api.getRules(),
    api.getTransactions(),
    api.getAccounts(),
    typeof api.getImports === 'function' ? api.getImports().catch(() => []) : Promise.resolve([]),
  ]);

  const fileWarnings: string[] = [];
  if (contentHash && allImports.length > 0) {
    const dupImport = allImports.find(i => i.contentHash && i.contentHash === contentHash);
    if (dupImport) {
      fileWarnings.push(
        `This file ("${dupImport.filename}") was previously imported on ${new Date(dupImport.importedAt).toLocaleDateString()}. Duplicate transactions will be skipped.`
      );
    }
  }

  if (!targetAccountMap) {
    targetAccountMap = {};
  }
  for (const p of parseResult.transactions) {
    const key = p.fileAccountName || p.accountName;
    if (!targetAccountMap[key]) {
      const best = findBestMatchingAccount(key, allAccounts);
      if (best?.id) {
        targetAccountMap[key] = best.id;
        targetAccountMap[p.accountName] = best.id;
      }
    }
  }
  if (Object.keys(targetAccountMap).length === 0) {
    targetAccountMap = undefined;
  }

  const existingKeys = new Set<string>(
    allTxnsForDedup.map(t => t.dedupKey)
  );
  const existingSemanticCounts = buildExistingSemanticCounts(allTxnsForDedup, allAccounts);

  const rows: ProcessedRow[] = [];
  const byCategory: Record<string, number> = {};
  const seqCounter = new Map<string, number>(); // dedup-bucket -> next seq
  const batchOccurrences = new Map<string, number>();
  let newCount = 0;
  let duplicateCount = 0;

  for (const p of parseResult.transactions) {
    const merchantKey = extractMerchantKey(p.description);
    let category = categorize(p.description, merchantKey, p.rawCategory, {
      rules,
    });
    if (category === 'Uncategorized') {
      const inferred = inferTypeCategory(p.amount, p.source, p.rawCategory, p.accountType, p.description);
      if (inferred) category = inferred;
    }
    const bucket = `${p.accountName}|${p.date}|${p.amount.toFixed(2)}|${p.description
      .trim()
      .toLowerCase()}`;
    const seq = seqCounter.get(bucket) ?? 0;
    seqCounter.set(bucket, seq + 1);

    const targetId =
      (p.fileAccountName && targetAccountMap?.[p.fileAccountName]) ||
      (targetAccountMap && targetAccountMap[p.accountName]);
    const targetAcc = targetId ? allAccounts.find(a => a.id === targetId) : undefined;

    const { dedupKey: k, duplicate } = checkRowDuplicate(
      p,
      p.accountName,
      targetId,
      seq,
      existingKeys,
      existingSemanticCounts,
      targetAcc?.source || p.source
    );

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

  return {
    filename,
    source: parseResult.source,
    rows,
    warnings: [...parseResult.warnings, ...fileWarnings],
    totalCount: rows.length,
    newCount,
    duplicateCount,
    byCategory,
    contentHash,
    rawText,
    targetAccountMap,
  };
}

export function findBestMatchingAccount<T extends { id?: number; name: string; institution: string; type: string; source?: string }>(
  fileAccountName: string,
  accounts: T[]
): T | undefined {
  if (!fileAccountName || accounts.length === 0) return undefined;
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  const fileTokens = clean(fileAccountName);

  let bestMatch: T | undefined = undefined;
  let bestScore = 0;

  for (const acc of accounts) {
    const accTokens = clean(`${acc.institution} ${acc.name} ${acc.source || ''}`);
    let score = 0;

    // Check alias matching (e.g., BOA <-> Bank of America)
    const isBoaFile = fileTokens.includes('boa');
    const isBoaAcc = accTokens.includes('america') || (acc.institution && acc.institution.toLowerCase().includes('bank of america')) || (acc.source && acc.source.startsWith('boa'));
    if (isBoaFile && isBoaAcc) {
      score += 4;
    }

    for (const t of fileTokens) {
      if (accTokens.includes(t)) {
        if (['bank', 'of', 'america', 'card', 'credit', 'account', 'the', 'checking', 'visa', 'signature'].includes(t)) {
          score += 1;
        } else {
          score += 4;
        }
      }
    }
    if (fileTokens.includes('business') !== accTokens.includes('business')) {
      score -= 4;
    }
    if (score > bestScore && score >= 4) {
      bestScore = score;
      bestMatch = acc;
    }
  }

  return bestMatch;
}

export async function updatePreviewAccountMapping(
  preview: ImportPreview,
  originalAccountName: string,
  target: { id?: number; name: string; institution?: string; type?: string }
): Promise<ImportPreview> {
  const [allTxnsForDedup, allAccounts] = await Promise.all([
    api.getTransactions(),
    api.getAccounts(),
  ]);
  const existingKeys = new Set<string>(
    allTxnsForDedup.map(t => t.dedupKey)
  );
  const existingSemanticCounts = buildExistingSemanticCounts(allTxnsForDedup, allAccounts);

  const targetAccountMap: Record<string, number> = {
    ...(preview.targetAccountMap || {}),
  };
  if (target.id) {
    targetAccountMap[target.name] = target.id;
    if (originalAccountName && originalAccountName !== target.name) {
      targetAccountMap[originalAccountName] = target.id;
    }
  }

  const seqCounter = new Map<string, number>();
  const batchOccurrences = new Map<string, number>();
  let duplicateCount = 0;
  let newCount = 0;

  const rows: ProcessedRow[] = preview.rows.map(row => {
    const matches =
      (row.parsed.fileAccountName && row.parsed.fileAccountName === originalAccountName) ||
      row.parsed.accountName === originalAccountName;
    const parsed: ParsedTransaction = matches
      ? {
          ...row.parsed,
          accountName: target.name,
          ...(target.institution ? { institution: target.institution } : {}),
          ...(target.type ? { accountType: target.type as any } : {}),
        }
      : row.parsed;

    const bucket = `${parsed.accountName}|${parsed.date}|${parsed.amount.toFixed(2)}|${parsed.description
      .trim()
      .toLowerCase()}`;
    const seq = seqCounter.get(bucket) ?? 0;
    seqCounter.set(bucket, seq + 1);

    const targetId =
      (parsed.fileAccountName && targetAccountMap[parsed.fileAccountName]) ||
      targetAccountMap[parsed.accountName] ||
      target.id ||
      preview.targetAccountId;
    const targetAcc = targetId ? allAccounts.find(a => a.id === targetId) : undefined;

    const { dedupKey: k, duplicate } = checkRowDuplicate(
      parsed,
      parsed.accountName,
      targetId,
      seq,
      existingKeys,
      existingSemanticCounts,
      targetAcc?.source || parsed.source
    );

    if (duplicate) duplicateCount++;
    else newCount++;

    return {
      ...row,
      parsed,
      dedupKey: k,
      duplicate,
    };
  });

  return {
    ...preview,
    targetAccountId: target.id ?? preview.targetAccountId,
    targetAccountName: target.name,
    targetAccountMap,
    rows,
    duplicateCount,
    newCount,
  };
}

export async function updatePreviewAccount(
  preview: ImportPreview,
  account: { id?: number; name: string; institution?: string; type?: string }
): Promise<ImportPreview> {
  const defaultAccName = preview.targetAccountName || preview.rows[0]?.parsed.fileAccountName || preview.rows[0]?.parsed.accountName || '';
  return updatePreviewAccountMapping(preview, defaultAccName, account);
}

export async function commitPreview(
  preview: ImportPreview,
  forceImportDuplicates = false
): Promise<{
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
    const key = row.parsed.fileAccountName || row.parsed.accountName;
    if (!uniqueAccounts.has(key)) {
      uniqueAccounts.set(key, row.parsed);
    }
  }
  const accounts = await api.getAccounts();
  const accountIdByName = new Map<string, number>();
  for (const [name, sample] of uniqueAccounts) {
    if (preview.targetAccountMap && preview.targetAccountMap[name]) {
      const targetId = preview.targetAccountMap[name];
      const matchedTarget = accounts.find(a => a.id === targetId);
      if (matchedTarget) {
        accountIdByName.set(name, matchedTarget.id!);
        accountIdByName.set(sample.accountName, matchedTarget.id!);
        continue;
      }
    }
    if (preview.targetAccountMap && preview.targetAccountMap[sample.accountName]) {
      const targetId = preview.targetAccountMap[sample.accountName];
      const matchedTarget = accounts.find(a => a.id === targetId);
      if (matchedTarget) {
        accountIdByName.set(name, matchedTarget.id!);
        accountIdByName.set(sample.accountName, matchedTarget.id!);
        continue;
      }
    }
    if (preview.targetAccountId && uniqueAccounts.size === 1) {
      const matchedTarget = accounts.find(a => a.id === preview.targetAccountId);
      if (matchedTarget) {
        accountIdByName.set(name, matchedTarget.id!);
        accountIdByName.set(sample.accountName, matchedTarget.id!);
        continue;
      }
    }
    const existing = accounts.find(a => a.name.toLowerCase() === name.toLowerCase())
      || accounts.find(a => a.name.toLowerCase() === sample.accountName.toLowerCase());
    if (existing) {
      accountIdByName.set(name, existing.id!);
      accountIdByName.set(sample.accountName, existing.id!);
    } else {
      const id = await api.addAccount({
        name: sample.accountName,
        type: sample.accountType as any,
        institution: sample.institution,
        last4: sample.last4,
        source: sample.source,
        enabled: true,
        currentBalance: 0,
      });
      accountIdByName.set(name, id);
      accountIdByName.set(sample.accountName, id);
    }
  }

  // Create the import batch row.
  const batchId = await api.addImport({
    filename: preview.filename,
    source: preview.source!,
    importedAt: new Date().toISOString(),
    rowCount: preview.totalCount,
    newCount: forceImportDuplicates ? preview.totalCount : preview.newCount,
    duplicateCount: forceImportDuplicates ? 0 : preview.duplicateCount,
    contentHash: preview.contentHash,
  });
  const taxRules = await api.getTaxRules();
  
  // Pass 2: insert all non-duplicate transactions in one shot.
  const toInsert: Omit<Transaction, 'id'>[] = [];
  let skippedDuplicates = 0;
  const seenKeys = new Set<string>();
  
  for (const row of preview.rows) {
    if (row.duplicate && !forceImportDuplicates) {
      skippedDuplicates++;
      continue;
    }
    let dedupKey = row.dedupKey;
    if (forceImportDuplicates && row.duplicate) {
      dedupKey = `${row.dedupKey}#force-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    }
    // Guard against intra-batch dedup collisions (same key appearing twice in this file).
    if (seenKeys.has(dedupKey)) {
      skippedDuplicates++;
      continue;
    }
    seenKeys.add(dedupKey);
    const taxGuess = resolveTaxDeduction(row.parsed.description, row.category, row.merchantKey, taxRules);
    const resolvedAccountId =
      (row.parsed.fileAccountName && accountIdByName.get(row.parsed.fileAccountName))
      || accountIdByName.get(row.parsed.accountName)
      || (preview.targetAccountMap && row.parsed.fileAccountName && preview.targetAccountMap[row.parsed.fileAccountName])
      || (preview.targetAccountMap && preview.targetAccountMap[row.parsed.accountName])
      || (preview.targetAccountId && uniqueAccounts.size <= 1 ? preview.targetAccountId : undefined)
      || preview.targetAccountId!;

    toInsert.push({
      accountId: resolvedAccountId,
      date: row.parsed.date,
      description: row.parsed.description,
      amount: row.parsed.amount,
      rawCategory: row.parsed.rawCategory,
      category: row.category,
      source: row.parsed.source,
      merchantKey: row.merchantKey,
      userOverridden: false,
      dedupKey,
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
    await api.bulkAddTransactions(toInsert as Transaction[], true);
    imported = toInsert.length;
  }

  // Update account balances
  for (const [name, sample] of uniqueAccounts) {
    const accountId = accountIdByName.get(name) ?? preview.targetAccountId;
    if (!accountId) continue;
    const accountRows = preview.rows.filter((r) => r.parsed.accountName === name);
    const sortedRows = [...accountRows].sort((a, b) => b.parsed.date.localeCompare(a.parsed.date));
    const latestBalanceRow = sortedRows.find((r) => r.parsed.balance !== undefined);
    const importedBalance = latestBalanceRow?.parsed.balance;

    const targetAcc = accounts.find(a => a.id === accountId);
    const isCredit = (targetAcc?.type || sample.accountType) === 'credit';

    if (importedBalance !== undefined) {
      await api.updateAccount(accountId, { currentBalance: importedBalance });
    } else if (isCredit) {
      const allTxns = await api.getTransactions();
      const txns = allTxns.filter(t => t.accountId === accountId);
      const balance = txns.reduce((sum, t) => sum + t.amount, 0);
      await api.updateAccount(accountId, { currentBalance: balance });
    }
  }

  // Refresh the recurrence cache database-wide to account for the new data
  await refreshRecurrenceAll();
  
  return { imported, skippedDuplicates, batchId };
}
