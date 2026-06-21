import { useState, useMemo, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useShallow } from 'zustand/react/shallow';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
  useDefaultLayout,
} from 'react-resizable-panels';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tab,
  Tabs,
  Stack,
  Paper,
  Divider,
  LinearProgress,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  InputAdornment,
  Chip,
  Slider,
  Collapse,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import PercentIcon from '@mui/icons-material/Percent';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';

import { useTheme } from '@mui/material/styles';

import { db } from '../db';
import { useDataStore } from '../dataStore';
import { usdCents } from '../lib';

import type { Loan } from '../types';

const DEFAULT_HOUSE_CONFIG: Omit<Loan, 'id' | 'createdAt'> = {
  name: 'Primary Residence',
  type: 'house',
  principal: 450000,
  rate: 6.5,
  termYears: 30,
  startDate: '2024-01-15',
  category: 'Mortgage',
  monthlyPayment: undefined,
  propertyValue: 500000,
  downPayment: 50000,
  extraMonthlyPayment: undefined,
  extraOneTimePayment: undefined,
  extraOneTimeMonth: undefined,
};

const DEFAULT_CAR_CONFIG: Omit<Loan, 'id' | 'createdAt'> = {
  name: 'Car Loan',
  type: 'car',
  principal: 35000,
  rate: 5.5,
  termYears: 5,
  startDate: '2024-06-15',
  category: 'Auto Loan',
  monthlyPayment: 389,
  propertyValue: 40000,
  downPayment: 5000,
  extraMonthlyPayment: undefined,
  extraOneTimePayment: undefined,
  extraOneTimeMonth: undefined,
};

interface PaymentRow {
  paymentNumber: number;
  date: string;
  scheduledPayment: number;
  scheduledInterest: number;
  scheduledPrincipal: number;
  scheduledBalance: number;
  actualPayment: number;
  actualInterest: number;
  actualPrincipal: number;
  actualBalance: number;
  extraPayment: number;
  isMatched: boolean;
  isAssumed: boolean;
  isFuture: boolean;
  isPast: boolean;
  transactions: any[];
  cumulativeScheduledInterest: number;
  cumulativeActualInterest: number;
  cumulativeActualPrincipal: number;
  cumulativeActualPayment: number;
}

