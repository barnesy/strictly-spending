import { useState } from 'react';
import { Box, Typography, Card, CardContent, Grid, Stack, Chip, Divider, useTheme, Tabs, Tab, Paper } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CategoryIcon from '@mui/icons-material/Category';
import DescriptionIcon from '@mui/icons-material/Description';
import AssessmentIcon from '@mui/icons-material/Assessment';
import TimelineIcon from '@mui/icons-material/Timeline';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import BugReportIcon from '@mui/icons-material/BugReport';
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest';
import SchoolIcon from '@mui/icons-material/School';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

const TOOLS = [
  {
    name: 'query_data',
    icon: <SearchIcon />,
    description: 'Searches the local database for transactions, totals, averages, and spending patterns.',
    prompts: ['How much did I spend on food last month?', 'Find Netflix transactions over $10']
  },
  {
    name: 'categorize_transactions',
    icon: <CategoryIcon />,
    description: 'Uses the local AI model to review all uncategorized transactions and automatically propose categories based on historical data.',
    prompts: ['AI categorize all my remaining transactions']
  },
  {
    name: 'generate_document',
    icon: <DescriptionIcon />,
    description: 'Dynamically generates documents (P&L, Expense Summary, generic lists) based on your transactions and saves them securely to your computer.',
    prompts: ['Generate a P&L statement for my business this year', 'Export my expense deductions', 'Create a CSV of my top 10 merchants'],
    code: `} else if (action === 'generate_document') {
  const docType = actionObj.documentType;
  const content = actionObj.documentContent || '';
  const isCsv = content.trim().startsWith('Date') || content.trim().includes(',');
  const defaultExt = isCsv ? 'csv' : 'md';
  const filePath = await save({
    filters: [{ name: 'Document', extensions: [defaultExt] }],
    defaultPath: \`Document_\${new Date().getFullYear()}.\${defaultExt}\`
  });
  if (filePath) {
    await writeTextFile(filePath, content);
    // Automatically check off tax form if applicable
  }
}`
  },
  {
    name: 'update_tax_settings',
    icon: <SettingsSuggestIcon />,
    description: 'Updates your tax settings and autofills form fields based on conversational input.',
    prompts: ['I am an LLC filing in California', 'Update my tax status to married filing jointly'],
    code: `} else if (action === 'update_tax_settings') {
  const currentSettings = await db.settings.get('app:taxSettings');
  const baseValue = currentSettings?.value || { checklist: {}, hasBusiness: false, taxYear: new Date().getFullYear() };
  if (actionObj.taxData) {
    const merged = { ...baseValue, ...actionObj.taxData };
    await db.settings.put({ key: 'app:taxSettings', value: merged });
  }
}`
  },
  {
    name: 'subscription_alerts',
    icon: <ReceiptLongIcon />,
    description: 'Scans recurring payments for duplicate subscriptions, price spikes, and overlapping services.',
    prompts: ['Check for subscription spikes', 'Find duplicate subscriptions'],
    code: `} else if (action === 'subscription_alerts') {
  // Finds transactions in 'Subscriptions' category
  // Groups by merchant and detects price changes > 20%
  // Alerts user to anomalies
}`
  },
  {
    name: 'spending_anomalies',
    icon: <AssessmentIcon />,
    description: 'Searches for unusual spending patterns or outliers within specific categories compared to your historical averages.',
    prompts: ['Are there any anomalies in my groceries spending?'],
    code: `} else if (action === 'spending_anomalies') {
  // Computes rolling 3-month average for category
  // Flags recent months that exceed 1.5x the average
}`
  },
  {
    name: 'project_runway',
    icon: <TimelineIcon />,
    description: 'Calculates your financial runway projection based on current cash reserves and monthly outflow.',
    prompts: ['How much runway do I have?', 'How long will my cash last?'],
    code: `} else if (action === 'project_runway') {
  const netCash = 17370.40; // Simulated cash balance
  const outflow = 4009.66; // Simulated monthly outflow
  const runway = (netCash / outflow).toFixed(2);
}`
  },
  {
    name: 'audit_accessibility',
    icon: <BugReportIcon />,
    description: 'Audits the web app accessibility score and provides a summary report.',
    prompts: ['Run an accessibility audit on this page'],
    code: `} else if (action === 'audit_accessibility') {
  const axe = await import('axe-core');
  const results = await axe.run();
  // Formats axe-core results for LLM summary
}`
  }
];

const SKILLS = [
  {
    name: 'Generate Profit & Loss Statement',
    description: 'Queries global category totals and generates a business Profit and Loss statement, saving it to the Documents tab.',
    prompts: ['generate business P&L', 'help me create a P&L for my business'],
    stages: [
      { step: '1', title: 'Query Database Aggregates', action: 'query_data', details: 'Retrieves year-to-date category totals for all categories, identifying income and expenses.' },
      { step: '2', title: 'Generate Document', action: 'generate_document', details: 'Formats the queried numbers into a structured Markdown document and prompts the user to save it.' }
    ]
  },
  {
    name: 'Financial Runway & Cash Projection',
    description: 'Calculates project budget runway based on cash reserves, CC debt, and monthly outflow.',
    prompts: ['How much runway do I have?', 'If I get 30k of income how much runway would I have if I raise the budget by $1000/month'],
    stages: [
      { step: '1', title: 'Project Runway', action: 'project_runway', details: 'Queries cash reserves and credit card debt to calculate net cash starting reserves, then outputs runway projection.' }
    ]
  },
  {
    name: 'Manual Transaction Categorization',
    description: 'Uses the local AI model to review and auto-categorize uncategorized transactions chunk-by-chunk.',
    prompts: ['AI categorize remaining transactions', 'please auto-categorize all uncategorized items'],
    stages: [
      { step: '1', title: 'Categorize Transactions', action: 'categorize_transactions', details: 'Processes uncategorized transactions in chunks using the local AI classification engine.' }
    ]
  }
];

