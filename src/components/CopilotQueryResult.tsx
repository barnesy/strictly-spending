import { db } from "../db/drizzle";
import * as schema from "../db/schema";
import { eq, between } from 'drizzle-orm';
import { useState, useEffect } from 'react';
import { Box, Typography, Stack, Chip, Button } from '@mui/material';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import FilterListIcon from '@mui/icons-material/FilterList';

import RecategorizeDialog from './RecategorizeDialog';
import { useFilters } from '../store';

import type { SubscriptionAlerts, SpendingAnomalies } from '../copilotAnalytics';
import type { AccessibilityReport } from '../accessibilityAuditor';

import { QueryResultSubscriptionAlerts } from './CopilotQueryResult/QueryResultSubscriptionAlerts';
import { QueryResultSpendingAnomalies } from './CopilotQueryResult/QueryResultSpendingAnomalies';
import { QueryResultAuditAccessibility } from './CopilotQueryResult/QueryResultAuditAccessibility';
import { QueryResultQueryData } from './CopilotQueryResult/QueryResultQueryData';
import { QueryResultTransactionModal } from './CopilotQueryResult/QueryResultTransactionModal';
import { formatDateRange } from './CopilotQueryResult/utils';

export interface QueryDataMetrics {
  totalSpend: number;
  totalIncome: number;
  spendCount: number;
  incomeCount: number;
  spendAverage: number;
  incomeAverage: number;
  totalBudget: number;
  numMonths: number;
  scaledBudget: number;
  difference: number;
  isOverBudget: boolean;
  budgetStatusText: string;
  resolvedCategoryNames: string[];
  isAll: boolean;
  transactions?: {
    id?: number;
    accountId?: number;
    date: string;
    description: string;
    amount: number;
    category: string;
    source?: string;
  }[];
}

interface CopilotQueryResultProps {
  action?: 'query_data' | 'subscription_alerts' | 'spending_anomalies' | 'audit_accessibility';
  categories: string[];
  customStart: string;
  customEnd: string;
  accounts?: (string | number)[];
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  metrics?: QueryDataMetrics;
  alerts?: SubscriptionAlerts;
  anomalies?: SpendingAnomalies;
  accessibilityReport?: AccessibilityReport;
  onApplyFilters: () => void;
}

