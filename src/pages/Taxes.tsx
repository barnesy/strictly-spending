import { useMemo } from 'react';
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
} from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import PersonIcon from '@mui/icons-material/Person';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { TaxSettings } from '../types';
import TaxDocumentUpload from '../components/TaxDocumentUpload';

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

const REQUIRED_DOCUMENTS: Array<{ id: string; label: string; accept: 'pdf' | 'spreadsheet'; category: string }> = [
  // Business Basics
  { id: 'business_pnl', label: 'Year-End Profit & Loss Statement (P&L)', accept: 'spreadsheet', category: 'business_basics' },
  { id: 'business_balance_sheet', label: 'Balance Sheet', accept: 'spreadsheet', category: 'business_basics' },
  { id: 'business_ledger', label: 'General Ledger / Bank Statements', accept: 'spreadsheet', category: 'business_basics' },
  
  // Business Income
  { id: 'income_1099k', label: 'Form 1099-K (Payment Processors)', accept: 'pdf', category: 'business_income' },
  { id: 'income_1099nec', label: 'Form 1099-NEC (Clients)', accept: 'pdf', category: 'business_income' },
  { id: 'income_1099misc', label: 'Form 1099-MISC', accept: 'pdf', category: 'business_income' },
  
  // Business Deductions
  { id: 'deduction_expense_summary', label: 'Expense Summary by Category', accept: 'spreadsheet', category: 'business_deductions' },
  { id: 'deduction_mileage_log', label: 'Mileage Log', accept: 'spreadsheet', category: 'business_deductions' },
  { id: 'deduction_vehicle_expenses', label: 'Vehicle Expense Receipts', accept: 'pdf', category: 'business_deductions' },
  { id: 'deduction_assets', label: 'Asset Purchases & Depreciation', accept: 'pdf', category: 'business_deductions' },
  { id: 'deduction_w2_w3', label: 'W-2 / W-3 for Employees', accept: 'pdf', category: 'business_deductions' },
  { id: 'deduction_1099_issued', label: '1099-NECs issued', accept: 'pdf', category: 'business_deductions' },

  // Personal Info
  { id: 'personal_prior_return', label: 'Prior Year Tax Return', accept: 'pdf', category: 'personal_info' },
  { id: 'personal_w2', label: 'Form W-2 (from employers)', accept: 'pdf', category: 'personal_info' },
  { id: 'personal_1099', label: 'Form 1099-INT / 1099-DIV', accept: 'pdf', category: 'personal_info' },
  { id: 'personal_k1', label: 'Schedule K-1', accept: 'pdf', category: 'personal_info' },
  { id: 'personal_ira', label: 'IRA Contributions Documented', accept: 'pdf', category: 'personal_info' },
  { id: 'personal_health', label: 'Health Insurance Info (Form 1095)', accept: 'pdf', category: 'personal_info' },
  { id: 'personal_charity', label: 'Charitable Donations Receipts', accept: 'pdf', category: 'personal_info' },
  { id: 'personal_student_loan', label: 'Student Loan Interest (Form 1098-E)', accept: 'pdf', category: 'personal_info' },

  // Payments
  { id: 'payments_estimated', label: 'Estimated Tax Payments (1040-ES)', accept: 'pdf', category: 'tax_payments' },
  { id: 'payments_state', label: 'State & Local Taxes / LLC Fees', accept: 'pdf', category: 'tax_payments' }
];

