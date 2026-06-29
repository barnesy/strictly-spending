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



export function DebugPromptModal({ open, onClose }: DebugPromptModalProps) {
  const lastDebugPayload = useChatStore(s => s.lastDebugPayload);
  const [tabIndex, setTabIndex] = useState(0);

  const { parsed, issues, activePlaybooks, currentStateStr } = useMemo(() => {
    let parsed: any = null;
    const issues: Issue[] = [];
    let activePlaybooks: any[] = [];
    let currentStateStr = '';
    
    if (!lastDebugPayload) return { parsed, issues, activePlaybooks, currentStateStr };

    try {
      parsed = JSON.parse(lastDebugPayload);
      
      // Analyze Issues
      const messages = parsed.messages || [];
      const systemMsg = messages.find((m: any) => m.role === 'system');
      
      if (systemMsg && typeof systemMsg.content === 'string') {
        const playbookMatch = systemMsg.content.match(/<api_playbook>([\s\S]*?)<\/api_playbook>/);
        if (playbookMatch) {
          try {
            activePlaybooks = JSON.parse(playbookMatch[1]);
          } catch (e) {
            issues.push({ type: 'warning', title: 'Playbook Parse Error', message: 'Found <api_playbook> but could not parse the JSON.' });
          }
        }
        
        const stateMatch = systemMsg.content.match(/<current_state>([\s\S]*?)<\/current_state>/);
        if (stateMatch) {
          currentStateStr = stateMatch[1].trim();
        }
      }

      // 1. Missing Native Tools
      if (!parsed.tools || parsed.tools.length === 0) {
        issues.push({ type: 'warning', title: 'Missing Agent Tools', message: 'No native tools are configured for this request. The model will not be able to interact with the application or access live data.' });
      }
      
      // 2. Missing Skills
      if (systemMsg && !systemMsg.content.includes('<custom_capabilities>')) {
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

    } catch (e) {
      issues.push({ type: 'error', title: 'Parse Error', message: 'Failed to parse the JSON payload.' });
    }

    return { parsed, issues, activePlaybooks, currentStateStr };
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
                  <Chip label={`Format: ${parsed.tools ? 'Native Tool Calling' : 'Text/Markdown'}`} variant="outlined" color={parsed.tools ? "success" : "default"} />
                </Box>

                <Typography variant="h6" gutterBottom>Active Playbooks</Typography>
                {activePlaybooks.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>No playbooks selected by Semantic Router for this interaction.</Typography>
                ) : (
                  <Box sx={{ display: 'flex', gap: 1, mb: 4, flexWrap: 'wrap' }}>
                    {activePlaybooks.map((pb, i) => (
                      <Chip key={i} label={`${pb.id}: ${pb.title}`} color="secondary" />
                    ))}
                  </Box>
                )}

                <Typography variant="h6" gutterBottom>Injected State Context</Typography>
                {!currentStateStr ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>No state context found.</Typography>
                ) : (
                  <Box sx={{ mb: 4, p: 2, bgcolor: 'rgba(0,0,0,0.03)', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="body2" component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 }}>
                      {currentStateStr}
                    </Typography>
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
                           {(() => {
                             let content = m.content;
                             let thinking = '';
                             if (typeof content === 'string') {
                               const thinkMatch = content.match(/<(?:thinking|\|channel>thought|\|think\|>)(?:>)?([\s\S]*?)(?:<\/(?:thinking|\|?think\|?>)|<channel\|>|$)/);
                               if (thinkMatch) {
                                 thinking = thinkMatch[1].trim();
                                 content = content.replace(thinkMatch[0], '').trim();
                               }
                             }
                             return (
                               <>
                                 {thinking && (
                                   <Box sx={{ mb: 2, p: 1.5, bgcolor: 'rgba(0,0,0,0.03)', borderLeft: '3px solid #888', borderRadius: 1 }}>
                                     <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'bold', display: 'block', mb: 0.5 }}>
                                       [Thinking Process]
                                     </Typography>
                                     <Typography variant="body2" component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 11, color: 'text.secondary' }}>
                                       {thinking}
                                     </Typography>
                                   </Box>
                                 )}
                                 <Typography variant="body2" component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 12 }}>
                                   {content}
                                 </Typography>
                               </>
                             );
                           })()}
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
                    <Typography fontWeight="bold">Configured Agent Tools</Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ bgcolor: 'background.paper', p: 2 }}>
                    {parsed.tools ? (
                      <Typography variant="body2" component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 }}>
                        {JSON.stringify(parsed.tools, null, 2)}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">No native tools configured.</Typography>
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
        <Button 
          onClick={() => {
            const debugText = [
              'Execution Configuration',
              `Model: ${parsed?.model || 'Unknown'}`,
              `Temperature: ${parsed?.options?.temperature ?? 'Default'}`,
              `Format: ${parsed?.tools ? 'Native Tool Calling' : 'Text/Markdown'}`,
              '',
              'Active Playbooks',
              activePlaybooks.length === 0 ? 'No playbooks selected by Semantic Router for this interaction.' : activePlaybooks.map((p: any) => `${p.id}: ${p.title}`).join('\n'),
              '',
              'Injected State Context',
              currentStateStr || 'No state context found.',
              '',
              'Payload Diagnostics',
              issues.length === 0 ? 'No issues detected.' : issues.map((i: any) => `${i.title}\n${i.message}`).join('\n\n')
            ].join('\n');
            navigator.clipboard.writeText(debugText);
          }} 
          color="inherit" 
          sx={{ mr: 'auto' }}
        >
          Copy Dashboard Data
        </Button>
        <Button onClick={onClose} variant="contained">Close</Button>
      </DialogActions>
    </Dialog>
  );
}
