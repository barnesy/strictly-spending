import { useState, useMemo } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Tabs, Tab, Alert, AlertTitle, Chip, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useChatStore } from '../../chatStore';

interface DebugPromptModalProps {
  open: boolean;
  onClose: () => void;
}

interface Issue {
  type: 'error' | 'warning' | 'info';
  title: string;
  message: string;
}

interface ContextKeyword {
  word: string;
  effect: string;
}

export function DebugPromptModal({ open, onClose }: DebugPromptModalProps) {
  const lastDebugPayload = useChatStore(s => s.lastDebugPayload);
  const [tabIndex, setTabIndex] = useState(0);

  const { parsed, issues, keywords } = useMemo(() => {
    let parsed: any = null;
    let issues: Issue[] = [];
    let keywords: ContextKeyword[] = [];
    
    if (!lastDebugPayload) return { parsed, issues, keywords };

    try {
      parsed = JSON.parse(lastDebugPayload);
      
      // Analyze Issues
      const messages = parsed.messages || [];
      const systemMsg = messages.find((m: any) => m.role === 'system');
      
      // 1. Missing Schema
      if (!parsed.format) {
        issues.push({ type: 'warning', title: 'Missing JSON Schema', message: 'No JSON schema is enforced for this request. The model may output unstructured text.' });
      }
      
      // 2. Missing Skills
      if (systemMsg && !systemMsg.content.includes('## Custom Capabilities')) {
         issues.push({ type: 'warning', title: 'No Agent Skills', message: 'There are no active custom agent skills injected into the system prompt.' });
      }

      // 3. Token Limits (very rough estimation: 4 chars per token)
      const totalChars = JSON.stringify(parsed).length;
      const estimatedTokens = Math.ceil(totalChars / 4);
      if (estimatedTokens > 3000) {
         issues.push({ type: 'error', title: 'High Token Count', message: `Estimated ${estimatedTokens} tokens. Small models like 1B/3B may hallucinate or forget instructions if the context is too large.` });
      } else if (estimatedTokens > 2000) {
         issues.push({ type: 'warning', title: 'Moderate Token Count', message: `Estimated ${estimatedTokens} tokens. Approaching optimal context limits for small models.` });
      }

      // 4. Cleaned History check
      const userMessages = messages.filter((m: any) => m.role === 'user');
      if (userMessages.length > 5) {
         issues.push({ type: 'info', title: 'Long Conversation History', message: `There are ${userMessages.length} user messages in history. Ensure old context is not confusing the model.` });
      }

      // Analyze Keywords in latest user message
      const latestUserMsg = userMessages[userMessages.length - 1];
      if (latestUserMsg) {
        const text = latestUserMsg.content.toLowerCase();
        if (text.includes('food')) {
          keywords.push({ word: 'food', effect: 'Maps categories to ["Groceries", "Restaurants & Coffee"]' });
        }
        if (text.includes('amazon') || text.includes('apple') || text.includes('netflix') || text.includes('walmart')) {
          keywords.push({ word: 'merchant name', effect: 'Triggers the exact merchant search parameter in agent_action' });
        }
        if (text.includes('january') || text.includes('february') || text.includes('last month')) {
          keywords.push({ word: 'timeframe', effect: 'Prompts the model to use the "custom" preset instead of "ytd"' });
        }
        if (text.includes('compare') || text.includes('versus') || text.includes('vs')) {
          keywords.push({ word: 'comparison', effect: 'May trigger multi-step queries or comparison breakdowns' });
        }
      }

    } catch (e) {
      issues.push({ type: 'error', title: 'Parse Error', message: 'Failed to parse the JSON payload.' });
    }

    return { parsed, issues, keywords };
  }, [lastDebugPayload]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ borderBottom: 1, borderColor: 'divider', pb: 2 }}>
        System Context Debugger
        <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} sx={{ minHeight: 36, mt: 1 }}>
          <Tab label="Dashboard" sx={{ minHeight: 36, py: 0.5 }} />
          <Tab label="Message Inspector" sx={{ minHeight: 36, py: 0.5 }} />
          <Tab label="Schema & Raw" sx={{ minHeight: 36, py: 0.5 }} />
        </Tabs>
      </DialogTitle>

      <DialogContent sx={{ p: 0, bgcolor: 'background.default', height: '60vh' }}>
        {!parsed ? (
           <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
             No request payload recorded yet. Try sending a message!
           </Box>
        ) : (
          <>
            {/* Dashboard Tab */}
            {tabIndex === 0 && (
              <Box sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>Execution Configuration</Typography>
                <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
                  <Chip label={`Model: ${parsed.model || 'Unknown'}`} color="primary" variant="outlined" />
                  <Chip label={`Temperature: ${parsed.options?.temperature ?? 'Default'}`} variant="outlined" />
                  <Chip label={`Format: ${parsed.format ? 'Strict JSON Schema' : 'Text/Markdown'}`} variant="outlined" color={parsed.format ? "success" : "default"} />
                </Box>

                <Typography variant="h6" gutterBottom>Detected Context Keywords</Typography>
                {keywords.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>No special keywords detected in the latest user query.</Typography>
                ) : (
                  <Box sx={{ display: 'flex', gap: 1, mb: 4, flexWrap: 'wrap' }}>
                    {keywords.map((kw, i) => (
                      <Chip key={i} label={`${kw.word}: ${kw.effect}`} color="secondary" />
                    ))}
                  </Box>
                )}

                <Typography variant="h6" gutterBottom>Payload Diagnostics</Typography>
                {issues.length === 0 ? (
                  <Alert severity="success">No issues detected in the payload structure.</Alert>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {issues.map((iss, i) => (
                      <Alert key={i} severity={iss.type}>
                        <AlertTitle>{iss.title}</AlertTitle>
                        {iss.message}
                      </Alert>
                    ))}
                  </Box>
                )}
              </Box>
            )}

            {/* Message Inspector Tab */}
            {tabIndex === 1 && (
              <Box sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  This timeline shows exactly what messages were sent to the model, in order.
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                  {parsed.messages?.map((m: any, i: number) => {
                    let bgcolor = 'background.paper';
                    let borderColor = 'divider';
                    if (m.role === 'system') {
                      bgcolor = 'rgba(25, 118, 210, 0.05)';
                      borderColor = 'primary.main';
                    } else if (m.role === 'assistant') {
                      bgcolor = 'rgba(156, 39, 176, 0.05)';
                      borderColor = 'secondary.main';
                    }
                    return (
                      <Box key={i} sx={{ borderLeft: '4px solid', borderColor, bgcolor, p: 2, borderRadius: 1, boxShadow: 1 }}>
                        <Typography variant="subtitle2" sx={{ textTransform: 'uppercase', color: borderColor, mb: 1 }}>
                          {m.role} {m.role === 'assistant' && i < parsed.messages.length - 2 ? '(Few-Shot Example)' : ''}
                        </Typography>
                        <Box sx={{ maxHeight: m.role === 'system' ? 300 : 'none', overflowY: 'auto' }}>
                           <Typography variant="body2" component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 12 }}>
                             {m.content}
                           </Typography>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            )}

            {/* Schema & Raw Tab */}
            {tabIndex === 2 && (
              <Box sx={{ p: 3 }}>
                <Accordion defaultExpanded>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography fontWeight="bold">Enforced JSON Schema</Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ bgcolor: 'background.paper', p: 2 }}>
                    {parsed.format ? (
                      <Typography variant="body2" component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 }}>
                        {JSON.stringify(parsed.format, null, 2)}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">No schema provided.</Typography>
                    )}
                  </AccordionDetails>
                </Accordion>

                <Accordion sx={{ mt: 2 }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography fontWeight="bold">Raw JSON Payload</Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ bgcolor: 'background.paper', p: 2 }}>
                    <Typography variant="body2" component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
                      {lastDebugPayload}
                    </Typography>
                  </AccordionDetails>
                </Accordion>
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
        <Button onClick={onClose} variant="contained">Close</Button>
      </DialogActions>
    </Dialog>
  );
}
