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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  InputAdornment,
  Chip,
  Collapse,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import SchoolIcon from '@mui/icons-material/School';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { usdCents } from '../../lib';
import type { Loan, Account } from '../../types';
import type { PaymentRow } from './LoanChart';

export function AddLoanDialog({
  open,
  onClose,
  onSubmit,
  connectedLoanAccounts,
  selectedConnectedAccId,
  onSelectConnectedAccount,
  addName,
  setAddName,
  addType,
  setAddType,
  addPrincipal,
  setAddPrincipal,
  addDownPayment,
  setAddDownPayment,
  merchantOptions,
  addMerchant,
  setAddMerchant,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  connectedLoanAccounts: Account[];
  selectedConnectedAccId: number | '';
  onSelectConnectedAccount: (id: number | '') => void;
  addName: string;
  setAddName: (val: string) => void;
  addType: 'house' | 'car' | 'student';
  setAddType: (val: 'house' | 'car' | 'student') => void;
  addPrincipal: string;
  setAddPrincipal: (val: string) => void;
  addDownPayment: string;
  setAddDownPayment: (val: string) => void;
  merchantOptions: string[];
  addMerchant: string;
  setAddMerchant: (val: string) => void;
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth fullScreen={isMobile}>
      <DialogTitle sx={{ fontWeight: 700 }}>Add New Loan</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {connectedLoanAccounts.length > 0 && (
            <FormControl fullWidth size="small">
              <InputLabel id="add-loan-conn-acc-label">⚡ Link to Connected Account (Auto-Fill)</InputLabel>
              <Select
                labelId="add-loan-conn-acc-label"
                value={selectedConnectedAccId}
                onChange={(e) => onSelectConnectedAccount(e.target.value as number | '')}
                label="⚡ Link to Connected Account (Auto-Fill)"
              >
                <MenuItem value=""><em>Manual / Custom Entry</em></MenuItem>
                {connectedLoanAccounts.map((acc) => (
                  <MenuItem key={acc.id} value={acc.id}>
                    {acc.institution} — {acc.name} ({usdCents.format(Math.abs(acc.currentBalance || 0))})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <TextField
            fullWidth
            size="small"
            label="Loan Name"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="e.g. Primary Residence or Tesla Model Y"
          />
          <FormControl fullWidth size="small">
            <InputLabel id="add-loan-type-label">Loan Type</InputLabel>
            <Select
              labelId="add-loan-type-label"
              value={addType}
              onChange={(e) => setAddType(e.target.value as 'house' | 'car' | 'student')}
              label="Loan Type"
            >
              <MenuItem value="house">House Mortgage</MenuItem>
              <MenuItem value="car">Car Loan / Lease</MenuItem>
              <MenuItem value="student">Student Loan</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            size="small"
            label={selectedConnectedAccId ? "Live Connected Balance" : (addType === 'student' ? "Loan Amount" : "Purchase Price / Loan Balance")}
            value={addPrincipal}
            onChange={(e) => setAddPrincipal(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start"><AttachMoneyIcon fontSize="small" /></InputAdornment>,
            }}
          />
          {addType !== 'student' && (
            <TextField
              fullWidth
              size="small"
              label="Down Payment"
              value={addDownPayment}
              onChange={(e) => setAddDownPayment(e.target.value)}
              helperText={selectedConnectedAccId ? "For active connected loans, set to $0 since balance is already net debt." : undefined}
              InputProps={{
                startAdornment: <InputAdornment position="start"><AttachMoneyIcon fontSize="small" /></InputAdornment>,
              }}
            />
          )}
          <Autocomplete
            freeSolo
            options={merchantOptions}
            value={addMerchant}
            onChange={(_, newValue) => setAddMerchant(newValue || '')}
            onInputChange={(_, newInputValue) => setAddMerchant(newInputValue || '')}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                label="Linked Merchant (Optional)"
                placeholder="e.g. TOYOTA FIN"
                helperText="Select or type a merchant pattern to match payments."
              />
            )}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} variant="outlined" color="inherit" size="small">
          Cancel
        </Button>
        <Button onClick={onSubmit} variant="contained" color="primary" size="small">
          Add Loan
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function RestoreLoansDialog({
  open,
  onClose,
  inactiveLoans,
  onRestoreLoan,
  onDeleteLoanById,
}: {
  open: boolean;
  onClose: () => void;
  inactiveLoans: Loan[];
  onRestoreLoan: (loan: Loan) => void;
  onDeleteLoanById: (id: number, name: string) => void;
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={isMobile}>
      <DialogTitle sx={{ fontWeight: 700 }}>Restore Removed Loans</DialogTitle>
      <DialogContent dividers>
        {inactiveLoans.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No removed loans to restore.
          </Typography>
        ) : (
          <TableContainer sx={{ maxHeight: 300 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {inactiveLoans.map((loan) => (
                  <TableRow key={loan.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        {loan.type === 'house' ? <HomeIcon sx={{ fontSize: 18, color: 'primary.main' }} /> : loan.type === 'student' ? <SchoolIcon sx={{ fontSize: 18, color: 'info.main' }} /> : <DirectionsCarIcon sx={{ fontSize: 18, color: 'secondary.main' }} />}
                        <Typography variant="body2">{loan.name}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ textTransform: 'capitalize' }}>{loan.type}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button
                          variant="outlined"
                          size="small"
                          color="primary"
                          onClick={() => onRestoreLoan(loan)}
                          sx={{ textTransform: 'none', py: 0.5 }}
                        >
                          Restore
                        </Button>
                        <Button
                          variant="text"
                          size="small"
                          color="error"
                          onClick={() => loan.id !== undefined && onDeleteLoanById(loan.id, loan.name)}
                          sx={{ textTransform: 'none', py: 0.5 }}
                        >
                          Delete
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} variant="contained" color="primary" size="small">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function MatchedTransactionsDialog({
  rows,
  date,
  onClose,
}: {
  rows: any[] | null;
  date: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Dialog
      open={rows !== null}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: { borderRadius: (theme) => (isMobile ? 0 : `${theme.shape.borderRadius}px`), p: 1 }
      }}
    >
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
        Matched Transactions — {date}
      </DialogTitle>
      <DialogContent dividers sx={{ p: 2 }}>
        <TableContainer component={Paper} variant="outlined" sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: 'action.hover' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows?.map((t, idx) => (
                <TableRow key={t.id || idx}>
                  <TableCell sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{t.date}</TableCell>
                  <TableCell>{t.description}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {usdCents.format(Math.abs(t.amount))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} variant="outlined" color="inherit" size="small">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function FormControlLabelCustom({ label, checked, onChange }: { label: string; checked: boolean; onChange: (val: boolean) => void }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" onClick={() => onChange(!checked)} sx={{ cursor: 'pointer', userSelect: 'none' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => {}}
        style={{ cursor: 'pointer' }}
      />
      <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
        {label}
      </Typography>
    </Stack>
  );
}

export function AmortizationScheduleCard({
  rows,
  showScheduleDetails,
  setShowScheduleDetails,
  onlyShowMatched,
  setOnlyShowMatched,
  onSelectMatchedRow,
}: {
  rows: PaymentRow[];
  showScheduleDetails: boolean;
  setShowScheduleDetails: (val: boolean) => void;
  onlyShowMatched: boolean;
  setOnlyShowMatched: (val: boolean) => void;
  onSelectMatchedRow: (transactions: any[], date: string) => void;
}) {
  return (
    <Paper sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
      <Button
        fullWidth
        variant="text"
        color="inherit"
        onClick={() => setShowScheduleDetails(!showScheduleDetails)}
        endIcon={showScheduleDetails ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
        sx={{
          justifyContent: 'space-between',
          textAlign: 'left',
          px: { xs: 1.75, sm: 3 },
          py: { xs: 1.5, sm: 2 },
          textTransform: 'none',
          fontSize: { xs: '0.84rem', sm: '0.9rem' },
          fontWeight: 700,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        Detailed Amortization & Transaction Matching
      </Button>

      <Collapse in={showScheduleDetails}>
        <Divider />
        <Box
          sx={{
            px: { xs: 1.5, sm: 2 },
            py: 1.25,
            bgcolor: 'background.default',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Showing {rows.length} schedule periods
          </Typography>
          <FormControlLabelCustom
            label="Only show linked months"
            checked={onlyShowMatched}
            onChange={(e) => setOnlyShowMatched(e)}
          />
        </Box>
        <TableContainer sx={{ maxHeight: 440, overflowY: 'auto' }}>
          <Table
            size="small"
            stickyHeader
            sx={{
              '& .MuiTableCell-root': {
                px: { xs: 1, sm: 2 },
                py: { xs: 0.75, sm: 1 },
                fontSize: { xs: '0.75rem', sm: '0.8125rem' },
              },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell align="center" sx={{ fontWeight: 700, width: 52, display: { xs: 'none', sm: 'table-cell' } }}>#</TableCell>
                <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Period</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Payment</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, display: { xs: 'none', sm: 'table-cell' } }}>Interest</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, display: { xs: 'none', md: 'table-cell' } }}>Principal</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Balance</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows
                .filter((row) => !onlyShowMatched || row.isMatched)
                .map((row) => {
                  const hasExtra = row.extraPayment > 0.01;
                  const isPaidOffEarly = row.actualBalance <= 0.01 && row.actualPayment === 0 && row.scheduledBalance > 0.01;

                  return (
                    <TableRow
                      key={row.paymentNumber}
                      hover
                      sx={{
                        bgcolor: row.isToday
                          ? (theme) => theme.palette.mode === 'dark' ? 'rgba(2, 136, 209, 0.12)' : 'rgba(2, 136, 209, 0.06)'
                          : isPaidOffEarly
                          ? (theme) => theme.palette.mode === 'dark' ? 'rgba(46, 125, 50, 0.06)' : 'rgba(46, 125, 50, 0.03)'
                          : row.isMatched
                          ? (theme) => theme.palette.mode === 'dark' ? 'rgba(76, 175, 80, 0.05)' : 'rgba(76, 175, 80, 0.02)'
                          : row.isAssumed
                          ? (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 152, 0, 0.05)' : 'rgba(255, 152, 0, 0.02)'
                          : 'inherit',
                        opacity: isPaidOffEarly ? 0.78 : 1,
                        '& td': { fontVariantNumeric: 'tabular-nums' }
                      }}
                    >
                      <TableCell align="center" color="text.secondary" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                        {row.paymentNumber}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <span>{row.date}</span>
                          {row.isToday && (
                            <Chip
                              size="small"
                              label="Today"
                              color="info"
                              sx={{ height: 16, fontSize: '0.58rem', fontWeight: 700 }}
                            />
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: row.isMatched || hasExtra ? 600 : 400, whiteSpace: 'nowrap' }}>
                        {isPaidOffEarly ? (
                          <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600, fontSize: { xs: '0.7rem', sm: '0.75rem' } }}>
                            $0.00
                          </Typography>
                        ) : (
                          usdCents.format(row.actualPayment)
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'table-cell' } }}>
                        {usdCents.format(row.actualInterest)}
                      </TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary', display: { xs: 'none', md: 'table-cell' } }}>
                        {usdCents.format(row.actualPrincipal)}
                      </TableCell>
                      <TableCell>
                        {isPaidOffEarly ? (
                          <Chip
                            size="small"
                            label="Paid Off 🎉"
                            color="success"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.62rem', borderRadius: 1, fontWeight: 600 }}
                          />
                        ) : row.isMatched ? (
                          <Tooltip title="Click to view matched transactions">
                            <Chip
                              size="small"
                              label="Matched"
                              color="success"
                              variant="outlined"
                              onClick={() => onSelectMatchedRow(row.transactions, row.date)}
                              sx={{ height: 20, fontSize: '0.62rem', borderRadius: 1, cursor: 'pointer' }}
                            />
                          </Tooltip>
                        ) : row.isAssumed ? (
                          <Chip
                            size="small"
                            label="Assumed"
                            color="warning"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.62rem', borderRadius: 1 }}
                          />
                        ) : (
                          <Chip
                            size="small"
                            label="Projected"
                            color="default"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.62rem', borderRadius: 1 }}
                          />
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {usdCents.format(row.actualBalance)}
                        {hasExtra && (
                          <Typography variant="caption" sx={{ display: 'block', color: 'success.main', fontSize: '0.62rem', fontWeight: 600 }}>
                            +{usdCents.format(row.extraPayment)} extra
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </TableContainer>
      </Collapse>
    </Paper>
  );
}