export default function CopilotQueryResult({
  action = 'query_data',
  categories,
  customStart,
  customEnd,
  accounts = [],
  search = '',
  minPrice,
  maxPrice,
  metrics,
  alerts,
  anomalies,
  accessibilityReport,
  onApplyFilters,
}: CopilotQueryResultProps) {
  const [showReceipt, setShowReceipt] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<any | null>(null);
  const [showRecategorize, setShowRecategorize] = useState(false);
  const [receiptTxns, setReceiptTxns] = useState<any[]>([]);
  const [loadingReceipt, setLoadingReceipt] = useState(false);

  const storeEarliest = useFilters((s) => s.earliestTransactionDate);
  const storeLatest = useFilters((s) => s.latestTransactionDate);

  const {
    totalSpend = 0,
    totalIncome = 0,
    spendCount = 0,
    incomeCount = 0,
    scaledBudget = 0,
    resolvedCategoryNames = [],
    isAll = false,
  } = metrics || {};

  const budgetBreakdowns = (metrics as any)?.budgetBreakdowns || null;

  useEffect(() => {
    if (showReceipt && action === 'query_data') {
      setLoadingReceipt(true);
      const startStr = customStart || storeEarliest || '2000-01-01';
      const endStr = customEnd || storeLatest || new Date().toISOString().slice(0, 10);
      
      db.select().from(schema.transactions).where(between(schema.transactions.date, startStr, endStr)).then(txns => {
        const filtered = txns.filter(t => {
          if (accounts.length > 0 && !accounts.includes('all')) {
            if (!accounts.includes(t.accountId)) return false;
          }
          if (search) {
            const q = search.toLowerCase();
            if (!t.description.toLowerCase().includes(q) && !t.merchantKey.toLowerCase().includes(q)) return false;
          }
          if (minPrice !== undefined && Math.abs(t.amount) < minPrice) return false;
          if (maxPrice !== undefined && Math.abs(t.amount) > maxPrice) return false;
          if (categories.includes('all') || categories.length === 0) return true;
          
          const resCats = metrics?.resolvedCategoryNames || categories;
          return resCats.some(c => c.toLowerCase() === t.category.toLowerCase());
        });
        setReceiptTxns(filtered);
        setLoadingReceipt(false);
      });
    }
  }, [showReceipt, customStart, customEnd, accounts.join(','), search, minPrice, maxPrice, categories.join(','), metrics?.resolvedCategoryNames?.join(','), action, storeEarliest, storeLatest]);

  const categoriesToDisplay =
    action === 'subscription_alerts'
      ? ['Subscriptions']
      : isAll
      ? ['All Categories']
      : resolvedCategoryNames.length > 0
      ? resolvedCategoryNames
      : categories.map((c) => c.charAt(0).toUpperCase() + c.slice(1));

  const budgetProgress = scaledBudget > 0 ? Math.round((totalSpend / scaledBudget) * 100) : 0;
  const showSpend = spendCount > 0 || (totalSpend > 0) || (resolvedCategoryNames.length > 0 && !isAll && categories.some(c => c.toLowerCase() !== 'income'));
  const showIncome = incomeCount > 0 || (totalIncome > 0) || (resolvedCategoryNames.length > 0 && !isAll && categories.some(c => c.toLowerCase() === 'income'));

  return (
    <Box
      className="copilot-query-result-card"
      sx={{
        width: '100%',
        p: 2,
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        boxShadow: '0 4px 20px 0 rgba(0,0,0,0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          boxShadow: '0 6px 24px 0 rgba(0,0,0,0.08)',
        },
      }}
    >
      {/* Header Info */}
      {action !== 'audit_accessibility' && (
        <Box>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
            <CalendarTodayIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
              {formatDateRange(customStart, customEnd, action)}
            </Typography>
          </Stack>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
            {categoriesToDisplay.map((cat, idx) => (
              <Chip
                key={idx}
                label={cat}
                size="small"
                variant="outlined"
                sx={{
                  fontSize: '11px',
                  fontWeight: 600,
                  height: '22px',
                  borderColor: cat === 'Income' ? (theme) => theme.palette.mode === 'dark' ? 'success.main' : 'success.light' : 'divider',
                  bgcolor: cat === 'Income' ? (theme) => theme.palette.mode === 'dark' ? 'rgba(46, 125, 50, 0.2)' : 'success.50' : 'transparent',
                  color: cat === 'Income' ? (theme) => theme.palette.mode === 'dark' ? 'success.light' : 'success.dark' : 'text.primary',
                }}
              />
            ))}
          </Box>
        </Box>
      )}

      {action === 'subscription_alerts' && <QueryResultSubscriptionAlerts alerts={alerts} />}
      {action === 'spending_anomalies' && <QueryResultSpendingAnomalies anomalies={anomalies} setSelectedTxn={setSelectedTxn} />}
      {action === 'audit_accessibility' && <QueryResultAuditAccessibility accessibilityReport={accessibilityReport} />}
      
      {action === 'query_data' && metrics && (
        <QueryResultQueryData
          metrics={metrics}
          showSpend={showSpend}
          showIncome={showIncome}
          budgetBreakdowns={budgetBreakdowns}
          showReceipt={showReceipt}
          setShowReceipt={setShowReceipt}
          loadingReceipt={loadingReceipt}
          receiptTxns={receiptTxns}
          setSelectedTxn={setSelectedTxn}
          budgetProgress={budgetProgress}
        />
      )}

      {/* Apply Filters Trigger */}
      {action !== 'audit_accessibility' && (
        <Button
          variant="contained"
          size="small"
          startIcon={<FilterListIcon />}
          onClick={onApplyFilters}
          sx={{
            borderRadius: 1,
            textTransform: 'none',
            fontWeight: 600,
            boxShadow: 'none',
            bgcolor: 'primary.main',
            '&:hover': {
              bgcolor: 'primary.dark',
              boxShadow: 'none',
            },
            mt: 0.5,
          }}
        >
          Apply filters to Dashboard
        </Button>
      )}

      {selectedTxn && (
        <QueryResultTransactionModal
          selectedTxn={selectedTxn}
          setSelectedTxn={setSelectedTxn}
          showRecategorize={showRecategorize}
          setShowRecategorize={setShowRecategorize}
        />
      )}

      {showRecategorize && selectedTxn && (
        <RecategorizeDialog
          txn={selectedTxn}
          onClose={async () => {
            setShowRecategorize(false);
            const updated = await (await db.select().from(schema.transactions).where(eq(schema.transactions.id, selectedTxn.id)))[0];
            if (updated) {
              setSelectedTxn(updated);
            } else {
              setSelectedTxn(null);
            }
          }}
        />
      )}
    </Box>
  );
}
