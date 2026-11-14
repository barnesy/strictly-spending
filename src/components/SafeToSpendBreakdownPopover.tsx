import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Popover,
  Stack,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import UndoIcon from '@mui/icons-material/Undo';
import CloseIcon from '@mui/icons-material/Close';
import { usd } from '../lib';
import {
  formatCleanMerchantName,
  setBillManuallyMarkedPaid,
  isBillManuallyMarkedPaid,
} from '../domain/forecastSpending';

export interface SafeToSpendBillItem {
  merchantKey: string;
  category?: string;
  accountId?: number;
  amount: number;
  expectedShortLabel?: string | null;
  expectedDate?: string | null;
}

interface SafeToSpendBreakdownPopoverProps {
  monthKey: string;
  scopeLabel?: string;
  postedBalance: number;
  availableBalance: number;
  pendingHoldAmount: number;
  itemizedPendingOutflow?: number;
  unitemizedBankHold?: number;
  nextPaydayLabel: string;
  daysUntilPayday: number;
  nextPaycheckAmount?: number;
  billsDueBeforePayday: SafeToSpendBillItem[];
  billsDueBeforePaydayTotal: number;
  safeToSpend: number;
  dailyAllowance: number;
  remainingMonthIncome?: number;
  remainingMonthSpend?: number;
  savingsTransferOut?: number;
  projectedEndOfMonthBalance?: number;
  onManualBillChange?: () => void;
  buttonLabel?: string;
  compact?: boolean;
}

