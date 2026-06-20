import { Box, Typography, Grid, LinearProgress, Stack, Accordion, AccordionSummary, AccordionDetails, Button } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { QueryDataMetrics } from '../CopilotQueryResult';
import { formatCurrency } from './utils';

interface Props {
  metrics: QueryDataMetrics;
  showSpend: boolean;
  showIncome: boolean;
  budgetBreakdowns: any;
  showReceipt: boolean;
  setShowReceipt: (show: boolean) => void;
  loadingReceipt: boolean;
  receiptTxns: any[];
  setSelectedTxn: (txn: any) => void;
  budgetProgress: number;
}

export function QueryResultQueryData({
  metrics,
  showSpend,
  showIncome,
  budgetBreakdowns,
  showReceipt,
  setShowReceipt,
  loadingReceipt,
  receiptTxns,
  setSelectedTxn,
  budgetProgress,
}: Props) {
  const { totalSpend = 0, totalIncome = 0, spendCount = 0, incomeCount = 0, spendAverage = 0, incomeAverage = 0, scaledBudget = 0, difference = 0, isOverBudget = false } = metrics;

  return (
    <>
      {/* Metric Widgets */}
      <Grid container spacing={1.5}>
        {showSpend && (
          <Grid size={showIncome ? 6 : 12}>
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
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
              <Typography variant="h5" color="error.dark" sx={{ fontWeight: 700, mb: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={formatCurrency(totalSpend)}>
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
                borderRadius: 1,
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
              <Typography variant="h5" color="success.dark" sx={{ fontWeight: 700, mb: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={formatCurrency(totalIncome)}>
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
            borderRadius: 1,
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
              borderRadius: 1,
              bgcolor: isOverBudget ? 'error.50' : 'success.50',
              '& .MuiLinearProgress-bar': {
                borderRadius: 1,
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

          {budgetBreakdowns && budgetBreakdowns.monthly?.length > 1 && (
            <Accordion
              variant="outlined"
              sx={{
                mt: 1.5,
                borderRadius: 1,
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
                      {budgetBreakdowns.yearly.map((y: any) => (
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
                      {budgetBreakdowns.monthly.map((m: any) => (
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
      {metrics && (spendCount > 0 || incomeCount > 0) && (
        <Box sx={{ mt: 0.5 }}>
          <Button
            variant="outlined"
            size="small"
            fullWidth
            onClick={() => setShowReceipt(!showReceipt)}
            sx={{
              borderRadius: 1,
              textTransform: 'none',
              fontWeight: 600,
              color: 'text.secondary',
              borderColor: 'divider',
              '&:hover': {
                borderColor: 'text.primary',
                bgcolor: 'action.hover',
              },
            }}
          >
            {showReceipt ? 'Hide Receipt Details' : `Show Receipt Details (${(spendCount || 0) + (incomeCount || 0)})`}
          </Button>
 
          {showReceipt && (
            <Box
              sx={{
                mt: 1.5,
                p: 2,
                borderRadius: 1,
                bgcolor: (theme) => theme.palette.mode === 'dark' ? '#182232' : '#FAF8F5',
                border: '1px dashed',
                borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.15)' : '#ccc',
                fontFamily: 'Courier New, Courier, monospace',
                color: (theme) => theme.palette.mode === 'dark' ? '#eceef2' : '#333',
                fontSize: '12px',
                lineHeight: 1.4,
              }}
            >
              {/* Receipt Title */}
              <Box sx={{ textAlign: 'center', mb: 1, fontWeight: 'bold' }}>
                *** TRANSACTION RECEIPT ***
              </Box>
              <Box sx={{ borderTop: '1px dashed', borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.15)' : '#ccc', my: 1 }} />
 
              {/* Scrollable list of items */}
              <Box sx={{ maxHeight: '180px', overflowY: 'auto', pr: 0.5 }}>
                {loadingReceipt ? (
                  <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', py: 2 }}>Loading transactions...</Typography>
                ) : (
                  receiptTxns.map((t, idx) => {
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
                  const desc = t.description || '';
                  const cleanDesc = desc.length > 18
                    ? desc.slice(0, 15) + '...'
                    : desc.padEnd(18);
 
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
                        borderRadius: 1,
                        px: 1,
                        py: 0.25,
                        mx: -1,
                        transition: 'background-color 150ms ease, transform 100ms ease',
                        '&:hover': {
                          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
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
                }))}
              </Box>
 
              <Box sx={{ borderTop: '1px dashed', borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.15)' : '#ccc', my: 1 }} />
 
              {/* Calculations Block */}
              {(() => {
                // Calculate subtotals
                let expenseSubtotal = 0;
                let refundSubtotal = 0;
                let incomeSubtotal = 0;
 
                for (const t of receiptTxns) {
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
                    <Box sx={{ borderTop: '2px double', borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.25)' : '#ccc', my: 0.5 }} />
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
              <Box sx={{ borderTop: '1px dashed', borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.15)' : '#ccc', my: 1 }} />
              <Box sx={{ textAlign: 'center', fontSize: '10px', color: 'text.secondary' }}>
                THANK YOU FOR SPENDING RESPONSIBLY
              </Box>
            </Box>
          )}
        </Box>
      )}
    </>
  );
}
