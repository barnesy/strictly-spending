import { useState } from 'react';
import { AGENT_TOOLS } from '../components/AgentSkills/constants';
import { Box, Typography, Card, CardContent, Grid, Stack, Chip, Divider, useTheme, Tabs, Tab, Paper } from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

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
          {AGENT_TOOLS.map((tool) => (
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
                  <Typography variant="h6" fontWeight="600" sx={{ wordBreak: 'break-all', mb: 0.5 }}>
                    {tool.label}
                  </Typography>
                  <Typography variant="caption" component="code" sx={{ 
                    fontFamily: 'monospace', 
                    bgcolor: 'action.selected', 
                    px: 1, py: 0.5, borderRadius: 1, 
                    display: 'inline-block', mb: 2, 
                    color: 'primary.main', fontWeight: 600 
                  }}>
                    action: "{tool.name}"
                  </Typography>
                  
                  <Typography variant="body2" color="text.secondary" mb={3}>
                    {tool.desc}
                  </Typography>
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
