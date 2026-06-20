import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  Chip,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  alpha,
} from '@mui/material';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import VisibilityIcon from '@mui/icons-material/Visibility';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import {
  type ChatMessage,
  parseAIResponse,
  getMessageDisplayContent,
  extractFieldUsingRegex,
  forceBoldAndTwoDecimals,
} from '../../ai';
import { db } from '../../db';
import { useChatStore } from '../../chatStore';
import SimpleMarkdown from '../SimpleMarkdown';
import CopilotQueryResult from '../CopilotQueryResult';
import { GenUXConfirmation, GenUXForm, ProposedCategorizationReportUX } from './GenUXComponents';
import AnimatedLogo from '../AnimatedLogo';

interface ChatMessageItemProps {
  message: ChatMessage;
  loading: boolean;
  onSendPromptText: (text: string) => void;
  onApplyFilters: (actionResult: any) => Promise<void>;
}

function renderMessageContent(m: ChatMessage): string {
  let content = '';
  if (m.role !== 'assistant') {
    content = m.content;
  } else {
    try {
      const parsed = parseAIResponse(m.content);
      if (parsed) {
        content = getMessageDisplayContent(parsed, m.isStreaming);
      }
    } catch {
      // Ignore and fall through
    }

    if (!content) {
      // Regex safety net
      const bodyField =
        extractFieldUsingRegex(m.content, 'body') ||
        extractFieldUsingRegex(m.content, 'explanation') ||
        extractFieldUsingRegex(m.content, 'message') ||
        extractFieldUsingRegex(m.content, 'text');
      content = bodyField || '';
    }

    if (!content && m.isStreaming) {
      content = "*Thinking...*";
    }

    if (!content) {
      // Last fallback if it looks like JSON but failed to parse/extract
      const trimmed = m.content.trim();
      if (
        trimmed.startsWith('{') ||
        trimmed.includes('```json') ||
        trimmed.includes('"body"')
      ) {
        content = 'I processed your request, but encountered a formatting issue while rendering the response.';
      } else {
        content = m.content;
      }
    }
  }

  if (m.role === 'assistant' && !m.isStreaming) {
    return forceBoldAndTwoDecimals(content);
  }
  return content;
}

