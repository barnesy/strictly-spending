import { useState } from 'react';
import { AGENT_TOOLS, GEN_UX_COMPONENTS } from '../ai/architecture';
import { Box, Typography, Card, CardContent, Grid, Stack, Chip, Divider, useTheme, Tabs, Tab, Paper } from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArchitectureIcon from '@mui/icons-material/Architecture';
import BuildIcon from '@mui/icons-material/Build';
import DashboardIcon from '@mui/icons-material/Dashboard';

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
          Reference documentation for the underlying architecture, tools, Gen UX components, and multi-step capabilities available to the Copilot financial AI.
        </Typography>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3.5 }}>
        <Tabs value={tabValue} onChange={(_, val) => setTabValue(val)}>
          <Tab label="Architecture Overview" sx={{ textTransform: 'none', fontWeight: 600 }} />
          <Tab label="AI Tools" sx={{ textTransform: 'none', fontWeight: 600 }} />
          <Tab label="Gen UX Components" sx={{ textTransform: 'none', fontWeight: 600 }} />
        </Tabs>
      </Box>

      {tabValue === 0 && (
        <Stack spacing={3}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'primary.main', color: 'primary.contrastText', display: 'flex' }}>
                  <ArchitectureIcon />
                </Box>
                <Typography variant="h6" fontWeight="600">
                  System Architecture
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" paragraph>
                The Copilot AI operates using an orchestrator that evaluates a <strong>System Prompt</strong>, executes <strong>Tools</strong>, responds with <strong>Gen UX Components</strong>, and can run multi-step <strong>Skills</strong>.
              </Typography>
              
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom mt={2}>
                1. System Prompt
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                The System Prompt acts as the foundation of the AI's behavior. It instructs the LLM on how to format its JSON responses, which tools are available, and how to maintain a helpful financial tone without hallucinating data. The prompt also dynamically injects the user's current application state (e.g., active budgets, current route).
              </Typography>
              
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom mt={2}>
                2. Tools (Actions)
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Tools are explicit capabilities the LLM can invoke to interact with the application. When the LLM outputs an <code>agent_action</code> with a specific tool name (like <code>query_data</code> or <code>navigate</code>), the local Copilot Orchestrator executes that tool to either modify the UI or fetch data from the local SQLite database.
              </Typography>

              <Typography variant="subtitle2" fontWeight="bold" gutterBottom mt={2}>
                3. Gen UX Components
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Instead of just generating text, the LLM can output Generative UX components (like buttons, forms, or confirmations) in the chat stream. By setting the <code>gen_ux.type</code> property, the LLM provides interactive interfaces directly inside the chat, allowing the user to seamlessly make choices or confirm actions.
              </Typography>

              <Typography variant="subtitle2" fontWeight="bold" gutterBottom mt={2}>
                4. Agent Skills
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Skills are multi-step workflows that chain together tools, logic, and Gen UX components. When a skill is triggered, the Orchestrator steps through the skill's defined stages, executing one or more tools automatically until the workflow is complete. This allows the AI to perform complex, long-running tasks.
              </Typography>
            </CardContent>
          </Card>
        </Stack>
      )}

      {tabValue === 1 && (
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
      )}

      {tabValue === 2 && (
        <Grid container spacing={3}>
          {GEN_UX_COMPONENTS.map((comp) => (
            <Grid size={{ xs: 12, md: 6 }} key={comp.name}>
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
                    {comp.label}
                  </Typography>
                  <Typography variant="caption" component="code" sx={{ 
                    fontFamily: 'monospace', 
                    bgcolor: 'action.selected', 
                    px: 1, py: 0.5, borderRadius: 1, 
                    display: 'inline-block', mb: 2, 
                    color: 'success.main', fontWeight: 600 
                  }}>
                    gen_ux.type: "{comp.name}"
                  </Typography>
                  
                  <Typography variant="body2" color="text.secondary" mb={3}>
                    {comp.desc}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}


    </Box>
  );
}