export default function SafeToSpendBreakdownPopover({
  monthKey,
  scopeLabel = 'Checking Accounts',
  postedBalance,
  availableBalance,
  pendingHoldAmount,
  itemizedPendingOutflow = 0,
  unitemizedBankHold = 0,
  nextPaydayLabel,
  daysUntilPayday,
  nextPaycheckAmount = 0,
  billsDueBeforePayday,
  billsDueBeforePaydayTotal,
  safeToSpend,
  dailyAllowance,
  remainingMonthIncome,
  remainingMonthSpend,
  savingsTransferOut = 0,
  projectedEndOfMonthBalance,
  onManualBillChange,
  buttonLabel = 'Math Breakdown',
  compact = false,
}: SafeToSpendBreakdownPopoverProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const handleToggleBillPaid = (merchantKey: string, accountId?: number) => {
    const currentlyPaid = isBillManuallyMarkedPaid(monthKey, merchantKey, accountId);
    setBillManuallyMarkedPaid(monthKey, merchantKey, !currentlyPaid, accountId);
    onManualBillChange?.();
  };

  return (
    <>
      {compact ? (
        <Tooltip title="Inspect Safe-to-Spend math & pending holds breakdown" arrow>
          <IconButton
            size="small"
            onClick={(e) => setAnchorEl(e.currentTarget)}
            aria-label="Inspect Safe-to-Spend math breakdown"
            sx={{ p: 0.35, color: 'text.secondary' }}
          >
            <HelpOutlineIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      ) : (
        <Button
          size="small"
          variant="outlined"
          color="inherit"
          startIcon={<HelpOutlineIcon sx={{ fontSize: 15 }} />}
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            height: 24,
            px: 1,
            fontSize: '0.68rem',
            fontWeight: 700,
            textTransform: 'none',
            borderRadius: 1,
            borderColor: 'divider',
            color: 'text.secondary',
            '&:hover': { color: 'text.primary', borderColor: 'text.secondary' },
          }}
        >
          {buttonLabel}
        </Button>
      )}

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              width: { xs: 330, sm: 410 },
              maxWidth: '94vw',
              p: 2,
              borderRadius: (t) => `${t.shape.borderRadius}px`,
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: '0 14px 34px rgba(0,0,0,0.28)',
            },
          },
        }}
      >
        <Stack spacing={1.25}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '0.88rem' }}>
                🧮 Safe-to-Spend Calculation
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {scopeLabel} · Zero double-counting of pending &amp; settled charges
              </Typography>
            </Box>
            <IconButton size="small" onClick={() => setAnchorEl(null)} aria-label="Close breakdown">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Divider />

          {/* Section 1: Available Cash Reconciliation */}
          <Stack spacing={0.6}>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, fontSize: '0.66rem', lineHeight: 1.2 }}>
              1. Live Checking Cash
            </Typography>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                Posted Bank Balance (Settled)
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: '0.8rem' }}>
                {usd.format(postedBalance)}
              </Typography>
            </Stack>

            {pendingHoldAmount > 0.01 && (
              <Box
                sx={{
                  pl: 1.25,
                  py: 0.5,
                  borderLeft: '2px solid',
                  borderColor: 'warning.main',
                  bgcolor: (t) => alpha(t.palette.warning.main, 0.06),
                  borderRadius: 0.5,
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="warning.main" sx={{ fontWeight: 700 }}>
                    − Pending Holds &amp; Authorizations
                  </Typography>
                  <Typography variant="caption" color="warning.main" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    -{usd.format(pendingHoldAmount)}
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.66rem' }}>
                  {itemizedPendingOutflow > 0 && unitemizedBankHold > 0
                    ? `${usd.format(itemizedPendingOutflow)} itemized pending + ${usd.format(unitemizedBankHold)} bank hold`
                    : itemizedPendingOutflow > 0
                    ? `${usd.format(itemizedPendingOutflow)} in itemized pending transactions`
                    : `${usd.format(unitemizedBankHold)} held in bank available balance`}
                </Typography>
              </Box>
            )}

            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ pt: 0.35, borderTop: '1px dashed', borderColor: 'divider' }}
            >
              <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.82rem' }}>
                = Available Checking Cash
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', fontSize: '0.85rem' }}>
                {usd.format(availableBalance)}
              </Typography>
            </Stack>
          </Stack>

          <Divider />

          {/* Section 2: Unpaid Bills Due Before Next Payday */}
          <Stack spacing={0.6}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, fontSize: '0.66rem', lineHeight: 1.2 }}>
                2. Reserved for Bills Before {nextPaydayLabel} ({billsDueBeforePayday.length})
              </Typography>
              <Typography variant="caption" color="warning.main" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                -{usd.format(billsDueBeforePaydayTotal)}
              </Typography>
            </Stack>

            {billsDueBeforePayday.length === 0 ? (
              <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
                ✓ All recurring bills due before {nextPaydayLabel} are already paid or settled!
              </Typography>
            ) : (
              <Stack spacing={0.5} sx={{ maxHeight: 185, overflowY: 'auto', pr: 0.5 }}>
                {billsDueBeforePayday.map((b) => {
                  const isManual = isBillManuallyMarkedPaid(monthKey, b.merchantKey, b.accountId);
                  return (
                    <Stack
                      key={`${b.merchantKey}-${b.accountId ?? 'any'}`}
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      spacing={1}
                      sx={{
                        py: 0.4,
                        px: 0.75,
                        borderRadius: 1,
                        bgcolor: 'action.hover',
                      }}
                    >
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }} noWrap>
                          {formatCleanMerchantName(b.merchantKey)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                          {b.expectedShortLabel ? `Due ~${b.expectedShortLabel}` : 'Upcoming'}
                          {b.category ? ` · ${b.category}` : ''}
                        </Typography>
                      </Box>

                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          -{usd.format(b.amount)}
                        </Typography>
                        <Tooltip title={isManual ? 'Undo manual paid status' : 'Mark as already paid for this month'} arrow>
                          <Button
                            size="small"
                            variant="outlined"
                            color={isManual ? 'warning' : 'success'}
                            onClick={() => handleToggleBillPaid(b.merchantKey, b.accountId)}
                            startIcon={
                              isManual ? (
                                <UndoIcon sx={{ fontSize: '12px !important' }} />
                              ) : (
                                <CheckCircleOutlineIcon sx={{ fontSize: '12px !important' }} />
                              )
                            }
                            sx={{
                              minWidth: 0,
                              height: 20,
                              px: 0.75,
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              textTransform: 'none',
                            }}
                          >
                            {isManual ? 'Undo' : 'Mark Paid'}
                          </Button>
                        </Tooltip>
                      </Stack>
                    </Stack>
                  );
                })}
              </Stack>
            )}
          </Stack>

          <Divider />

          {/* Section 3: Final Safe-to-Spend Result */}
          <Box
            sx={{
              p: 1.25,
              borderRadius: 1,
              bgcolor: (t) =>
                alpha(
                  safeToSpend >= 0 ? t.palette.success.main : t.palette.error.main,
                  t.palette.mode === 'dark' ? 0.14 : 0.08
                ),
              border: '1px solid',
              borderColor: safeToSpend >= 0 ? alpha('#2e7d32', 0.4) : alpha('#d32f2f', 0.45),
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="baseline">
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '0.84rem' }}>
                  = Safe-to-Spend Until {nextPaydayLabel}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                  {usd.format(dailyAllowance)}/day over {daysUntilPayday} day{daysUntilPayday === 1 ? '' : 's'}
                  {nextPaycheckAmount > 0 ? ` · Next payday +${usd.format(nextPaycheckAmount)}` : ''}
                </Typography>
              </Box>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums',
                  color: safeToSpend >= 0 ? 'success.main' : 'error.main',
                }}
              >
                {safeToSpend >= 0 ? '' : '-'}
                {usd.format(Math.abs(safeToSpend))}
              </Typography>
            </Stack>
          </Box>

          {/* Optional Section 4: Full Month End-of-Month Projection */}
          {projectedEndOfMonthBalance !== undefined && (
            <Box sx={{ pt: 0.25 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.67rem' }}>
                <strong>Full-Month EOM Projection:</strong> Available {usd.format(availableBalance)}
                {remainingMonthIncome !== undefined && remainingMonthIncome > 0
                  ? ` + Remaining Income ${usd.format(remainingMonthIncome)}`
                  : ''}
                {remainingMonthSpend !== undefined && remainingMonthSpend > 0
                  ? ` − Remaining Planned Spend ${usd.format(remainingMonthSpend)}`
                  : ''}
                {savingsTransferOut > 0 ? ` − Savings Out ${usd.format(savingsTransferOut)}` : ''}
                {' = '}
                <strong>{usd.format(projectedEndOfMonthBalance)}</strong>
              </Typography>
            </Box>
          )}
        </Stack>
      </Popover>
    </>
  );
}