export default function ToolsReference() {
  const theme = useTheme();
  const [tabValue, setTabValue] = useState(0);

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', p: 3 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Copilot Reference Library
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Reference documentation for tools (actions) and multi-step capabilities available to the Copilot financial AI.
        </Typography>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3.5 }}>
        <Tabs value={tabValue} onChange={(_, val) => setTabValue(val)}>
          <Tab label="AI Tools" sx={{ textTransform: 'none', fontWeight: 600 }} />
          <Tab label="Multi-Step Skills" sx={{ textTransform: 'none', fontWeight: 600 }} />
        </Tabs>
      </Box>

      {tabValue === 0 ? (
        <Grid container spacing={3}>
          {TOOLS.map((tool) => (
            <Grid size={{ xs: 12, md: 6 }} key={tool.name}>
              <Card 
                variant="outlined" 
                sx={{ 
                  height: '100%', 
                  display: 'flex', 
                  flexDirection: 'column',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: theme.shadows[4]
                  }
                }}
              >
                <CardContent sx={{ flexGrow: 1 }}>
                  <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                    <Box 
                      sx={{ 
                        p: 1.5, 
                        borderRadius: 2, 
                        bgcolor: 'primary.main', 
                        color: 'primary.contrastText',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {tool.icon}
                    </Box>
                    <Typography variant="h6" fontWeight="600" sx={{ wordBreak: 'break-all' }}>
                      {tool.name}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" mb={3} sx={{ minHeight: 40 }}>
                    {tool.description}
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  <Typography variant="caption" fontWeight="bold" color="text.primary" sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Example Prompts
                  </Typography>
                  <Stack direction="column" spacing={1} mb={3}>
                    {tool.prompts.map((prompt, idx) => (
                      <Chip 
                        key={idx} 
                        label={prompt} 
                        size="small" 
                        variant="outlined" 
                        sx={{ 
                          justifyContent: 'flex-start',
                          bgcolor: 'background.default',
                          py: 1,
                          height: 'auto',
                          '& .MuiChip-label': { whiteSpace: 'normal', display: 'block' }
                        }} 
                      />
                    ))}
                  </Stack>
                  {tool.code && (
                    <>
                      <Divider sx={{ mb: 2 }} />
                      <Typography variant="caption" fontWeight="bold" color="text.primary" sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Underlying Code implementation
                      </Typography>
                      <Box 
                        component="pre" 
                        sx={{ 
                          bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.04)',
                          p: 1.5,
                          borderRadius: 1,
                          overflowX: 'auto',
                          fontSize: '0.75rem',
                          fontFamily: 'monospace',
                          color: theme.palette.mode === 'dark' ? '#a5d6ff' : '#0550ae',
                          m: 0,
                          border: '1px solid',
                          borderColor: 'divider'
                        }}
                      >
                        {tool.code}
                      </Box>
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <Stack spacing={3}>
          {SKILLS.map((skill) => (
            <Card key={skill.name} variant="outlined">
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                  <Box 
                    sx={{ 
                      p: 1.5, 
                      borderRadius: 2, 
                      bgcolor: 'secondary.main', 
                      color: 'secondary.contrastText',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <SchoolIcon />
                  </Box>
                  <Typography variant="h6" fontWeight="600">
                    {skill.name}
                  </Typography>
                </Stack>
                
                <Typography variant="body2" color="text.secondary" mb={3}>
                  {skill.description}
                </Typography>
                
                <Divider sx={{ mb: 2.5 }} />

                <Typography variant="caption" fontWeight="bold" color="text.primary" sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Trigger Prompts
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" gap={1} mb={3}>
                  {skill.prompts.map((p, idx) => (
                    <Chip key={idx} label={p} size="small" variant="outlined" sx={{ bgcolor: 'background.default' }} />
                  ))}
                </Stack>

                <Divider sx={{ mb: 2.5 }} />

                <Typography variant="caption" fontWeight="bold" color="text.primary" sx={{ display: 'block', mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Skill Stages & Execution Flow
                </Typography>
                
                <Stack spacing={2}>
                  {skill.stages.map((stage, idx) => (
                    <Paper 
                      key={idx} 
                      variant="outlined" 
                      sx={{ 
                        p: 2, 
                        bgcolor: 'background.default',
                        display: 'flex',
                        flexDirection: { xs: 'column', sm: 'row' },
                        alignItems: { xs: 'flex-start', sm: 'center' },
                        gap: 2
                      }}
                    >
                      <Chip 
                        label={`Stage ${stage.step}`} 
                        color="primary" 
                        size="small" 
                        sx={{ fontWeight: 'bold' }} 
                      />
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="subtitle2" fontWeight="600" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {stage.title}
                          <Chip 
                            label={`action: "${stage.action}"`} 
                            size="small" 
                            component="code"
                            sx={{ fontFamily: 'monospace', height: 18, fontSize: '0.65rem', bgcolor: 'action.selected' }} 
                          />
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                          {stage.details}
                        </Typography>
                      </Box>
                      {idx < skill.stages.length - 1 && (
                        <Box sx={{ display: { xs: 'none', sm: 'block' }, color: 'text.secondary' }}>
                          <ArrowForwardIcon />
                        </Box>
                      )}
                    </Paper>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </Box>
  );
}
