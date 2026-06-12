import { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  TextField,
  Stack,
  Paper,
  CircularProgress,
  LinearProgress,
  Button,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DeleteIcon from '@mui/icons-material/Delete';
import { useNavigate, useLocation } from 'react-router-dom';
import { useFilters, type DateRangePreset } from '../store';
import { useChatStore } from '../chatStore';
import { localAI, type ChatMessage } from '../ai';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';

interface CopilotChatProps {
  onClose?: () => void;
  showCloseButton?: boolean;
  isEmbedded?: boolean;
}

export default function CopilotChat({
  onClose,
  showCloseButton = false,
  isEmbedded = false,
}: CopilotChatProps) {
  const {
    preset,
    setPreset,
    searchQuery,
    setSearchQuery,
    disabledCategories,
    setDisabledCategories,
    enabledAccountIds,
    setEnabledAccounts,
  } = useFilters();

  const {
    messages,
    addMessage,
    clearMessages,
    aiLoaded,
    aiStatus,
    aiProgress,
    aiProgressPercent,
    initializeAI,
    checkAIStatus,
  } = useChatStore();

  useEffect(() => {
    checkAIStatus();
  }, [checkAIStatus]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();
  const location = useLocation();

  const categories = useLiveQuery(() => db.categories.toArray(), []) || [];
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) || [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, aiStatus]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    addMessage(userMsg);
    setInput('');
    setLoading(true);

    try {
      if (!localAI.isLoaded) {
        addMessage({
          role: 'assistant',
          content: 'Please initialize the Local AI first!',
        });
        return;
      }

      const stateContext = `Current Page: ${location.pathname}
Current Filter Preset: ${preset}
Current Search Query: "${searchQuery}"
Available Categories: ${categories.map((c) => c.name).join(', ')}
Available Accounts: ${accounts.map((a) => a.name).join(', ')}
Currently Disabled Categories: ${disabledCategories.join(', ')}
Currently Enabled Accounts: ${enabledAccountIds.join(', ')}`;

      const responseText = await localAI.chatCopilot(
        [...messages, userMsg],
        stateContext
      );

      // Attempt to parse JSON command
      try {
        let jsonStr = responseText.trim();
        const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) {
          jsonStr = match[1].trim();
        } else {
          const start = jsonStr.indexOf('{');
          const end = jsonStr.lastIndexOf('}');
          if (start >= 0 && end >= 0) {
            jsonStr = jsonStr.slice(start, end + 1);
          }
        }

        const cmd = JSON.parse(jsonStr);
        if (
          cmd.action === 'navigate' ||
          cmd.action === 'search' ||
          cmd.action === 'filter'
        ) {
          if (cmd.page && cmd.page !== location.pathname) navigate(cmd.page);
          if (cmd.preset) setPreset(cmd.preset as DateRangePreset);

          // If merchant search is specified, reset checkboxes to show everything by default.
          if (
            (cmd.search !== undefined && cmd.search !== null && cmd.search !== '') ||
            (cmd.query !== undefined && cmd.query !== null && cmd.query !== '')
          ) {
            if (!cmd.categories) {
              setDisabledCategories([]);
            }
            if (!cmd.accounts) {
              setEnabledAccounts(accounts.map((a) => a.id!));
            }
          }

          // Apply merchant search query if specified, otherwise clear it if category/account/preset filters are active.
          if (cmd.search !== undefined) {
            setSearchQuery(cmd.search || '');
          } else if (cmd.query !== undefined) {
            setSearchQuery(cmd.query || '');
          } else if (cmd.categories || cmd.accounts || cmd.preset) {
            setSearchQuery('');
          }

          if (cmd.categories && Array.isArray(cmd.categories)) {
            // Fuzzy match category names
            const desiredNames = new Set<string>();
            for (const requested of cmd.categories) {
              const reqLower = requested.toLowerCase().trim();
              const matchedCat = categories.find((c) => {
                const cLower = c.name.toLowerCase();
                return (
                  cLower === reqLower ||
                  cLower.includes(reqLower) ||
                  reqLower.includes(cLower)
                );
              });
              if (matchedCat) {
                desiredNames.add(matchedCat.name);
              }
            }

            // Disable any categories NOT in the matched list
            const toDisable = categories
              .filter((c) => !desiredNames.has(c.name))
              .map((c) => c.name);
            setDisabledCategories(toDisable);
          }

          if (cmd.accounts && Array.isArray(cmd.accounts)) {
            // Fuzzy match accounts (name or id)
            const desiredAccountIds = new Set<number>();
            for (const requested of cmd.accounts) {
              const reqLower = String(requested).toLowerCase().trim();
              const matchedAcct = accounts.find((a) => {
                const aNameLower = a.name.toLowerCase();
                const aIdStr = String(a.id);
                return (
                  aNameLower === reqLower ||
                  aNameLower.includes(reqLower) ||
                  reqLower.includes(aNameLower) ||
                  aIdStr === reqLower
                );
              });
              if (matchedAcct && matchedAcct.id !== undefined) {
                desiredAccountIds.add(matchedAcct.id);
              }
            }
            setEnabledAccounts(Array.from(desiredAccountIds));
          }

          const assistantText =
            cmd.explanation ||
            `*(Action: Applied filters. Preset: ${
              cmd.preset || preset
            }, Categories: ${cmd.categories?.join(', ') || 'unchanged'})*`;

          addMessage({ role: 'assistant', content: assistantText });
        } else {
          addMessage({ role: 'assistant', content: responseText });
        }
      } catch (e) {
        // Not a JSON command, just regular text
        addMessage({ role: 'assistant', content: responseText });
      }
    } catch (err: any) {
      addMessage({
        role: 'assistant',
        content: `Error: ${err.message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      className="copilot-chat-container"
      sx={{
        width: isEmbedded ? '100%' : { xs: '100vw', sm: 400 },
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderLeft: isEmbedded ? '1px solid' : 'none',
        borderColor: 'divider',
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ p: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <AutoAwesomeIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>Strictly Copilot</Typography>
        </Stack>
        <Stack direction="row" spacing={0.5}>
          {aiLoaded && (
            <IconButton onClick={clearMessages} title="Clear conversation history">
              <DeleteIcon />
            </IconButton>
          )}
          {showCloseButton && onClose && (
            <IconButton onClick={onClose} title="Close copilot panel">
              <CloseIcon />
            </IconButton>
          )}
        </Stack>
      </Stack>

      {/* Main Body */}
      {!aiLoaded ? (
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 4,
            textAlign: 'center',
            gap: 3,
            overflowY: 'auto',
          }}
        >
          <AutoAwesomeIcon sx={{ fontSize: 48, color: 'primary.main' }} />
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              Strictly Copilot Setup
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Unlock private, offline AI commands to filter, search, and navigate your spending. Runs 100% locally via the lightweight Ollama service.
            </Typography>
            {aiProgress && (
              <Typography variant="caption" color={aiStatus === 'error' ? 'error' : 'text.secondary'} sx={{ display: 'block', mt: 1, fontWeight: 500 }}>
                {aiProgress}
              </Typography>
            )}
          </Box>

          {aiStatus === 'checking' && (
            <CircularProgress size={32} />
          )}

          {aiStatus === 'pulling' && (
            <Box sx={{ width: '100%', mt: 1 }}>
              <LinearProgress variant="determinate" value={aiProgressPercent} sx={{ mb: 1.5, borderRadius: 1, height: 6 }} />
            </Box>
          )}

          {(aiStatus === 'uninstalled' || aiStatus === 'stopped' || aiStatus === 'running' || aiStatus === 'error') && (
            <Box>
              <Button variant="contained" onClick={initializeAI} startIcon={<AutoAwesomeIcon />}>
                {aiStatus === 'uninstalled' ? 'Install Local AI' :
                 aiStatus === 'stopped' ? 'Start Ollama' :
                 aiStatus === 'running' ? 'Download AI Model' :
                 'Retry Setup'}
              </Button>
            </Box>
          )}
        </Box>
      ) : (
        <>
          {/* Chat Stream */}
          <Box
            ref={scrollRef}
            sx={{
              flex: 1,
              overflowY: 'auto',
              p: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {messages.length === 0 && (
              <Box sx={{ textAlign: 'center', mt: 4, color: 'text.secondary' }}>
                <Typography variant="body2">
                  Ask me to filter your spending, navigate to a different view, or search for a specific transaction!
                </Typography>
              </Box>
            )}
            {messages.map((m, i) => (
              <Box
                key={i}
                sx={{
                  display: 'flex',
                  justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <Paper
                  elevation={0}
                  sx={{
                    p: 1.5,
                    maxWidth: '85%',
                    bgcolor: m.role === 'user' ? 'primary.main' : 'grey.100',
                    color: m.role === 'user' ? 'primary.contrastText' : 'text.primary',
                    borderRadius: 2,
                  }}
                >
                  <Typography className="copilot-msg-text" variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {m.content}
                  </Typography>
                </Paper>
              </Box>
            ))}
            {loading && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                <Paper elevation={0} sx={{ p: 1.5, bgcolor: 'grey.100', borderRadius: 2 }}>
                  <CircularProgress size={20} />
                </Paper>
              </Box>
            )}
          </Box>

          {/* Text Input */}
          <Box
            sx={{
              p: 2,
              borderTop: 1,
              borderColor: 'divider',
              bgcolor: 'background.default',
              flexShrink: 0,
            }}
          >
            <Stack direction="row" spacing={1}>
              <TextField
                fullWidth
                size="small"
                placeholder="E.g. Show me food spending..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend();
                }}
                disabled={loading}
              />
              <IconButton
                color="primary"
                onClick={handleSend}
                disabled={!input.trim() || loading}
              >
                <SendIcon />
              </IconButton>
            </Stack>
          </Box>
        </>
      )}
    </Box>
  );
}
