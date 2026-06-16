import { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Grid,
  Chip,
  LinearProgress,
  CircularProgress,
  Button,
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FilterListIcon from '@mui/icons-material/FilterList';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import type { SubscriptionAlerts, SpendingAnomalies } from '../copilotAnalytics';
import type { AccessibilityReport } from '../accessibilityAuditor';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import RecategorizeDialog from './RecategorizeDialog';

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
  metrics,
  alerts,
  anomalies,
  accessibilityReport,
  onApplyFilters,
}: CopilotQueryResultProps) {
  const [showReceipt, setShowReceipt] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<any | null>(null);
  const [showRecategorize, setShowRecategorize] = useState(false);

  const dbAccounts = useLiveQuery(() => db.accounts.toArray(), []);
  const dbCategories = useLiveQuery(() => db.categories.toArray(), []);

  const {
    totalSpend = 0,
    totalIncome = 0,
    spendCount = 0,
    incomeCount = 0,
    spendAverage = 0,
    incomeAverage = 0,
    scaledBudget = 0,
    difference = 0,
    isOverBudget = false,
    resolvedCategoryNames = [],
    isAll = false,
  } = metrics || {};

  // Group transactions by year and month for budget breakdown
  const budgetBreakdowns = useMemo(() => {
    if (!metrics || !metrics.transactions || metrics.transactions.length === 0 || scaledBudget <= 0) {
      return null;
    }

    const txns = metrics.transactions;
    const monthlyBudget = metrics.totalBudget;

    const startStr = customStart || txns[txns.length - 1]?.date || '2000-01-01';
    const endStr = customEnd || txns[0]?.date || new Date().toISOString().slice(0, 10);

    const [sy, sm] = startStr.split('-').map(Number);
    const [ey, em] = endStr.split('-').map(Number);

    if (isNaN(sy) || isNaN(sm) || isNaN(ey) || isNaN(em)) {
      return null;
    }

    const monthsList: { year: number; month: number; key: string; label: string }[] = [];
    let curY = sy;
    let curM = sm;
    while (curY < ey || (curY === ey && curM <= em)) {
      const date = new Date(curY, curM - 1, 1);
      const label = date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
      monthsList.push({
        year: curY,
        month: curM,
        key: `${curY}-${String(curM).padStart(2, '0')}`,
        label
      });
      curM++;
      if (curM > 12) {
        curM = 1;
        curY++;
      }
    }

    const monthlyData = monthsList.map(m => {
      const monthTxns = txns.filter(t => {
        const [ty, tm] = t.date.split('-').map(Number);
        return ty === m.year && tm === m.month;
      });

      let spent = 0;
      for (const t of monthTxns) {
        const isIncome = t.category.toLowerCase() === 'income';
        if (!isIncome) {
          spent += -t.amount;
        }
      }

      let budget = monthlyBudget;
      const startDay = new Date(startStr + 'T00:00:00');
      const endDay = new Date(endStr + 'T00:00:00');
      const totalDays = new Date(m.year, m.month, 0).getDate();
      const mStart = new Date(m.year, m.month - 1, 1, 0, 0, 0);
      const mEnd = new Date(m.year, m.month - 1, totalDays, 0, 0, 0);
      
      const effectiveStart = startDay > mStart ? startDay : mStart;
      const effectiveEnd = endDay < mEnd ? endDay : mEnd;
      
      if (effectiveStart <= effectiveEnd) {
        const diffDays = Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        if (diffDays < totalDays) {
          budget = monthlyBudget * (diffDays / totalDays);
        }
      } else {
        budget = 0;
      }

      return {
        ...m,
        spent: Math.max(0, spent),
        budget,
        progress: budget > 0 ? Math.round((spent / budget) * 100) : 0,
        isOver: spent > budget
      };
    }).filter(d => d.budget > 0 || d.spent > 0);

    const yearlyMap = new Map<number, { spent: number; budget: number }>();
    for (const m of monthlyData) {
      const current = yearlyMap.get(m.year) || { spent: 0, budget: 0 };
      yearlyMap.set(m.year, {
        spent: current.spent + m.spent,
        budget: current.budget + m.budget
      });
    }

    const yearlyData = Array.from(yearlyMap.entries()).map(([year, data]) => {
      return {
        year,
        spent: data.spent,
        budget: data.budget,
        progress: data.budget > 0 ? Math.round((data.spent / data.budget) * 100) : 0,
        isOver: data.spent > data.budget
      };
    }).sort((a, b) => b.year - a.year);

    return {
      monthly: monthlyData,
      yearly: yearlyData
    };
  }, [metrics, customStart, customEnd, scaledBudget]);

  const formatCurrency = (val: number) =>
    `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatDateRange = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) {
      if (action === 'subscription_alerts') {
        return 'All-Time Subscription Monitoring';
      }
      return 'All-Time History';
    }
    try {
      const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
      const start = new Date(startStr + 'T00:00:00');
      const end = new Date(endStr + 'T00:00:00');
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error();
      }
      return `${start.toLocaleDateString(undefined, options)} - ${end.toLocaleDateString(undefined, options)}`;
    } catch {
      return `${startStr} to ${endStr}`;
    }
  };

  const categoriesToDisplay =
    action === 'subscription_alerts'
      ? ['Subscriptions']
      : isAll
      ? ['All Categories']
      : resolvedCategoryNames.length > 0
      ? resolvedCategoryNames
      : categories.map((c) => c.charAt(0).toUpperCase() + c.slice(1));

  // Compute budget progress percentage
  const budgetProgress = scaledBudget > 0 ? Math.round((totalSpend / scaledBudget) * 100) : 0;

  // Determine query mode
  const showSpend = spendCount > 0 || (totalSpend > 0) || (resolvedCategoryNames.length > 0 && !isAll && categories.some(c => c.toLowerCase() !== 'income'));
  const showIncome = incomeCount > 0 || (totalIncome > 0) || (resolvedCategoryNames.length > 0 && !isAll && categories.some(c => c.toLowerCase() === 'income'));

  return (
    <Box
      className="copilot-query-result-card"
      sx={{
        width: '100%',
        p: 2,
        borderRadius: 3,
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
              {formatDateRange(customStart, customEnd)}
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
                  borderColor: cat === 'Income' ? 'success.light' : 'divider',
                  bgcolor: cat === 'Income' ? 'success.50' : 'transparent',
                  color: cat === 'Income' ? 'success.dark' : 'text.primary',
                }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Action: subscription_alerts */}
      {action === 'subscription_alerts' && alerts && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {alerts.priceSpikes.length === 0 &&
           alerts.duplicateCharges.length === 0 &&
           alerts.overlappingSubscriptions.length === 0 ? (
            <Box
              sx={{
                p: 2.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'success.100',
                bgcolor: 'rgba(46, 125, 50, 0.02)',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <CheckCircleIcon color="success" sx={{ fontSize: 32 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'success.dark' }}>
                All Clear!
              </Typography>
              <Typography variant="body2" color="text.secondary">
                No subscription price spikes, duplicate charges, or overlapping services detected in your history.
              </Typography>
            </Box>
          ) : (
            <>
              {/* Price Spikes */}
              {alerts.priceSpikes.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
                    PRICE INCREASE DETECTED
                  </Typography>
                  <Stack spacing={1}>
                    {alerts.priceSpikes.map((spike, idx) => (
                      <Box
                        key={idx}
                        sx={{
                          p: 1.2,
                          borderRadius: 2,
                          border: '1px solid',
                          borderColor: 'error.100',
                          bgcolor: 'rgba(239, 83, 80, 0.02)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                            {spike.merchantName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Increased on {spike.date}
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                          <Typography variant="body2" color="error.dark" sx={{ fontWeight: 700 }}>
                            {formatCurrency(spike.newPrice)}/mo
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            was {formatCurrency(spike.oldPrice)} (+{Math.round(spike.percentageChange)}%)
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}

              {/* Duplicate Billing */}
              {alerts.duplicateCharges.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
                    POTENTIAL DOUBLE-BILLING / DUPLICATES
                  </Typography>
                  <Stack spacing={1}>
                    {alerts.duplicateCharges.map((dup, idx) => (
                      <Box
                        key={idx}
                        sx={{
                          p: 1.2,
                          borderRadius: 2,
                          border: '1px solid',
                          borderColor: 'warning.100',
                          bgcolor: 'rgba(237, 108, 2, 0.02)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                            {dup.merchantName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Charged twice: {dup.dates.map(d => d.slice(5)).join(' & ')}
                          </Typography>
                        </Box>
                        <Typography variant="body2" color="warning.dark" sx={{ fontWeight: 700 }}>
                          {formatCurrency(dup.amount)} each
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}

              {/* Overlapping Subscriptions */}
              {alerts.overlappingSubscriptions.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
                    OVERLAPPING SERVICE BUNDLES
                  </Typography>
                  <Stack spacing={1}>
                    {alerts.overlappingSubscriptions.map((overlap, idx) => (
                      <Box
                        key={idx}
                        sx={{
                          p: 1.2,
                          borderRadius: 2,
                          border: '1px solid',
                          borderColor: 'divider',
                          bgcolor: 'transparent',
                        }}
                      >
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                            {overlap.groupName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                            Total: {formatCurrency(overlap.totalEstMonthly)}/mo
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          Active: {overlap.merchants.join(', ')}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}
            </>
          )}
        </Box>
      )}

      {/* Action: spending_anomalies */}
      {action === 'spending_anomalies' && anomalies && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {anomalies.categorySpikes.length === 0 && anomalies.outliers.length === 0 ? (
            <Box
              sx={{
                p: 2.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'success.100',
                bgcolor: 'rgba(46, 125, 50, 0.02)',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <CheckCircleIcon color="success" sx={{ fontSize: 32 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'success.dark' }}>
                No Anomalies Found!
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Your spending in these categories matches baseline levels, and no outlier transactions were found.
              </Typography>
            </Box>
          ) : (
            <>
              {/* Category Spikes */}
              {anomalies.categorySpikes.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
                    CATEGORY SPENDING SPIKES
                  </Typography>
                  <Stack spacing={1}>
                    {anomalies.categorySpikes.map((spike, idx) => (
                      <Box
                        key={idx}
                        sx={{
                          p: 1.2,
                          borderRadius: 2,
                          border: '1px solid',
                          borderColor: 'error.100',
                          bgcolor: 'rgba(239, 83, 80, 0.02)',
                        }}
                      >
                        <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                            {spike.category}
                          </Typography>
                          <Typography variant="body2" color="error.dark" sx={{ fontWeight: 700 }}>
                            +{Math.round(spike.percentageChange)}% Spike
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          Current rate: {formatCurrency(spike.currentPeriodSpend * (1 / spike.durationMonths))}/mo (vs baseline {formatCurrency(spike.baselineMonthlySpend)}/mo)
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}

              {/* Outlier Transactions */}
              {anomalies.outliers.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
                    OUTLIER / LARGE TRANSACTIONS
                  </Typography>
                  <Stack spacing={1}>
                    {anomalies.outliers.map((outlier, idx) => (
                      <Box
                        key={idx}
                        sx={{
                          p: 1.2,
                          borderRadius: 2,
                          border: '1px solid',
                          borderColor: 'warning.100',
                          bgcolor: 'rgba(237, 108, 2, 0.02)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                            {outlier.description}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {outlier.date} | {outlier.category}
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                          <Typography variant="body2" color="warning.dark" sx={{ fontWeight: 700 }}>
                            {formatCurrency(outlier.amount)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {outlier.multiplier.toFixed(1)}x category avg
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}
            </>
          )}
        </Box>
      )}

      {/* Action: audit_accessibility */}
      {action === 'audit_accessibility' && accessibilityReport && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Score Circle & Overview */}
          <Stack direction="row" spacing={2.5} alignItems="center" sx={{ pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
              <CircularProgress
                variant="determinate"
                value={accessibilityReport.score}
                size={64}
                thickness={5}
                color={
                  accessibilityReport.score >= 90
                    ? 'success'
                    : accessibilityReport.score >= 70
                    ? 'warning'
                    : 'error'
                }
              />
              <Box
                sx={{
                  top: 0,
                  left: 0,
                  bottom: 0,
                  right: 0,
                  position: 'absolute',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Typography variant="body2" component="div" sx={{ fontWeight: 800, color: 'text.primary', fontSize: 13 }}>
                  {accessibilityReport.score}
                </Typography>
              </Box>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                DOM Accessibility Score
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                URL: <code>{accessibilityReport.path}</code>
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  label={`${accessibilityReport.issues.filter(i => i.severity === 'error').length} Errors`}
                  size="small"
                  color="error"
                  variant="outlined"
                  sx={{ height: 18, fontSize: 9.5, fontWeight: 600 }}
                />
                <Chip
                  label={`${accessibilityReport.issues.filter(i => i.severity === 'warning').length} Warnings`}
                  size="small"
                  color="warning"
                  variant="outlined"
                  sx={{ height: 18, fontSize: 9.5, fontWeight: 600 }}
                />
              </Stack>
            </Box>
          </Stack>

          {/* Critical Issues & Remediations */}
          {accessibilityReport.issues.length > 0 ? (
            <Box>
              <Typography variant="caption" color="error.dark" sx={{ fontWeight: 700, display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Identified Violations & Fixes ({accessibilityReport.issues.length})
              </Typography>
              <Stack spacing={1} sx={{ maxHeight: 220, overflowY: 'auto', pr: 0.5 }}>
                {accessibilityReport.issues.map((iss, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      p: 1.2,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: iss.severity === 'error' ? 'error.100' : 'warning.100',
                      bgcolor: iss.severity === 'error' ? 'rgba(239, 83, 80, 0.015)' : 'rgba(237, 108, 2, 0.015)',
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 0.5 }}>
                      {iss.severity === 'error' ? (
                        <ErrorIcon color="error" sx={{ fontSize: 16, mt: 0.25 }} />
                      ) : (
                        <WarningIcon color="warning" sx={{ fontSize: 16, mt: 0.25 }} />
                      )}
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', display: 'block' }}>
                          {iss.issue}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontFamily: 'monospace' }}>
                          Element: {iss.element}
                        </Typography>
                        <Typography variant="caption" color="text.primary" sx={{ display: 'block', fontStyle: 'italic', bgcolor: 'grey.50', p: 0.5, borderRadius: 0.5, fontSize: 9.5 }}>
                          Fix: {iss.suggestion}
                        </Typography>
                      </Box>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </Box>
          ) : (
            <Box
              sx={{
                p: 2.5,
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: 'success.100',
                bgcolor: 'rgba(46, 125, 50, 0.02)',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <CheckCircleIcon color="success" sx={{ fontSize: 32 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'success.dark' }}>
                Perfect Accessibility!
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
                No landmarks skipped, heading hierarchy checks passed, and all analyzed interactive buttons, inputs, and links have correct accessible names.
              </Typography>
            </Box>
          )}

          {/* Structural Details Accordions */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Accordion variant="outlined" sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 18 }} />} sx={{ py: 0, minHeight: 32, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                  Heading Structure ({accessibilityReport.headings.length})
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 1.5, pt: 0, borderTop: '1px solid', borderColor: 'divider' }}>
                {accessibilityReport.headings.length === 0 ? (
                  <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    No heading tags found on page.
                  </Typography>
                ) : (
                  <Stack spacing={0.5} sx={{ maxHeight: 120, overflowY: 'auto' }}>
                    {accessibilityReport.headings.map((h, idx) => (
                      <Stack key={idx} direction="row" spacing={1} alignItems="center">
                        <Chip
                          label={`H${h.level}`}
                          size="small"
                          color={h.valid ? 'primary' : 'warning'}
                          sx={{ height: 16, fontSize: 8.5, fontWeight: 700, px: 0.25 }}
                        />
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', textDecoration: h.valid ? 'none' : 'line-through' }}>
                          {h.text || '<empty>'}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </AccordionDetails>
            </Accordion>

            <Accordion variant="outlined" sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 18 }} />} sx={{ py: 0, minHeight: 32, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                  Accessibility Landmarks ({accessibilityReport.landmarks.length})
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 1.5, pt: 0, borderTop: '1px solid', borderColor: 'divider' }}>
                {accessibilityReport.landmarks.length === 0 ? (
                  <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    No landmark structures parsed on page.
                  </Typography>
                ) : (
                  <Stack spacing={0.5} sx={{ maxHeight: 120, overflowY: 'auto' }}>
                    {accessibilityReport.landmarks.map((l, idx) => (
                      <Typography key={idx} variant="caption" sx={{ display: 'block', fontSize: 10.5 }}>
                        <strong>{l.tagName}</strong> (role: <code>{l.role}</code>) {l.label ? `[Label: "${l.label}"]` : ''}
                      </Typography>
                    ))}
                  </Stack>
                )}
              </AccordionDetails>
            </Accordion>

            <Accordion variant="outlined" sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 18 }} />} sx={{ py: 0, minHeight: 32, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                  Interactive Controls Check ({accessibilityReport.interactiveElements.filter(e => e.accessible).length} parsed)
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 1.5, pt: 0, borderTop: '1px solid', borderColor: 'divider' }}>
                <Stack spacing={0.5} sx={{ maxHeight: 140, overflowY: 'auto' }}>
                  {accessibilityReport.interactiveElements.map((el, idx) => (
                    <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="caption" sx={{ fontSize: 10 }}>
                        &lt;{el.tagName}&gt; <code>{el.text}</code> {el.label ? `[Label: ${el.label}]` : ''}
                      </Typography>
                      <Chip
                        label={el.accessible ? 'Valid' : 'Invalid'}
                        size="small"
                        color={el.accessible ? 'success' : 'error'}
                        variant="outlined"
                        sx={{ height: 14, fontSize: 8, px: 0 }}
                      />
                    </Box>
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          </Box>
        </Box>
      )}

      {/* Action: query_data (Standard View) */}
      {action === 'query_data' && (
        <>
          {/* Metric Widgets */}
          <Grid container spacing={1.5}>
            {showSpend && (
              <Grid size={showIncome ? 6 : 12}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'error.100',
                    bgcolor: 'rgba(239, 83, 80, 0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                    <TrendingDownIcon sx={{ fontSize: 16, color: 'error.main' }} />
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                      TOTAL SPENT
                    </Typography>
                  </Stack>
                  <Typography variant="h5" color="error.dark" sx={{ fontWeight: 700, mb: 0.5 }}>
                    {formatCurrency(totalSpend)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {spendCount} transaction{spendCount === 1 ? '' : 's'}
                  </Typography>
                  {spendCount > 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.2 }}>
                      Avg: {formatCurrency(spendAverage)}
                    </Typography>
                  )}
                </Box>
              </Grid>
            )}

            {showIncome && (
              <Grid size={showSpend ? 6 : 12}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'success.100',
                    bgcolor: 'rgba(46, 125, 50, 0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                    <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main' }} />
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                      TOTAL INCOME
                    </Typography>
                  </Stack>
                  <Typography variant="h5" color="success.dark" sx={{ fontWeight: 700, mb: 0.5 }}>
                    {formatCurrency(totalIncome)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {incomeCount} transaction{incomeCount === 1 ? '' : 's'}
                  </Typography>
                  {incomeCount > 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.2 }}>
                      Avg: {formatCurrency(incomeAverage)}
                    </Typography>
                  )}
                </Box>
              </Grid>
            )}
          </Grid>

          {/* Budget Status Widget */}
          {showSpend && scaledBudget > 0 && (
            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: isOverBudget ? 'error.100' : 'success.100',
                bgcolor: isOverBudget ? 'rgba(239, 83, 80, 0.02)' : 'rgba(46, 125, 50, 0.02)',
              }}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  {isOverBudget ? (
                    <ErrorIcon color="error" sx={{ fontSize: 16 }} />
                  ) : (
                    <CheckCircleIcon color="success" sx={{ fontSize: 16 }} />
                  )}
                  <Typography variant="caption" sx={{ fontWeight: 600, color: isOverBudget ? 'error.dark' : 'success.dark' }}>
                    {isOverBudget ? 'Over Budget' : 'Within Budget'}
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                  {budgetProgress}% consumed
                </Typography>
              </Stack>

              <LinearProgress
                variant="determinate"
                value={Math.min(100, budgetProgress)}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  bgcolor: isOverBudget ? 'error.50' : 'success.50',
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 3,
                    background: isOverBudget
                      ? 'linear-gradient(90deg, #ff1744 0%, #ff5252 100%)'
                      : 'linear-gradient(90deg, #2e7d32 0%, #4caf50 100%)',
                  },
                  mb: 1,
                }}
              />

              <Stack direction="row" justifyContent="space-between" sx={{ fontSize: '11px', color: 'text.secondary' }}>
                <Typography variant="inherit">
                  Spent: <strong>{formatCurrency(totalSpend)}</strong>
                </Typography>
                <Typography variant="inherit">
                  Budget: <strong>{formatCurrency(scaledBudget)}</strong>
                </Typography>
              </Stack>

              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontSize: '10px', fontStyle: 'italic' }}>
                {isOverBudget
                  ? `You are over budget by ${formatCurrency(Math.abs(difference))}.`
                  : `You have ${formatCurrency(difference)} remaining in this period's budget.`}
              </Typography>

              {budgetBreakdowns && budgetBreakdowns.monthly.length > 1 && (
                <Accordion
                  variant="outlined"
                  sx={{
                    mt: 1.5,
                    borderRadius: 1.5,
                    border: '1px solid rgba(0,0,0,0.06)',
                    bgcolor: 'background.paper',
                    '&:before': { display: 'none' },
                    overflow: 'hidden',
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}
                    sx={{
                      minHeight: 28,
                      py: 0,
                      px: 1.5,
                      '& .MuiAccordionSummary-content': { my: 0.75 }
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                      Period Breakdowns (Monthly & Yearly)
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ p: 1.5, pt: 0, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                      {/* Yearly Summary */}
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 0.75, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                          Yearly Summary
                        </Typography>
                        <Stack spacing={1}>
                          {budgetBreakdowns.yearly.map((y) => (
                            <Box
                              key={y.year}
                              sx={{
                                p: 1,
                                borderRadius: 1,
                                border: '1px solid',
                                borderColor: y.isOver ? 'error.100' : 'success.100',
                                bgcolor: y.isOver ? 'rgba(239, 83, 80, 0.02)' : 'rgba(46, 125, 50, 0.02)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                            >
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {y.year}
                              </Typography>
                              <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="caption" sx={{ fontWeight: 600, color: y.isOver ? 'error.dark' : 'success.dark', display: 'block' }}>
                                  {y.isOver ? 'Over' : 'Within'} Budget ({y.progress}%)
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  Spent: <strong>{formatCurrency(y.spent)}</strong> of {formatCurrency(y.budget)}
                                </Typography>
                              </Box>
                            </Box>
                          ))}
                        </Stack>
                      </Box>

                      {/* Monthly Breakdown */}
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 0.75, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                          Monthly Breakdown
                        </Typography>
                        <Stack spacing={1} sx={{ maxHeight: 180, overflowY: 'auto', pr: 0.5 }}>
                          {budgetBreakdowns.monthly.map((m) => (
                            <Box
                              key={m.key}
                              sx={{
                                p: 1,
                                borderRadius: 1,
                                border: '1px solid rgba(0,0,0,0.04)',
                                bgcolor: 'grey.50',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                            >
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {m.label}
                              </Typography>
                              <Box sx={{ textAlign: 'right' }}>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontWeight: 600,
                                    color: m.isOver ? 'error.main' : 'success.main',
                                    display: 'block'
                                  }}
                                >
                                  {formatCurrency(m.spent)} / {formatCurrency(m.budget)} ({m.progress}%)
                                </Typography>
                              </Box>
                            </Box>
                          ))}
                        </Stack>
                      </Box>
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              )}
            </Box>
          )}

          {/* Receipt Toggle Button */}
          {metrics && metrics.transactions && metrics.transactions.length > 0 && (
            <Box sx={{ mt: 0.5 }}>
              <Button
                variant="outlined"
                size="small"
                fullWidth
                onClick={() => setShowReceipt(!showReceipt)}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  color: 'text.secondary',
                  borderColor: 'divider',
                  '&:hover': {
                    borderColor: 'text.primary',
                    bgcolor: 'grey.50',
                  },
                }}
              >
                {showReceipt ? 'Hide Receipt Details' : `Show Receipt Details (${metrics.transactions.length})`}
              </Button>

              {showReceipt && (
                <Box
                  sx={{
                    mt: 1.5,
                    p: 2,
                    borderRadius: 2,
                    bgcolor: '#FAF8F5',
                    border: '1px dashed #ccc',
                    fontFamily: 'Courier New, Courier, monospace',
                    color: '#333',
                    fontSize: '12px',
                    lineHeight: 1.4,
                  }}
                >
                  {/* Receipt Title */}
                  <Box sx={{ textAlign: 'center', mb: 1, fontWeight: 'bold' }}>
                    *** TRANSACTION RECEIPT ***
                  </Box>
                  <Box sx={{ borderTop: '1px dashed #ccc', my: 1 }} />

                  {/* Scrollable list of items */}
                  <Box sx={{ maxHeight: '180px', overflowY: 'auto', pr: 0.5 }}>
                    {metrics.transactions.map((t, idx) => {
                      const isIncome = t.category.toLowerCase() === 'income';
                      // In spending categories, negative numbers are spending, positive are refunds
                      const isRefund = t.amount > 0 && t.category.toLowerCase() !== 'income';
                      
                      let displayAmt = '';
                      if (isIncome) {
                        displayAmt = `+${formatCurrency(t.amount)}`;
                      } else if (isRefund) {
                        displayAmt = `-${formatCurrency(t.amount)}`; // printed as negative subtraction on receipt
                      } else {
                        displayAmt = ` ${formatCurrency(Math.abs(t.amount))}`; // normal spent
                      }

                      const dateStr = t.date.slice(5); // MM-DD format
                      const cleanDesc = t.description.length > 18
                        ? t.description.slice(0, 15) + '...'
                        : t.description.padEnd(18);

                      return (
                        <Box
                          key={idx}
                          onClick={() => setSelectedTxn(t)}
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            mb: 0.5,
                            whiteSpace: 'pre',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            px: 1,
                            py: 0.25,
                            mx: -1,
                            transition: 'background-color 150ms ease, transform 100ms ease',
                            '&:hover': {
                              bgcolor: 'rgba(0, 0, 0, 0.04)',
                              transform: 'scale(1.01)',
                            },
                            '&:active': {
                              transform: 'scale(0.99)',
                            }
                          }}
                        >
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit', color: 'text.secondary' }}>
                              {dateStr}
                            </Typography>
                            <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit', fontWeight: isRefund ? 'bold' : 'normal' }}>
                              {cleanDesc}{isRefund ? ' (Refund)' : ''}
                            </Typography>
                          </Box>
                          <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit', color: isRefund ? 'success.main' : 'inherit' }}>
                            {displayAmt}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>

                  <Box sx={{ borderTop: '1px dashed #ccc', my: 1 }} />

                  {/* Calculations Block */}
                  {(() => {
                    // Calculate subtotals
                    let expenseSubtotal = 0;
                    let refundSubtotal = 0;
                    let incomeSubtotal = 0;

                    for (const t of metrics.transactions || []) {
                      const isIncome = t.category.toLowerCase() === 'income';
                      const isRefund = t.amount > 0 && t.category.toLowerCase() !== 'income';
                      
                      if (isIncome) {
                        incomeSubtotal += t.amount;
                      } else if (isRefund) {
                        refundSubtotal += t.amount;
                      } else {
                        expenseSubtotal += Math.abs(t.amount);
                      }
                    }

                    return (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {expenseSubtotal > 0 && (
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit' }}>SUBTOTAL (SPEND)</Typography>
                            <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit' }}>{formatCurrency(expenseSubtotal)}</Typography>
                          </Box>
                        )}
                        {refundSubtotal > 0 && (
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'success.dark' }}>
                            <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit' }}>REFUNDS/CREDITS</Typography>
                            <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit' }}>-{formatCurrency(refundSubtotal)}</Typography>
                          </Box>
                        )}
                        {incomeSubtotal > 0 && (
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit' }}>SUBTOTAL (INCOME)</Typography>
                            <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit' }}>{formatCurrency(incomeSubtotal)}</Typography>
                          </Box>
                        )}
                        <Box sx={{ borderTop: '2px double #ccc', my: 0.5 }} />
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                          <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 'bold' }}>
                            {incomeSubtotal > 0 && expenseSubtotal === 0 ? 'NET RECEIVED' : 'NET TOTAL SPENT'}
                          </Typography>
                          <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 'bold' }}>
                            {formatCurrency(incomeSubtotal > 0 && expenseSubtotal === 0 ? incomeSubtotal : (expenseSubtotal - refundSubtotal))}
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })()}
                  <Box sx={{ borderTop: '1px dashed #ccc', my: 1 }} />
                  <Box sx={{ textAlign: 'center', fontSize: '10px', color: 'text.secondary' }}>
                    THANK YOU FOR SPENDING RESPONSIBLY
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </>
      )}

      {/* Apply Filters Trigger */}
      {action !== 'audit_accessibility' && (
        <Button
          variant="contained"
          size="small"
          startIcon={<FilterListIcon />}
          onClick={onApplyFilters}
          sx={{
            borderRadius: 2,
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

      {/* Transaction Detail Modal */}
      {selectedTxn && (
        <Dialog
          open={!!selectedTxn && !showRecategorize}
          onClose={() => setSelectedTxn(null)}
          maxWidth="xs"
          fullWidth
          slotProps={{
            paper: {
              sx: {
                borderRadius: 3,
                p: 1,
                bgcolor: 'background.paper',
                backgroundImage: 'none',
              }
            }
          }}
        >
          <DialogTitle sx={{ p: 2, pb: 1, fontWeight: 700, fontSize: '1.1rem' }}>
            Transaction Details
          </DialogTitle>
          <DialogContent sx={{ p: 2, py: 1 }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  Description
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600, mt: 0.5 }}>
                  {selectedTxn.description}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  Amount
                </Typography>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 700,
                    mt: 0.5,
                    color: selectedTxn.category.toLowerCase() === 'income' ? 'success.main' : 'error.main'
                  }}
                >
                  {(() => {
                    const val = selectedTxn.amount;
                    const isIncome = selectedTxn.category.toLowerCase() === 'income';
                    const absVal = Math.abs(val);
                    const formatted = absVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    if (isIncome) return `+$${formatted}`;
                    if (val < 0) return `-$${formatted}`;
                    return `$${formatted}`;
                  })()}
                </Typography>
              </Box>

              <Divider />

              <Grid container spacing={2}>
                <Grid size={6}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                    Date
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 500 }}>
                    {selectedTxn.date}
                  </Typography>
                </Grid>
                <Grid size={6}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                    Category
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip
                      label={selectedTxn.category}
                      size="small"
                      sx={{
                        fontWeight: 600,
                        bgcolor: dbCategories?.find(c => c.name.toLowerCase() === selectedTxn.category.toLowerCase())?.color + '20' || 'action.selected',
                        color: dbCategories?.find(c => c.name.toLowerCase() === selectedTxn.category.toLowerCase())?.color || 'text.primary',
                        borderColor: dbCategories?.find(c => c.name.toLowerCase() === selectedTxn.category.toLowerCase())?.color || 'divider',
                        border: '1px solid',
                      }}
                    />
                  </Box>
                </Grid>
                <Grid size={12}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                    Account
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 500 }}>
                    {(() => {
                      const account = dbAccounts?.find(a => a.id === selectedTxn.accountId);
                      return account ? `${account.institution} - ${account.name}` : `Account #${selectedTxn.accountId}`;
                    })()}
                  </Typography>
                </Grid>
                <Grid size={6}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                    Source
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 500, textTransform: 'capitalize' }}>
                    {selectedTxn.source || 'Unknown'}
                  </Typography>
                </Grid>
              </Grid>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 2, py: 1.5, gap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setShowRecategorize(true)}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
            >
              Recategorize
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={() => setSelectedTxn(null)}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
            >
              Close
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {showRecategorize && selectedTxn && (
        <RecategorizeDialog
          txn={selectedTxn}
          onClose={async () => {
            setShowRecategorize(false);
            const updated = await db.transactions.get(selectedTxn.id);
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
