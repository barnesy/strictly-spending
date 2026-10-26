import { useState, useMemo, useEffect, useRef } from 'react';
import { useFilters } from '../stores/store';
import { useLoans, useUniqueMerchants, useCategories, useAccounts } from '../hooks/queries';
import { useAddLoan, useUpdateLoan, useDeleteLoan } from '../hooks/mutations';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
  useDefaultLayout,
} from 'react-resizable-panels';
import {
  Box,
  Typography,
  Button,
  Tab,
  Tabs,
  Stack,
  Paper,
  Snackbar,
  Tooltip,
  Drawer,
  Alert,
  AlertTitle,
  useMediaQuery,
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import SchoolIcon from '@mui/icons-material/School';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import TuneIcon from '@mui/icons-material/Tune';

import { useTheme } from '@mui/material/styles';

import { useDeferredRender } from '../hooks/useDeferredRender';
import PageLoader from '../components/PageLoader';
import { UNIFORM_TOOLBAR_BUTTON_SX } from '../components/AccountFilterDropdown';
import { usdCents } from '../lib';

import type { Loan, Account } from '../types';
import {
  LoanChart,
  DEFAULT_HOUSE_CONFIG,
  DEFAULT_STUDENT_CONFIG,
  DEFAULT_CAR_CONFIG,
  type PaymentRow,
} from '../components/loans/LoanChart';
import {
  AddLoanDialog,
  RestoreLoansDialog,
  MatchedTransactionsDialog,
  AmortizationScheduleCard,
} from '../components/loans/LoanDialogs';
import { LoanSummaryCards } from '../components/loans/LoanSummaryCards';
import { LoanParametersPanel } from '../components/loans/LoanParametersPanel';

export default function Loans() {
  const theme = useTheme();
  const demoMode = useFilters((s) => s.demoMode);
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const shouldRender = useDeferredRender();
  const addLoanMutation = useAddLoan();
  const updateLoanMutation = useUpdateLoan();
  const deleteLoanMutation = useDeleteLoan();
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [activeLoanId, setActiveLoanId] = useState<number | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addType, setAddType] = useState<'house' | 'car' | 'student'>('house');
  const [addMerchant, setAddMerchant] = useState('');
  const [addPrincipal, setAddPrincipal] = useState('450000');
  const [addDownPayment, setAddDownPayment] = useState('50000');
  const [addDetectedPayment, setAddDetectedPayment] = useState<number | undefined>(undefined);
  const [selectedConnectedAccId, setSelectedConnectedAccId] = useState<number | ''>('');

  useEffect(() => {
    if (selectedConnectedAccId !== '') return;
    if (addType === 'house') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAddPrincipal('450000');
      setAddDownPayment('50000');
    } else if (addType === 'student') {
      setAddPrincipal('30000');
      setAddDownPayment('0');
    } else {
      setAddPrincipal('35000');
      setAddDownPayment('5000');
    }
  }, [addType, selectedConnectedAccId]);

  const panelIds = useMemo(() => ['loan-parameters', 'loan-graph'], []);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `loans-layout-v1-${panelIds.join('-')}`,
    panelIds,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  });

  const { data: loans = [], isLoading } = useLoans();
  const safeLoans = loans || [];

  const { data: accountsAll = [] } = useAccounts();
  const connectedLoanAccounts = useMemo(() => {
    return accountsAll.filter((a) =>
      (a.type === 'loan' || a.type === 'mortgage') &&
      (demoMode ? a.source === 'demo' : a.source !== 'demo')
    );
  }, [accountsAll, demoMode]);

  const isStudentLoanAccount = (acc: Account): boolean => {
    const combined = `${acc.name || ''} ${acc.institution || ''}`.toLowerCase();
    return /student|nelnet|aidvantage|mohela|navient|sallie\s*mae|edfinancial|pheaa|fedloan|great\s*lakes|earnest|dept\s*of\s*ed/i.test(
      combined
    );
  };

  const estimatePropertyValue = (
    loanType: 'house' | 'car' | 'student',
    principal: number,
    downPayment = 0
  ): number | undefined => {
    if (loanType === 'student') return undefined;
    if (downPayment > 0) return principal;
    if (loanType === 'house') {
      return principal > 0 ? Math.round((principal * 1.25) / 1000) * 1000 : 400000;
    }
    return principal > 0 ? Math.round((principal * 1.15) / 500) * 500 : 30000;
  };

  const getConnectedAccount = (loan: Loan | null | undefined): Account | null => {
    if (!loan) return null;

    // 1. Direct match by merchant or institution
    if (loan.merchant) {
      const norm = loan.merchant.toLowerCase().trim();
      const found = connectedLoanAccounts.find((a) =>
        (a.institution && (a.institution.toLowerCase().includes(norm) || norm.includes(a.institution.toLowerCase()))) ||
        a.name.toLowerCase().includes(norm) ||
        norm.includes(a.name.toLowerCase())
      );
      if (found) return found;
    }

    // 2. Match by loan name
    const normName = loan.name.toLowerCase().trim();
    const byName = connectedLoanAccounts.find((a) =>
      a.name.toLowerCase().includes(normName) ||
      normName.includes(a.name.toLowerCase()) ||
      (a.institution && normName.includes(a.institution.toLowerCase()))
    );
    if (byName) return byName;

    // 3. Fallback by loan type match
    if (loan.type === 'house') {
      const m = connectedLoanAccounts.find((a) => a.type === 'mortgage');
      if (m) return m;
    } else if (loan.type === 'student') {
      const s =
        connectedLoanAccounts.find((a) => a.type === 'loan' && isStudentLoanAccount(a)) ||
        connectedLoanAccounts.find((a) => a.type === 'loan');
      if (s) return s;
    } else if (loan.type === 'car') {
      const c =
        connectedLoanAccounts.find((a) => a.type === 'loan' && !isStudentLoanAccount(a)) ||
        connectedLoanAccounts.find((a) => a.type === 'loan');
      if (c) return c;
    }

    return null;
  };

  const activeLoans = useMemo(() => {
    return safeLoans.filter((l) => l.enabled !== false);
  }, [safeLoans]);

  const inactiveLoans = useMemo(() => {
    return safeLoans.filter((l) => l.enabled === false);
  }, [safeLoans]);

  const currentLoan = useMemo(() => {
    return activeLoans.find((l) => l.id === activeLoanId) || null;
  }, [activeLoans, activeLoanId]);

  const currentConfig = currentLoan;
  const activeTab = currentConfig ? currentConfig.type : 'house';

  const connectedAccount = useMemo(() => getConnectedAccount(currentConfig), [currentConfig, connectedLoanAccounts]);
  const connectedLiveBalance = connectedAccount?.currentBalance !== undefined
    ? Math.abs(connectedAccount.currentBalance)
    : null;

  const unlinkedAccounts = useMemo(() => {
    return connectedLoanAccounts.filter((acc) =>
      !safeLoans.some((l) => {
        const matched = getConnectedAccount(l);
        return matched?.id === acc.id;
      })
    );
  }, [connectedLoanAccounts, safeLoans]);

  useEffect(() => {
    if (activeLoans.length > 0) {
      if (activeLoanId === null || !activeLoans.some((l) => l.id === activeLoanId)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActiveLoanId(activeLoans[0].id!);
      }
    } else {
      setActiveLoanId(null);
    }
  }, [activeLoans, activeLoanId]);

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // Live effective configuration merging saved loan config with current valid form inputs
  const effectiveConfig = useMemo<Loan | null>(() => {
    if (!currentConfig) return null;
    const p = parseFloat(formPrincipal);
    const r = parseFloat(formRate);
    const t = parseInt(formTerm, 10);
    const mp = parseFloat(formMonthlyPayment);
    const pv = parseFloat(formPropertyValue);
    const dp = parseFloat(formDownPayment);
    const emp = parseFloat(formExtraMonthlyPayment);
    const eotp = parseFloat(formExtraOneTimePayment);
    const eotm = parseInt(formExtraOneTimeMonth, 10);

    return {
      ...currentConfig,
      name: formName.trim() || currentConfig.name,
      principal: !isNaN(p) && p > 0 ? p : currentConfig.principal,
      rate: !isNaN(r) && r >= 0 ? r : currentConfig.rate,
      termYears: !isNaN(t) && t > 0 && t <= 60 ? t : currentConfig.termYears,
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(formStartDate) ? formStartDate : currentConfig.startDate,
      category: formCategory,
      merchant: formMerchant.trim() || undefined,
      monthlyPayment: !isNaN(mp) && mp > 0 ? mp : undefined,
      propertyValue: currentConfig.type === 'student' || isNaN(pv) || pv <= 0 ? undefined : pv,
      downPayment: currentConfig.type === 'student' || isNaN(dp) || dp < 0 ? undefined : dp,
      extraMonthlyPayment: !isNaN(emp) && emp > 0 ? emp : undefined,
      extraOneTimePayment: !isNaN(eotp) && eotp > 0 ? eotp : undefined,
      extraOneTimeMonth: !isNaN(eotm) && eotm > 0 ? eotm : undefined,
    };
  }, [
    currentConfig,
    formName,
    formPrincipal,
    formRate,
    formTerm,
    formStartDate,
    formCategory,
    formMerchant,
    formMonthlyPayment,
    formPropertyValue,
    formDownPayment,
    formExtraMonthlyPayment,
    formExtraOneTimePayment,
    formExtraOneTimeMonth,
  ]);

  const hasUnsavedChanges = useMemo(() => {
    if (!currentConfig || !effectiveConfig) return false;
    return (
      effectiveConfig.name !== currentConfig.name ||
      effectiveConfig.principal !== currentConfig.principal ||
      effectiveConfig.rate !== currentConfig.rate ||
      effectiveConfig.termYears !== currentConfig.termYears ||
      effectiveConfig.startDate !== currentConfig.startDate ||
      (effectiveConfig.category || '') !== (currentConfig.category || '') ||
      (effectiveConfig.merchant || '') !== (currentConfig.merchant || '') ||
      (effectiveConfig.monthlyPayment || 0) !== (currentConfig.monthlyPayment || 0) ||
      (effectiveConfig.propertyValue || 0) !== (currentConfig.propertyValue || 0) ||
      (effectiveConfig.downPayment || 0) !== (currentConfig.downPayment || 0) ||
      (effectiveConfig.extraMonthlyPayment || 0) !== (currentConfig.extraMonthlyPayment || 0) ||
      (effectiveConfig.extraOneTimePayment || 0) !== (currentConfig.extraOneTimePayment || 0) ||
      (effectiveConfig.extraOneTimeMonth || 0) !== (currentConfig.extraOneTimeMonth || 0)
    );
  }, [currentConfig, effectiveConfig]);

  const handleRevertChanges = () => {
    if (!currentConfig) return;
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
  };

  // Global Categories and Transactions
  const { data: merchantOptions = [] } = useUniqueMerchants();
  const { data: categories = [] } = useCategories();

  const { data: rawTransactions = [] } = useQuery({
    queryKey: ['active_loan_transactions', activeLoanId, effectiveConfig?.category, effectiveConfig?.merchant],
    queryFn: () => {
      if (!effectiveConfig) return [];
      const filters: any = {};
      if (effectiveConfig.merchant) {
        filters.merchantKey = effectiveConfig.merchant;
      } else if (effectiveConfig.category) {
        filters.category = effectiveConfig.category;
      } else {
        return [];
      }
      return api.getTransactions('1970-01-01', '2100-01-01', filters);
    },
    enabled: !!effectiveConfig,
  });

  const transactions = useMemo(() => {
    return rawTransactions.filter(t => demoMode ? t.source === 'demo' : t.source !== 'demo');
  }, [rawTransactions, demoMode]);

  const [snackbarMsg, setSnackbarMsg] = useState('');
  const [showScheduleDetails, setShowScheduleDetails] = useState(false);
  const [onlyShowMatched, setOnlyShowMatched] = useState(false);
  const [activeTxDialogRows, setActiveTxDialogRows] = useState<any[] | null>(null);
  const [activeTxDialogDate, setActiveTxDialogDate] = useState<string>('');

  // Handler for loading payment details from selected category transactions
  const handleCategoryChange = async (categoryName: string) => {
    setFormCategory(categoryName);
    if (!categoryName) {
      if (!formMerchant) {
        setFormMonthlyPayment('');
        setSnackbarMsg('Monthly payment reset to standard schedule.');
      }
      return;
    }

    try {
      // Filter transactions for selected category to identify typical payment amount
      const categoryTxns = await api.getTransactions('1970-01-01', '2100-01-01', { category: categoryName });
      const filtered = categoryTxns.filter(t => demoMode ? t.source === 'demo' : t.source !== 'demo');
      if (filtered.length > 0) {
        const amounts = filtered.map((t) => Math.abs(t.amount));
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
    } catch (err) {
      console.error('Failed to load category history for loan payments:', err);
    }
  };

  // Amortization engine calculation (live-preview enabled via effectiveConfig)
  const scheduleData = useMemo(() => {
    if (!effectiveConfig) return null;
    let P = effectiveConfig.principal;
    if (effectiveConfig.downPayment && effectiveConfig.downPayment > 0) {
      if (
        effectiveConfig.propertyValue &&
        Math.abs(effectiveConfig.principal - effectiveConfig.propertyValue) < 1 &&
        effectiveConfig.principal > effectiveConfig.downPayment
      ) {
        P = effectiveConfig.principal - effectiveConfig.downPayment;
      } else if (!connectedAccount && !effectiveConfig.propertyValue && effectiveConfig.principal > effectiveConfig.downPayment * 2) {
        P = effectiveConfig.principal - effectiveConfig.downPayment;
      }
    }
    P = Math.max(1, P);
    const r = (effectiveConfig.rate / 100) / 12;
    const n = effectiveConfig.termYears * 12;
    const startDate = new Date(effectiveConfig.startDate + 'T00:00:00');
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Filter and group transactions by calendar month (YYYY-MM)
    const txByMonth = new Map<string, any[]>();
    for (const t of transactions) {
      let isMatch = false;
      if (effectiveConfig.merchant) {
        const normMerchant = effectiveConfig.merchant.toLowerCase().trim();
        const normDesc = t.description.toLowerCase();
        const normKey = (t.merchantKey || '').toLowerCase();
        isMatch = normDesc.includes(normMerchant) || normKey.includes(normMerchant);
      } else {
        isMatch = t.category === effectiveConfig.category;
      }

      if (isMatch) {
        const monthKeyStr = t.date.substring(0, 7); // YYYY-MM
        const list = txByMonth.get(monthKeyStr) || [];
        list.push(t);
        txByMonth.set(monthKeyStr, list);
      }
    }

    // Normalize weekend/end-of-month ACH shifts: if a month has >= 2 transactions,
    // its earliest transaction posted on day 1..5, and the previous calendar month had 0 transactions,
    // attribute that early-month payment to the previous month.
    const sortedMonths = Array.from(txByMonth.keys()).sort();
    for (const monthKey of sortedMonths) {
      const list = txByMonth.get(monthKey);
      if (!list || list.length < 2) continue;
      list.sort((a, b) => a.date.localeCompare(b.date));
      const firstTx = list[0];
      const dayOfMonth = parseInt(firstTx.date.substring(8, 10), 10);
      if (dayOfMonth >= 1 && dayOfMonth <= 5) {
        const [yr, mo] = monthKey.split('-').map(Number);
        const prevDate = new Date(yr, mo - 2, 15);
        const prevMonthKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
        if (!txByMonth.has(prevMonthKey)) {
          txByMonth.set(prevMonthKey, [firstTx]);
          txByMonth.set(monthKey, list.slice(1));
        }
      }
    }

    // Determine how many monthly payment cycles have elapsed up to Today
    const monthsSinceStart =
      (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth());
    const todayPaymentIndex = monthsSinceStart >= 0 ? monthsSinceStart + 1 : 0;
    const todayHasMatchedTx = (txByMonth.get(todayStr)?.length ?? 0) > 0;
    // If today's month already has a posted payment (e.g. paid on the 3rd-5th), the live balance is post-payment.
    // If today's month has NOT had a payment yet (e.g. paid on the 29th), the live balance is pre-payment (end of prior month).
    const completedPaymentsCount =
      todayPaymentIndex > 0 ? (todayHasMatchedTx ? todayPaymentIndex : todayPaymentIndex - 1) : 0;

    // Determine whether P / connectedLiveBalance represents the current balance as of Today
    // rather than the original starting principal at startDate.
    const userEditedPrincipal =
      currentConfig !== null && Math.abs(effectiveConfig.principal - currentConfig.principal) >= 1;
    let anchorBalance: number | null = null;
    if (connectedLiveBalance !== null && completedPaymentsCount > 0) {
      anchorBalance = userEditedPrincipal ? P : connectedLiveBalance;
    } else if (
      completedPaymentsCount >= 6 &&
      effectiveConfig.monthlyPayment &&
      effectiveConfig.monthlyPayment > P * r
    ) {
      const m = effectiveConfig.monthlyPayment;
      const monthsFromP =
        r === 0 ? P / m : -Math.log(1 - (P * r) / m) / Math.log(1 + r);
      if (!isNaN(monthsFromP) && monthsFromP < n * 0.85 && completedPaymentsCount + monthsFromP >= n * 0.85) {
        anchorBalance = P;
      }
    }

    // Use monthly payment override if specified, otherwise calculate mathematically
    let scheduledMonthlyPayment = effectiveConfig.monthlyPayment || 0;
    if (scheduledMonthlyPayment <= 0) {
      const targetPrincipal = anchorBalance !== null ? anchorBalance : P;
      const targetMonths = anchorBalance !== null ? Math.max(1, n - completedPaymentsCount) : n;
      if (r === 0) {
        scheduledMonthlyPayment = targetPrincipal / targetMonths;
      } else {
        scheduledMonthlyPayment =
          (targetPrincipal * (r * Math.pow(1 + r, targetMonths))) / (Math.pow(1 + r, targetMonths) - 1);
      }
    }

    // If anchored to Today's balance after `completedPaymentsCount` payments, reconstruct the
    // starting principal P at startDate so that forward amortization reaches exact `anchorBalance` at Today.
    if (anchorBalance !== null && completedPaymentsCount > 0 && scheduledMonthlyPayment > anchorBalance * r) {
      let b = anchorBalance;
      for (let k = completedPaymentsCount; k >= 1; k--) {
        b = (b + scheduledMonthlyPayment) / (1 + r);
      }
      P = b;
    }

    const rows: PaymentRow[] = [];
    let sBalance = P;
    let aBalance = P;
    let cumulativeScheduledInterest = 0;
    let cumulativeActualInterest = 0;
    let totalActualPaid = 0;
    let matchedPaymentsCount = 0;
    const maxMonths = Math.max(n, 600);

    for (let i = 1; i <= maxMonths; i++) {
      const pDate = new Date(startDate.getFullYear(), startDate.getMonth() + i - 1, 15);
      const yearMonth = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}`;
      const startingBalanceThisMonth = aBalance;

      // Baseline scheduled calculations
      let sInterest = 0;
      let sPrincipal = 0;
      if (sBalance > 0.005) {
        sInterest = sBalance * r;
        sPrincipal = Math.max(0, scheduledMonthlyPayment - sInterest);
        if (sPrincipal > sBalance) {
          sPrincipal = sBalance;
        }
        sBalance = Math.max(0, sBalance - sPrincipal);
        cumulativeScheduledInterest += sInterest;
      }
      const sPaymentThisMonth = sPrincipal + sInterest;

      // Actual / accelerated calculations
      const monthTxns = txByMonth.get(yearMonth) || [];
      const actualPaid = monthTxns.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const isMatched = monthTxns.length > 0;
      if (isMatched && yearMonth <= todayStr) {
        matchedPaymentsCount++;
      }

      let aInterest = 0;
      let aPrincipal = 0;
      let aPaymentThisMonth = 0;
      let extra = 0;
      let hasOneTimeExtra = false;

      const isFuture = yearMonth > todayStr;
      const isToday = yearMonth === todayStr;
      const isAssumed = !isMatched && !isFuture;

      if (anchorBalance !== null && i <= completedPaymentsCount) {
        // Completed past months prior to the live-balance anchor: keep sBalance and aBalance
        // aligned so both arrive at the exact live bank balance entering Today.
        aInterest = sInterest;
        aPrincipal = sPrincipal;
        aBalance = sBalance;
        aPaymentThisMonth = isMatched ? actualPaid : sPaymentThisMonth;
        extra = isMatched ? Math.max(0, actualPaid - scheduledMonthlyPayment) : 0;
        totalActualPaid += aPaymentThisMonth;
        cumulativeActualInterest += aInterest;
      } else if (aBalance > 0.005) {
        aInterest = aBalance * r;
        if (isFuture || isAssumed) {
          const recurringExtra =
            yearMonth >= todayStr && effectiveConfig.extraMonthlyPayment && effectiveConfig.extraMonthlyPayment > 0
              ? effectiveConfig.extraMonthlyPayment
              : 0;
          const oneTimeExtra =
            yearMonth >= todayStr &&
            effectiveConfig.extraOneTimePayment &&
            effectiveConfig.extraOneTimePayment > 0 &&
            effectiveConfig.extraOneTimeMonth === i
              ? effectiveConfig.extraOneTimePayment
              : 0;
          hasOneTimeExtra = oneTimeExtra > 0;

          const desiredPayment = scheduledMonthlyPayment + recurringExtra + oneTimeExtra;
          const balanceBefore = aBalance;
          aPrincipal = Math.max(0, desiredPayment - aInterest);
          if (aPrincipal > aBalance) {
            aPrincipal = aBalance;
          }
          aPaymentThisMonth = aPrincipal + aInterest;
          aBalance = Math.max(0, aBalance - aPrincipal);

          const basePrincipal = Math.min(balanceBefore, Math.max(0, scheduledMonthlyPayment - aInterest));
          extra = Math.max(0, aPrincipal - basePrincipal);

          totalActualPaid += aPaymentThisMonth;
          cumulativeActualInterest += aInterest;
        } else {
          // Matched past/present month: use actual transactions
          aPrincipal = Math.max(0, actualPaid - aInterest);
          if (aPrincipal > aBalance) {
            aPrincipal = aBalance;
          }
          aPaymentThisMonth = actualPaid;
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
        yearMonth,
        scheduledPayment: sPaymentThisMonth,
        scheduledInterest: sInterest,
        scheduledPrincipal: sPrincipal,
        scheduledBalance: sBalance,
        actualPayment: aPaymentThisMonth,
        actualInterest: aInterest,
        actualPrincipal: aPrincipal,
        actualBalance: aBalance,
        startingBalance: startingBalanceThisMonth,
        extraPayment: extra,
        hasOneTimeExtra,
        isToday,
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

      const canAmortize = scheduledMonthlyPayment > sBalance * r + 0.01;
      if (i >= completedPaymentsCount && sBalance <= 0.005 && aBalance <= 0.005 && (isFuture || i >= n)) {
        break;
      }
      if (i >= n && !canAmortize) {
        break;
      }
    }

    const interestSaved = Math.max(0, cumulativeScheduledInterest - cumulativeActualInterest);

    const completedRows =
      completedPaymentsCount > 0
        ? rows.slice(0, completedPaymentsCount)
        : rows.filter((row) => !row.isFuture);
    const amountPaidUpToToday = completedRows.reduce((sum, row) => sum + row.actualPayment, 0);
    const paymentsCountUpToToday = completedRows.length;
    const balanceAsOfToday =
      anchorBalance !== null
        ? anchorBalance
        : completedRows.length > 0
        ? completedRows[completedRows.length - 1].actualBalance
        : P;
    const percentPaid = Math.max(0, Math.min(100, ((P - balanceAsOfToday) / P) * 100));

    // Calculate remaining payments & payoff dates from actual simulated rows (respecting extra monthly & one-time payments)
    const remainingActualActiveRows = rows.filter(
      (row) => row.paymentNumber > completedPaymentsCount && row.actualPayment > 0.01
    );
    const remainingScheduledActiveRows = rows.filter(
      (row) => row.paymentNumber > completedPaymentsCount && row.scheduledPayment > 0.01
    );
    const monthsRemaining = remainingActualActiveRows.length;
    const scheduledMonthsRemaining = remainingScheduledActiveRows.length;

    const lastActualPaymentRow = [...rows].reverse().find((row) => row.actualPayment > 0.01);
    const lastScheduledPaymentRow = [...rows].reverse().find((row) => row.scheduledPayment > 0.01);
    const totalScheduledPayments = lastScheduledPaymentRow?.paymentNumber ?? n;
    const payoffDate = lastActualPaymentRow?.date ?? null;
    const scheduledPayoffDate = lastScheduledPaymentRow?.date ?? null;
    const monthsSaved = Math.max(
      0,
      totalScheduledPayments - (lastActualPaymentRow?.paymentNumber ?? totalScheduledPayments)
    );

    return {
      rows,
      originalPrincipal: P,
      scheduledMonthlyPayment,
      totalScheduledInterest: cumulativeScheduledInterest,
      totalActualInterest: cumulativeActualInterest,
      interestSaved,
      actualBalance: balanceAsOfToday,
      monthsRemaining,
      scheduledMonthsRemaining,
      totalScheduledPayments,
      monthsSaved,
      payoffDate,
      scheduledPayoffDate,
      totalActualPaid,
      percentPaid,
      matchedPaymentsCount,
      amountPaidUpToToday,
      paymentsCountUpToToday,
    };
  }, [effectiveConfig, currentConfig, connectedAccount, connectedLiveBalance, transactions]);

  const loanPrincipal = scheduleData?.originalPrincipal ?? currentConfig?.principal ?? 0;

  const handleSyncBalanceToLive = async () => {
    if (!currentConfig || currentConfig.id === undefined || connectedLiveBalance === null) return;

    const updated: Loan = {
      ...currentConfig,
      principal: connectedLiveBalance,
      downPayment: 0,
    };
    setFormPrincipal(String(connectedLiveBalance));
    setFormDownPayment('0');
    await updateLoanMutation.mutateAsync({ id: currentConfig.id, updates: updated });
    setSnackbarMsg(`Loan balance synced to live connection: ${usdCents.format(connectedLiveBalance)}`);
  };

  const handleImportAllConnectedAccounts = async (accountsToImport: Account[]) => {
    for (const acc of accountsToImport) {
      const rawBalance = Math.abs(acc.currentBalance || 0);
      const isMortgage = acc.type === 'mortgage' || /mortgage|home\s*loan/i.test(`${acc.name} ${acc.institution}`);
      const isStudent = isStudentLoanAccount(acc);
      const loanType: 'house' | 'car' | 'student' = isMortgage ? 'house' : (isStudent ? 'student' : 'car');
      const merchantStr = acc.institution ? acc.institution.toLowerCase() : '';
      const category = loanType === 'house' ? 'Mortgage' : (loanType === 'student' ? 'Student Loans' : 'Auto Loan');

      let detectedPayment: number | undefined = undefined;
      try {
        const txns = await api.getTransactions('1970-01-01', '2100-01-01', { merchantKey: merchantStr || undefined, category });
        const filtered = txns.filter((t) => demoMode ? t.source === 'demo' : t.source !== 'demo');
        if (filtered.length > 0) {
          const amounts = filtered.map((t) => Math.abs(t.amount));
          const counts: Record<number, number> = {};
          let mostCommon = 0;
          let maxC = 0;
          for (const a of amounts) {
            counts[a] = (counts[a] || 0) + 1;
            if (counts[a] > maxC) {
              maxC = counts[a];
              mostCommon = a;
            }
          }
          if (mostCommon > 0) detectedPayment = mostCommon;
        }
      } catch (e) {
        console.error('Error auto-detecting payment during import:', e);
      }

      const defaultVal = loanType === 'house' ? DEFAULT_HOUSE_CONFIG : (loanType === 'student' ? DEFAULT_STUDENT_CONFIG : DEFAULT_CAR_CONFIG);
      const newLoan: Loan = {
        ...defaultVal,
        name: acc.name,
        type: loanType,
        principal: rawBalance,
        downPayment: 0,
        propertyValue: estimatePropertyValue(loanType, rawBalance, 0),
        merchant: merchantStr || undefined,
        category,
        monthlyPayment: detectedPayment || defaultVal.monthlyPayment,
        enabled: true,
        createdAt: new Date().toISOString(),
      };
      await addLoanMutation.mutateAsync(newLoan as Loan);
    }
    setSnackbarMsg(`Imported ${accountsToImport.length} connected loan(s) successfully!`);
  };

  const handleSelectConnectedAccount = async (accId: number | '') => {
    setSelectedConnectedAccId(accId);
    setAddDetectedPayment(undefined);
    if (!accId) return;
    const acc = connectedLoanAccounts.find((a) => a.id === accId);
    if (!acc) return;

    const rawBalance = Math.abs(acc.currentBalance || 0);
    const isMortgage = acc.type === 'mortgage' || /mortgage|home\s*loan/i.test(`${acc.name} ${acc.institution}`);
    const isStudent = isStudentLoanAccount(acc);
    const loanType: 'house' | 'car' | 'student' = isMortgage ? 'house' : (isStudent ? 'student' : 'car');

    setAddName(acc.name);
    setAddType(loanType);
    setAddPrincipal(String(rawBalance));
    setAddDownPayment('0');
    const merchantStr = acc.institution ? acc.institution.toLowerCase() : '';
    setAddMerchant(merchantStr);

    try {
      const filters: any = {};
      if (merchantStr) {
        filters.merchantKey = merchantStr;
      } else {
        filters.category = loanType === 'house' ? 'Mortgage' : (loanType === 'student' ? 'Student Loans' : 'Auto Loan');
      }
      const txns = await api.getTransactions('1970-01-01', '2100-01-01', filters);
      const filtered = txns.filter((t) => demoMode ? t.source === 'demo' : t.source !== 'demo');
      if (filtered.length > 0) {
        const amounts = filtered.map((t) => Math.abs(t.amount));
        const counts: Record<number, number> = {};
        let mostCommon = 0;
        let maxC = 0;
        for (const a of amounts) {
          counts[a] = (counts[a] || 0) + 1;
          if (counts[a] > maxC) {
            maxC = counts[a];
            mostCommon = a;
          }
        }
        if (mostCommon > 0) {
          setAddDetectedPayment(mostCommon);
          setSnackbarMsg(`Auto-detected recurring payment of ${usdCents.format(mostCommon)} from checking history!`);
        }
      }
    } catch (err) {
      console.error('Error auto-detecting payment:', err);
    }
  };

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
      propertyValue: (currentConfig?.type === 'student' || isNaN(PV) || PV <= 0) ? undefined : PV,
      downPayment: (currentConfig?.type === 'student' || isNaN(DP) || DP < 0) ? undefined : DP,
      extraMonthlyPayment: isNaN(EMP) || EMP <= 0 ? undefined : EMP,
      extraOneTimePayment: isNaN(EOTP) || EOTP <= 0 ? undefined : EOTP,
      extraOneTimeMonth: isNaN(EOTM) || EOTM <= 0 ? undefined : EOTM,
      createdAt: currentConfig?.createdAt || new Date().toISOString(),
    };

    if (currentConfig && currentConfig.id !== undefined) {
      await updateLoanMutation.mutateAsync({ id: currentConfig.id, updates: { ...currentConfig, ...updatedConfig } as Loan });
      setSnackbarMsg('Loan settings saved successfully!');
      setMobileSettingsOpen(false);
    }
  };

  const handleResetDefaults = async () => {
    if (currentConfig && currentConfig.id !== undefined) {
      const defaultVal = currentConfig.type === 'house' ? DEFAULT_HOUSE_CONFIG : currentConfig.type === 'student' ? DEFAULT_STUDENT_CONFIG : DEFAULT_CAR_CONFIG;
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
      setFormExtraMonthlyPayment(resetLoan.extraMonthlyPayment ? String(resetLoan.extraMonthlyPayment) : '');
      setFormExtraOneTimePayment(resetLoan.extraOneTimePayment ? String(resetLoan.extraOneTimePayment) : '');
      setFormExtraOneTimeMonth(resetLoan.extraOneTimeMonth ? String(resetLoan.extraOneTimeMonth) : '');

      await updateLoanMutation.mutateAsync({ id: resetLoan.id!, updates: resetLoan as Loan });
      setSnackbarMsg('Reset to default values.');
    }
  };

  const handleAddLoanSubmit = async () => {
    const nameStr = addName.trim();
    if (!nameStr) {
      alert('Please enter a loan name.');
      return;
    }

    const principalVal = parseFloat(addPrincipal);
    const downPaymentVal = addType === 'student' ? 0 : parseFloat(addDownPayment);

    if (isNaN(principalVal) || principalVal <= 0) {
      alert('Please enter a valid loan balance or purchase price.');
      return;
    }

    if (isNaN(downPaymentVal) || downPaymentVal < 0) {
      alert('Please enter a valid down payment amount.');
      return;
    }

    const defaultVal = addType === 'house' ? DEFAULT_HOUSE_CONFIG : addType === 'student' ? DEFAULT_STUDENT_CONFIG : DEFAULT_CAR_CONFIG;
    const newLoan: Loan = {
      ...defaultVal,
      name: nameStr,
      type: addType,
      principal: principalVal,
      downPayment: addType === 'student' ? undefined : downPaymentVal,
      propertyValue: estimatePropertyValue(addType, principalVal, downPaymentVal),
      merchant: addMerchant.trim() || undefined,
      category: addType === 'house' ? 'Mortgage' : (addType === 'student' ? 'Student Loans' : 'Auto Loan'),
      monthlyPayment: addDetectedPayment ?? defaultVal.monthlyPayment,
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    const newId = await addLoanMutation.mutateAsync(newLoan as Loan);
    setActiveLoanId(newId);
    setAddDialogOpen(false);
    setSelectedConnectedAccId('');
    setAddDetectedPayment(undefined);
    setAddName('');
    setAddMerchant('');
    setAddType('house');
    setAddPrincipal('450000');
    setAddDownPayment('50000');
    setSnackbarMsg(`Loan "${nameStr}" created successfully.`);
  };

  const handleRemoveLoan = async () => {
    if (!currentConfig || currentConfig.id === undefined) return;
    await updateLoanMutation.mutateAsync({ id: currentConfig.id, updates: { ...currentConfig, enabled: false } as Loan });
    setSnackbarMsg(`Loan "${currentConfig.name}" removed from view.`);
  };

  const handleRestoreLoan = async (loan: Loan) => {
    if (loan.id === undefined) return;
    await updateLoanMutation.mutateAsync({ id: loan.id, updates: { ...loan, enabled: true } as Loan });
    setActiveLoanId(loan.id);
    setSnackbarMsg(`Loan "${loan.name}" restored successfully.`);
  };

  const handleDeleteLoanById = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete the loan "${name}"? This action cannot be undone.`)) {
      return;
    }
    await deleteLoanMutation.mutateAsync(id);
    setSnackbarMsg(`Loan "${name}" deleted permanently.`);
  };

  const handleDeleteLoan = async () => {
    if (!currentConfig || currentConfig.id === undefined) return;
    await handleDeleteLoanById(currentConfig.id, currentConfig.name);
  };

  const handleCloseAddDialog = () => {
    setAddDialogOpen(false);
    setSelectedConnectedAccId('');
    setAddName('');
    setAddMerchant('');
    setAddType('house');
    setAddPrincipal('450000');
    setAddDownPayment('50000');
  };

  const renderAddLoanDialog = () => (
    <AddLoanDialog
      open={addDialogOpen}
      onClose={handleCloseAddDialog}
      onSubmit={handleAddLoanSubmit}
      connectedLoanAccounts={connectedLoanAccounts}
      selectedConnectedAccId={selectedConnectedAccId}
      onSelectConnectedAccount={handleSelectConnectedAccount}
      addName={addName}
      setAddName={setAddName}
      addType={addType}
      setAddType={setAddType}
      addPrincipal={addPrincipal}
      setAddPrincipal={setAddPrincipal}
      addDownPayment={addDownPayment}
      setAddDownPayment={setAddDownPayment}
      merchantOptions={merchantOptions}
      addMerchant={addMerchant}
      setAddMerchant={setAddMerchant}
    />
  );

  const renderRestoreDialog = () => (
    <RestoreLoansDialog
      open={restoreDialogOpen}
      onClose={() => setRestoreDialogOpen(false)}
      inactiveLoans={inactiveLoans}
      onRestoreLoan={handleRestoreLoan}
      onDeleteLoanById={handleDeleteLoanById}
    />
  );

  if (activeLoans.length === 0) {
    return (
      <Stack spacing={{ xs: 2, md: 3 }} sx={{ width: '100%', pb: 5 }}>
        {/* Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Loans Tracker
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Visualize your amortization schedules and match against transaction histories.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            {inactiveLoans.length > 0 && (
              <Button
                variant="outlined"
                color="inherit"
                size="small"
                onClick={() => setRestoreDialogOpen(true)}
                sx={UNIFORM_TOOLBAR_BUTTON_SX}
              >
                Restore ({inactiveLoans.length})
              </Button>
            )}
            <Button
              variant="contained"
              color="primary"
              size="small"
              onClick={() => setAddDialogOpen(true)}
              sx={{
                ...UNIFORM_TOOLBAR_BUTTON_SX,
                border: '1px solid',
                borderColor: 'primary.main',
              }}
            >
              + Add Loan
            </Button>
          </Stack>
        </Stack>

        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, sm: 6 },
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            textAlign: 'center',
            bgcolor: 'background.default'
          }}
        >
          <HomeIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2, opacity: 0.5 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            No Active Loans
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 480, mx: 'auto' }}>
            {connectedLoanAccounts.length > 0
              ? `We detected ${connectedLoanAccounts.length} connected loan/mortgage account(s) from your bank connections (${connectedLoanAccounts.map((a) => a.name).join(', ')}). You can import them automatically with live balances or create a custom loan.`
              : inactiveLoans.length > 0
              ? `You have ${inactiveLoans.length} removed loan(s). You can restore them or create a new active loan.`
              : 'Get started by adding a house mortgage or auto loan to simulate payment schedules, extra payments, and match against actual bank transactions.'}
          </Typography>
          <Stack direction="row" spacing={1.5} justifyContent="center" flexWrap="wrap" useFlexGap>
            {connectedLoanAccounts.length > 0 && (
              <Button
                variant="contained"
                color="success"
                size="small"
                startIcon={<AutoAwesomeIcon fontSize="small" />}
                onClick={() => handleImportAllConnectedAccounts(connectedLoanAccounts)}
                sx={{
                  ...UNIFORM_TOOLBAR_BUTTON_SX,
                  border: '1px solid',
                  borderColor: 'success.main',
                }}
              >
                Import {connectedLoanAccounts.length} Connected Loan(s)
              </Button>
            )}
            {inactiveLoans.length > 0 && (
              <Button
                variant="outlined"
                color="inherit"
                size="small"
                onClick={() => setRestoreDialogOpen(true)}
                sx={UNIFORM_TOOLBAR_BUTTON_SX}
              >
                Restore Removed Loans
              </Button>
            )}
            <Button
              variant="contained"
              color="primary"
              size="small"
              onClick={() => setAddDialogOpen(true)}
              sx={{
                ...UNIFORM_TOOLBAR_BUTTON_SX,
                border: '1px solid',
                borderColor: 'primary.main',
              }}
            >
              Create New Loan
            </Button>
          </Stack>
        </Paper>

        {renderAddLoanDialog()}
        {renderRestoreDialog()}
      </Stack>
    );
  }

  if (!shouldRender) return <PageLoader isLoading={true}><div /></PageLoader>;
  if (!scheduleData || !currentConfig || !effectiveConfig) return null;

  const cardWidth = effectiveConfig.propertyValue ? 2.4 : 3;
  const displayedBalance = connectedLiveBalance !== null ? connectedLiveBalance : scheduleData.actualBalance;
  const displayedPercentPaid =
    connectedLiveBalance !== null && connectedLiveBalance < loanPrincipal
      ? Math.max(0, Math.min(100, ((loanPrincipal - connectedLiveBalance) / loanPrincipal) * 100))
      : scheduleData.percentPaid;
  const loanParametersPanel = (
    <LoanParametersPanel
      hasUnsavedChanges={hasUnsavedChanges}
      connectedAccount={connectedAccount}
      connectedLiveBalance={connectedLiveBalance}
      connectedLoanAccounts={connectedLoanAccounts}
      handleSyncBalanceToLive={handleSyncBalanceToLive}
      activeTab={activeTab}
      formName={formName}
      setFormName={setFormName}
      formPrincipal={formPrincipal}
      setFormPrincipal={setFormPrincipal}
      formDownPayment={formDownPayment}
      setFormDownPayment={setFormDownPayment}
      formRate={formRate}
      setFormRate={setFormRate}
      formTerm={formTerm}
      setFormTerm={setFormTerm}
      formStartDate={formStartDate}
      setFormStartDate={setFormStartDate}
      formCategory={formCategory}
      handleCategoryChange={handleCategoryChange}
      categories={categories}
      merchantOptions={merchantOptions}
      formMerchant={formMerchant}
      setFormMerchant={setFormMerchant}
      formMonthlyPayment={formMonthlyPayment}
      setFormMonthlyPayment={setFormMonthlyPayment}
      formPropertyValue={formPropertyValue}
      setFormPropertyValue={setFormPropertyValue}
      formExtraMonthlyPayment={formExtraMonthlyPayment}
      setFormExtraMonthlyPayment={setFormExtraMonthlyPayment}
      formExtraOneTimePayment={formExtraOneTimePayment}
      setFormExtraOneTimePayment={setFormExtraOneTimePayment}
      formExtraOneTimeMonth={formExtraOneTimeMonth}
      setFormExtraOneTimeMonth={setFormExtraOneTimeMonth}
      setSnackbarMsg={setSnackbarMsg}
      handleRevertChanges={handleRevertChanges}
      handleSaveSettings={handleSaveSettings}
      scheduleData={scheduleData}
    />
  );

  const loanChartCard = (
    <Paper sx={{ p: { xs: 1.5, sm: 3 }, border: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.25, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
            Remaining Balance & Payoff Trajectory
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            Compare your baseline amortization schedule against accelerated payoff with extra payments.
          </Typography>
        </Box>
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, position: 'relative', width: '100%', height: '100%' }}>
        <LoanChart
          rows={scheduleData.rows}
          originalPrincipal={loanPrincipal}
          interestSaved={scheduleData.interestSaved}
          monthsSaved={scheduleData.monthsSaved}
          payoffDate={scheduleData.payoffDate}
        />
      </Box>
    </Paper>
  );

  return (
    <Stack spacing={{ xs: 2, md: 3 }} sx={{ width: '100%', pb: 5 }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.25}>
        <Box sx={{ display: { xs: 'none', md: 'block' } }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Loans Tracker
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Visualize your amortization schedules and match against transaction histories.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
          {!isDesktop && (
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              startIcon={<TuneIcon fontSize="small" />}
              onClick={() => setMobileSettingsOpen(true)}
              sx={UNIFORM_TOOLBAR_BUTTON_SX}
            >
              Settings
            </Button>
          )}
          {inactiveLoans.length > 0 && (
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              onClick={() => setRestoreDialogOpen(true)}
              sx={UNIFORM_TOOLBAR_BUTTON_SX}
            >
              Restore ({inactiveLoans.length})
            </Button>
          )}
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={() => setAddDialogOpen(true)}
            sx={{
              ...UNIFORM_TOOLBAR_BUTTON_SX,
              border: '1px solid',
              borderColor: 'primary.main',
            }}
          >
            + Add Loan
          </Button>
        </Stack>
      </Stack>

      {/* Unlinked Connected Accounts Alert */}
      {unlinkedAccounts.length > 0 && (
        <Alert
          severity="info"
          icon={<AutoAwesomeIcon />}
          action={
            <Button
              color="inherit"
              size="small"
              variant="outlined"
              onClick={() => handleImportAllConnectedAccounts(unlinkedAccounts)}
              sx={{
                ...UNIFORM_TOOLBAR_BUTTON_SX,
                whiteSpace: 'nowrap',
              }}
            >
              Import {unlinkedAccounts.length === 1 ? 'Loan' : 'Loans'}
            </Button>
          }
          sx={{
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            '& .MuiAlert-action': {
              alignItems: 'center',
              pt: { xs: 1, sm: 0.5 },
              pl: { xs: 0, sm: 2 },
            },
            flexWrap: { xs: 'wrap', sm: 'nowrap' },
          }}
        >
          <AlertTitle sx={{ fontWeight: 700 }}>Connected Financial Accounts Detected</AlertTitle>
          We detected {unlinkedAccounts.length} connected loan/mortgage account(s) ({unlinkedAccounts.map((a) => a.name).join(', ')}) from your bank connections. Click import to track them with live balances and detected payment schedules.
        </Alert>
      )}

      {/* Tabs */}
      <Paper sx={{ borderBottom: 1, borderColor: 'divider', borderRadius: (theme) => `${theme.shape.borderRadius}px` }}>
        <Tabs
          value={activeLoanId}
          onChange={(_, val) => {
            setActiveLoanId(val);
            setShowScheduleDetails(false);
          }}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: { xs: 1, sm: 2 } }}
        >
          {activeLoans.map((loan) => (
            <Tab
              key={loan.id}
              icon={loan.type === 'house' ? <HomeIcon sx={{ fontSize: 18 }} /> : loan.type === 'student' ? <SchoolIcon sx={{ fontSize: 18 }} /> : <DirectionsCarIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
              label={
                <Tooltip title={loan.name} arrow placement="top">
                  <Box
                    component="span"
                    sx={{
                      display: 'inline-block',
                      maxWidth: { xs: 140, sm: 200, md: 240 },
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      verticalAlign: 'bottom',
                    }}
                  >
                    {loan.name}
                  </Box>
                </Tooltip>
              }
              value={loan.id}
              sx={{
                fontWeight: 600,
                minHeight: 48,
                maxWidth: { xs: 180, sm: 240, md: 280 },
                '& .MuiTab-iconWrapper': { mr: 1, mb: '0 !important' },
              }}
            />
          ))}
        </Tabs>
      </Paper>

      {/* Summary Cards */}
      <LoanSummaryCards
        cardWidth={cardWidth}
        connectedAccount={connectedAccount}
        connectedLiveBalance={connectedLiveBalance}
        displayedBalance={displayedBalance}
        displayedPercentPaid={displayedPercentPaid}
        loanPrincipal={loanPrincipal}
        effectiveConfig={effectiveConfig}
        activeTab={activeTab}
        scheduleData={scheduleData}
      />

      {/* Resizable Config Sidebar & Graph Panel */}
      <Box sx={{ width: '100%', height: isDesktop ? 620 : 'auto', display: 'flex', flexDirection: 'column' }}>
        {isDesktop ? (
          <PanelGroup
            key="loans-panels"
            orientation="horizontal"
            defaultLayout={defaultLayout}
            onLayoutChanged={onLayoutChanged}
            style={{ height: '100%', width: '100%' }}
          >
            {/* Left Panel: Parameters/Filters */}
            <Panel id="loan-parameters" defaultSize="30%" minSize="25%" maxSize="45%">
              {loanParametersPanel}
            </Panel>

            <StyledResizeHandle ariaLabel="Resize loan config panel" />

            {/* Right Panel: Graph */}
            <Panel id="loan-graph" defaultSize="70%">
              {loanChartCard}
            </Panel>
          </PanelGroup>
        ) : (
          <>
            <Box sx={{ height: 420, mb: 1.5 }}>
              {loanChartCard}
            </Box>
            <Box sx={{ pb: 1, display: 'flex', justifyContent: 'center' }}>
              <Button
                variant="outlined"
                color="inherit"
                fullWidth
                startIcon={<TuneIcon fontSize="small" />}
                onClick={() => setMobileSettingsOpen(true)}
                sx={UNIFORM_TOOLBAR_BUTTON_SX}
              >
                Edit Loan Parameters & Extra Payments
              </Button>
            </Box>
            <Drawer
              anchor="bottom"
              open={mobileSettingsOpen}
              onClose={() => setMobileSettingsOpen(false)}
              PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '85vh', pb: 4 } }}
            >
              {loanParametersPanel}
            </Drawer>
          </>
        )}
      </Box>

      {/* Schedule Table Container */}
      <AmortizationScheduleCard
        rows={scheduleData.rows}
        showScheduleDetails={showScheduleDetails}
        setShowScheduleDetails={setShowScheduleDetails}
        onlyShowMatched={onlyShowMatched}
        setOnlyShowMatched={setOnlyShowMatched}
        onSelectMatchedRow={(txns, date) => {
          setActiveTxDialogRows(txns);
          setActiveTxDialogDate(date);
        }}
      />

      {/* Danger Zone */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: (theme) => `${theme.shape.borderRadius}px`,
          border: '1px dashed',
          borderColor: 'error.main',
          bgcolor: (theme) =>
            theme.palette.mode === 'dark' ? 'rgba(211, 47, 47, 0.05)' : 'rgba(211, 47, 47, 0.02)',
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'error.main', mb: 1, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Danger Zone
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Destructive actions for this loan. Once deleted, all custom settings and matches for this loan configuration will be permanently discarded.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Button
            variant="outlined"
            size="small"
            color="inherit"
            onClick={handleResetDefaults}
            startIcon={<SettingsBackupRestoreIcon />}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Reset to Default Values
          </Button>
          <Button
            variant="outlined"
            size="small"
            color="warning"
            onClick={handleRemoveLoan}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Remove Loan (Deactivate)
          </Button>
          <Button
            variant="outlined"
            size="small"
            color="error"
            onClick={handleDeleteLoan}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Delete Loan (Permanently)
          </Button>
        </Stack>
      </Paper>

      <MatchedTransactionsDialog
        rows={activeTxDialogRows}
        date={activeTxDialogDate}
        onClose={() => setActiveTxDialogRows(null)}
      />

      {renderAddLoanDialog()}
      {renderRestoreDialog()}

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


