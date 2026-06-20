import { useMemo } from 'react';
import type { AppDocument, Transaction, Category } from '../../types';

export function usePnL({
  derivedPreviewDoc,
  allTxns,
  allCats,
  selectedAuditCat,
  auditSearchQuery,
  auditPage,
  auditPageSize,
}: {
  derivedPreviewDoc: AppDocument | null;
  allTxns: Transaction[];
  allCats: Category[];
  selectedAuditCat: string;
  auditSearchQuery: string;
  auditPage: number;
  auditPageSize: number;
}) {
  // Derive matched transactions for active P&L scope
  const matchedPnlTxns = useMemo(() => {
    if (!derivedPreviewDoc || derivedPreviewDoc.metadata?.docType !== 'business_pnl') {
      return [];
    }
    const meta: any = derivedPreviewDoc.metadata;
    const start = meta.start || `${new Date().getFullYear()}-01-01`;
    const end = meta.end || `${new Date().getFullYear()}-12-31`;
    const resolvedCats = meta.resolvedCats || [];
    const resolvedAccts = meta.resolvedAccts || [];
    const searchVal = meta.search || '';
    const minPriceVal = meta.minPrice;
    const maxPriceVal = meta.maxPrice;

    return allTxns.filter(t => {
      if (t.date < start || t.date > end) return false;
      if (resolvedAccts.length > 0 && !resolvedAccts.includes(t.accountId)) return false;
      if (resolvedCats.length > 0 && !resolvedCats.some(c => c.toLowerCase() === t.category.toLowerCase())) return false;
      if (t.category.toLowerCase() === 'transfers') return false;

      if (searchVal) {
        const q = searchVal.toLowerCase();
        if (!t.description.toLowerCase().includes(q) && !t.merchantKey.toLowerCase().includes(q)) return false;
      }
      if (minPriceVal !== undefined) {
        if (Math.abs(t.amount) < minPriceVal) return false;
      }
      if (maxPriceVal !== undefined) {
        if (Math.abs(t.amount) > maxPriceVal) return false;
      }
      return true;
    });
  }, [allTxns, derivedPreviewDoc]);

  // Derive category types
  const categoryTypes = useMemo(() => {
    const types: Record<string, string> = {};
    for (const c of allCats) {
      types[c.name.toLowerCase()] = c.type;
    }
    return types;
  }, [allCats]);

  // Calculate live P&L summaries
  const pnlSummary = useMemo(() => {
    let revenue = 0;
    let expenses = 0;
    const catTotals: Record<string, number> = {};

    for (const t of matchedPnlTxns) {
      const catLower = t.category.toLowerCase();
      const type = categoryTypes[catLower] || 'spend';

      if (type === 'income') {
        const amt = t.amount;
        revenue += amt;
        catTotals[t.category] = (catTotals[t.category] || 0) + amt;
      } else {
        const amt = -t.amount;
        expenses += amt;
        catTotals[t.category] = (catTotals[t.category] || 0) + amt;
      }
    }

    const net = revenue - expenses;
    return { revenue, expenses, net, catTotals };
  }, [matchedPnlTxns, categoryTypes]);

  const revenueCats = useMemo(() => {
    return Object.keys(pnlSummary.catTotals).filter(catName => categoryTypes[catName.toLowerCase()] === 'income');
  }, [pnlSummary.catTotals, categoryTypes]);

  const expenseCats = useMemo(() => {
    return Object.keys(pnlSummary.catTotals).filter(catName => categoryTypes[catName.toLowerCase()] !== 'income');
  }, [pnlSummary.catTotals, categoryTypes]);

  // Audited items query
  const auditedTxns = useMemo(() => {
    return matchedPnlTxns.filter(t => {
      if (selectedAuditCat !== 'All' && t.category !== selectedAuditCat) {
        return false;
      }
      if (auditSearchQuery) {
        const q = auditSearchQuery.toLowerCase();
        return t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [matchedPnlTxns, selectedAuditCat, auditSearchQuery]);

  const paginatedAuditTxns = useMemo(() => {
    return auditedTxns.slice(auditPage * auditPageSize, auditPage * auditPageSize + auditPageSize);
  }, [auditedTxns, auditPage, auditPageSize]);

  return {
    pnlSummary,
    revenueCats,
    expenseCats,
    auditedTxns,
    paginatedAuditTxns,
  };
}
