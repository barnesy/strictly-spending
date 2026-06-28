import { api } from '../../api';
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  Chip,
  Collapse,
  CircularProgress,
} from '@mui/material';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckIcon from '@mui/icons-material/Check';

import {
  type ChatMessage,
  parseAIResponse,
  getMessageDisplayContent,
  extractFieldUsingRegex,
  forceBoldAndTwoDecimals,
} from '../../ai';

import { useChatStore } from '../../chatStore';
import SimpleMarkdown from '../SimpleMarkdown';
import CopilotQueryResult from '../CopilotQueryResult';
import { GenUXConfirmation, GenUXForm, ProposedCategorizationReportUX } from './GenUXComponents';

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
    const trimmed = m.content.trim();
    const isJsonLike = trimmed.startsWith('{') || trimmed.includes('```json') || trimmed.includes('"body"') || trimmed.includes('"agent_action"');
    
    if (isJsonLike) {
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
        content = 'I processed your request, but encountered a formatting issue while rendering the response.';
      }
    } else {
      content = m.content;
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
  const autoExpandLogs = !!message.thinking || !!message.content.match(/<(?:thinking|\|channel>thought|\|think\|>)/) || !message.content;
  const shouldExpand = isLogsExpanded !== null ? isLogsExpanded : autoExpandLogs;

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
        const dbMsgs = await api.getMessages();
        const threadMsgs = dbMsgs.filter((m) => m.threadId === threadId);
        const dbMsg = threadMsgs.find(m => m.role === targetMsg.role && m.content === targetMsg.content);
        if (dbMsg && dbMsg.id) {
          await api.putMessage({ ...dbMsg, actionResult: newResult });
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
  const hasAgentAction = useMemo(() => {
    if (isUser) return false;
    if (message.purpose === 'tool_select') return true;
    if (message.purpose === 'explanation') return false;
    // For native tool calls without explicit purpose tracking yet
    if (message.tool_calls && message.tool_calls.length > 0) return true;
    if (message.actionResult) return true;
    if (Array.isArray(message.steps) && message.steps.length > 0) return true;
    return false;
  }, [message.purpose, message.tool_calls, message.actionResult, message.steps, isUser]);

  const stepsList = useMemo(() => {
    return Array.isArray(message.steps) ? [...message.steps] : [];
  }, [message.steps]);

  const hasSteps = !isUser && stepsList.length > 0;

  const hasChoices = message.actionResult?.action === 'request_user_choice' && Array.isArray(message.actionResult?.options);
  const isConfirmation = message.actionResult?.action === 'request_user_confirmation';
  const hasForm = message.actionResult?.action === 'request_user_form' && Array.isArray(message.actionResult?.options);
    
  const hasSuggestedActions = false; // Deprecated with native tool calls

  const { displayContent, thinkingContent } = useMemo(() => {
    let content = message.content || '';
    let thinking = message.thinking || '';
    
    // Extract <thinking> or <|channel>thought or <|think|> block, or just 'thought' at the very beginning of the response
    // if native thinking is not provided (for backwards compatibility with legacy chat history)
    if (!thinking) {
      const thinkingMatch = content.match(/^(?:<(?:thinking|\|channel>thought|\|think\|>)(?:>)?|thought[\r\n]+)([\s\S]*?)(?:<\/(?:thinking|\|?think\|?>)|<channel\|>|$)/);
      if (thinkingMatch) {
        thinking = thinkingMatch[1].trim();
        content = content.replace(/^(?:<(?:thinking|\|channel>thought|\|think\|>)(?:>)?|thought[\r\n]+)[\s\S]*?(?:<\/(?:thinking|\|?think\|?>)|<channel\|>|$)/, '').trim();
      }
    }
    
    // Strip leading markdown blockquotes or dots that might be leftover from LLM artifacts
    content = content.replace(/^[\s>.]+/, '');

    if (hasAgentAction) {
      if (content.length > 50) {
        return { displayContent: content, thinkingContent: thinking };
      }
      return { displayContent: '', thinkingContent: thinking };
    }
    return { displayContent: content, thinkingContent: thinking };
  }, [message.content, message.thinking, hasAgentAction]);

  let logLabel = "Thought process";
  if (message.isStreaming && thinkingContent) {
    logLabel = "Thinking...";
  } else if (message.isStreaming && !displayContent) {
    logLabel = "Processing...";
  } else if (hasSteps && !thinkingContent) {
    logLabel = "Executed tools";
  } else if (hasSteps && thinkingContent) {
    logLabel = "Analyzed and queried data";
  } else if (thinkingContent) {
    logLabel = "Analyzed request";
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        gap: 1,
      }}
    >
      {/* Skill stages are now embedded directly in the execution log steps */}

      {(hasSteps || thinkingContent) && (
        <Box sx={{ width: '85%', mb: 0.5 }}>
          {/* Subtle Log Toggle */}
          <Box
            onClick={() => setIsLogsExpanded(!shouldExpand)}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              cursor: 'pointer',
              userSelect: 'none',
              color: 'text.secondary',
              opacity: 0.8,
              transition: 'opacity 0.2s',
              '&:hover': { opacity: 1 },
              mb: 1
            }}
          >
            <ExpandMoreIcon 
              sx={{ 
                fontSize: '18px', 
                transform: shouldExpand ? 'none' : 'rotate(-90deg)',
                transition: 'transform 0.2s'
              }} 
            />
            <Typography variant="body2" sx={{ fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {logLabel}
              {message.isStreaming && !displayContent && (
                <Box
                  component="span"
                  sx={{
                    display: 'inline-block',
                    width: '6px',
                    height: '6px',
                    bgcolor: 'text.secondary',
                    borderRadius: '50%',
                    animation: 'pulse 1.5s infinite ease-in-out',
                    '@keyframes pulse': {
                      '0%, 100%': { opacity: 0.3, transform: 'scale(0.8)' },
                      '50%': { opacity: 1, transform: 'scale(1.2)' },
                    }
                  }}
                />
              )}
            </Typography>
            {!message.isStreaming && <CheckIcon sx={{ fontSize: '14px' }} />}
          </Box>

          {/* Collapsible List Container */}
          <Collapse in={shouldExpand} timeout="auto" unmountOnExit>
            <Box
              sx={{
                pl: 1.5,
                mb: 1.5,
                borderLeft: '2px solid',
                borderColor: 'divider',
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
                overflowY: 'auto',
                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                maxHeight: 400,
              }}
            >
              {thinkingContent && (
                <Box sx={{ color: 'text.secondary', '& p': { m: 0, mb: 1, fontStyle: 'italic' }, fontSize: '13px', lineHeight: 1.6 }}>
                  <SimpleMarkdown content={thinkingContent} />
                </Box>
              )}

              {/* Steps List */}
              {hasSteps && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: thinkingContent ? 1 : 0 }}>
                  {stepsList.map((stepRaw, idx) => {
                    const isObj = typeof stepRaw === 'object' && stepRaw !== null;
                    const stepText = isObj ? stepRaw.text : stepRaw;
                    const isToolCall = isObj ? stepRaw.type === 'tool_execution' : (stepText.includes('Executing action:') || stepText.includes('Tool Call:'));
                    const isError = isObj ? stepRaw.type === 'error' : stepText.startsWith('Error:');
                    const isLast = idx === stepsList.length - 1;
                    const isPending = message.isStreaming && isLast && !displayContent;

                    let dotColor = 'text.secondary';
                    let textColor: any = 'text.secondary';
                    let fontWeight = 400;

                    if (isToolCall) {
                      dotColor = 'info.main';
                      textColor = (theme: any) => theme.palette.mode === 'dark' ? 'info.light' : 'info.dark';
                      fontWeight = 600;
                    } else if (isError) {
                      dotColor = 'error.main';
                      textColor = 'error.main';
                    }

                    return (
                      <Box
                        key={idx}
                        sx={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 1.5,
                          fontSize: '12px',
                          color: textColor,
                          fontWeight: fontWeight,
                          opacity: (isPending && !isToolCall) ? 0.7 : 1,
                          animation: (message.isStreaming && isLast) ? 'slideDownAndFade 300ms ease-out forwards' : 'none',
                          '@keyframes slideDownAndFade': {
                            '0%': { opacity: 0, transform: 'translateY(-4px)' },
                            '100%': { opacity: 1, transform: 'translateY(0)' }
                          }
                        }}
                      >
                          <Box
                            sx={{
                              width: 6,
                              height: 6,
                              mt: 0.75,
                              borderRadius: '50%',
                              bgcolor: dotColor,
                              flexShrink: 0,
                            }}
                          />
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: 1.5 }}>
                          {stepText}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              )}

              {/* Token Usage Block */}
              {message.tokenUsage && (
                <Box
                  sx={{
                    mt: 1,
                    pt: 1.5,
                    borderTop: '1px dashed',
                    borderColor: 'divider',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 1.5,
                  }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '10px', fontWeight: 600 }}>
                    Tokens:
                  </Typography>
                  <Chip
                    label={`P: ${message.tokenUsage.prompt}`}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '10px', height: 20, fontFamily: 'monospace', color: 'text.secondary' }}
                  />
                  <Chip
                    label={`C: ${message.tokenUsage.completion}`}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '10px', height: 20, fontFamily: 'monospace', color: 'text.secondary' }}
                  />
                  <Chip
                    label={`T: ${message.tokenUsage.total}`}
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ fontSize: '10px', height: 20, fontFamily: 'monospace', fontWeight: 600 }}
                  />
                </Box>
              )}

              {/* Raw Tool Call Inspection inside collapsed area if exists */}
              {message.actionResult && (
                <Box sx={{ mt: 0.5, pt: 1, borderTop: '1px dashed', borderColor: 'divider' }}>
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
                        p: 1.5,
                        bgcolor: 'background.paper',
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                        fontSize: '10px',
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
                        },
                        (_key, val) => val === undefined || val === null ? undefined : val,
                        2
                      )}
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          </Collapse>
        </Box>
      )}

      {displayContent ? (
        <Paper
          elevation={0}
          sx={{
            p: isUser ? 1.5 : 2,
            maxWidth: '90%',
            bgcolor: isUser ? 'primary.main' : 'background.paper',
            border: isUser ? 'none' : '1px solid',
            borderColor: 'divider',
            color: isUser ? 'primary.contrastText' : 'text.primary',
            borderRadius: 2,
            width: !isUser && displayContent.includes('|') ? '90%' : 'auto',
          }}
        >
          {isUser ? (
            <Typography
              className="copilot-msg-text"
              variant="body1"
              sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}
            >
              {message.content}
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary', textTransform: 'uppercase', fontSize: '11px', letterSpacing: 0.5 }}>
                  {message.purpose && message.purpose !== 'tool_select' ? message.purpose : 'Response'}
                </Typography>
              </Box>
              <Box sx={{ overflowX: 'auto', '& p': { mt: 0 } }}>
                <SimpleMarkdown content={displayContent} onLinkClick={handleChatMessageLinkClick} />
              </Box>
              {message.isStreaming && (
                 <Box sx={{ pl: 1, pr: 1, mt: 1, mb: 1, display: 'flex', alignItems: 'center' }}>
                   <CircularProgress size={16} thickness={5} sx={{ color: 'primary.main' }} />
                 </Box>
              )}
            </Box>
          )}
        </Paper>
      ) : (!displayContent && message.isStreaming && !isUser && !hasAgentAction && !hasSteps && !thinkingContent) ? (
        <Box
          sx={{
            p: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            minHeight: '40px',
          }}
        >
          <CircularProgress size={18} thickness={5} sx={{ color: 'primary.main' }} />
        </Box>
      ) : null}

      {message.isAborted && (
        <Paper elevation={0} sx={{ p: 1, pl: 1.5, pr: 1.5, mt: 0.5, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(237, 108, 2, 0.2)' : '#fff3e0', color: 'warning.main', display: 'flex', alignItems: 'center', gap: 1, borderRadius: 2, maxWidth: '90%' }}>
          <Typography variant="caption" sx={{ fontWeight: 600 }}>Generation interrupted.</Typography>
          <Button size="small" color="warning" onClick={() => onSendPromptText("Continue from where you left off")} sx={{ ml: 'auto', textTransform: 'none', py: 0, minHeight: 0 }}>Continue</Button>
        </Paper>
      )}

      {message.error && (
        <Paper elevation={0} sx={{ p: 1, pl: 1.5, pr: 1.5, mt: 0.5, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(211, 47, 47, 0.2)' : '#ffebee', color: 'error.main', display: 'flex', alignItems: 'center', gap: 1, borderRadius: 2, maxWidth: '90%' }}>
          <Typography variant="caption" sx={{ fontWeight: 600 }}>Error: {message.error}</Typography>
          <Button size="small" color="error" onClick={() => onSendPromptText("Retry")} sx={{ ml: 'auto', textTransform: 'none', py: 0, minHeight: 0 }}>Retry</Button>
        </Paper>
      )}

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
          {message.actionResult.options.map((opt: any, idx: number) => {
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

      {isConfirmation && (
        <GenUXConfirmation
          options={message.actionResult.options || []}
          onConfirm={(txt) => onSendPromptText(txt)}
          disabled={loading}
        />
      )}

      {hasForm && (
          <GenUXForm
            options={message.actionResult.options}
            onSubmit={(txt) => onSendPromptText(txt)}
            disabled={loading}
          />
      )}

      {hasSuggestedActions && (
        <Box sx={{ width: '85%', mt: 0.5 }}>
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
                  const targetId = message.actionResult?.artifactId || message.actionResult?.id;
                  if (targetId) {
                    const artifacts = await api.getArtifacts();
                    const art = artifacts.find((a) => a.id === targetId);
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
                bgcolor: 'background.default',
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
