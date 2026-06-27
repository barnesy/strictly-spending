import { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  TextField,
  MenuItem,
  FormControlLabel,
  Switch,
  LinearProgress,
  Paper,
  alpha,
  useTheme,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  CircularProgress
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DownloadIcon from '@mui/icons-material/Download';
import Papa from 'papaparse';
import { useDeferredRender } from '../hooks/useDeferredRender';
import PageLoader from '../components/PageLoader';
import { useSettings, useTaxTransactions, useCategories, useTaxRules, useAccounts, useDocuments, useTransactions } from '../hooks/queries';
import { api } from '../api';
import type { TaxSettings, AppDocument } from '../types';
import TaxDocumentUpload from '../components/TaxDocumentUpload';
import { SCHEDULE_C_CATEGORIES, resolveTaxDeduction } from '../taxUtils';

const DEFAULT_TAX_SETTINGS: TaxSettings = {
  hasBusiness: false,
  taxYear: new Date().getFullYear() - 1,
  checklist: {},
  businessIdentity: {},
  businessFinancials: {},
  businessIncome: {},
  businessDeductions: {},
  personalInfo: {},
  taxPayments: {}
};

const REQUIRED_DOCUMENTS: Array<{ 
  id: string; 
  label: string; 
  accept: 'pdf' | 'spreadsheet'; 
  category: string; 
  aiStatus: 'supported' | 'coming_soon' | 'manual';
}> = [
  // Business Basics
  { id: 'business_pnl', label: 'Year-End Profit & Loss Statement (P&L)', accept: 'spreadsheet', category: 'business_basics', aiStatus: 'supported' },
  { id: 'business_balance_sheet', label: 'Balance Sheet', accept: 'spreadsheet', category: 'business_basics', aiStatus: 'supported' },
  { id: 'business_ledger', label: 'General Ledger / Bank Statements', accept: 'spreadsheet', category: 'business_basics', aiStatus: 'supported' },
  
  // Business Income
  { id: 'income_1099k', label: 'Form 1099-K (Payment Processors)', accept: 'pdf', category: 'business_income', aiStatus: 'manual' },
  { id: 'income_1099nec', label: 'Form 1099-NEC (Clients)', accept: 'pdf', category: 'business_income', aiStatus: 'manual' },
  { id: 'income_1099misc', label: 'Form 1099-MISC', accept: 'pdf', category: 'business_income', aiStatus: 'manual' },
  
  // Business Deductions
  { id: 'deduction_expense_summary', label: 'Expense Summary by Category', accept: 'spreadsheet', category: 'business_deductions', aiStatus: 'supported' },
  { id: 'deduction_mileage_log', label: 'Mileage Log', accept: 'spreadsheet', category: 'business_deductions', aiStatus: 'supported' },
  { id: 'deduction_vehicle_expenses', label: 'Vehicle Expense Receipts', accept: 'pdf', category: 'business_deductions', aiStatus: 'manual' },
  { id: 'deduction_assets', label: 'Asset Purchases & Depreciation', accept: 'pdf', category: 'business_deductions', aiStatus: 'supported' },
  { id: 'deduction_w2_w3', label: 'W-2 / W-3 for Employees', accept: 'pdf', category: 'business_deductions', aiStatus: 'supported' },
  { id: 'deduction_1099_issued', label: '1099-NECs issued', accept: 'pdf', category: 'business_deductions', aiStatus: 'supported' },

  // Personal Info
  { id: 'personal_prior_return', label: 'Prior Year Tax Return', accept: 'pdf', category: 'personal_info', aiStatus: 'manual' },
  { id: 'personal_w2', label: 'Form W-2 (from employers)', accept: 'pdf', category: 'personal_info', aiStatus: 'manual' },
  { id: 'personal_1099', label: 'Form 1099-INT / 1099-DIV', accept: 'pdf', category: 'personal_info', aiStatus: 'manual' },
  { id: 'personal_k1', label: 'Schedule K-1', accept: 'pdf', category: 'personal_info', aiStatus: 'manual' },
  { id: 'personal_ira', label: 'IRA Contributions Documented', accept: 'pdf', category: 'personal_info', aiStatus: 'manual' },
  { id: 'personal_health', label: 'Health Insurance Info (Form 1095)', accept: 'pdf', category: 'personal_info', aiStatus: 'manual' },
  { id: 'personal_charity', label: 'Charitable Donations Receipts', accept: 'pdf', category: 'personal_info', aiStatus: 'manual' },
  { id: 'personal_student_loan', label: 'Student Loan Interest (Form 1098-E)', accept: 'pdf', category: 'personal_info', aiStatus: 'manual' },

  // Payments
  { id: 'payments_estimated', label: 'Estimated Tax Payments (1040-ES)', accept: 'pdf', category: 'tax_payments', aiStatus: 'supported' },
  { id: 'payments_state', label: 'State & Local Taxes / LLC Fees', accept: 'pdf', category: 'tax_payments', aiStatus: 'manual' }
];

export default function Taxes() {
  const theme = useTheme();

  const { data: settings = [] } = useSettings();
  const rawSettings = settings.find(s => s.key === 'app:taxSettings');
  const taxSettings: TaxSettings = rawSettings?.value || DEFAULT_TAX_SETTINGS;
  const currentTaxYear = taxSettings.taxYear;

  const { data: documents = [] } = useDocuments();
  const shouldRender = useDeferredRender();
  const { data: taxRules = [], isLoading: isRulesLoading } = useTaxRules();
  const { data: transactions = [], isLoading: isTransactionsLoading } = useTransactions();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();

  const [bulkPromptOpen, setBulkPromptOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<{
    type: 'account' | 'category';
    targetId: string | number;
    targetName: string;
    value: string;
  } | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compilationProgress, setCompilationProgress] = useState(0);
  const [compilationStepText, setCompilationStepText] = useState('');

  const handleUpdateSettings = async (updates: Partial<TaxSettings>) => {
    const newSettings = { ...taxSettings, ...updates };
    await api.putSetting('app:taxSettings', newSettings);
  };

  const updateNestedSetting = (category: keyof TaxSettings, field: string, value: unknown) => {
    handleUpdateSettings({
      [category]: {
        ...(taxSettings[category] as Record<string, unknown> || {}),
        [field]: value
      }
    });
  };

  const handleAccountDefaultChange = (accountId: number, accountName: string, value: string) => {
    setBulkAction({
      type: 'account',
      targetId: accountId,
      targetName: accountName,
      value,
    });
    setBulkPromptOpen(true);
  };

  const handleCategoryDefaultChange = (categoryName: string, value: string) => {
    setBulkAction({
      type: 'category',
      targetId: categoryName,
      targetName: categoryName,
      value,
    });
    setBulkPromptOpen(true);
  };

  const handleBulkUpdateConfirm = async () => {
    if (!bulkAction) return;
    const { type, targetId, value } = bulkAction;

    let updates: any[] = [];
    if (type === 'account') {
      if (value === 'business') {
        const txns = transactions.filter(t => t.accountId === targetId);
        updates = txns.map(t => {
          const guess = resolveTaxDeduction(t.description, t.category, t.merchantKey, taxRules);
          return {
            ...t,
            isBusiness: true,
            taxCategory: guess.taxCategory || 'other',
            deductionStatus: 'confirmed',
          };
        });
      } else if (value === 'personal') {
        const txns = transactions.filter(t => t.accountId === targetId);
        updates = txns.map(t => ({
          ...t,
          isBusiness: false,
          taxCategory: null,
          deductionStatus: 'confirmed',
        }));
      } else if (value === 'unassigned') {
        const txns = transactions.filter(t => t.accountId === targetId);
        updates = txns.map(t => ({
          ...t,
          isBusiness: null,
          taxCategory: null,
          deductionStatus: 'pending',
        }));
      }
    } else if (type === 'category') {
      if (value === 'personal') {
        const txns = transactions.filter(t => t.category === targetId);
        updates = txns.map(t => ({
          ...t,
          isBusiness: false,
          taxCategory: null,
          deductionStatus: 'confirmed',
        }));
      } else {
        const txns = transactions.filter(t => t.category === targetId);
        updates = txns.map(t => ({
          ...t,
          isBusiness: true,
          taxCategory: value,
          deductionStatus: 'confirmed',
        }));
      }
    }

    if (updates.length > 0) {
      await api.bulkUpdateTransactions(updates);
    }

    if (type === 'account') {
      const currentMap = taxSettings.accountDefaults || {};
      await handleUpdateSettings({
        accountDefaults: { ...currentMap, [targetId]: value }
      });
    } else {
      const currentMap = taxSettings.categoryDefaults || {};
      await handleUpdateSettings({
        categoryDefaults: { ...currentMap, [targetId]: value }
      });
    }

    setBulkPromptOpen(false);
    setBulkAction(null);
  };

  const handleDocumentUpload = async (documentId: string, fileInfo: { filename: string; type: string; path: string; uploadedAt: string }) => {
    const newDocId = crypto.randomUUID();
    await api.putDocument({
      id: newDocId,
      name: fileInfo.filename,
      path: fileInfo.path,
      type: fileInfo.type,
      source: 'uploaded',
      associatedChecklistId: documentId,
      createdAt: fileInfo.uploadedAt
    });

    handleUpdateSettings({
      checklist: {
        ...(taxSettings.checklist || {}),
        [documentId]: true
      }
    });
  };

  const handleDocumentRemove = async (documentId: string) => {
    const docToRemove = documents.find((d) => d.associatedChecklistId === documentId);
    if (docToRemove) {
      await api.deleteDocument(docToRemove.id);
    }
    
    const checklistCopy = { ...(taxSettings.checklist || {}) };
    delete checklistCopy[documentId];

    await handleUpdateSettings({
      checklist: checklistCopy
    });
  };

  const handleDocumentGenerateAi = (_documentId: string, label: string) => {
    const promptText = `Please generate ${label} for the tax year ${taxSettings.taxYear}`;
    window.dispatchEvent(new CustomEvent('app:run-prompt', { detail: { prompt: promptText } }));
    window.dispatchEvent(new CustomEvent('app:open-chat'));
  };

  // Automated Insights
  const taxYearStats = useMemo(() => {
    const yearTransactions = transactions.filter(t => new Date(t.date).getFullYear() === taxSettings.taxYear);
    
    let totalIncome = 0;
    let businessExpenses = 0;
    let itemizedDeductions = 0;

    yearTransactions.forEach(t => {
      if (t.category.toLowerCase() === 'income' || t.amount > 0) {
        totalIncome += Math.abs(t.amount);
      } else {
        if (t.isBusiness && t.deductionStatus === 'confirmed') {
          const rate = t.taxCategory ? (SCHEDULE_C_CATEGORIES[t.taxCategory]?.deductionRate ?? 1.0) : 1.0;
          businessExpenses += Math.abs(t.amount) * rate;
        }
        if (!t.isBusiness && t.category.toLowerCase().match(/(charity|medical|dental|vision|tax)/)) {
          itemizedDeductions += Math.abs(t.amount);
        }
      }
    });

    return { totalIncome, businessExpenses, itemizedDeductions };
  }, [transactions, taxSettings.taxYear]);

  const activeDocuments = REQUIRED_DOCUMENTS.filter(doc => taxSettings.hasBusiness || !doc.category.startsWith('business'));
  const totalChecklist = activeDocuments.length;
  const completedChecklist = activeDocuments.filter(i => documents.some(d => d.associatedChecklistId === i.id)).length;
  const progressPercent = totalChecklist === 0 ? 0 : (completedChecklist / totalChecklist) * 100;
  const downloadFile = async (content: string | Uint8Array, filename: string, contentType: string) => {
    const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
    
    if (isTauri) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const { writeTextFile, writeFile } = await import('@tauri-apps/plugin-fs');
        
        const extension = filename.split('.').pop() || '';
        const filters = [];
        if (extension === 'csv') {
          filters.push({ name: 'CSV Spreadsheet', extensions: ['csv'] });
        } else if (extension === 'md') {
          filters.push({ name: 'Markdown Document', extensions: ['md'] });
        } else if (extension === 'zip') {
          filters.push({ name: 'ZIP Archive', extensions: ['zip'] });
        }
        
        const filePath = await save({
          defaultPath: filename,
          filters
        });
        
        if (filePath) {
          if (content instanceof Uint8Array) {
            await writeFile(filePath, content);
          } else {
            await writeTextFile(filePath, content);
          }
        }
      } catch (err) {
        console.error('Failed to save file via Tauri:', err);
      }
    } else {
      const blob = new Blob([content], { type: contentType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const getBusinessCsvContent = () => {
    const yearTxns = transactions.filter(t => new Date(t.date).getFullYear() === taxSettings.taxYear);
    const businessTxns = yearTxns.filter(t => t.isBusiness && t.deductionStatus === 'confirmed');

    const csvData = businessTxns.map(t => {
      const rate = t.taxCategory ? (SCHEDULE_C_CATEGORIES[t.taxCategory]?.deductionRate ?? 1.0) : 1.0;
      const deductible = Math.abs(t.amount) * rate;
      const catLabel = t.taxCategory ? (SCHEDULE_C_CATEGORIES[t.taxCategory]?.label ?? 'Other') : 'Other';
      const acc = accounts.find(a => a.id === t.accountId);
      
      return {
        Date: t.date,
        Account: acc ? acc.name : 'Unknown',
        Institution: acc ? acc.institution : 'Unknown',
        Description: t.description,
        'IRS Schedule C Category': catLabel,
        'Gross Amount': Math.abs(t.amount),
        'Deduction Rate': `${rate * 100}%`,
        'Deductible Amount': deductible
      };
    });

    return Papa.unparse(csvData);
  };

  const getPersonalCsvContent = () => {
    const yearTxns = transactions.filter(t => new Date(t.date).getFullYear() === taxSettings.taxYear);
    const personalTxns = yearTxns.filter(t => !t.isBusiness && t.category.toLowerCase().match(/(charity|medical|dental|vision|tax)/));

    const csvData = personalTxns.map(t => {
      const acc = accounts.find(a => a.id === t.accountId);
      return {
        Date: t.date,
        Account: acc ? acc.name : 'Unknown',
        Institution: acc ? acc.institution : 'Unknown',
        Description: t.description,
        Category: t.category,
        Amount: Math.abs(t.amount)
      };
    });

    return Papa.unparse(csvData);
  };

  const getMarkdownContent = () => {
    const yearTxns = transactions.filter(t => new Date(t.date).getFullYear() === taxSettings.taxYear);
    const businessTxns = yearTxns.filter(t => t.isBusiness && t.deductionStatus === 'confirmed');
    const personalTxns = yearTxns.filter(t => !t.isBusiness && t.category.toLowerCase().match(/(charity|medical|dental|vision|tax)/));

    const filerStatusLabel = {
      single: 'Single',
      married_joint: 'Married Filing Jointly',
      married_separate: 'Married Filing Separately',
      head_household: 'Head of Household'
    }[taxSettings.personalInfo?.filingStatus || 'single'] || 'Single';

    const checklistItems = activeDocuments.map(item => {
      const doc = documents.find(d => d.associatedChecklistId === item.id);
      return {
        label: item.label,
        status: doc ? 'Uploaded' : 'Missing',
        filename: doc ? doc.name : 'N/A'
      };
    });

    const formatCurrency = (val: number | undefined) => 
      (val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    let md = `# Tax Summary Report - ${taxSettings.taxYear}\n\n`;
    md += `**Exported:** ${new Date().toLocaleDateString()}\n`;
    md += `**Source:** Local Database (strictly spending)\n\n`;

    md += `## Tax Financial Overview\n\n`;
    md += `### Income & Estimations\n`;
    md += `- **Gross Personal / W-2 Income:** $${formatCurrency(taxSettings.personalInfo?.w2Income)}\n`;
    if (taxSettings.hasBusiness) {
      md += `- **Gross Business Income:** $${formatCurrency(taxSettings.businessIncome?.grossSales || taxSettings.businessIncome?.forms1099Total || 0)}\n`;
    }
    md += `- **Estimated Tax Payments Paid:** $${formatCurrency(taxSettings.taxPayments?.estimatedPayments)}\n`;
    md += `- **State / LLC Fees Paid:** $${formatCurrency(taxSettings.taxPayments?.stateLocalFees)}\n\n`;

    md += `### Mapped Deductions\n`;
    md += `- **Personal Itemized Deductions:** $${formatCurrency(taxYearStats.itemizedDeductions)}\n`;
    if (taxSettings.hasBusiness) {
      md += `- **Business Schedule C Expenses:** $${formatCurrency(taxYearStats.businessExpenses)}\n`;
      md += `- **Net Business Income:** $${formatCurrency((taxSettings.businessIncome?.grossSales || 0) - taxYearStats.businessExpenses)}\n`;
    }
    md += `\n`;

    md += `## Filer & Entity Profile\n\n`;
    md += `### Personal Profile\n`;
    md += `- **Filing Status:** ${filerStatusLabel}\n`;
    md += `- **Dependents:** ${taxSettings.personalInfo?.dependents || 0}\n\n`;

    if (taxSettings.hasBusiness) {
      md += `### Business / LLC Profile\n`;
      md += `- **DBA / Legal Name:** ${taxSettings.businessIdentity?.dba || 'N/A'}\n`;
      md += `- **Address:** ${taxSettings.businessIdentity?.address || 'N/A'}\n`;
      md += `- **EIN or SSN:** ${taxSettings.businessIdentity?.einSsn || 'N/A'}\n\n`;
    }

    if (taxSettings.hasBusiness && (taxSettings.businessDeductions?.homeOffice || taxSettings.businessDeductions?.vehicle)) {
      md += `## Home Office & Vehicle Declarations\n\n`;
      if (taxSettings.businessDeductions?.homeOffice) {
        const sqFtOffice = taxSettings.businessDeductions.homeOffice.sqFtOffice || 0;
        const sqFtHome = taxSettings.businessDeductions.homeOffice.sqFtHome || 0;
        const ratio = sqFtHome ? ((sqFtOffice / sqFtHome) * 100).toFixed(1) : '0.0';
        md += `### Home Office\n`;
        md += `- **Dedicated Office Area:** ${sqFtOffice} sq ft\n`;
        md += `- **Total Home Area:** ${sqFtHome} sq ft\n`;
        md += `- **Home Office Ratio:** ${ratio}%\n\n`;
      }
      if (taxSettings.businessDeductions?.vehicle) {
        const busMiles = taxSettings.businessDeductions.vehicle.businessMiles || 0;
        const persMiles = taxSettings.businessDeductions.vehicle.personalMiles || 0;
        const ratio = (busMiles + persMiles) ? ((busMiles / (busMiles + persMiles)) * 100).toFixed(1) : '0.0';
        md += `### Vehicle Mileage\n`;
        md += `- **Business Miles Logged:** ${busMiles.toLocaleString()} mi\n`;
        md += `- **Personal Miles Logged:** ${persMiles.toLocaleString()} mi\n`;
        md += `- **Business Use Percentage:** ${ratio}%\n\n`;
      }
    }

    md += `## Document Audit Checklist\n\n`;
    md += `| Document Description | Status | File Name |\n`;
    md += `| :--- | :--- | :--- |\n`;
    checklistItems.forEach(item => {
      md += `| ${item.label} | ${item.status} | \`${item.filename}\` |\n`;
    });
    md += `\n`;

    if (taxSettings.hasBusiness) {
      md += `## Schedule C Business Deductions Ledger (${businessTxns.length} records)\n\n`;
      md += `| Date | Account | Description | IRS Category | Gross Amount | Rate | Deductible |\n`;
      md += `| :--- | :--- | :--- | :--- | ---: | ---: | ---: |\n`;
      businessTxns.forEach(t => {
        const rate = t.taxCategory ? (SCHEDULE_C_CATEGORIES[t.taxCategory]?.deductionRate ?? 1.0) : 1.0;
        const deductible = Math.abs(t.amount) * rate;
        const catLabel = t.taxCategory ? (SCHEDULE_C_CATEGORIES[t.taxCategory]?.label ?? 'Other') : 'Other';
        const acc = accounts.find(a => a.id === t.accountId);
        md += `| ${t.date} | ${acc ? acc.name : 'Unknown'} | ${t.description} | ${catLabel} | $${Math.abs(t.amount).toFixed(2)} | ${(rate * 100)}% | $${deductible.toFixed(2)} |\n`;
      });
      md += `| **TOTAL** | | | | **$${businessTxns.reduce((sum, t) => sum + Math.abs(t.amount), 0).toFixed(2)}** | | **$${taxYearStats.businessExpenses.toFixed(2)}** |\n\n`;
    }

    md += `## Itemized Personal Deductions Ledger (${personalTxns.length} records)\n\n`;
    md += `| Date | Account | Description | Spend Category | Amount |\n`;
    md += `| :--- | :--- | :--- | :--- | ---: |\n`;
    personalTxns.forEach(t => {
      const acc = accounts.find(a => a.id === t.accountId);
      md += `| ${t.date} | ${acc ? acc.name : 'Unknown'} | ${t.description} | ${t.category} | $${Math.abs(t.amount).toFixed(2)} |\n`;
    });
    md += `| **TOTAL** | | | | **$${taxYearStats.itemizedDeductions.toFixed(2)}** |\n`;

    return md;
  };

  const getComprehensiveCsvContent = () => {
    const yearTxns = transactions.filter(t => new Date(t.date).getFullYear() === taxSettings.taxYear);
    const businessTxns = yearTxns.filter(t => t.isBusiness && t.deductionStatus === 'confirmed');
    const personalTxns = yearTxns.filter(t => !t.isBusiness && t.category.toLowerCase().match(/(charity|medical|dental|vision|tax)/));

    const filerStatusLabel = {
      single: 'Single',
      married_joint: 'Married Filing Jointly',
      married_separate: 'Married Filing Separately',
      head_household: 'Head of Household'
    }[taxSettings.personalInfo?.filingStatus || 'single'] || 'Single';

    const lines: string[][] = [
      ['--- TAX PACKAGE GENERAL PROFILE ---'],
      ['Tax Year', String(taxSettings.taxYear)],
      ['Filing Status', filerStatusLabel],
      ['Number of Dependents', String(taxSettings.personalInfo?.dependents || 0)],
      ['Gross Personal / W-2 Income', String(taxSettings.personalInfo?.w2Income || 0)],
      ['Estimated Tax Payments Paid', String(taxSettings.taxPayments?.estimatedPayments || 0)],
      ['State / LLC Fees Paid', String(taxSettings.taxPayments?.stateLocalFees || 0)],
      [],
    ];

    if (taxSettings.hasBusiness) {
      lines.push(
        ['--- BUSINESS LLC PROFILE ---'],
        ['DBA / Legal Name', taxSettings.businessIdentity?.dba || 'N/A'],
        ['Business Address', taxSettings.businessIdentity?.address || 'N/A'],
        ['EIN or SSN', taxSettings.businessIdentity?.einSsn || 'N/A'],
        ['Gross Sales / Receipts', String(taxSettings.businessIncome?.grossSales || 0)],
        ['Forms 1099 Total', String(taxSettings.businessIncome?.forms1099Total || 0)],
        ['Other Income', String(taxSettings.businessIncome?.otherIncome || 0)],
        ['Home Office sq ft', String(taxSettings.businessDeductions?.homeOffice?.sqFtOffice || 0)],
        ['Total Home sq ft', String(taxSettings.businessDeductions?.homeOffice?.sqFtHome || 0)],
        ['Vehicle Business Miles', String(taxSettings.businessDeductions?.vehicle?.businessMiles || 0)],
        ['Vehicle Personal Miles', String(taxSettings.businessDeductions?.vehicle?.personalMiles || 0)],
        []
      );
    }

    lines.push(
      ['--- DOCUMENT AUDIT CHECKLIST STATUS ---'],
      ['Document Title', 'Status', 'File Name']
    );

    activeDocuments.forEach(item => {
      const doc = documents.find(d => d.associatedChecklistId === item.id);
      lines.push([item.label, doc ? 'Uploaded' : 'Missing', doc ? doc.name : 'N/A']);
    });
    lines.push([]);

    lines.push(
      ['--- COMPILED DEDUCTIONS LEDGER ---'],
      ['Ledger Type', 'Date', 'Account', 'Merchant/Description', 'IRS or Spend Category', 'Gross Amount', 'Rate', 'Deductible Amount']
    );

    businessTxns.forEach(t => {
      const rate = t.taxCategory ? (SCHEDULE_C_CATEGORIES[t.taxCategory]?.deductionRate ?? 1.0) : 1.0;
      const deductible = Math.abs(t.amount) * rate;
      const catLabel = t.taxCategory ? (SCHEDULE_C_CATEGORIES[t.taxCategory]?.label ?? 'Other') : 'Other';
      const acc = accounts.find(a => a.id === t.accountId);
      lines.push([
        'Business Schedule C',
        t.date,
        acc ? acc.name : 'Unknown',
        t.description,
        catLabel,
        String(Math.abs(t.amount)),
        `${rate * 100}%`,
        String(deductible)
      ]);
    });

    personalTxns.forEach(t => {
      const acc = accounts.find(a => a.id === t.accountId);
      lines.push([
        'Personal Itemized',
        t.date,
        acc ? acc.name : 'Unknown',
        t.description,
        t.category,
        String(Math.abs(t.amount)),
        '100%',
        String(Math.abs(t.amount))
      ]);
    });

    return Papa.unparse(lines);
  };


  const handleExportBusinessCsv = async () => {
    const content = getBusinessCsvContent();
    const dateStr = `${new Date().getMonth() + 1}_${new Date().getDate()}_${new Date().getFullYear()}`;
    await downloadFile(content, `Tax_package_business_expenses_${dateStr}.csv`, 'text/csv');
  };

  const handleExportPersonalCsv = async () => {
    const content = getPersonalCsvContent();
    const dateStr = `${new Date().getMonth() + 1}_${new Date().getDate()}_${new Date().getFullYear()}`;
    await downloadFile(content, `Tax_package_personal_deductions_${dateStr}.csv`, 'text/csv');
  };

  const handleExportMarkdown = async () => {
    const content = getMarkdownContent();
    const dateStr = `${new Date().getMonth() + 1}_${new Date().getDate()}_${new Date().getFullYear()}`;
    await downloadFile(content, `Tax_package_summary_${dateStr}.md`, 'text/markdown');
  };

  const handleExportComprehensiveCsv = async () => {
    const content = getComprehensiveCsvContent();
    const dateStr = `${new Date().getMonth() + 1}_${new Date().getDate()}_${new Date().getFullYear()}`;
    await downloadFile(content, `Tax_package_comprehensive_${dateStr}.csv`, 'text/csv');
  };

  const handleExportAll = async () => {
    setExportDialogOpen(false);
    setIsCompiling(true);
    setCompilationProgress(0);
    setCompilationStepText('Initializing compilation engine...');

    const steps = [
      { progress: 15, text: 'Extracting personal and filing declarations...' },
      { progress: 35, text: 'Formatting W-2 income & tax payment receipts...' },
      { progress: 55, text: 'Analyzing Business Schedule C operating deductions...' },
      { progress: 75, text: 'Compiling ledger transactions and itemizing personal deductions...' },
      { progress: 90, text: 'Building final consolidated reports (CSVs & Markdown)...' },
      { progress: 100, text: 'Success! Packaging all documents into ZIP...' }
    ];

    for (const step of steps) {
      setCompilationProgress(step.progress);
      setCompilationStepText(step.text);
      await new Promise(resolve => setTimeout(resolve, 400));
    }

    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      
      const dateStr = `${new Date().getMonth() + 1}_${new Date().getDate()}_${new Date().getFullYear()}`;

      // 1. Comprehensive Consolidated CSV
      const compCsv = getComprehensiveCsvContent();
      zip.file(`Tax_package_comprehensive_${dateStr}.csv`, compCsv);

      // 2. Summary Markdown
      const summaryMd = getMarkdownContent();
      zip.file(`Tax_package_summary_${dateStr}.md`, summaryMd);

      // 3. Business CSV
      if (taxSettings.hasBusiness) {
        const busCsv = getBusinessCsvContent();
        zip.file(`Tax_package_business_expenses_${dateStr}.csv`, busCsv);
      }

      // 4. Personal CSV
      const persCsv = getPersonalCsvContent();
      zip.file(`Tax_package_personal_deductions_${dateStr}.csv`, persCsv);

      // 5. Checklist Documents
      for (const item of activeDocuments) {
        const doc = documents.find(d => d.associatedChecklistId === item.id);
        if (doc) {
          try {
            if (doc.source === 'generated') {
              const contentsRes = await api.getDocumentContents();
              const contentRecord = contentsRes.find(c => c.id === doc.id);
              const docContent = contentRecord ? contentRecord.content : (doc as any).content || '';
              if (docContent) {
                zip.file(doc.name, docContent);
              }
            } else if (doc.source === 'uploaded') {
              const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
              if (isTauri) {
                try {
                  const { readFile } = await import('@tauri-apps/plugin-fs');
                  const fileBytes = await readFile(doc.path);
                  zip.file(doc.name, fileBytes);
                } catch (fsErr) {
                  console.error(`Could not read uploaded file at ${doc.path}:`, fsErr);
                }
              }
            }
          } catch (docErr) {
            console.error(`Error adding document ${doc.name} to zip:`, docErr);
          }
        }
      }

      // Generate Zip content
      const zipData = await zip.generateAsync({ type: 'uint8array' });

      // Save Zip
      await downloadFile(
        zipData, 
        `Tax_package_${taxSettings.taxYear}_${dateStr}.zip`, 
        'application/zip'
      );
    } catch (err) {
      console.error('Failed to generate ZIP package:', err);
    }

    setIsCompiling(false);
  };

  if (!shouldRender) return <PageLoader isLoading={true}><div /></PageLoader>;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 0 } }}>
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h4" fontWeight="800" sx={{ mb: 1 }}>
            Tax Center
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your personal and business taxes, upload required documents, and stay organized.
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            variant="contained"
            color="primary"
            startIcon={<DownloadIcon />}
            onClick={() => setExportDialogOpen(true)}
            sx={{ fontWeight: '600' }}
          >
            Export Tax Package
          </Button>
          <TextField
            select
            size="small"
            label="Tax Year"
            value={taxSettings.taxYear}
            onChange={(e) => handleUpdateSettings({ taxYear: parseInt(e.target.value, 10) })}
            sx={{ minWidth: 120 }}
          >
            {[...Array(5)].map((_, i) => {
              const year = new Date().getFullYear() - i;
              return <MenuItem key={year} value={year}>{year}</MenuItem>;
            })}
          </TextField>
        </Stack>
      </Box>

      {/* Overview Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper
            elevation={0}
            sx={{ p: 3, borderRadius: (theme) => `${theme.shape.borderRadius}px`, border: '1px solid', borderColor: 'divider', height: '100%', 
                   background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, ${alpha(theme.palette.primary.main, 0.01)} 100%)` }}
          >
            <Typography variant="subtitle2" color="text.secondary" fontWeight="600" gutterBottom>
              Document Upload Progress
            </Typography>
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1 }}>
                 <LinearProgress variant="determinate" value={progressPercent} sx={{ height: 10, borderRadius: (theme) => `${theme.shape.borderRadius}px` }} color={progressPercent === 100 ? 'success' : 'primary'} />
              </Box>
              <Typography variant="h6" fontWeight="700" color={progressPercent === 100 ? 'success.main' : 'primary.main'}>
                {Math.round(progressPercent)}%
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {completedChecklist} of {totalChecklist} documents uploaded
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: (theme) => `${theme.shape.borderRadius}px`, border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <Typography variant="subtitle2" color="text.secondary" fontWeight="600" gutterBottom>
              Personal Deductions Identified
            </Typography>
            <Typography variant="h3" fontWeight="800">
              ${taxYearStats.itemizedDeductions.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Identified medical and charitable expenses.
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: (theme) => `${theme.shape.borderRadius}px`, border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <Typography variant="subtitle2" color="text.secondary" fontWeight="600" gutterBottom>
              Business Expenses Identified
            </Typography>
            <Typography variant="h3" fontWeight="800" color={taxSettings.hasBusiness ? 'warning.main' : 'text.disabled'}>
              {taxSettings.hasBusiness ? `$${taxYearStats.businessExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {taxSettings.hasBusiness ? 'Identified LLC operating expenses.' : 'Enable Business tracking below.'}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Accordion Sections */}
      <Box sx={{ mb: 6 }}>

        {/* 1. Business Basics */}
        <Accordion defaultExpanded sx={{ mb: 2, borderRadius: (theme) => `${theme.shape.borderRadius}px`, '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: alpha(theme.palette.background.default, 0.5) }}>
            <Typography variant="h6" fontWeight="700">
              Business Basics & Financials
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={4}>
              <Grid size={{ xs: 12, md: 6 }}>
                <FormControlLabel
                  control={<Switch checked={taxSettings.hasBusiness} onChange={(e) => handleUpdateSettings({ hasBusiness: e.target.checked })} color="primary" />}
                  label="I have a Small Business / LLC (Schedule C)"
                  sx={{ mb: 2 }}
                />
                <Grid container spacing={2}>
                  <Grid size={12}>
                    <TextField fullWidth size="small" label="DBA / Legal Name" value={taxSettings.businessIdentity?.dba || ''} onChange={(e) => updateNestedSetting('businessIdentity', 'dba', e.target.value)} />
                  </Grid>
                  <Grid size={12}>
                    <TextField fullWidth size="small" label="Business Address" value={taxSettings.businessIdentity?.address || ''} onChange={(e) => updateNestedSetting('businessIdentity', 'address', e.target.value)} />
                  </Grid>
                  <Grid size={12}>
                    <TextField fullWidth size="small" label="EIN or SSN" value={taxSettings.businessIdentity?.einSsn || ''} onChange={(e) => updateNestedSetting('businessIdentity', 'einSsn', e.target.value)} />
                  </Grid>
                </Grid>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" fontWeight="600" color="text.secondary" gutterBottom>Required Documents</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  {REQUIRED_DOCUMENTS.filter(i => i.category === 'business_basics').map((item) => (
                    <TaxDocumentUpload
                      key={item.id}
                      documentId={item.id}
                      label={item.label}
                      accept={item.accept}
                      aiStatus={item.aiStatus}
                      doc={documents.find(d => d.associatedChecklistId === item.id)}
                      onUpload={handleDocumentUpload}
                      onRemove={handleDocumentRemove}
                      onGenerateAi={handleDocumentGenerateAi}
                    />
                  ))}
                </Box>
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Default Tax Rules (Accounts & Categories) */}
        <Accordion sx={{ mb: 2, borderRadius: (theme) => `${theme.shape.borderRadius}px`, '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: alpha(theme.palette.background.default, 0.5) }}>
            <Typography variant="h6" fontWeight="700">
              Default Tax Deduction Rules
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={4}>
              {/* Account-level defaults */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle1" fontWeight="600" sx={{ mb: 1 }}>
                  Account-Level Defaults
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                  Set default rules for entire bank/credit accounts. Changing this can bulk update existing transactions in that account.
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Account</TableCell>
                      <TableCell>Default Classification</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {accounts.map(acc => {
                      const val = taxSettings.accountDefaults?.[acc.id!] || 'unassigned';
                      return (
                        <TableRow key={acc.id} hover>
                          <TableCell sx={{ py: 1 }}>
                            <Typography variant="body2" fontWeight="500">{acc.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{acc.institution}</Typography>
                          </TableCell>
                          <TableCell>
                            <TextField
                              select
                              size="small"
                              fullWidth
                              value={val}
                              onChange={(e) => handleAccountDefaultChange(acc.id!, acc.name, e.target.value)}
                            >
                              <MenuItem value="unassigned">Review individually (Pending)</MenuItem>
                              <MenuItem value="business">Business Deduction (Default)</MenuItem>
                              <MenuItem value="personal">Personal Expense (Default)</MenuItem>
                            </TextField>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {accounts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} align="center" sx={{ color: 'text.secondary', py: 2 }}>
                          No accounts defined yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Grid>

              {/* Category-level defaults */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle1" fontWeight="600" sx={{ mb: 1 }}>
                  Category-Level Assignments
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                  Map standard spend categories to IRS Schedule C categories. Setting this triggers a bulk update of existing transactions.
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Spend Category</TableCell>
                      <TableCell>Schedule C Category</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {categories.filter(c => c.type === 'spend' && c.name !== 'Uncategorized').map(cat => {
                      const val = taxSettings.categoryDefaults?.[cat.name] || 'personal';
                      return (
                        <TableRow key={cat.id} hover>
                          <TableCell sx={{ py: 1 }}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: cat.color }} />
                              <Typography variant="body2" fontWeight="500">{cat.name}</Typography>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <TextField
                              select
                              size="small"
                              fullWidth
                              value={val}
                              onChange={(e) => handleCategoryDefaultChange(cat.name, e.target.value)}
                            >
                              <MenuItem value="personal">Personal Expense (Non-Business)</MenuItem>
                              {Object.values(SCHEDULE_C_CATEGORIES).map(sc => (
                                <MenuItem key={sc.id} value={sc.id}>
                                  {sc.label}
                                </MenuItem>
                              ))}
                            </TextField>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {categories.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} align="center" sx={{ color: 'text.secondary', py: 2 }}>
                          No categories defined yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* 2. Business Income */}
        {taxSettings.hasBusiness && (
          <Accordion sx={{ mb: 2, borderRadius: (theme) => `${theme.shape.borderRadius}px`, '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: alpha(theme.palette.background.default, 0.5) }}>
              <Typography variant="h6" fontWeight="700">
                Business Income & Tax Forms
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={4}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Grid container spacing={2}>
                    <Grid size={12}>
                      <TextField fullWidth size="small" type="number" label="Gross Sales / Receipts" value={taxSettings.businessIncome?.grossSales || ''} onChange={(e) => updateNestedSetting('businessIncome', 'grossSales', parseFloat(e.target.value) || 0)} InputProps={{ startAdornment: <Typography color="text.secondary" sx={{ mr: 1 }}>$</Typography> }} />
                    </Grid>
                    <Grid size={12}>
                      <TextField fullWidth size="small" type="number" label="Total from 1099s" value={taxSettings.businessIncome?.forms1099Total || ''} onChange={(e) => updateNestedSetting('businessIncome', 'forms1099Total', parseFloat(e.target.value) || 0)} InputProps={{ startAdornment: <Typography color="text.secondary" sx={{ mr: 1 }}>$</Typography> }} />
                    </Grid>
                    <Grid size={12}>
                      <TextField fullWidth size="small" type="number" label="Other Income" value={taxSettings.businessIncome?.otherIncome || ''} onChange={(e) => updateNestedSetting('businessIncome', 'otherIncome', parseFloat(e.target.value) || 0)} InputProps={{ startAdornment: <Typography color="text.secondary" sx={{ mr: 1 }}>$</Typography> }} />
                    </Grid>
                  </Grid>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Typography variant="subtitle2" fontWeight="600" color="text.secondary" gutterBottom>Required Documents</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    {REQUIRED_DOCUMENTS.filter(i => i.category === 'business_income').map((item) => (
                      <TaxDocumentUpload
                        key={item.id}
                        documentId={item.id}
                        label={item.label}
                        accept={item.accept}
                        aiStatus={item.aiStatus}
                        doc={documents.find(d => d.associatedChecklistId === item.id)}
                        onUpload={handleDocumentUpload}
                        onRemove={handleDocumentRemove}
                        onGenerateAi={handleDocumentGenerateAi}
                      />
                    ))}
                  </Box>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        )}

        {/* 3. Business Deductions */}
        {taxSettings.hasBusiness && (
          <Accordion sx={{ mb: 2, borderRadius: (theme) => `${theme.shape.borderRadius}px`, '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: alpha(theme.palette.background.default, 0.5) }}>
              <Typography variant="h6" fontWeight="700">
                Business Deductions & Expenses
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={4}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Typography variant="subtitle2" fontWeight="600" sx={{ mb: 2 }}>Home Office</Typography>
                  <Grid container spacing={2}>
                    <Grid size={6}>
                       <TextField fullWidth size="small" type="number" label="Sq Ft (Office)" value={taxSettings.businessDeductions?.homeOffice?.sqFtOffice || ''} onChange={(e) => handleUpdateSettings({ businessDeductions: { ...taxSettings.businessDeductions, homeOffice: { ...taxSettings.businessDeductions?.homeOffice, sqFtOffice: parseFloat(e.target.value) || 0 } } })} />
                    </Grid>
                    <Grid size={6}>
                       <TextField fullWidth size="small" type="number" label="Sq Ft (Total Home)" value={taxSettings.businessDeductions?.homeOffice?.sqFtHome || ''} onChange={(e) => handleUpdateSettings({ businessDeductions: { ...taxSettings.businessDeductions, homeOffice: { ...taxSettings.businessDeductions?.homeOffice, sqFtHome: parseFloat(e.target.value) || 0 } } })} />
                    </Grid>
                  </Grid>

                  <Typography variant="subtitle2" fontWeight="600" sx={{ mt: 3, mb: 2 }}>Vehicle</Typography>
                  <Grid container spacing={2}>
                    <Grid size={6}>
                       <TextField fullWidth size="small" type="number" label="Business Miles" value={taxSettings.businessDeductions?.vehicle?.businessMiles || ''} onChange={(e) => handleUpdateSettings({ businessDeductions: { ...taxSettings.businessDeductions, vehicle: { ...taxSettings.businessDeductions?.vehicle, businessMiles: parseFloat(e.target.value) || 0 } } })} />
                    </Grid>
                    <Grid size={6}>
                       <TextField fullWidth size="small" type="number" label="Personal Miles" value={taxSettings.businessDeductions?.vehicle?.personalMiles || ''} onChange={(e) => handleUpdateSettings({ businessDeductions: { ...taxSettings.businessDeductions, vehicle: { ...taxSettings.businessDeductions?.vehicle, personalMiles: parseFloat(e.target.value) || 0 } } })} />
                    </Grid>
                  </Grid>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Typography variant="subtitle2" fontWeight="600" color="text.secondary" gutterBottom>Required Documents</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    {REQUIRED_DOCUMENTS.filter(i => i.category === 'business_deductions').map((item) => (
                      <TaxDocumentUpload
                        key={item.id}
                        documentId={item.id}
                        label={item.label}
                        accept={item.accept}
                        aiStatus={item.aiStatus}
                        doc={documents.find(d => d.associatedChecklistId === item.id)}
                        onUpload={handleDocumentUpload}
                        onRemove={handleDocumentRemove}
                        onGenerateAi={handleDocumentGenerateAi}
                      />
                    ))}
                  </Box>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        )}

        {/* 4. Personal Tax Info */}
        <Accordion sx={{ mb: 2, borderRadius: (theme) => `${theme.shape.borderRadius}px`, '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: alpha(theme.palette.background.default, 0.5) }}>
            <Typography variant="h6" fontWeight="700">
              Personal Tax Information
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={4}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Grid container spacing={2}>
                  <Grid size={12}>
                    <TextField
                      select
                      fullWidth
                      size="small"
                      label="Filing Status"
                      value={taxSettings.personalInfo?.filingStatus || 'single'}
                      onChange={(e) => updateNestedSetting('personalInfo', 'filingStatus', e.target.value)}
                    >
                      <MenuItem value="single">Single</MenuItem>
                      <MenuItem value="married_joint">Married Filing Jointly</MenuItem>
                      <MenuItem value="married_separate">Married Filing Separately</MenuItem>
                      <MenuItem value="head_household">Head of Household</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid size={12}>
                    <TextField fullWidth size="small" type="number" label="Number of Dependents" value={taxSettings.personalInfo?.dependents || 0} onChange={(e) => updateNestedSetting('personalInfo', 'dependents', parseInt(e.target.value) || 0)} />
                  </Grid>
                  <Grid size={12}>
                    <TextField fullWidth size="small" type="number" label="W-2 Income (Box 1)" value={taxSettings.personalInfo?.w2Income || ''} onChange={(e) => updateNestedSetting('personalInfo', 'w2Income', parseFloat(e.target.value) || 0)} InputProps={{ startAdornment: <Typography color="text.secondary" sx={{ mr: 1 }}>$</Typography> }} />
                  </Grid>
                </Grid>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" fontWeight="600" color="text.secondary" gutterBottom>Required Documents</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  {REQUIRED_DOCUMENTS.filter(i => i.category === 'personal_info').map((item) => (
                    <TaxDocumentUpload
                      key={item.id}
                      documentId={item.id}
                      label={item.label}
                      accept={item.accept}
                      aiStatus={item.aiStatus}
                      doc={documents.find(d => d.associatedChecklistId === item.id)}
                      onUpload={handleDocumentUpload}
                      onRemove={handleDocumentRemove}
                      onGenerateAi={handleDocumentGenerateAi}
                    />
                  ))}
                </Box>
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* 5. Payments */}
        <Accordion sx={{ mb: 2, borderRadius: (theme) => `${theme.shape.borderRadius}px`, '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: alpha(theme.palette.background.default, 0.5) }}>
            <Typography variant="h6" fontWeight="700">
              Tax Payments Already Made
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={4}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Grid container spacing={2}>
                  <Grid size={12}>
                     <TextField fullWidth size="small" type="number" label="Estimated Payments (1040-ES)" value={taxSettings.taxPayments?.estimatedPayments || ''} onChange={(e) => updateNestedSetting('taxPayments', 'estimatedPayments', parseFloat(e.target.value) || 0)} InputProps={{ startAdornment: <Typography color="text.secondary" sx={{ mr: 1 }}>$</Typography> }} />
                  </Grid>
                  <Grid size={12}>
                     <TextField fullWidth size="small" type="number" label="State/Local LLC Fees Paid" value={taxSettings.taxPayments?.stateLocalFees || ''} onChange={(e) => updateNestedSetting('taxPayments', 'stateLocalFees', parseFloat(e.target.value) || 0)} InputProps={{ startAdornment: <Typography color="text.secondary" sx={{ mr: 1 }}>$</Typography> }} />
                  </Grid>
                </Grid>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" fontWeight="600" color="text.secondary" gutterBottom>Required Documents</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  {REQUIRED_DOCUMENTS.filter(i => i.category === 'tax_payments').map((item) => (
                    <TaxDocumentUpload
                      key={item.id}
                      documentId={item.id}
                      label={item.label}
                      accept={item.accept}
                      aiStatus={item.aiStatus}
                      doc={documents.find(d => d.associatedChecklistId === item.id)}
                      onUpload={handleDocumentUpload}
                      onRemove={handleDocumentRemove}
                      onGenerateAi={handleDocumentGenerateAi}
                    />
                  ))}
                </Box>
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

      </Box>

      {/* Bulk Update Prompt Dialog */}
      <Dialog open={bulkPromptOpen} onClose={() => setBulkPromptOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Bulk Update Transactions?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            You updated the default tax deduction mapping for <strong>{bulkAction?.targetName}</strong>. 
            Do you want to apply this rule and bulk update all existing transactions in the database?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button 
            variant="outlined" 
            onClick={async () => {
              if (bulkAction) {
                const { type, targetId, value } = bulkAction;
                if (type === 'account') {
                  const currentMap = taxSettings.accountDefaults || {};
                  await handleUpdateSettings({
                    accountDefaults: { ...currentMap, [targetId]: value }
                  });
                } else {
                  const currentMap = taxSettings.categoryDefaults || {};
                  await handleUpdateSettings({
                    categoryDefaults: { ...currentMap, [targetId]: value }
                  });
                }
              }
              setBulkPromptOpen(false);
              setBulkAction(null);
            }}
          >
            No, only future
          </Button>
          <Button variant="contained" onClick={handleBulkUpdateConfirm} autoFocus>
            Yes, update all
          </Button>
        </DialogActions>
      </Dialog>

      {/* Export Tax Package Dialog */}
      <Dialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>Export Tax Package ({taxSettings.taxYear})</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Compile and download your complete tax documentation package for the {taxSettings.taxYear} tax year. 
            You can export the consolidated profile and ledger, printable summary report, individual spreadsheets, or download the full package.
          </Typography>
          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: (theme) => `${theme.shape.borderRadius}px` }}>
              <Box sx={{ pr: 2 }}>
                <Typography variant="subtitle2" fontWeight="700">Comprehensive Consolidated Spreadsheet (CSV)</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Complete package combining general filer profile, entity status, checklist audit, and unified ledger of all deductions.</Typography>
              </Box>
              <Button variant="outlined" size="small" startIcon={<DownloadIcon />} onClick={handleExportComprehensiveCsv} sx={{ minWidth: '120px' }}>
                Export CSV
              </Button>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: (theme) => `${theme.shape.borderRadius}px` }}>
              <Box sx={{ pr: 2 }}>
                <Typography variant="subtitle2" fontWeight="700">Tax Summary Report (Markdown)</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Complete demographics, financials checklist, and formatted transaction tables in Markdown format.</Typography>
              </Box>
              <Button variant="outlined" size="small" startIcon={<DownloadIcon />} onClick={handleExportMarkdown} sx={{ minWidth: '120px' }}>
                Export MD
              </Button>
            </Paper>

            {taxSettings.hasBusiness && (
              <Paper variant="outlined" sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: (theme) => `${theme.shape.borderRadius}px` }}>
                <Box sx={{ pr: 2 }}>
                  <Typography variant="subtitle2" fontWeight="700">Business Expenses Spreadsheet (CSV)</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Schedule C deductible business transactions (gross, rate, and net deductible amounts) for spreadsheet analysis.</Typography>
                </Box>
                <Button variant="outlined" size="small" startIcon={<DownloadIcon />} onClick={handleExportBusinessCsv} sx={{ minWidth: '120px' }}>
                  Export CSV
                </Button>
              </Paper>
            )}

            <Paper variant="outlined" sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: (theme) => `${theme.shape.borderRadius}px` }}>
              <Box sx={{ pr: 2 }}>
                <Typography variant="subtitle2" fontWeight="700">Personal Deductions Spreadsheet (CSV)</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Itemized personal tax-deductible items (charity, medical, etc.) formatted for Excel or tax prep software.</Typography>
              </Box>
              <Button variant="outlined" size="small" startIcon={<DownloadIcon />} onClick={handleExportPersonalCsv} sx={{ minWidth: '120px' }}>
                Export CSV
              </Button>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1, justifyContent: 'space-between' }}>
          <Button variant="contained" color="primary" onClick={handleExportAll} startIcon={<DownloadIcon />}>
            Download Complete Package
          </Button>
          <Button variant="outlined" onClick={() => setExportDialogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Premium Compiling Progress Dialog Overlay */}
      <Dialog 
        open={isCompiling} 
        disableEscapeKeyDown
        PaperProps={{
          sx: {
            p: 3,
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            maxWidth: 400,
            width: '100%',
            textAlign: 'center'
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>Compiling Tax Package</DialogTitle>
        <DialogContent>
          <Box sx={{ py: 2 }}>
            <LinearProgress 
              variant="determinate" 
              value={compilationProgress} 
              sx={{ 
                height: 8, 
                borderRadius: 4, 
                mb: 2,
                background: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 4,
                  background: `linear-gradient(90deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`
                }
              }} 
            />
            <Typography variant="body2" fontWeight="600" color="text.secondary" sx={{ minHeight: 20 }}>
              {compilationStepText}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {compilationProgress}% completed
            </Typography>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