export const ChatMessageItem = React.memo(function ChatMessageItem({
  message,
  loading,
  onSendPromptText,
  onApplyFilters,
}: ChatMessageItemProps) {
  const isUser = message.role === 'user';
  const navigate = useNavigate();
  const [showInspector, setShowInspector] = useState(false);
  const [isLogsExpanded, setIsLogsExpanded] = useState<boolean | null>(null);
  const [openPreview, setOpenPreview] = useState(false);
  const logsExpanded = isLogsExpanded !== null ? isLogsExpanded : !!message.isStreaming;

  const handleChatMessageLinkClick = (url: string) => {
    const match = url.match(/^doc:\/\/([^#]+)(?:#tab=(.+))?$/);
    if (match) {
      const docId = match[1];
      const tabName = match[2] || 'All';
      navigate(`/documents?previewId=${docId}&tab=${encodeURIComponent(tabName)}`);
    }
  };

  // Skill metadata resolved from steps list dynamically

  const updateMessageResult = async (targetMsg: ChatMessage, newResult: any) => {
    const currentMessages = useChatStore.getState().messages;
    const index = currentMessages.findIndex((m) => m === targetMsg);
    if (index >= 0) {
      const updatedMessages = [...currentMessages];
      updatedMessages[index] = {
        ...updatedMessages[index],
        actionResult: newResult,
      };
      useChatStore.getState().setMessages(updatedMessages);

      const threadId = useChatStore.getState().activeThreadId;
      if (threadId) {
        const dbMsgs = await db.messages.where('threadId').equals(threadId).sortBy('id');
        const dbMsg = dbMsgs.find(m => m.role === targetMsg.role && m.content === targetMsg.content);
        if (dbMsg && dbMsg.id) {
          await db.messages.update(dbMsg.id, { actionResult: newResult });
        }
      }
    }
  };
  
  const showResult =
    message.actionResult &&
    [
      'query_data',
      'subscription_alerts',
      'spending_anomalies',
      'audit_accessibility',
    ].includes(message.actionResult.action);

  const isArtifact =
    message.actionResult &&
    ['create_artifact', 'update_artifact'].includes(
      message.actionResult.action
    );

  // Memoize parsed JSON so it is only computed once per message content change
  const parsedJson = useMemo(() => {
    if (message.role === 'assistant') {
      return parseAIResponse(message.content);
    }
    return null;
  }, [message.content, message.role]);

  const hasAgentAction = useMemo(() => {
    if (isUser) return false;
    
    // Explicit purpose checks first
    if (message.purpose === 'tool_select') return true;
    if (message.purpose === 'explanation') return false;

    // Legacy/heuristic backup
    const trimmed = message.content.trim();
    const isJsonLike = trimmed.startsWith('{') || trimmed.includes('"agent_action"');
    if (isJsonLike) {
      const action = parsedJson?.agent_action?.action || parsedJson?.action;
      if (action) {
        return action !== 'none';
      }
      const bodyText = parsedJson?.body || parsedJson?.explanation || parsedJson?.agent_action?.explanation;
      if (bodyText && typeof bodyText === 'string') {
        const lower = bodyText.toLowerCase();
        return lower.includes('querying') || lower.includes('calculating') || lower.includes('scanning') || lower.includes('auditing');
      }
      return true; // Default while streaming json
    }
    return false;
  }, [message.purpose, message.content, parsedJson, isUser]);

  const streamedLogMessage = useMemo(() => {
    if (!parsedJson) return null;
    const bodyText = parsedJson.body || parsedJson.explanation || parsedJson.agent_action?.explanation;
    if (bodyText && typeof bodyText === 'string') {
      return bodyText.trim();
    }
    return null;
  }, [parsedJson]);

  const stepsList = useMemo(() => {
    const baseSteps = Array.isArray(message.steps) ? [...message.steps] : [];
    if (hasAgentAction && streamedLogMessage) {
      const trimmedExpl = streamedLogMessage.trim();
      if (trimmedExpl && !baseSteps.some(s => s.toLowerCase().includes(trimmedExpl.toLowerCase()))) {
        const toolCallIdx = baseSteps.findIndex(s => s.startsWith('Tool Call:'));
        if (toolCallIdx !== -1) {
          baseSteps.splice(toolCallIdx, 0, trimmedExpl);
        } else {
          baseSteps.push(trimmedExpl);
        }
      }
    }
    return baseSteps;
  }, [message.steps, hasAgentAction, streamedLogMessage]);

  const hasSteps = !isUser && stepsList.length > 0;

  const hasChoices =
    parsedJson?.gen_ux?.type === 'choices' &&
    Array.isArray(parsedJson.gen_ux.options) &&
    parsedJson.gen_ux.options.length > 0;
    
  const hasSuggestedActions =
    Array.isArray(parsedJson?.suggested_actions) &&
    parsedJson.suggested_actions.length > 0;

  const displayContent = useMemo(() => {
    if (hasAgentAction) {
      return '';
    }
    return renderMessageContent(message);
  }, [message, hasAgentAction]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        gap: 1,
      }}
    >
      {displayContent ? (
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            maxWidth: '85%',
            bgcolor: isUser ? 'primary.main' : (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'grey.100',
            color: isUser ? 'primary.contrastText' : 'text.primary',
            borderRadius: 1,
            width: !isUser && displayContent.includes('|') ? '85%' : 'auto',
          }}
        >
          {isUser ? (
            <Typography
              className="copilot-msg-text"
              variant="body2"
              sx={{ whiteSpace: 'pre-wrap' }}
            >
              {message.content}
            </Typography>
          ) : (
            <SimpleMarkdown content={displayContent} onLinkClick={handleChatMessageLinkClick} />
          )}
        </Paper>
      ) : (!displayContent && message.isStreaming && !isUser && !hasAgentAction) ? (
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            maxWidth: '85%',
            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'grey.100',
            color: 'text.primary',
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '40px',
            minWidth: '60px'
          }}
        >
          <AnimatedLogo scale={0.8} spinSpeed={0.08} />
        </Paper>
      ) : null}

      {hasChoices && (
        <Box
          sx={{
            width: '85%',
            mt: 0.5,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          {parsedJson.gen_ux.options.map((opt: any, idx: number) => {
            const optText =
              typeof opt === 'string'
                ? opt
                : opt &&
                  typeof opt === 'object' &&
                  ('label' in opt || 'text' in opt || 'content' in opt)
                ? opt.label || opt.text || opt.content
                : JSON.stringify(opt);
            return (
              <Button
                key={idx}
                variant="outlined"
                size="small"
                fullWidth
                onClick={() => onSendPromptText(optText)}
                disabled={loading}
                sx={{
                  textTransform: 'none',
                  borderRadius: 1,
                  fontWeight: 600,
                  py: 1,
                  px: 2,
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  fontSize: '12px',
                  borderColor: 'divider',
                  color: 'text.primary',
                  '&:hover': {
                    bgcolor: 'action.hover',
                    borderColor: 'text.secondary',
                  },
                }}
              >
                👉 {optText}
              </Button>
            );
          })}
        </Box>
      )}

      {parsedJson?.gen_ux?.type === 'confirmation' && (
        <GenUXConfirmation
          options={parsedJson.gen_ux.options || []}
          onConfirm={(txt) => onSendPromptText(txt)}
          disabled={loading}
        />
      )}

      {parsedJson?.gen_ux?.type === 'form' &&
        Array.isArray(parsedJson.gen_ux.options) &&
        parsedJson.gen_ux.options.length > 0 && (
          <GenUXForm
            options={parsedJson.gen_ux.options}
            onSubmit={(txt) => onSendPromptText(txt)}
            disabled={loading}
          />
        )}

      {hasSuggestedActions && (
        <Box sx={{ width: '85%', mt: 0.5 }}>
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {parsedJson.suggested_actions.map((act: any, idx: number) => {
              const actText =
                typeof act === 'string'
                  ? act
                  : act &&
                    typeof act === 'object' &&
                    ('label' in act || 'text' in act || 'content' in act)
                  ? act.label || act.text || act.content
                  : JSON.stringify(act);
              return (
                <Chip
                  key={idx}
                  label={actText}
                  size="small"
                  onClick={() => onSendPromptText(actText)}
                  disabled={loading}
                  clickable
                  sx={{
                    fontSize: '11px',
                    fontWeight: 500,
                    height: 24,
                  }}
                />
              );
            })}
          </Stack>
        </Box>
      )}

      {showResult && message.actionResult && (
        <Box sx={{ width: '85%', mt: 0.5 }}>
          <CopilotQueryResult
            action={message.actionResult.action as any}
            categories={message.actionResult.categories || []}
            customStart={message.actionResult.customStart || ''}
            customEnd={message.actionResult.customEnd || ''}
            metrics={message.actionResult.metrics}
            alerts={message.actionResult.alerts}
            anomalies={message.actionResult.anomalies}
            accessibilityReport={message.actionResult.accessibilityReport}
            onApplyFilters={() => onApplyFilters(message.actionResult)}
          />
        </Box>
      )}


      {message.actionResult?.action === 'categorize_transactions' && (
        <ProposedCategorizationReportUX
          message={message}
          onUpdateMessageResult={async (newResult) => {
            await updateMessageResult(message, newResult);
          }}
          disabled={loading}
        />
      )}

      {message.actionResult?.action === 'generate_document' && (
        <Box sx={{ width: '85%', mt: 0.5 }}>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              borderColor: 'divider',
              bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'grey.50',
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ 
                p: 1, 
                borderRadius: 1.5, 
                bgcolor: (theme) => alpha(theme.palette.success.main, 0.1),
                color: 'success.main'
              }}>
                <InsertDriveFileIcon />
              </Box>
              <Box sx={{ overflow: 'hidden' }}>
                <Typography variant="subtitle2" fontWeight="700" noWrap>
                  {message.actionResult.documentName || 'Tax Document'}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  Generated Document
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 1 }}>
              {message.actionResult.content && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<VisibilityIcon />}
                  onClick={() => setOpenPreview(true)}
                  sx={{ textTransform: 'none', borderRadius: 1.5 }}
                >
                  View Content
                </Button>
              )}
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  const blob = new Blob([message.actionResult.content || ''], { type: 'text/markdown' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = message.actionResult.documentName || 'Tax_Document.md';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                sx={{ textTransform: 'none', borderRadius: 1.5 }}
              >
                Download
              </Button>
            </Box>
          </Paper>

          {/* Document Preview Modal inside Chat */}
          <Dialog
            open={openPreview}
            onClose={() => setOpenPreview(false)}
            maxWidth="md"
            fullWidth
            PaperProps={{
              sx: {
                borderRadius: 3,
                p: 1,
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
              }
            }}
          >
            <DialogTitle sx={{ fontWeight: 800, pr: 6, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <InsertDriveFileIcon color="primary" />
              {message.actionResult.documentName}
            </DialogTitle>
            <DialogContent dividers sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
              {message.actionResult.content && (
                <SimpleMarkdown content={message.actionResult.content} onLinkClick={handleChatMessageLinkClick} />
              )}
            </DialogContent>
            <DialogActions sx={{ p: 2, gap: 1 }}>
              <Button variant="contained" size="small" onClick={() => setOpenPreview(false)}>
                Close
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      )}

      {isArtifact && message.actionResult && (
        <Box sx={{ width: '85%', mt: 0.5 }}>
          <Paper
            variant="outlined"
            sx={{
              p: 1.5,
              bgcolor: 'background.paper',
              borderColor: 'divider',
              borderRadius: 1,
            }}
          >
            <Stack spacing={1}>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                }}
              >
                🎨{' '}
                {message.actionResult.action === 'create_artifact'
                  ? 'Artifact Created'
                  : 'Artifact Updated'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
                <strong>Title:</strong> {message.actionResult.title}
              </Typography>
              <Button
                variant="contained"
                size="small"
                onClick={async () => {
                  if (message.actionResult?.id) {
                    const art = await db.artifacts.get(message.actionResult.id);
                    if (art) useChatStore.getState().setActiveArtifact(art);
                  }
                }}
                sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
              >
                Open Artifact
              </Button>
            </Stack>
          </Paper>
        </Box>
      )}

      {/* Skill stages are now embedded directly in the execution log steps */}

      {hasSteps && (
        <Box sx={{ width: '85%', mt: 0.5 }}>


          {/* Collapsible Chip */}
          <Chip
            icon={logsExpanded ? <ExpandLessIcon sx={{ fontSize: '16px !important' }} /> : <ExpandMoreIcon sx={{ fontSize: '16px !important' }} />}
            label={message.isStreaming ? `LLM Progress (${stepsList.length} steps)` : `Execution Log (${stepsList.length} steps)`}
            onClick={() => setIsLogsExpanded(!logsExpanded)}
            variant="outlined"
            size="small"
            clickable
            color={message.isStreaming ? "primary" : "default"}
            sx={{
              fontSize: '11px',
              fontWeight: 600,
              height: 26,
              borderColor: 'divider',
              '& .MuiChip-icon': {
                color: message.isStreaming ? 'primary.main' : 'text.secondary',
              },
              '&:hover': {
                bgcolor: 'action.hover',
              }
            }}
          />

          {/* Collapsible List Container */}
          <Collapse in={logsExpanded} timeout="auto" unmountOnExit>
            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                mt: 1,
                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 'grey.50',
                borderColor: 'divider',
                borderRadius: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                overflowY: 'auto',
                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                height: message.isStreaming ? 320 : 'auto',
                maxHeight: 320,
              }}
            >
              {/* Steps List */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {stepsList.map((step, idx) => {
                  const isToolCall = step.includes('Tool Call:');
                  const isError = step.startsWith('Error:');
                  const isCorrection = step.startsWith('Self-Correction');
                  const isLast = idx === stepsList.length - 1;
                  const isPending = message.isStreaming && isLast;

                  const isSkillStage = step.startsWith('Skill Stage:');

                  let dotColor = 'text.secondary';
                  let textColor: any = 'text.primary';
                  let fontWeight = 400;

                  if (isSkillStage) {
                    dotColor = 'success.main';
                    textColor = (theme: any) => theme.palette.mode === 'dark' ? 'success.light' : 'success.dark';
                    fontWeight = 600;
                  } else if (isToolCall) {
                    dotColor = 'info.main';
                    textColor = (theme: any) => theme.palette.mode === 'dark' ? 'info.light' : 'info.dark';
                    fontWeight = 500;
                  } else if (isError) {
                    dotColor = 'error.main';
                    textColor = 'error.main';
                  } else if (isCorrection) {
                    dotColor = 'warning.main';
                    textColor = (theme: any) => theme.palette.mode === 'dark' ? 'warning.light' : 'warning.dark';
                  } else if (isLast && !message.isStreaming) {
                    dotColor = 'success.main';
                  }

                  return (
                    <Box
                      key={idx}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        fontSize: '11px',
                        color: textColor,
                        fontWeight: fontWeight,
                        overflow: 'hidden',
                        animation: (message.isStreaming && isLast) ? 'slideDownAndFade 300ms ease-out forwards' : 'none',
                        '@keyframes slideDownAndFade': {
                          '0%': {
                            opacity: 0,
                            maxHeight: 0,
                            transform: 'translateY(-4px)'
                          },
                          '100%': {
                            opacity: 1,
                            maxHeight: '60px',
                            transform: 'translateY(0)'
                          }
                        }
                      }}
                    >
                      {/* Step Indicator */}
                      {isSkillStage ? (
                        <Box sx={{ color: 'success.main', fontWeight: 900, flexShrink: 0, fontSize: '11px', lineHeight: 1 }}>✓</Box>
                      ) : isPending ? (
                        <AnimatedLogo scale={0.9} spinSpeed={0.04} />
                      ) : (
                        <Box
                          sx={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            bgcolor: dotColor,
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: 1.2 }}>
                        {step}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>

              {/* Token Usage Block */}
              {message.tokenUsage && (
                <Box
                  sx={{
                    mt: 0.5,
                    pt: 1,
                    borderTop: '1px dashed',
                    borderColor: 'divider',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 1.5,
                  }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '10px', fontWeight: 600 }}>
                    Token Usage:
                  </Typography>
                  <Chip
                    label={`Prompt: ${message.tokenUsage.prompt}`}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '9px', height: 18, fontFamily: 'monospace', color: 'text.secondary' }}
                  />
                  <Chip
                    label={`Response: ${message.tokenUsage.completion}`}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '9px', height: 18, fontFamily: 'monospace', color: 'text.secondary' }}
                  />
                  <Chip
                    label={`Total: ${message.tokenUsage.total}`}
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ fontSize: '9px', height: 18, fontFamily: 'monospace', fontWeight: 600 }}
                  />
                </Box>
              )}

              {/* Raw Tool Call Inspection inside collapsed area if exists */}
              {message.actionResult && (
                <Box sx={{ mt: 0.5, pt: 0.5, borderTop: '1px dashed', borderColor: 'divider' }}>
                  <Box
                    onClick={() => setShowInspector(!showInspector)}
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                      cursor: 'pointer',
                      userSelect: 'none',
                      opacity: 0.7,
                      '&:hover': { opacity: 1 },
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontFamily: 'monospace', fontSize: '10px' }}>
                      {showInspector ? '▼ Hide Parameters' : '▶ Show Parameters'} (<code>{message.actionResult.action}</code>)
                    </Typography>
                  </Box>
                  {showInspector && (
                    <Box
                      component="pre"
                      sx={{
                        m: 0,
                        mt: 0.5,
                        p: 1,
                        bgcolor: 'background.paper',
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                        fontSize: '9px',
                        fontFamily: 'monospace',
                        color: 'text.secondary',
                        overflowX: 'auto',
                      }}
                    >
                      {JSON.stringify(
                        {
                          action: message.actionResult.action,
                          categories: message.actionResult.categories,
                          accounts: message.actionResult.accounts,
                          search: message.actionResult.search,
                          minPrice: message.actionResult.minPrice,
                          maxPrice: message.actionResult.maxPrice,
                          preset: message.actionResult.preset,
                          customStart: message.actionResult.customStart,
                          customEnd: message.actionResult.customEnd,
                          accessibilityAuditScore: message.actionResult.accessibilityReport?.score,
                        },
                        (_key, val) => val === undefined || val === null ? undefined : val,
                        2
                      )}
                    </Box>
                  )}
                </Box>
              )}
            </Paper>
          </Collapse>
        </Box>
      )}

      {!hasSteps && message.actionResult && (
        <Box sx={{ width: '85%', mt: 0.5 }}>
          <Box
            onClick={() => setShowInspector(!showInspector)}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              cursor: 'pointer',
              userSelect: 'none',
              opacity: 0.7,
              '&:hover': { opacity: 1 },
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontFamily: 'monospace' }}>
              {showInspector ? '▼ Hide Tool Call' : '▶ Show Tool Call'} (<code>{message.actionResult.action}</code>)
            </Typography>
          </Box>
          {showInspector && (
            <Paper
              variant="outlined"
              sx={{
                p: 1,
                mt: 0.5,
                bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 'grey.50',
                borderColor: 'divider',
                borderRadius: 1,
                overflowX: 'auto',
              }}
            >
              <Box component="pre" sx={{ m: 0, fontSize: '10px', fontFamily: 'monospace', color: 'text.secondary' }}>
                {JSON.stringify(
                  {
                    action: message.actionResult.action,
                    categories: message.actionResult.categories,
                    accounts: message.actionResult.accounts,
                    search: message.actionResult.search,
                    minPrice: message.actionResult.minPrice,
                    maxPrice: message.actionResult.maxPrice,
                    preset: message.actionResult.preset,
                    customStart: message.actionResult.customStart,
                    customEnd: message.actionResult.customEnd,
                    accessibilityAuditScore: message.actionResult.accessibilityReport?.score,
                  },
                  (_key, val) => val === undefined || val === null ? undefined : val,
                  2
                )}
              </Box>
            </Paper>
          )}
        </Box>
      )}
    </Box>
  );
});
