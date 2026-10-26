import {
  Box,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Stack,
  Paper,
  Divider,
  InputAdornment,
  Chip,
  Slider,
  Autocomplete,
} from '@mui/material';
import PercentIcon from '@mui/icons-material/Percent';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SyncIcon from '@mui/icons-material/Sync';
import { usd, usdCents } from '../../lib';
import type { Account, Category } from '../../types';
import { formatMonthsSaved, type PaymentRow } from './LoanChart';

export interface LoanParametersScheduleData {
  scheduledMonthlyPayment: number;
  rows: PaymentRow[];
  interestSaved: number;
  monthsSaved: number;
  payoffDate?: string;
  scheduledPayoffDate?: string;
}

export function LoanParametersPanel({
  hasUnsavedChanges,
  connectedAccount,
  connectedLiveBalance,
  connectedLoanAccounts,
  handleSyncBalanceToLive,
  activeTab,
  formName,
  setFormName,
  formPrincipal,
  setFormPrincipal,
  formDownPayment,
  setFormDownPayment,
  formRate,
  setFormRate,
  formTerm,
  setFormTerm,
  formStartDate,
  setFormStartDate,
  formCategory,
  handleCategoryChange,
  categories,
  merchantOptions,
  formMerchant,
  setFormMerchant,
  formMonthlyPayment,
  setFormMonthlyPayment,
  formPropertyValue,
  setFormPropertyValue,
  formExtraMonthlyPayment,
  setFormExtraMonthlyPayment,
  formExtraOneTimePayment,
  setFormExtraOneTimePayment,
  formExtraOneTimeMonth,
  setFormExtraOneTimeMonth,
  setSnackbarMsg,
  handleRevertChanges,
  handleSaveSettings,
  scheduleData,
}: {
  hasUnsavedChanges: boolean;
  connectedAccount: Account | null;
  connectedLiveBalance: number | null;
  connectedLoanAccounts: Account[];
  handleSyncBalanceToLive: () => void;
  activeTab: 'house' | 'car' | 'student';
  formName: string;
  setFormName: (v: string) => void;
  formPrincipal: string;
  setFormPrincipal: (v: string) => void;
  formDownPayment: string;
  setFormDownPayment: (v: string) => void;
  formRate: string;
  setFormRate: (v: string) => void;
  formTerm: string;
  setFormTerm: (v: string) => void;
  formStartDate: string;
  setFormStartDate: (v: string) => void;
  formCategory: string;
  handleCategoryChange: (v: string) => void;
  categories: Category[];
  merchantOptions: string[];
  formMerchant: string;
  setFormMerchant: (v: string) => void;
  formMonthlyPayment: string;
  setFormMonthlyPayment: (v: string) => void;
  formPropertyValue: string;
  setFormPropertyValue: (v: string) => void;
  formExtraMonthlyPayment: string;
  setFormExtraMonthlyPayment: (v: string) => void;
  formExtraOneTimePayment: string;
  setFormExtraOneTimePayment: (v: string) => void;
  formExtraOneTimeMonth: string;
  setFormExtraOneTimeMonth: (v: string) => void;
  setSnackbarMsg: (v: string) => void;
  handleRevertChanges: () => void;
  handleSaveSettings: () => void;
  scheduleData: LoanParametersScheduleData;
}) {
  const oneExtraPaymentPerYearMonthly = Math.max(10, Math.round(scheduleData.scheduledMonthlyPayment / 12));
  const maxExtraSlider = Math.max(2000, Math.ceil((scheduleData.scheduledMonthlyPayment * 1.5) / 100) * 100);
  const currentExtraMonthly = Number(formExtraMonthlyPayment) || 0;
  const currentExtraOneTime = Number(formExtraOneTimePayment) || 0;

  return (
    <Paper
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid',
        borderColor: 'divider',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ p: 3, pb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Loan Parameters
        </Typography>
        {hasUnsavedChanges && (
          <Chip
            size="small"
            label="Live Preview"
            color="warning"
            variant="outlined"
            sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }}
          />
        )}
      </Box>

      <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 3, pb: 3 }}>
        <Stack spacing={2.5}>
          {connectedAccount ? (
            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(46, 125, 50, 0.08)' : 'rgba(46, 125, 50, 0.04)',
                borderColor: 'success.light',
                borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              }}
            >
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <AccountBalanceIcon sx={{ fontSize: 16, color: 'success.main' }} />
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'success.main', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Live Bank Connection
                    </Typography>
                  </Stack>
                  <Chip size="small" label="Live" color="success" sx={{ height: 16, fontSize: '0.65rem', fontWeight: 700 }} />
                </Stack>
                <Box>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}
                    title={connectedAccount.institution}
                  >
                    {connectedAccount.institution}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}
                    title={connectedAccount.name}
                  >
                    {connectedAccount.name} {connectedAccount.last4 ? `(••${connectedAccount.last4})` : ''}
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', mt: 0.5, display: 'block' }}>
                    Bank Balance: {usd.format(Math.round(connectedLiveBalance || 0))}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  color="success"
                  startIcon={<SyncIcon fontSize="small" />}
                  onClick={handleSyncBalanceToLive}
                  sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.5, borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
                >
                  Sync Principal to Bank Balance
                </Button>
              </Stack>
            </Paper>
          ) : (
            connectedLoanAccounts.length > 0 && (
              <Paper
                variant="outlined"
                sx={{
                  p: 1.5,
                  bgcolor: 'action.hover',
                  borderColor: 'divider',
                  borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                }}
              >
                <Stack spacing={1}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Link to a connected bank account:
                  </Typography>
                  <FormControl fullWidth size="small">
                    <InputLabel id="link-account-select-label">Select Connection</InputLabel>
                    <Select
                      labelId="link-account-select-label"
                      value=""
                      onChange={(e) => {
                        const acc = connectedLoanAccounts.find((a) => a.id === Number(e.target.value));
                        if (acc) {
                          setFormMerchant(acc.institution.toLowerCase());
                          setSnackbarMsg(`Linked merchant to "${acc.institution}". Click Save Settings.`);
                        }
                      }}
                      label="Select Connection"
                    >
                      <MenuItem value=""><em>None</em></MenuItem>
                      {connectedLoanAccounts.map((acc) => (
                        <MenuItem key={acc.id} value={acc.id}>
                          {acc.institution} — {acc.name} ({usd.format(Math.round(Math.abs(acc.currentBalance || 0)))})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
              </Paper>
            )
          )}
          <TextField
            fullWidth
            size="small"
            label="Loan Name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />
          <TextField
            fullWidth
            size="small"
            label={connectedAccount ? 'Loan Balance (Financed)' : 'Purchase Price / Loan Amount'}
            value={formPrincipal}
            onChange={(e) => setFormPrincipal(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start"><AttachMoneyIcon fontSize="small" /></InputAdornment>,
            }}
          />
          {activeTab !== 'student' && (
            <TextField
              fullWidth
              size="small"
              label="Down Payment"
              value={formDownPayment}
              onChange={(e) => setFormDownPayment(e.target.value)}
              helperText={connectedAccount ? 'For active connected loans, set to $0 since balance is already net debt.' : undefined}
              InputProps={{
                startAdornment: <InputAdornment position="start"><AttachMoneyIcon fontSize="small" /></InputAdornment>,
              }}
            />
          )}
          <TextField
            fullWidth
            size="small"
            label="Interest Rate (APR)"
            value={formRate}
            onChange={(e) => setFormRate(e.target.value)}
            InputProps={{
              endAdornment: <InputAdornment position="end"><PercentIcon fontSize="small" /></InputAdornment>,
            }}
          />
          <TextField
            fullWidth
            size="small"
            label="Loan Term"
            value={formTerm}
            onChange={(e) => setFormTerm(e.target.value)}
            InputProps={{
              endAdornment: <InputAdornment position="end">years</InputAdornment>,
            }}
          />
          <TextField
            fullWidth
            size="small"
            label="Start Date"
            type="date"
            value={formStartDate}
            onChange={(e) => setFormStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <FormControl fullWidth size="small">
            <InputLabel id="loan-category-label">Linked Category</InputLabel>
            <Select
              labelId="loan-category-label"
              value={formCategory}
              onChange={(e) => handleCategoryChange(e.target.value)}
              label="Linked Category"
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {categories.map((cat) => (
                <MenuItem key={cat.id} value={cat.name}>
                  {cat.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Autocomplete
            freeSolo
            options={merchantOptions}
            value={formMerchant}
            onChange={(_, newValue) => {
              setFormMerchant(newValue || '');
              if (!newValue && !formCategory) {
                setFormMonthlyPayment('');
                setSnackbarMsg('Monthly payment reset to standard schedule.');
              }
            }}
            onInputChange={(_, newInputValue) => {
              setFormMerchant(newInputValue || '');
              if (!newInputValue && !formCategory) {
                setFormMonthlyPayment('');
              }
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                label="Linked Merchant Pattern (Optional)"
                placeholder="e.g. TOYOTA FIN"
                helperText="If specified, matches transactions by merchant name instead of category."
              />
            )}
          />
          <TextField
            fullWidth
            size="small"
            label="Monthly Payment (Scheduled)"
            value={formMonthlyPayment}
            onChange={(e) => setFormMonthlyPayment(e.target.value)}
            helperText="Calculated from loan amount if left empty"
            InputProps={{
              startAdornment: <InputAdornment position="start"><AttachMoneyIcon fontSize="small" /></InputAdornment>,
            }}
          />
          {activeTab !== 'student' && (
            <TextField
              fullWidth
              size="small"
              label={activeTab === 'house' ? 'Current Home Value' : 'Estimated Resale Value'}
              value={formPropertyValue}
              onChange={(e) => setFormPropertyValue(e.target.value)}
              helperText={activeTab === 'house' ? 'Estimated resale value of the house for equity tracking' : 'Estimated resale value of the car for equity tracking'}
              InputProps={{
                startAdornment: <InputAdornment position="start"><AttachMoneyIcon fontSize="small" /></InputAdornment>,
              }}
            />
          )}

          <Divider sx={{ my: 0.5 }} />

          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Extra Payments (Live Simulator)
              </Typography>
              {(currentExtraMonthly > 0 || currentExtraOneTime > 0) && (
                <Button
                  size="small"
                  color="inherit"
                  onClick={() => {
                    setFormExtraMonthlyPayment('');
                    setFormExtraOneTimePayment('');
                    setFormExtraOneTimeMonth('');
                  }}
                  sx={{ minWidth: 0, px: 0.75, py: 0, fontSize: '0.7rem', textTransform: 'none', color: 'text.secondary' }}
                >
                  Clear Extra
                </Button>
              )}
            </Stack>

            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                Monthly Extra Principal
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main', fontVariantNumeric: 'tabular-nums' }}>
                +{usdCents.format(currentExtraMonthly)}/mo
              </Typography>
            </Stack>

            <Slider
              value={Math.min(maxExtraSlider, currentExtraMonthly)}
              min={0}
              max={maxExtraSlider}
              step={10}
              onChange={(_, val) => setFormExtraMonthlyPayment(val === 0 ? '' : String(val))}
              valueLabelDisplay="auto"
              valueLabelFormat={(val) => `+$${val}/mo`}
              sx={{
                color: 'success.main',
                py: 1,
                '& .MuiSlider-thumb': {
                  width: 15,
                  height: 15,
                  '&:hover, &.Mui-focusVisible': {
                    boxShadow: (theme) => `0px 0px 0px 8px ${theme.palette.success.main}1a`,
                  },
                  '&.Mui-active': {
                    boxShadow: (theme) => `0px 0px 0px 14px ${theme.palette.success.main}2a`,
                  },
                },
              }}
            />

            {/* Quick-preset extra payment chips */}
            <Stack direction="row" spacing={0.75} sx={{ mt: 0.5, mb: 1.5, flexWrap: 'wrap', rowGap: 0.75 }}>
              {[
                { label: '+$100', value: 100 },
                { label: '+$250', value: 250 },
                { label: '+$500', value: 500 },
                { label: `+1 Pmt/yr ($${oneExtraPaymentPerYearMonthly})`, value: oneExtraPaymentPerYearMonthly },
              ].map((preset) => {
                const isSelected = Math.round(currentExtraMonthly) === preset.value;
                return (
                  <Chip
                    key={preset.label}
                    size="small"
                    label={preset.label}
                    clickable
                    color={isSelected ? 'success' : 'default'}
                    variant={isSelected ? 'filled' : 'outlined'}
                    onClick={() => setFormExtraMonthlyPayment(isSelected ? '' : String(preset.value))}
                    sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600 }}
                  />
                );
              })}
            </Stack>
          </Box>

          <TextField
            fullWidth
            size="small"
            label="One-Time Lump Sum Payment"
            value={formExtraOneTimePayment}
            onChange={(e) => {
              const val = e.target.value;
              setFormExtraOneTimePayment(val);
              if (parseFloat(val) > 0 && !formExtraOneTimeMonth) {
                const firstUpcoming = scheduleData.rows.find((row) => !row.isPast);
                if (firstUpcoming) {
                  setFormExtraOneTimeMonth(String(firstUpcoming.paymentNumber));
                }
              }
            }}
            helperText="Additional lump-sum principal applied once"
            InputProps={{
              startAdornment: <InputAdornment position="start"><AttachMoneyIcon fontSize="small" /></InputAdornment>,
            }}
          />

          <FormControl fullWidth size="small" disabled={!formExtraOneTimePayment || parseFloat(formExtraOneTimePayment) <= 0}>
            <InputLabel id="one-time-month-label">Apply One-Time Payment At</InputLabel>
            <Select
              labelId="one-time-month-label"
              value={formExtraOneTimeMonth}
              onChange={(e) => setFormExtraOneTimeMonth(String(e.target.value))}
              label="Apply One-Time Payment At"
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {scheduleData.rows
                .filter((row) => !row.isPast)
                .map((row) => (
                  <MenuItem key={row.paymentNumber} value={row.paymentNumber}>
                    Month {row.paymentNumber} ({row.date}){row.isToday ? ' — This Month' : ''}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>

          {/* Early Payoff Impact Summary Box */}
          {(scheduleData.interestSaved > 0.5 || scheduleData.monthsSaved > 0) && (
            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                borderColor: 'success.main',
                bgcolor: (theme) =>
                  theme.palette.mode === 'dark' ? 'rgba(46, 125, 50, 0.1)' : 'rgba(46, 125, 50, 0.05)',
                borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 800,
                  color: 'success.main',
                  display: 'block',
                  mb: 0.75,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Early Payoff Impact
              </Typography>
              <Stack spacing={0.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary">
                    Interest Saved:
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: 'success.main', fontVariantNumeric: 'tabular-nums' }}>
                    {usdCents.format(scheduleData.interestSaved)}
                  </Typography>
                </Stack>
                {scheduleData.monthsSaved > 0 && (
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption" color="text.secondary">
                      Time Saved:
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>
                      {formatMonthsSaved(scheduleData.monthsSaved)} ({scheduleData.monthsSaved} {scheduleData.monthsSaved === 1 ? 'pmt' : 'pmts'})
                    </Typography>
                  </Stack>
                )}
                {scheduleData.payoffDate && (
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption" color="text.secondary">
                      Projected Payoff:
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>
                      {scheduleData.payoffDate}
                      {scheduleData.scheduledPayoffDate && scheduleData.scheduledPayoffDate !== scheduleData.payoffDate
                        ? ` (was ${scheduleData.scheduledPayoffDate})`
                        : ''}
                    </Typography>
                  </Stack>
                )}
              </Stack>
            </Paper>
          )}
        </Stack>
      </Box>

      <Box sx={{ p: 2.5, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Stack direction="row" spacing={1}>
          {hasUnsavedChanges && (
            <Button
              variant="outlined"
              size="medium"
              color="inherit"
              onClick={handleRevertChanges}
              sx={{ textTransform: 'none', fontWeight: 600, py: 1, px: 2 }}
            >
              Revert
            </Button>
          )}
          <Button
            variant="contained"
            fullWidth
            size="medium"
            color="primary"
            onClick={handleSaveSettings}
            sx={{ textTransform: 'none', fontWeight: 700, py: 1 }}
          >
            {hasUnsavedChanges ? 'Save Changes' : 'Save Settings'}
          </Button>
        </Stack>
      </Box>
    </Paper>
  );
}