export default function Loans() {
  const [activeLoanId, setActiveLoanId] = useState<number | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addType, setAddType] = useState<'house' | 'car'>('house');

  const panelIds = ['loan-parameters', 'loan-graph'];
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `loans-layout-v1-${panelIds.join('-')}`,
    panelIds,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  });

  // Settings DB Query
  const loans = useLiveQuery(() => db.loans.toArray(), []) || [];

  const currentLoan = useMemo(() => {
    return loans.find((l) => l.id === activeLoanId) || null;
  }, [loans, activeLoanId]);

  const currentConfig = currentLoan;
  const activeTab = currentConfig ? currentConfig.type : 'house';

  useEffect(() => {
    if (activeLoanId === null && loans.length > 0 && loans[0].id !== undefined) {
      setActiveLoanId(loans[0].id);
    }
  }, [loans, activeLoanId]);

  // Form State
  const [formName, setFormName] = useState('');
  const [formPrincipal, setFormPrincipal] = useState('');
  const [formRate, setFormRate] = useState('');
  const [formTerm, setFormTerm] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formMerchant, setFormMerchant] = useState('');
  const [formMonthlyPayment, setFormMonthlyPayment] = useState('');
  const [formPropertyValue, setFormPropertyValue] = useState('');
  const [formDownPayment, setFormDownPayment] = useState('');
  const [formExtraMonthlyPayment, setFormExtraMonthlyPayment] = useState('');
  const [formExtraOneTimePayment, setFormExtraOneTimePayment] = useState('');
  const [formExtraOneTimeMonth, setFormExtraOneTimeMonth] = useState('');

  // Sync Form with config
  useEffect(() => {
    if (currentConfig) {
      setFormName(currentConfig.name);
      setFormPrincipal(String(currentConfig.principal));
      setFormRate(String(currentConfig.rate));
      setFormTerm(String(currentConfig.termYears));
      setFormStartDate(currentConfig.startDate);
      setFormCategory(currentConfig.category);
      setFormMerchant(currentConfig.merchant || '');
      setFormMonthlyPayment(String(currentConfig.monthlyPayment ?? ''));
      setFormPropertyValue(currentConfig.propertyValue ? String(currentConfig.propertyValue) : '');
      setFormDownPayment(currentConfig.downPayment ? String(currentConfig.downPayment) : '');
      setFormExtraMonthlyPayment(currentConfig.extraMonthlyPayment ? String(currentConfig.extraMonthlyPayment) : '');
      setFormExtraOneTimePayment(currentConfig.extraOneTimePayment ? String(currentConfig.extraOneTimePayment) : '');
      setFormExtraOneTimeMonth(currentConfig.extraOneTimeMonth ? String(currentConfig.extraOneTimeMonth) : '');
    }
  }, [currentConfig, activeLoanId]);

  // Global Categories and Transactions
  const { transactions, categories } = useDataStore(useShallow((s) => ({
    transactions: s.transactions,
    categories: s.categories,
  })));

  const [snackbarMsg, setSnackbarMsg] = useState('');
  const [showScheduleDetails, setShowScheduleDetails] = useState(false);
  const [onlyShowMatched, setOnlyShowMatched] = useState(false);
  const [activeTxDialogRows, setActiveTxDialogRows] = useState<any[] | null>(null);
  const [activeTxDialogDate, setActiveTxDialogDate] = useState<string>('');

  // Handler for loading payment details from selected category transactions
  const handleCategoryChange = (categoryName: string) => {
    setFormCategory(categoryName);
    if (!categoryName) return;

    // Filter transactions for selected category to identify typical payment amount
    const categoryTxns = transactions.filter((t) => t.category === categoryName);
    if (categoryTxns.length > 0) {
      const amounts = categoryTxns.map((t) => Math.abs(t.amount));
      const counts: Record<number, number> = {};
      let mostCommonAmt = 0;
      let maxCount = 0;
      for (const amt of amounts) {
        counts[amt] = (counts[amt] || 0) + 1;
        if (counts[amt] > maxCount) {
          maxCount = counts[amt];
          mostCommonAmt = amt;
        }
      }
      if (mostCommonAmt > 0) {
        setFormMonthlyPayment(String(mostCommonAmt));
        setSnackbarMsg(`Loaded monthly payment of ${usdCents.format(mostCommonAmt)} from category history.`);
      }
    }
  };

  // Amortization engine calculation
  const scheduleData = useMemo(() => {
    if (!currentConfig) return null;
    const P = currentConfig.principal - (currentConfig.downPayment || 0);
    const r = (currentConfig.rate / 100) / 12;
    const n = currentConfig.termYears * 12;
    const startDate = new Date(currentConfig.startDate + 'T00:00:00');

    // Use monthly payment override if specified, otherwise calculate mathematically
    let scheduledMonthlyPayment = currentConfig.monthlyPayment || 0;
    if (scheduledMonthlyPayment <= 0) {
      if (r === 0) {
        scheduledMonthlyPayment = P / n;
      } else {
        scheduledMonthlyPayment = P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
      }
    }

    // Filter and group transactions by calendar month (YYYY-MM)
    const txByMonth = new Map<string, any[]>();
    for (const t of transactions) {
      let isMatch = false;
      if (currentConfig.merchant) {
        const normMerchant = currentConfig.merchant.toLowerCase().trim();
        const normDesc = t.description.toLowerCase();
        const normKey = (t.merchantKey || '').toLowerCase();
        isMatch = normDesc.includes(normMerchant) || normKey.includes(normMerchant);
      } else {
        isMatch = t.category === currentConfig.category;
      }

      if (isMatch) {
        const monthKeyStr = t.date.substring(0, 7); // YYYY-MM
        const list = txByMonth.get(monthKeyStr) || [];
        list.push(t);
        txByMonth.set(monthKeyStr, list);
      }
    }

    const rows: PaymentRow[] = [];
    let sBalance = P;
    let aBalance = P;
    let cumulativeScheduledInterest = 0;
    let cumulativeActualInterest = 0;
    let totalActualPaid = 0;
    let matchedPaymentsCount = 0;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    for (let i = 1; i <= n; i++) {
      const pDate = new Date(startDate.getFullYear(), startDate.getMonth() + i - 1, 15);
      const yearMonth = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}`;

      // Scheduled calculations
      let sInterest = sBalance * r;
      let sPrincipal = scheduledMonthlyPayment - sInterest;
      if (sBalance < sPrincipal) {
        sPrincipal = sBalance;
        sInterest = 0;
      }
      sBalance = Math.max(0, sBalance - sPrincipal);
      cumulativeScheduledInterest += sInterest;

      // Actual calculations
      const monthTxns = txByMonth.get(yearMonth) || [];
      const actualPaid = monthTxns.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const isMatched = monthTxns.length > 0;
      if (isMatched && yearMonth <= todayStr) {
        matchedPaymentsCount++;
      }

      let aInterest = 0;
      let aPrincipal = 0;
      let extra = 0;

      const isFuture = yearMonth > todayStr;
      const isAssumed = !isMatched && !isFuture;

      if (aBalance > 0) {
        aInterest = aBalance * r;
        if (isFuture || isAssumed) {
          // Project or assume standard payment plus any extra payments (only from present date onwards)
          let paymentAmount = scheduledMonthlyPayment;
          if (yearMonth >= todayStr && currentConfig.extraMonthlyPayment && currentConfig.extraMonthlyPayment > 0) {
            paymentAmount += currentConfig.extraMonthlyPayment;
          }
          if (yearMonth >= todayStr && currentConfig.extraOneTimePayment && currentConfig.extraOneTimePayment > 0 && currentConfig.extraOneTimeMonth === i) {
            paymentAmount += currentConfig.extraOneTimePayment;
          }

          aPrincipal = Math.min(aBalance, Math.max(0, paymentAmount - aInterest));
          aBalance = Math.max(0, aBalance - aPrincipal);
          totalActualPaid += paymentAmount;
          cumulativeActualInterest += aInterest;
          extra = yearMonth >= todayStr
            ? (currentConfig.extraMonthlyPayment || 0) + (currentConfig.extraOneTimeMonth === i ? (currentConfig.extraOneTimePayment || 0) : 0)
            : 0;
        } else {
          // Matched past month: use actual transactions
          aPrincipal = Math.min(aBalance, Math.max(0, actualPaid - aInterest));
          aBalance = Math.max(0, aBalance - aPrincipal);
          extra = Math.max(0, actualPaid - scheduledMonthlyPayment);
          totalActualPaid += actualPaid;
          cumulativeActualInterest += aInterest;
        }
      }

      const cumulativeActualPrincipal = P - aBalance;
      const cumulativeActualPayment = cumulativeActualPrincipal + cumulativeActualInterest;

      rows.push({
        paymentNumber: i,
        date: pDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        scheduledPayment: scheduledMonthlyPayment,
        scheduledInterest: sInterest,
        scheduledPrincipal: sPrincipal,
        scheduledBalance: sBalance,
        actualPayment: isFuture || isAssumed 
          ? scheduledMonthlyPayment + 
            (yearMonth >= todayStr ? (currentConfig.extraMonthlyPayment || 0) : 0) + 
            (yearMonth >= todayStr && currentConfig.extraOneTimeMonth === i ? (currentConfig.extraOneTimePayment || 0) : 0)
          : actualPaid,
        actualInterest: aInterest,
        actualPrincipal: aPrincipal,
        actualBalance: aBalance,
        extraPayment: extra,
        isMatched: isMatched && !isFuture,
        isAssumed,
        isFuture,
        isPast: yearMonth < todayStr,
        transactions: monthTxns,
        cumulativeScheduledInterest,
        cumulativeActualInterest,
        cumulativeActualPrincipal,
        cumulativeActualPayment,
      });

      if (sBalance === 0 && aBalance === 0 && isFuture) {
        break;
      }
    }

    const interestSaved = Math.max(0, cumulativeScheduledInterest - cumulativeActualInterest);

    const elapsedRows = rows.filter(r => !r.isFuture);
    const amountPaidUpToToday = elapsedRows.reduce((sum, r) => sum + r.actualPayment, 0);
    const paymentsCountUpToToday = elapsedRows.length;
    const balanceAsOfToday = elapsedRows.length > 0 ? elapsedRows[elapsedRows.length - 1].actualBalance : P;
    const percentPaid = Math.max(0, Math.min(100, ((P - balanceAsOfToday) / P) * 100));

    // Calculate months remaining
    let monthsRemaining = 0;
    if (balanceAsOfToday > 0 && scheduledMonthlyPayment > 0) {
      if (r === 0) {
        monthsRemaining = balanceAsOfToday / scheduledMonthlyPayment;
      } else {
        const num = Math.log(1 - (balanceAsOfToday * r) / scheduledMonthlyPayment);
        if (!isNaN(num)) {
          monthsRemaining = -num / Math.log(1 + r);
        } else {
          monthsRemaining = balanceAsOfToday / scheduledMonthlyPayment;
        }
      }
    }

    return {
      rows,
      scheduledMonthlyPayment,
      totalScheduledInterest: cumulativeScheduledInterest,
      totalActualInterest: cumulativeActualInterest,
      interestSaved,
      actualBalance: balanceAsOfToday,
      monthsRemaining: Math.ceil(monthsRemaining),
      totalActualPaid,
      percentPaid,
      matchedPaymentsCount,
      amountPaidUpToToday,
      paymentsCountUpToToday,
    };
  }, [currentConfig, transactions]);

  const handleSaveSettings = async () => {
    const P = parseFloat(formPrincipal);
    const R = parseFloat(formRate);
    const T = parseInt(formTerm, 10);
    const MP = parseFloat(formMonthlyPayment);
    const PV = parseFloat(formPropertyValue);
    const DP = parseFloat(formDownPayment);
    const EMP = parseFloat(formExtraMonthlyPayment);
    const EOTP = parseFloat(formExtraOneTimePayment);
    const EOTM = parseInt(formExtraOneTimeMonth, 10);
    
    if (isNaN(P) || P <= 0 || isNaN(R) || R < 0 || isNaN(T) || T <= 0 || !formStartDate || !formName.trim()) {
      setSnackbarMsg('Please fill out all settings with valid positive numbers and a loan name.');
      return;
    }

    const updatedConfig: Loan = {
      id: currentConfig?.id,
      name: formName.trim(),
      type: currentConfig?.type || 'house',
      principal: P,
      rate: R,
      termYears: T,
      startDate: formStartDate,
      category: formCategory,
      merchant: formMerchant.trim() || undefined,
      monthlyPayment: isNaN(MP) || MP <= 0 ? undefined : MP,
      propertyValue: isNaN(PV) || PV <= 0 ? undefined : PV,
      downPayment: isNaN(DP) || DP < 0 ? undefined : DP,
      extraMonthlyPayment: isNaN(EMP) || EMP <= 0 ? undefined : EMP,
      extraOneTimePayment: isNaN(EOTP) || EOTP <= 0 ? undefined : EOTP,
      extraOneTimeMonth: isNaN(EOTM) || EOTM <= 0 ? undefined : EOTM,
      createdAt: currentConfig?.createdAt || new Date().toISOString(),
    };

    if (currentConfig && currentConfig.id !== undefined) {
      await db.loans.put(updatedConfig);
      setSnackbarMsg('Loan settings saved successfully!');
    }
  };

  const handleResetDefaults = async () => {
    if (currentConfig && currentConfig.id !== undefined) {
      const defaultVal = currentConfig.type === 'house' ? DEFAULT_HOUSE_CONFIG : DEFAULT_CAR_CONFIG;
      const resetLoan = {
        ...currentConfig,
        ...defaultVal,
        name: currentConfig.name,
        type: currentConfig.type,
      };

      setFormPrincipal(String(resetLoan.principal));
      setFormRate(String(resetLoan.rate));
      setFormTerm(String(resetLoan.termYears));
      setFormStartDate(resetLoan.startDate);
      setFormCategory(resetLoan.category);
      setFormMerchant(resetLoan.merchant || '');
      setFormMonthlyPayment(String(resetLoan.monthlyPayment ?? ''));
      setFormPropertyValue(resetLoan.propertyValue ? String(resetLoan.propertyValue) : '');
      setFormDownPayment(resetLoan.downPayment ? String(resetLoan.downPayment) : '');
      setFormExtraMonthlyPayment(resetLoan.extraMonthlyPayment ? String(resetLoan.extraMonthlyPayment ?? '') : '');
      setFormExtraOneTimePayment(resetLoan.extraOneTimePayment ? String(resetLoan.extraOneTimePayment ?? '') : '');
      setFormExtraOneTimeMonth(resetLoan.extraOneTimeMonth ? String(resetLoan.extraOneTimeMonth ?? '') : '');

      await db.loans.put(resetLoan);
      setSnackbarMsg('Reset to default values.');
    }
  };

  const handleAddLoanSubmit = async () => {
    const nameStr = addName.trim();
    if (!nameStr) {
      alert('Please enter a loan name.');
      return;
    }

    const defaultVal = addType === 'house' ? DEFAULT_HOUSE_CONFIG : DEFAULT_CAR_CONFIG;
    const newLoan: Loan = {
      ...defaultVal,
      name: nameStr,
      type: addType,
      createdAt: new Date().toISOString(),
    };

    const newId = await db.loans.add(newLoan);
    setActiveLoanId(newId);
    setAddDialogOpen(false);
    setAddName('');
    setSnackbarMsg(`Loan "${nameStr}" created successfully.`);
  };

  const handleDeleteLoan = async () => {
    if (!currentConfig || currentConfig.id === undefined) return;
    if (!window.confirm(`Are you sure you want to delete the loan "${currentConfig.name}"? This action cannot be undone.`)) {
      return;
    }

    const idToDelete = currentConfig.id;
    await db.loans.delete(idToDelete);

    const remainingLoans = loans.filter((l) => l.id !== idToDelete);
    if (remainingLoans.length > 0 && remainingLoans[0].id !== undefined) {
      setActiveLoanId(remainingLoans[0].id);
    } else {
      setActiveLoanId(null);
    }
    setSnackbarMsg(`Loan "${currentConfig.name}" deleted.`);
  };

  if (loans.length === 0) {
    return (
      <Stack spacing={3} sx={{ width: '100%', pb: 5 }}>
        {/* Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Loans Tracker
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Visualize your amortization schedules and match against transaction histories.
            </Typography>
          </Box>
          <Button
            variant="contained"
            color="primary"
            onClick={() => setAddDialogOpen(true)}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            + Add Loan
          </Button>
        </Stack>

        <Paper
          elevation={0}
          sx={{
            p: 6,
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 2,
            textAlign: 'center',
            bgcolor: 'background.default'
          }}
        >
          <HomeIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2, opacity: 0.5 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            No Loans Tracked
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}>
            Get started by adding a house mortgage or auto loan to simulate payment schedules, extra payments, and match against actual bank transactions.
          </Typography>
          <Button
            variant="contained"
            color="primary"
            onClick={() => setAddDialogOpen(true)}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Create Your First Loan
          </Button>
        </Paper>

        {/* Add Loan Dialog */}
        <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ fontWeight: 700 }}>Add New Loan</DialogTitle>
          <DialogContent sx={{ pt: 1 }}>
            <Stack spacing={2} sx={{ mt: 1 }}>
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
                  onChange={(e) => setAddType(e.target.value as 'house' | 'car')}
                  label="Loan Type"
                >
                  <MenuItem value="house">House Mortgage</MenuItem>
                  <MenuItem value="car">Car Loan / Lease</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={() => setAddDialogOpen(false)} variant="outlined" color="inherit" size="small">
              Cancel
            </Button>
            <Button onClick={handleAddLoanSubmit} variant="contained" color="primary" size="small">
              Add Loan
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
    );
  }

  if (!scheduleData || !currentConfig) return null;

  const cardWidth = currentConfig.propertyValue ? 2.4 : 3;

  return (
    <Stack spacing={3} sx={{ width: '100%', pb: 5 }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Loans Tracker
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Visualize your amortization schedules and match against transaction histories.
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="primary"
          onClick={() => setAddDialogOpen(true)}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          + Add Loan
        </Button>
      </Stack>

      {/* Tabs */}
      <Paper sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={activeLoanId}
          onChange={(_, val) => {
            setActiveLoanId(val);
            setShowScheduleDetails(false);
          }}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 2 }}
        >
          {loans.map((loan) => (
            <Tab
              key={loan.id}
              icon={loan.type === 'house' ? <HomeIcon sx={{ fontSize: 18 }} /> : <DirectionsCarIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
              label={loan.name}
              value={loan.id}
              sx={{ fontWeight: 600, minHeight: 48 }}
            />
          ))}
        </Tabs>
      </Paper>

      {/* Summary Cards */}
      <Grid container spacing={3}>
        {/* Card 1: Remaining Balance */}
        <Grid item xs={12} sm={6} md={cardWidth}>
          <Card
            elevation={0}
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              background: (theme) =>
                theme.palette.mode === 'dark'
                  ? 'linear-gradient(135deg, rgba(25, 118, 210, 0.1) 0%, rgba(25, 118, 210, 0.02) 100%)'
                  : 'linear-gradient(135deg, rgba(25, 118, 210, 0.05) 0%, rgba(25, 118, 210, 0.01) 100%)',
            }}
          >
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                Remaining Balance
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800, my: 1, fontVariantNumeric: 'tabular-nums' }}>
                {usdCents.format(scheduleData.actualBalance)}
              </Typography>
              <Stack direction="row" justifyContent="space-between" sx={{ mt: 2, mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {scheduleData.percentPaid.toFixed(1)}% paid
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Original: {usdCents.format(currentConfig.principal - (currentConfig.downPayment || 0))}
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={scheduleData.percentPaid}
                color="primary"
                sx={{ height: 6, borderRadius: 3 }}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Card 2: Equity (rendered dynamically when Property Value is available) */}
        {!!currentConfig.propertyValue && (
          <Grid item xs={12} sm={6} md={cardWidth}>
            <Card
              elevation={0}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                background: (theme) =>
                  theme.palette.mode === 'dark'
                    ? 'linear-gradient(135deg, rgba(156, 39, 176, 0.1) 0%, rgba(156, 39, 176, 0.02) 100%)'
                    : 'linear-gradient(135deg, rgba(156, 39, 176, 0.05) 0%, rgba(156, 39, 176, 0.01) 100%)',
              }}
            >
              <CardContent>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                  {activeTab === 'house' ? 'Estimated Home Equity' : 'Estimated Vehicle Equity'}
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 800, my: 1, fontVariantNumeric: 'tabular-nums', color: 'secondary.main' }}>
                  {usdCents.format(Math.max(0, currentConfig.propertyValue - scheduleData.actualBalance))}
                </Typography>
                <Stack direction="row" justifyContent="space-between" sx={{ mt: 2, mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    {((Math.max(0, currentConfig.propertyValue - scheduleData.actualBalance) / currentConfig.propertyValue) * 100).toFixed(1)}% equity
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Value: {usdCents.format(currentConfig.propertyValue)}
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, (Math.max(0, currentConfig.propertyValue - scheduleData.actualBalance) / currentConfig.propertyValue) * 100)}
                  color="secondary"
                  sx={{ height: 6, borderRadius: 3 }}
                />
                {currentConfig.downPayment !== undefined && currentConfig.downPayment > 0 && (
                  <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Down Payment
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                      {usdCents.format(currentConfig.downPayment)}
                    </Typography>
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Card 3: Amount Paid / Payments (Progress to Date) */}
        <Grid item xs={12} sm={6} md={cardWidth}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                Payments to Date
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800, my: 1, fontVariantNumeric: 'tabular-nums' }}>
                {usdCents.format(scheduleData.amountPaidUpToToday)}
              </Typography>
              <Stack direction="row" justifyContent="space-between" sx={{ mt: 2, mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {((scheduleData.paymentsCountUpToToday / (currentConfig.termYears * 12)) * 100).toFixed(1)}% elapsed
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {scheduleData.paymentsCountUpToToday} / {currentConfig.termYears * 12} pmts
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, (scheduleData.paymentsCountUpToToday / (currentConfig.termYears * 12)) * 100)}
                color="info"
                sx={{ height: 6, borderRadius: 3 }}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Card 4: Monthly Payment Details */}
        <Grid item xs={12} sm={6} md={cardWidth}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                Monthly Payment Details
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800, my: 1, fontVariantNumeric: 'tabular-nums' }}>
                {usdCents.format(scheduleData.scheduledMonthlyPayment)}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
                <CalendarMonthIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  <strong>{scheduleData.monthsRemaining}</strong> months remaining
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 5: Interest Saved & Matching */}
        <Grid item xs={12} sm={6} md={cardWidth}>
          <Card
            elevation={0}
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              background: (theme) =>
                theme.palette.mode === 'dark'
                  ? 'linear-gradient(135deg, rgba(76, 175, 80, 0.1) 0%, rgba(76, 175, 80, 0.02) 100%)'
                  : 'linear-gradient(135deg, rgba(76, 175, 80, 0.05) 0%, rgba(76, 175, 80, 0.01) 100%)',
            }}
          >
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                Interest Saved & Matching
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800, my: 1, color: 'success.main', fontVariantNumeric: 'tabular-nums' }}>
                {usdCents.format(scheduleData.interestSaved)}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
                <CheckCircleOutlineIcon sx={{ fontSize: 16, color: 'success.main' }} />
                <Typography variant="body2" color="text.secondary">
                  <strong>{scheduleData.matchedPaymentsCount}</strong> payments matched
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Resizable Config Sidebar & Graph Panel */}
      <Box sx={{ width: '100%', height: 600, display: 'flex' }}>
        <PanelGroup
          orientation="horizontal"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
          style={{ height: '100%', width: '100%' }}
        >
          {/* Left Panel: Parameters/Filters */}
          <Panel id="loan-parameters" defaultSize="30%" minSize="25%" maxSize="45%">
            <Paper
              sx={{
                p: 3,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Loan Parameters
              </Typography>
              
              <Box sx={{ flexGrow: 1 }}>
                <Stack spacing={2.5}>
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
                    label="Original Loan Amount"
                    value={formPrincipal}
                    onChange={(e) => setFormPrincipal(e.target.value)}
                    InputProps={{
                      startAdornment: <InputAdornment position="start"><AttachMoneyIcon fontSize="small" /></InputAdornment>,
                    }}
                  />
                  <TextField
                    fullWidth
                    size="small"
                    label="Down Payment"
                    value={formDownPayment}
                    onChange={(e) => setFormDownPayment(e.target.value)}
                    InputProps={{
                      startAdornment: <InputAdornment position="start"><AttachMoneyIcon fontSize="small" /></InputAdornment>,
                    }}
                  />
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
                      {categories.map((cat) => (
                        <MenuItem key={cat.id} value={cat.name}>
                          {cat.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    fullWidth
                    size="small"
                    label="Linked Merchant Pattern (Optional)"
                    value={formMerchant}
                    onChange={(e) => setFormMerchant(e.target.value)}
                    placeholder="e.g. TOYOTA FIN"
                    helperText="If specified, matches transactions by merchant name instead of category."
                    FormHelperTextProps={{ sx: { mx: 1 } }}
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
                  <TextField
                    fullWidth
                    size="small"
                    label={activeTab === 'house' ? "Selling Price (Home Value)" : "Estimated Resale Value"}
                    value={formPropertyValue}
                    onChange={(e) => setFormPropertyValue(e.target.value)}
                    helperText={activeTab === 'house' ? "Estimated resale value of the house for equity tracking" : "Estimated resale value of the car for equity tracking"}
                    InputProps={{
                      startAdornment: <InputAdornment position="start"><AttachMoneyIcon fontSize="small" /></InputAdornment>,
                    }}
                  />
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Extra Payments (Accelerate Payoff)
                  </Typography>
                  <Box>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                      <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                        Monthly Extra Payment
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main', fontVariantNumeric: 'tabular-nums' }}>
                        {usdCents.format(Number(formExtraMonthlyPayment) || 0)}
                      </Typography>
                    </Stack>
                    <Slider
                      value={Number(formExtraMonthlyPayment) || 0}
                      min={0}
                      max={2000}
                      step={10}
                      onChange={(_, val) => setFormExtraMonthlyPayment(String(val))}
                      valueLabelDisplay="auto"
                      valueLabelFormat={(val) => `$${val}`}
                      sx={{
                        color: 'success.main',
                        py: 1,
                        '& .MuiSlider-thumb': {
                          width: 14,
                          height: 14,
                          '&:hover, &.Mui-focusVisible': {
                            boxShadow: (theme) => `0px 0px 0px 8px ${theme.palette.success.main}1a`,
                          },
                          '&.Mui-active': {
                            boxShadow: (theme) => `0px 0px 0px 14px ${theme.palette.success.main}2a`,
                          },
                        },
                      }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: -0.5 }}>
                      Additional principal paid every month
                    </Typography>
                  </Box>
                  <TextField
                    fullWidth
                    size="small"
                    label="One-Time Extra Payment"
                    value={formExtraOneTimePayment}
                    onChange={(e) => setFormExtraOneTimePayment(e.target.value)}
                    helperText="Additional principal paid once"
                    InputProps={{
                      startAdornment: <InputAdornment position="start"><AttachMoneyIcon fontSize="small" /></InputAdornment>,
                    }}
                  />
                  <FormControl fullWidth size="small" disabled={!formExtraOneTimePayment || parseFloat(formExtraOneTimePayment) <= 0}>
                    <InputLabel id="one-time-month-label">Apply One-Time Payment At</InputLabel>
                    <Select
                      labelId="one-time-month-label"
                      value={formExtraOneTimeMonth}
                      onChange={(e) => setFormExtraOneTimeMonth(e.target.value)}
                      label="Apply One-Time Payment At"
                    >
                      <MenuItem value=""><em>None</em></MenuItem>
                      {scheduleData.rows
                        .filter((row) => !row.isPast)
                        .map((row) => (
                          <MenuItem key={row.paymentNumber} value={row.paymentNumber}>
                            Month {row.paymentNumber} ({row.date})
                          </MenuItem>
                        ))}
                    </Select>
                  </FormControl>
                </Stack>
              </Box>

              <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between" sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Button
                  variant="text"
                  size="small"
                  color="error"
                  onClick={handleDeleteLoan}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  Delete Loan
                </Button>
                <Stack direction="row" spacing={1.5}>
                  <Button
                    variant="outlined"
                    size="small"
                    color="inherit"
                    onClick={handleResetDefaults}
                    startIcon={<SettingsBackupRestoreIcon />}
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                  >
                    Reset
                  </Button>
                  <Button
                    variant="contained"
                    size="small"
                    color="primary"
                    onClick={handleSaveSettings}
                    sx={{ textTransform: 'none', fontWeight: 600, minWidth: 100 }}
                  >
                    Save
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          </Panel>

          <StyledResizeHandle ariaLabel="Resize loan config panel" />

          {/* Right Panel: Graph */}
          <Panel id="loan-graph" defaultSize="70%">
            <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2, flexWrap: 'wrap', gap: 2 }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Remaining Balance & Payment Projections
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Visualizing balance, payments, principal, and interest totals over time.
                  </Typography>
                </Box>
                <Stack direction="row" spacing={2} sx={{ display: { xs: 'none', sm: 'flex' }, flexWrap: 'wrap', gap: 1 }}>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Box sx={{ width: 12, height: 12, bgcolor: 'var(--mui-palette-primary-main, #1976d2)', borderRadius: 0.5 }} />
                    <Typography variant="caption" color="text.secondary">Balance</Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Box sx={{ width: 12, height: 12, bgcolor: 'var(--mui-palette-secondary-main, #9c27b0)', borderRadius: 0.5 }} />
                    <Typography variant="caption" color="text.secondary">Total Payments</Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Box sx={{ width: 12, height: 12, bgcolor: 'var(--mui-palette-success-main, #2e7d32)', borderRadius: 0.5 }} />
                    <Typography variant="caption" color="text.secondary">Principal Paid</Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Box sx={{ width: 12, height: 12, bgcolor: 'var(--mui-palette-warning-main, #ed6c02)', borderRadius: 0.5 }} />
                    <Typography variant="caption" color="text.secondary">Interest Paid</Typography>
                  </Stack>
                </Stack>
              </Stack>
              
              <Box sx={{ flex: 1, minHeight: 0, position: 'relative', width: '100%', height: '100%' }}>
                <LoanChart 
                  rows={scheduleData.rows} 
                  originalPrincipal={currentConfig.principal - (currentConfig.downPayment || 0)} 
                />
              </Box>
            </Paper>
          </Panel>
        </PanelGroup>
      </Box>

      {/* Schedule Table Container */}
      <Paper sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        <Button
          fullWidth
          variant="text"
          color="inherit"
          onClick={() => setShowScheduleDetails(!showScheduleDetails)}
          endIcon={showScheduleDetails ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          sx={{
            justifyContent: 'space-between',
            px: 3,
            py: 2,
            textTransform: 'none',
            fontSize: '0.9rem',
            fontWeight: 700,
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          Detailed Amortization & Transaction Matching
        </Button>
        
        <Collapse in={showScheduleDetails}>
          <Divider />
          <Box sx={{ p: 2, bgcolor: 'background.default', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Showing {scheduleData.rows.length} schedule periods
            </Typography>
            <FormControlLabelCustom
              label="Only show linked months"
              checked={onlyShowMatched}
              onChange={(e) => setOnlyShowMatched(e)}
            />
          </Box>
          <TableContainer sx={{ maxHeight: 440, overflowY: 'auto' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell align="center" sx={{ fontWeight: 700, width: 60 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 110 }}>Period</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Payment</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, display: { xs: 'none', sm: 'table-cell' } }}>Interest</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, display: { xs: 'none', md: 'table-cell' } }}>Principal</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 120 }}>Link Status</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Outstanding Balance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {scheduleData.rows
                  .filter((row) => !onlyShowMatched || row.isMatched)
                  .map((row) => {
                    const hasExtra = row.extraPayment > 0.01;
                    
                    return (
                      <TableRow
                        key={row.paymentNumber}
                        hover
                        sx={{
                          bgcolor: row.isMatched
                            ? (theme) => theme.palette.mode === 'dark' ? 'rgba(76, 175, 80, 0.05)' : 'rgba(76, 175, 80, 0.02)'
                            : row.isAssumed
                            ? (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 152, 0, 0.05)' : 'rgba(255, 152, 0, 0.02)'
                            : 'inherit',
                          '& td': { fontVariantNumeric: 'tabular-nums' }
                        }}
                      >
                        <TableCell align="center" color="text.secondary">{row.paymentNumber}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{row.date}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: row.isMatched ? 600 : 400 }}>
                          {usdCents.format(row.actualPayment)}
                        </TableCell>
                        <TableCell align="right" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'table-cell' } }}>
                          {usdCents.format(row.actualInterest)}
                        </TableCell>
                        <TableCell align="right" sx={{ color: 'text.secondary', display: { xs: 'none', md: 'table-cell' } }}>
                          {usdCents.format(row.actualPrincipal)}
                        </TableCell>
                        <TableCell>
                          {row.isMatched ? (
                            <Tooltip title="Click to view matched transactions">
                              <Chip
                                size="small"
                                label="Matched"
                                color="success"
                                variant="outlined"
                                onClick={() => {
                                  setActiveTxDialogRows(row.transactions);
                                  setActiveTxDialogDate(row.date);
                                }}
                                sx={{ height: 20, fontSize: '0.65rem', borderRadius: 1, cursor: 'pointer' }}
                              />
                            </Tooltip>
                          ) : row.isAssumed ? (
                            <Chip
                              size="small"
                              label="Assumed"
                              color="warning"
                              variant="outlined"
                              sx={{ height: 20, fontSize: '0.65rem', borderRadius: 1 }}
                            />
                          ) : (
                            <Chip
                              size="small"
                              label="Projected"
                              color="default"
                              variant="outlined"
                              sx={{ height: 20, fontSize: '0.65rem', borderRadius: 1 }}
                            />
                          )}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {usdCents.format(row.actualBalance)}
                          {hasExtra && (
                            <Typography variant="caption" sx={{ display: 'block', color: 'success.main', fontSize: '0.65rem' }}>
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

      {/* Matched Transactions Dialog */}
      <Dialog
        open={activeTxDialogRows !== null}
        onClose={() => setActiveTxDialogRows(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 2, p: 1 }
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          Matched Transactions — {activeTxDialogDate}
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
                {activeTxDialogRows?.map((t, idx) => (
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
          <Button onClick={() => setActiveTxDialogRows(null)} variant="outlined" color="inherit" size="small">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Loan Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Add New Loan</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
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
                onChange={(e) => setAddType(e.target.value as 'house' | 'car')}
                label="Loan Type"
              >
                <MenuItem value="house">House Mortgage</MenuItem>
                <MenuItem value="car">Car Loan / Lease</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setAddDialogOpen(false)} variant="outlined" color="inherit" size="small">
            Cancel
          </Button>
          <Button onClick={handleAddLoanSubmit} variant="contained" color="primary" size="small">
            Add Loan
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={!!snackbarMsg}
        autoHideDuration={3000}
        onClose={() => setSnackbarMsg('')}
        message={snackbarMsg}
      />
    </Stack>
  );
}

function FormControlLabelCustom({ label, checked, onChange }: { label: string; checked: boolean; onChange: (val: boolean) => void }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" onClick={() => onChange(!checked)} sx={{ cursor: 'pointer', userSelect: 'none' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => {}} // handled by click
        style={{ cursor: 'pointer' }}
      />
      <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
        {label}
      </Typography>
    </Stack>
  );
}

function StyledResizeHandle({ ariaLabel }: { ariaLabel: string }) {
  return (
    <PanelResizeHandle aria-label={ariaLabel} style={{ width: 16, position: 'relative' }}>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          margin: '0 auto',
          width: 2,
          bgcolor: 'divider',
          borderRadius: 1,
          transition: 'background-color 120ms ease',
          '[data-resize-handle-active] &, &:hover': {
            bgcolor: 'primary.main',
            width: 3,
          },
        }}
      />
    </PanelResizeHandle>
  );
}

function LoanChart({ 
  rows, 
  originalPrincipal 
}: { 
  rows: PaymentRow[]; 
  originalPrincipal: number; 
}) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize({
        width: Math.max(100, Math.floor(rect.width || el.clientWidth)),
        height: Math.max(100, Math.floor(rect.height || el.clientHeight)),
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pointsCount = rows.length;

  if (pointsCount === 0) return null;

  const width = size.width || 600;
  const height = size.height || 240;
  const padding = { top: 15, right: 15, bottom: 30, left: 75 };

  const usableWidth = width - padding.left - padding.right;
  const usableHeight = height - padding.top - padding.bottom;

  // Determine Y-axis max value dynamically by looking at max cumulative payments
  const lastRow = rows[rows.length - 1];
  const finalPayment = lastRow && !isNaN(lastRow.cumulativeActualPayment) 
    ? lastRow.cumulativeActualPayment 
    : 0;

  const maxVal = Math.max(
    originalPrincipal || 1,
    finalPayment
  ) || 1;

  const divisor = pointsCount > 1 ? pointsCount - 1 : 1;

  // Build outstanding balance points
  const balPoints = rows.map((r, i) => {
    const x = padding.left + (i / divisor) * usableWidth;
    const val = !isNaN(r.actualBalance) ? r.actualBalance : 0;
    const y = padding.top + usableHeight - (val / maxVal) * usableHeight;
    return `${x},${y}`;
  });

  // Build cumulative payments points
  const pmPoints = rows.map((r, i) => {
    const x = padding.left + (i / divisor) * usableWidth;
    const val = !isNaN(r.cumulativeActualPayment) ? r.cumulativeActualPayment : 0;
    const y = padding.top + usableHeight - (val / maxVal) * usableHeight;
    return `${x},${y}`;
  });

  // Build cumulative principal points
  const prPoints = rows.map((r, i) => {
    const x = padding.left + (i / divisor) * usableWidth;
    const val = !isNaN(r.cumulativeActualPrincipal) ? r.cumulativeActualPrincipal : 0;
    const y = padding.top + usableHeight - (val / maxVal) * usableHeight;
    return `${x},${y}`;
  });

  // Build cumulative interest points
  const intPoints = rows.map((r, i) => {
    const x = padding.left + (i / divisor) * usableWidth;
    const val = !isNaN(r.cumulativeActualInterest) ? r.cumulativeActualInterest : 0;
    const y = padding.top + usableHeight - (val / maxVal) * usableHeight;
    return `${x},${y}`;
  });

  const balPath = `M ${balPoints.join(' L ')}`;
  const pmPath = `M ${pmPoints.join(' L ')}`;
  const prPath = `M ${prPoints.join(' L ')}`;
  const intPath = `M ${intPoints.join(' L ')}`;

  // Grid lines
  const gridLines = [];
  for (let i = 0; i <= 4; i++) {
    const ratio = i / 4;
    const y = padding.top + ratio * usableHeight;
    const val = maxVal * (1 - ratio);
    gridLines.push({ y, val });
  }

  // Monthly ticks (approx 5 ticks)
  const ticks = [];
  const step = Math.max(1, Math.floor(pointsCount / 5));
  for (let i = 0; i < pointsCount; i += step) {
    const x = padding.left + (i / divisor) * usableWidth;
    ticks.push({ x, label: rows[i].date });
  }
  if ((pointsCount - 1) % step !== 0) {
    ticks.push({ x: padding.left + usableWidth, label: rows[pointsCount - 1].date });
  }

  // Mouse / Touch handlers for interactivity
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const svgX = (mouseX / rect.width) * width;
    const relativeX = svgX - padding.left;

    const index = Math.min(
      rows.length - 1,
      Math.max(0, Math.round((relativeX / usableWidth) * (rows.length - 1)))
    );

    const percentX = ((padding.left + (index / (rows.length - 1)) * usableWidth) / width) * 100;
    
    setHoverIndex(index);
    setHoverPos({ x: percentX, y: 0 });
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (!e.touches[0]) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.touches[0].clientX - rect.left;
    const svgX = (mouseX / rect.width) * width;
    const relativeX = svgX - padding.left;

    const index = Math.min(
      rows.length - 1,
      Math.max(0, Math.round((relativeX / usableWidth) * (rows.length - 1)))
    );

    const percentX = ((padding.left + (index / (rows.length - 1)) * usableWidth) / width) * 100;

    setHoverIndex(index);
    setHoverPos({ x: percentX, y: 0 });
  };

  // Hover markers calculations
  let hoverX = 0;
  let balY = 0;
  let pmY = 0;
  let prY = 0;
  let intY = 0;
  if (hoverIndex !== null && rows[hoverIndex]) {
    const row = rows[hoverIndex];
    hoverX = padding.left + (hoverIndex / divisor) * usableWidth;
    
    const balVal = !isNaN(row.actualBalance) ? row.actualBalance : 0;
    const pmVal = !isNaN(row.cumulativeActualPayment) ? row.cumulativeActualPayment : 0;
    const prVal = !isNaN(row.cumulativeActualPrincipal) ? row.cumulativeActualPrincipal : 0;
    const intVal = !isNaN(row.cumulativeActualInterest) ? row.cumulativeActualInterest : 0;

    balY = padding.top + usableHeight - (balVal / maxVal) * usableHeight;
    pmY = padding.top + usableHeight - (pmVal / maxVal) * usableHeight;
    prY = padding.top + usableHeight - (prVal / maxVal) * usableHeight;
    intY = padding.top + usableHeight - (intVal / maxVal) * usableHeight;
  }

  return (
    <Box 
      ref={containerRef}
      sx={{ position: 'relative', width: '100%', height: '100%' }}
      onMouseLeave={() => { setHoverIndex(null); setHoverPos(null); }}
      onTouchEnd={() => { setHoverIndex(null); setHoverPos(null); }}
    >
      <svg 
        viewBox={`0 0 ${width} ${height}`} 
        width="100%" 
        height="100%" 
        style={{ overflow: 'visible', width: '100%', height: '100%' }}
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
      >
        {/* Background grid */}
        {gridLines.map((line, idx) => (
          <g key={idx}>
            <line
              x1={padding.left}
              y1={line.y}
              x2={width - padding.right}
              y2={line.y}
              stroke={theme.palette.divider}
              strokeDasharray="4 4"
            />
            <text
              x={padding.left - 8}
              y={line.y + 4}
              textAnchor="end"
              style={{
                fontSize: 12,
                fontWeight: 600,
                fill: theme.palette.text.secondary,
                fontFamily: 'monospace',
              }}
            >
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(line.val)}
            </text>
          </g>
        ))}

        {/* X axis ticks */}
        {ticks.map((tick, idx) => (
          <g key={idx}>
            <line
              x1={tick.x}
              y1={height - padding.bottom}
              x2={tick.x}
              y2={height - padding.bottom + 4}
              stroke={theme.palette.divider}
            />
            <text
              x={tick.x}
              y={height - padding.bottom + 18}
              textAnchor="middle"
              style={{
                fontSize: 11,
                fontWeight: 600,
                fill: theme.palette.text.secondary,
              }}
            >
              {tick.label}
            </text>
          </g>
        ))}

        {/* Remaining Balance Line */}
        <path
          d={balPath}
          fill="none"
          stroke={theme.palette.primary.main}
          strokeWidth="3"
        />

        {/* Total Payments Line */}
        <path
          d={pmPath}
          fill="none"
          stroke={theme.palette.secondary.main}
          strokeWidth="3"
        />

        {/* Principal Paid Line */}
        <path
          d={prPath}
          fill="none"
          stroke={theme.palette.success.main}
          strokeWidth="3"
        />

        {/* Interest Paid Line */}
        <path
          d={intPath}
          fill="none"
          stroke={theme.palette.warning.main}
          strokeWidth="3"
        />

        {/* Interactive Guideline and Dots */}
        {hoverIndex !== null && (
          <g>
            {/* Vertical Guideline */}
            <line
              x1={hoverX}
              y1={padding.top}
              x2={hoverX}
              y2={height - padding.bottom}
              stroke={theme.palette.text.secondary}
              strokeDasharray="3 3"
              strokeWidth="1.5"
            />
            
            {/* Balance Dot */}
            <circle
              cx={hoverX}
              cy={balY}
              r={5}
              fill={theme.palette.primary.main}
              stroke={theme.palette.background.paper}
              strokeWidth={1.5}
            />

            {/* Total Payments Dot */}
            <circle
              cx={hoverX}
              cy={pmY}
              r={5}
              fill={theme.palette.secondary.main}
              stroke={theme.palette.background.paper}
              strokeWidth={1.5}
            />

            {/* Principal Dot */}
            <circle
              cx={hoverX}
              cy={prY}
              r={5}
              fill={theme.palette.success.main}
              stroke={theme.palette.background.paper}
              strokeWidth={1.5}
            />

            {/* Interest Dot */}
            <circle
              cx={hoverX}
              cy={intY}
              r={5}
              fill={theme.palette.warning.main}
              stroke={theme.palette.background.paper}
              strokeWidth={1.5}
            />
          </g>
        )}
      </svg>

      {/* HTML Interactive Tooltip Overlay */}
      {hoverIndex !== null && hoverPos && rows[hoverIndex] && (
        <Paper
          elevation={4}
          sx={{
            position: 'absolute',
            left: hoverPos.x > 50 ? `calc(${hoverPos.x}% - 240px)` : `calc(${hoverPos.x}% + 15px)`,
            top: '10px',
            p: 1.5,
            width: 220,
            zIndex: 10,
            pointerEvents: 'none',
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1.5,
            boxShadow: (theme) => theme.shadows[3],
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, borderBottom: '1px solid', borderColor: 'divider', pb: 0.5 }}>
            {rows[hoverIndex].date}
          </Typography>
          <Stack spacing={0.5}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">Remaining Balance:</Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', fontVariantNumeric: 'tabular-nums' }}>
                {usdCents.format(rows[hoverIndex].actualBalance)}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">Total Payments:</Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'secondary.main', fontVariantNumeric: 'tabular-nums' }}>
                {usdCents.format(rows[hoverIndex].cumulativeActualPayment)}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">Principal Paid:</Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'success.main', fontVariantNumeric: 'tabular-nums' }}>
                {usdCents.format(rows[hoverIndex].cumulativeActualPrincipal)}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">Interest Paid:</Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'warning.main', fontVariantNumeric: 'tabular-nums' }}>
                {usdCents.format(rows[hoverIndex].cumulativeActualInterest)}
              </Typography>
            </Stack>
            
            <Divider sx={{ my: 0.5 }} />
            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', color: 'text.secondary', fontSize: '0.7rem', mt: 0.5 }}>
              MONTHLY PAYMENT BREAKDOWN
            </Typography>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">Payment Amount:</Typography>
              <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {usdCents.format(rows[hoverIndex].actualPayment)}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">↳ Principal portion:</Typography>
              <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: 'success.main', fontWeight: 600 }}>
                {usdCents.format(rows[hoverIndex].actualPrincipal)}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">↳ Interest portion:</Typography>
              <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: 'warning.main', fontWeight: 600 }}>
                {usdCents.format(rows[hoverIndex].actualInterest)}
              </Typography>
            </Stack>

            {/* Visual ratio bar */}
            {rows[hoverIndex].actualPayment > 0 && (
              <Box sx={{ mt: 1, width: '100%' }}>
                <Box sx={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', bgcolor: 'divider' }}>
                  <Box 
                    sx={{ 
                      width: `${(rows[hoverIndex].actualPrincipal / rows[hoverIndex].actualPayment) * 100}%`, 
                      bgcolor: 'success.main' 
                    }} 
                  />
                  <Box 
                    sx={{ 
                      width: `${(rows[hoverIndex].actualInterest / rows[hoverIndex].actualPayment) * 100}%`, 
                      bgcolor: 'warning.main' 
                    }} 
                  />
                </Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                  <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', fontWeight: 600 }}>
                    {((rows[hoverIndex].actualPrincipal / rows[hoverIndex].actualPayment) * 100).toFixed(0)}% Prin
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', fontWeight: 600 }}>
                    {((rows[hoverIndex].actualInterest / rows[hoverIndex].actualPayment) * 100).toFixed(0)}% Int
                  </Typography>
                </Stack>
              </Box>
            )}
          </Stack>
        </Paper>
      )}
    </Box>
  );
}

