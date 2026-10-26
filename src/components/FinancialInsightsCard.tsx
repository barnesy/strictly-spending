import { useMemo, useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Stack,
  Typography,
  Chip,
  Collapse,
  IconButton,
  Button,
  Tooltip,
  Grid,
  alpha,
  useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CloseIcon from '@mui/icons-material/Close';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LayersIcon from '@mui/icons-material/Layers';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useTransactions, useMerchantOverrides, useBudgets } from '../hooks/queries';
import { useFilters } from '../stores/store';
import { detectSubscriptionAlerts, detectSpendingAnomalies } from '../domain/insights';
import { usd, usdCents } from '../lib';

const DISMISSED_STORAGE_KEY = 'strictly_dismissed_insights_v1';

function loadDismissedInsights(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

export function FinancialInsightsCard() {
  const theme = useTheme();
  const demoMode = useFilters((s) => s.demoMode);
  const { data: allTransactions = [] } = useTransactions();
  const { data: overrides = [] } = useMerchantOverrides();
  const { data: budgets = [] } = useBudgets();

  // Start closed by default so all drawers on the Budget page begin collapsed
  const [expanded, setExpanded] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => loadDismissedInsights());

  useEffect(() => {
    try {
      window.localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(Array.from(dismissedIds)));
    } catch {
      // ignore storage errors
    }
  }, [dismissedIds]);

  const dismissInsight = (id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const activeTransactions = useMemo(() => {
    return demoMode
      ? allTransactions.filter((t) => t.source === 'demo')
      : allTransactions.filter((t) => t.source !== 'demo');
  }, [allTransactions, demoMode]);

  const {
    priceSpikes,
    duplicateCharges,
    overlappingSubscriptions,
    categorySpikes,
    outliers,
    allActiveInsightIds,
    dismissedCount,
  } = useMemo(() => {
    if (activeTransactions.length === 0) {
      return {
        priceSpikes: [],
        duplicateCharges: [],
        overlappingSubscriptions: [],
        categorySpikes: [],
        outliers: [],
        allActiveInsightIds: [] as string[],
        dismissedCount: 0,
      };
    }

    const now = new Date();
    const endDateStr = now.toISOString().slice(0, 10);
    const start30 = new Date(now);
    start30.setDate(now.getDate() - 30);
    const startDateStr = start30.toISOString().slice(0, 10);

    const subAlerts = detectSubscriptionAlerts(activeTransactions, overrides);
    const anomalies = detectSpendingAnomalies(
      activeTransactions,
      ['all'],
      startDateStr,
      endDateStr,
      budgets
    );

    // Scope price spikes & duplicate charges to the last 30 days and attach stable IDs
    const rawSpikes = subAlerts.priceSpikes
      .filter((s) => s.date >= startDateStr)
      .map((s) => ({ ...s, insightId: `spike:${s.merchantKey}:${s.date}` }));

    const rawDups = subAlerts.duplicateCharges
      .filter((d) => d.dates.some((dt) => dt >= startDateStr))
      .map((d) => ({ ...d, insightId: `dup:${d.merchantKey}:${d.dates.join(',')}` }));

    const rawOverlaps = subAlerts.overlappingSubscriptions.map((g) => ({
      ...g,
      insightId: `overlap:${g.groupName}`,
    }));

    const rawCatSpikes = anomalies.categorySpikes.map((cs) => ({
      ...cs,
      insightId: `catspike:${cs.category}:${endDateStr.slice(0, 7)}`,
    }));

    const rawOutliers = anomalies.outliers.map((o) => ({
      ...o,
      insightId: `outlier:${o.id || `${o.date}-${o.amount}`}`,
    }));

    const totalRaw =
      rawSpikes.length +
      rawDups.length +
      rawOverlaps.length +
      rawCatSpikes.length +
      rawOutliers.length;

    const filteredSpikes = rawSpikes.filter((x) => !dismissedIds.has(x.insightId));
    const filteredDups = rawDups.filter((x) => !dismissedIds.has(x.insightId));
    const filteredOverlaps = rawOverlaps.filter((x) => !dismissedIds.has(x.insightId));
    const filteredCatSpikes = rawCatSpikes.filter((x) => !dismissedIds.has(x.insightId));
    const filteredOutliers = rawOutliers.filter((x) => !dismissedIds.has(x.insightId));

    const activeIds = [
      ...filteredSpikes.map((x) => x.insightId),
      ...filteredDups.map((x) => x.insightId),
      ...filteredOverlaps.map((x) => x.insightId),
      ...filteredCatSpikes.map((x) => x.insightId),
      ...filteredOutliers.map((x) => x.insightId),
    ];

    return {
      priceSpikes: filteredSpikes,
      duplicateCharges: filteredDups,
      overlappingSubscriptions: filteredOverlaps,
      categorySpikes: filteredCatSpikes,
      outliers: filteredOutliers,
      allActiveInsightIds: activeIds,
      dismissedCount: Math.max(0, totalRaw - activeIds.length),
    };
  }, [activeTransactions, overrides, budgets, dismissedIds]);

  const totalFindings = allActiveInsightIds.length;

  if (activeTransactions.length === 0) return null;

  const handleDismissAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedIds((prev) => {
      const next = new Set(prev);
      for (const id of allActiveInsightIds) next.add(id);
      return next;
    });
  };

  const handleRestoreAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedIds(new Set());
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: (t) => `${t.shape.borderRadius}px`,
        borderColor: totalFindings > 0 ? alpha(theme.palette.warning.main, 0.45) : 'divider',
        bgcolor:
          totalFindings > 0
            ? alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.04 : 0.02)
            : 'background.paper',
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={1}
        onClick={() => setExpanded((prev) => !prev)}
        sx={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ flex: 1, minWidth: 0 }}>
          <WarningAmberIcon
            fontSize="small"
            color={totalFindings > 0 ? 'warning' : 'success'}
          />
          <Typography variant="subtitle1" fontWeight={600} sx={{ fontSize: { xs: '0.92rem', sm: '1rem' }, lineHeight: 1.3 }}>
            Automated Subscription &amp; Anomaly Audit (Last 30 Days)
          </Typography>
          {totalFindings > 0 ? (
            <Chip
              size="small"
              color="warning"
              label={`${totalFindings} insight${totalFindings === 1 ? '' : 's'} detected`}
              sx={{ height: 22, fontSize: '0.72rem', fontWeight: 700 }}
            />
          ) : (
            <Chip
              size="small"
              color="success"
              icon={<CheckCircleOutlineIcon />}
              label="No active alerts"
              sx={{ height: 22, fontSize: '0.72rem', fontWeight: 600 }}
            />
          )}
          {dismissedCount > 0 && (
            <Typography variant="caption" color="text.secondary">
              ({dismissedCount} dismissed)
            </Typography>
          )}
        </Stack>

        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
          {totalFindings > 0 && (
            <Button
              size="small"
              onClick={handleDismissAll}
              sx={{ textTransform: 'none', fontSize: '0.75rem', whiteSpace: 'nowrap', minWidth: 'auto', px: 1 }}
            >
              Dismiss all
            </Button>
          )}
          {dismissedCount > 0 && (
            <Button
              size="small"
              onClick={handleRestoreAll}
              sx={{ textTransform: 'none', fontSize: '0.75rem', whiteSpace: 'nowrap', minWidth: 'auto', px: 1 }}
            >
              Restore ({dismissedCount})
            </Button>
          )}
          <IconButton size="small">
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Stack>
      </Stack>

      <Collapse in={expanded} timeout="auto" unmountOnExit>
        {totalFindings === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            All recurring bills, category pace, and recent charges are within normal ranges
            {dismissedCount > 0 ? ` (${dismissedCount} dismissed insight${dismissedCount === 1 ? '' : 's'} hidden).` : '.'}
          </Typography>
        ) : (
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {/* 1. Subscription Price Spikes */}
            {priceSpikes.length > 0 && (
              <Grid size={{ xs: 12, md: 6 }}>
                <Box
                  sx={{
                    p: 1.75,
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    height: '100%',
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <TrendingUpIcon fontSize="small" color="error" />
                    <Typography variant="subtitle2" fontWeight={700}>
                      Recurring Price Increases ({priceSpikes.length})
                    </Typography>
                  </Stack>
                  <Stack spacing={1}>
                    {priceSpikes.slice(0, 5).map((spike) => (
                      <Stack
                        key={spike.insightId}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        spacing={1}
                      >
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {spike.merchantName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {spike.date} · Was {usdCents.format(spike.oldPrice)}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
                          <Typography variant="body2" fontWeight={700} color="error.main">
                            {usdCents.format(spike.newPrice)}
                          </Typography>
                          <Chip
                            size="small"
                            color="error"
                            variant="outlined"
                            label={`+${spike.percentageChange.toFixed(0)}%`}
                            sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }}
                          />
                          <Tooltip title="Dismiss insight">
                            <IconButton
                              size="small"
                              onClick={() => dismissInsight(spike.insightId)}
                              sx={{ p: 0.25 }}
                            >
                              <CloseIcon sx={{ fontSize: 15 }} />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              </Grid>
            )}

            {/* 2. Potential Duplicate Charges */}
            {duplicateCharges.length > 0 && (
              <Grid size={{ xs: 12, md: 6 }}>
                <Box
                  sx={{
                    p: 1.75,
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    height: '100%',
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <ContentCopyIcon fontSize="small" color="warning" />
                    <Typography variant="subtitle2" fontWeight={700}>
                      Possible Double Billing ({duplicateCharges.length})
                    </Typography>
                  </Stack>
                  <Stack spacing={1}>
                    {duplicateCharges.slice(0, 5).map((dup) => (
                      <Stack
                        key={dup.insightId}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        spacing={1}
                      >
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {dup.merchantName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            Charged on {dup.dates.join(' & ')}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
                          <Typography variant="body2" fontWeight={700} color="warning.main">
                            {usdCents.format(dup.amount)} × 2
                          </Typography>
                          <Tooltip title="Dismiss insight">
                            <IconButton
                              size="small"
                              onClick={() => dismissInsight(dup.insightId)}
                              sx={{ p: 0.25 }}
                            >
                              <CloseIcon sx={{ fontSize: 15 }} />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              </Grid>
            )}

            {/* 3. Overlapping Subscriptions */}
            {overlappingSubscriptions.length > 0 && (
              <Grid size={{ xs: 12, md: 6 }}>
                <Box
                  sx={{
                    p: 1.75,
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    height: '100%',
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <LayersIcon fontSize="small" color="info" />
                    <Typography variant="subtitle2" fontWeight={700}>
                      Overlapping Services ({overlappingSubscriptions.length})
                    </Typography>
                  </Stack>
                  <Stack spacing={1}>
                    {overlappingSubscriptions.map((group) => (
                      <Stack
                        key={group.insightId}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        spacing={1}
                      >
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" fontWeight={600}>
                            {group.groupName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap display="block">
                            {group.merchants.join(', ')}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
                          <Typography variant="body2" fontWeight={700}>
                            {usd.format(group.totalEstMonthly)}/mo
                          </Typography>
                          <Tooltip title="Dismiss insight">
                            <IconButton
                              size="small"
                              onClick={() => dismissInsight(group.insightId)}
                              sx={{ p: 0.25 }}
                            >
                              <CloseIcon sx={{ fontSize: 15 }} />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              </Grid>
            )}

            {/* 4. Category Pace Spikes & Outliers */}
            {(categorySpikes.length > 0 || outliers.length > 0) && (
              <Grid size={{ xs: 12, md: 6 }}>
                <Box
                  sx={{
                    p: 1.75,
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    height: '100%',
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <WarningAmberIcon fontSize="small" color="warning" />
                    <Typography variant="subtitle2" fontWeight={700}>
                      30-Day Spending Outliers &amp; Category Spikes
                    </Typography>
                  </Stack>
                  <Stack spacing={1}>
                    {categorySpikes.slice(0, 3).map((cs) => (
                      <Stack
                        key={cs.insightId}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        spacing={1}
                      >
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {cs.category} Pace Spike
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            90d baseline: {usd.format(cs.baselineMonthlySpend)}/mo
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
                          <Typography variant="body2" fontWeight={700} color="warning.main">
                            {usd.format(cs.currentPeriodSpend)}
                          </Typography>
                          <Chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            label={`+${cs.percentageChange.toFixed(0)}%`}
                            sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }}
                          />
                          <Tooltip title="Dismiss insight">
                            <IconButton
                              size="small"
                              onClick={() => dismissInsight(cs.insightId)}
                              sx={{ p: 0.25 }}
                            >
                              <CloseIcon sx={{ fontSize: 15 }} />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </Stack>
                    ))}
                    {outliers.slice(0, 3).map((out) => (
                      <Stack
                        key={out.insightId}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        spacing={1}
                      >
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {out.description}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {out.date} · {out.category} ({out.multiplier.toFixed(1)}× avg)
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
                          <Typography variant="body2" fontWeight={700} color="error.main">
                            {usdCents.format(out.amount)}
                          </Typography>
                          <Tooltip title="Dismiss insight">
                            <IconButton
                              size="small"
                              onClick={() => dismissInsight(out.insightId)}
                              sx={{ p: 0.25 }}
                            >
                              <CloseIcon sx={{ fontSize: 15 }} />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              </Grid>
            )}
          </Grid>
        )}
      </Collapse>
    </Paper>
  );
}