export default function Taxes() {
  const theme = useTheme();

  const rawSettings = useLiveQuery(() => db.settings.get('app:taxSettings'), []);
  const taxSettings: TaxSettings = (rawSettings?.value as TaxSettings) || DEFAULT_TAX_SETTINGS;

  const documents = useLiveQuery(() => db.documents?.toArray(), []) || [];

  const transactions = useLiveQuery(
    () => db.transactions.toArray(),
    []
  ) || [];

  const handleUpdateSettings = async (updates: Partial<TaxSettings>) => {
    const newSettings = { ...taxSettings, ...updates };
    await db.settings.put({
      key: 'app:taxSettings',
      value: newSettings,
    });
  };

  const updateNestedSetting = (category: keyof TaxSettings, field: string, value: any) => {
    handleUpdateSettings({
      [category]: {
        ...(taxSettings[category] as any || {}),
        [field]: value
      }
    });
  };

  const handleDocumentUpload = async (documentId: string, fileInfo: { filename: string; type: string; path: string; uploadedAt: string }) => {
    const newDocId = crypto.randomUUID();
    await db.documents.put({
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

  // Automated Insights
  const taxYearStats = useMemo(() => {
    const yearTransactions = transactions.filter(t => new Date(t.date).getFullYear() === taxSettings.taxYear);
    
    let totalIncome = 0;
    let businessExpenses = 0;
    let itemizedDeductions = 0;

    yearTransactions.forEach(t => {
      if (t.amount < 0 || t.category.toLowerCase().includes('income')) {
        totalIncome += Math.abs(t.amount);
      } else {
        if (t.category.toLowerCase().match(/(business|software|office|advertising|contractor)/)) {
          businessExpenses += t.amount;
        }
        if (t.category.toLowerCase().match(/(charity|medical|dental|vision|tax)/)) {
          itemizedDeductions += t.amount;
        }
      }
    });

    return { totalIncome, businessExpenses, itemizedDeductions };
  }, [transactions, taxSettings.taxYear]);

  const activeDocuments = REQUIRED_DOCUMENTS.filter(doc => taxSettings.hasBusiness || !doc.category.startsWith('business'));
  const totalChecklist = activeDocuments.length;
  const completedChecklist = activeDocuments.filter(i => documents.some(d => d.associatedChecklistId === i.id)).length;
  const progressPercent = totalChecklist === 0 ? 0 : (completedChecklist / totalChecklist) * 100;



  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 0 } }}>
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h4" fontWeight="800" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <ReceiptLongIcon fontSize="large" color="primary" />
            Tax Center
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your personal and business taxes, upload required documents, and stay organized.
          </Typography>
        </Box>
        <Box>
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
        </Box>
      </Box>

      {/* Overview Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper
            elevation={0}
            sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider', height: '100%', 
                   background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, ${alpha(theme.palette.primary.main, 0.01)} 100%)` }}
          >
            <Typography variant="subtitle2" color="text.secondary" fontWeight="600" gutterBottom>
              Document Upload Progress
            </Typography>
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1 }}>
                 <LinearProgress variant="determinate" value={progressPercent} sx={{ height: 10, borderRadius: 5 }} color={progressPercent === 100 ? 'success' : 'primary'} />
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
          <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider', height: '100%' }}>
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
          <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider', height: '100%' }}>
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
        <Accordion defaultExpanded sx={{ mb: 2, borderRadius: 2, '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: alpha(theme.palette.background.default, 0.5) }}>
            <Typography variant="h6" fontWeight="700" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <BusinessCenterIcon color="primary" /> Business Basics & Financials
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
                      doc={documents.find(d => d.associatedChecklistId === item.id)}
                      onUpload={handleDocumentUpload}
                    />
                  ))}
                </Box>
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* 2. Business Income */}
        {taxSettings.hasBusiness && (
          <Accordion sx={{ mb: 2, borderRadius: 2, '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: alpha(theme.palette.background.default, 0.5) }}>
              <Typography variant="h6" fontWeight="700" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <MonetizationOnIcon color="success" /> Business Income & Tax Forms
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
                        doc={documents.find(d => d.associatedChecklistId === item.id)}
                        onUpload={handleDocumentUpload}
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
          <Accordion sx={{ mb: 2, borderRadius: 2, '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: alpha(theme.palette.background.default, 0.5) }}>
              <Typography variant="h6" fontWeight="700" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ReceiptLongIcon color="warning" /> Business Deductions & Expenses
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
                        doc={documents.find(d => d.associatedChecklistId === item.id)}
                        onUpload={handleDocumentUpload}
                      />
                    ))}
                  </Box>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        )}

        {/* 4. Personal Tax Info */}
        <Accordion sx={{ mb: 2, borderRadius: 2, '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: alpha(theme.palette.background.default, 0.5) }}>
            <Typography variant="h6" fontWeight="700" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PersonIcon color="info" /> Personal Tax Information
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
                      doc={documents.find(d => d.associatedChecklistId === item.id)}
                      onUpload={handleDocumentUpload}
                    />
                  ))}
                </Box>
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* 5. Payments */}
        <Accordion sx={{ mb: 2, borderRadius: 2, '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: alpha(theme.palette.background.default, 0.5) }}>
            <Typography variant="h6" fontWeight="700" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <MonetizationOnIcon color="error" /> Tax Payments Already Made
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
                      doc={documents.find(d => d.associatedChecklistId === item.id)}
                      onUpload={handleDocumentUpload}
                    />
                  ))}
                </Box>
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

      </Box>
    </Box>
  );
}
