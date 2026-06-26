import { db } from "../db/drizzle";
import * as schema from "../db/schema";
import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  TextField,
  Stack,
  CircularProgress,
  LinearProgress,
  Button,
  Alert,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DeleteIcon from '@mui/icons-material/Delete';
import BugReportIcon from '@mui/icons-material/BugReport';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useNavigate, useLocation } from 'react-router-dom';
import { useFilters } from '../store';
import { useChatStore, formatModelName } from '../chatStore';
import { useShallow } from 'zustand/react/shallow';
import { parseAIResponse } from '../ai';
import { useCategories, useAccounts } from '../hooks/queries';

import { executeCopilotCommand } from '../copilotMatcher';
import { useCopilotActionHandler } from './CopilotChat/useCopilotActionHandler';
import { ChatInput } from './CopilotChat/ChatInput';
import { ChatMessageItem } from './CopilotChat/ChatMessageItem';
import { DebugPromptModal } from './CopilotChat/DebugPromptModal';
import { CONTROL_HEIGHT } from '../theme';
import AnimatedLogo from './AnimatedLogo';


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
    messages,
    clearMessages,
    aiLoaded,
    aiStatus,
    aiProgress,
    aiProgressPercent,
    initializeAI,
    checkAIStatus,
    modelName,
    activeThreadId,
    threads,
    setActiveThreadId,
    loadThreads,
    createThread,
    deleteThread,
    directLlmMode,
    setDirectLlmMode,
  } = useChatStore(useShallow((s) => ({
    messages: s.messages,
    clearMessages: s.clearMessages,
    aiLoaded: s.aiLoaded,
    aiStatus: s.aiStatus,
    aiProgress: s.aiProgress,
    aiProgressPercent: s.aiProgressPercent,
    initializeAI: s.initializeAI,
    checkAIStatus: s.checkAIStatus,
    modelName: s.modelName,
    activeThreadId: s.activeThreadId,
    threads: s.threads,
    setActiveThreadId: s.setActiveThreadId,
    loadThreads: s.loadThreads,
    createThread: s.createThread,
    deleteThread: s.deleteThread,
    directLlmMode: s.directLlmMode,
    setDirectLlmMode: s.setDirectLlmMode,
  })));

  useEffect(() => {
    checkAIStatus();
    loadThreads();
  }, [checkAIStatus, loadThreads]);

  useEffect(() => {
    if (threads.length > 0 && !activeThreadId) {
      setActiveThreadId(threads[0].id);
    } else if (threads.length === 0 && activeThreadId === null) {
      createThread();
    }
  }, [threads, activeThreadId, setActiveThreadId, createThread]);

  const scrollRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();
  const location = useLocation();

  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();

  const [debugModalOpen, setDebugModalOpen] = useState(false);

  const { sendPromptText, stopPromptExecution, loading } = useCopilotActionHandler();

  useEffect(() => {
    const handleRunAiCategorization = () => {
      if (!loading) {
        sendPromptText("Please auto-categorize all uncategorized items");
      }
    };
    const handleRunPrompt = (e: Event) => {
      const customEvent = e as CustomEvent<{ prompt: string }>;
      if (!loading && customEvent.detail?.prompt) {
        sendPromptText(customEvent.detail.prompt);
      }
    };
    window.addEventListener('app:run-ai-categorization', handleRunAiCategorization);
    window.addEventListener('app:run-prompt', handleRunPrompt as EventListener);
    return () => {
      window.removeEventListener('app:run-ai-categorization', handleRunAiCategorization);
      window.removeEventListener('app:run-prompt', handleRunPrompt as EventListener);
    };
  }, [sendPromptText, loading]);

  const visibleMessages = useMemo(() => {
    return messages.filter((m) => {
      if (m.role === 'system') return false;
      if (m.role === 'assistant') {
        const parsed = parseAIResponse(m.content);
        const action = parsed?.agent_action?.action || parsed?.action;
        if (
          action &&
          action !== 'none' &&
          action !== 'filter' &&
          action !== 'navigate' &&
          !m.actionResult &&
          !m.isStreaming
        ) {
          return false;
        }
      }
      return true;
    });
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleMessages, loading, aiStatus]);

  const handleApplyFilters = async (actionResult: any) => {
    if (!actionResult) return;
    const filterState = useFilters.getState();
    await executeCopilotCommand({
      action: 'filter',
      categories: actionResult.categories || ['all'],
      accounts: actionResult.accounts || ['all'],
      preset: actionResult.preset || 'current',
      search: actionResult.search || '',
      customStart: actionResult.customStart,
      customEnd: actionResult.customEnd,
      minPrice: actionResult.minPrice,
      maxPrice: actionResult.maxPrice
    }, {
      categories,
      accounts,
      currentPath: location.pathname,
      navigate,
      setPreset: filterState.setPreset,
      setCustomRange: filterState.setCustomRange,
      setDisabledCategories: filterState.setDisabledCategories,
      setEnabledAccounts: filterState.setEnabledAccounts,
      setSearchQuery: filterState.setSearchQuery,
      setMinPrice: filterState.setMinPrice,
      setMaxPrice: filterState.setMaxPrice
    });
  };

  const sendPromptTextRef = useRef(sendPromptText);
  useEffect(() => { sendPromptTextRef.current = sendPromptText; }, [sendPromptText]);
  const stableSendPromptText = useCallback((text: string) => {
    sendPromptTextRef.current(text);
  }, []);

  const handleApplyFiltersRef = useRef(handleApplyFilters);
  useEffect(() => { handleApplyFiltersRef.current = handleApplyFilters; }, [handleApplyFilters]);
  const stableHandleApplyFilters = useCallback((actionResult: any) => {
    return handleApplyFiltersRef.current(actionResult);
  }, []);


  return (
    <Box
      className="copilot-chat-container"
      sx={{
        width: isEmbedded ? '100%' : { xs: '100vw', sm: 400 },
        minWidth: isEmbedded ? 350 : undefined,
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
        sx={{ px: 2, height: 64, borderBottom: 0, flexShrink: 0, bgcolor: 'background.default' }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box component="span" sx={{ fontWeight: 900, textShadow: '0 0 0.5px currentColor', color: 'primary.main', fontSize: '0.9rem' }}>
            AI
          </Box>
          {aiLoaded && (
            <Button
              variant={directLlmMode ? "contained" : "outlined"}
              color={directLlmMode ? "info" : "primary"}
              size="small"
              onClick={() => setDirectLlmMode(!directLlmMode)}
              sx={{
                fontSize: '0.72rem',
                py: 0.25,
                px: 1,
                borderRadius: 2,
                textTransform: 'none',
                height: 22,
                fontWeight: 700,
                boxShadow: 'none',
                '&:hover': {
                  boxShadow: 'none'
                }
              }}
            >
              {directLlmMode ? "Direct LLM" : "Copilot"}
            </Button>
          )}
        </Stack>
        <Stack direction="row" spacing={0.5}>
          <IconButton onClick={() => setDebugModalOpen(true)} title="View System Context">
            <BugReportIcon fontSize="small" />
          </IconButton>
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

      {/* Thread Session Selection & Management */}
      {aiLoaded && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            px: 2,
            py: 1,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'background.default',
            flexShrink: 0,
          }}
        >
          <TextField
            select
            size="small"
            value={activeThreadId || ''}
            onChange={(e) => setActiveThreadId(e.target.value)}
            slotProps={{
              select: {
                native: true,
              }
            }}
            sx={{ flex: 1, mr: 1 }}
          >
            {threads.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </TextField>
          <Stack direction="row" spacing={0.5}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => createThread()}
              sx={{ minWidth: CONTROL_HEIGHT, width: CONTROL_HEIGHT, p: 0 }}
              title="Start a new chat thread"
            >
              +
            </Button>
            {activeThreadId && (
              <IconButton
                size="small"
                onClick={() => {
                  if (activeThreadId) {
                    deleteThread(activeThreadId);
                  }
                }}
                disabled={threads.length <= 1}
                title="Delete current thread"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            )}
          </Stack>
        </Stack>
      )}

      <ThreadFiltersBanner />
      <DirectLlmModeBanner />

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

          {aiStatus === 'safemode' && (
            <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <Alert severity="warning" sx={{ textAlign: 'left', width: '100%' }}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                  Safe Mode Active
                </Typography>
                Automatic Ollama pings and background process launches are disabled on startup to prevent Windows crash loops. GPU acceleration is also turned off.
              </Alert>
              <Button 
                variant="outlined" 
                onClick={() => checkAIStatus(true)} 
                startIcon={<RefreshIcon />}
                size="small"
              >
                Run Diagnostic Check
              </Button>
            </Box>
          )}

          {(aiStatus === 'uninstalled' || aiStatus === 'stopped' || aiStatus === 'running' || aiStatus === 'error') && (
            <Box>
              <Button variant="contained" onClick={initializeAI} startIcon={<AutoAwesomeIcon />}>
                {aiStatus === 'uninstalled' ? 'Install Local AI' :
                 aiStatus === 'stopped' ? 'Start Ollama' :
                 aiStatus === 'running' ? `Download ${formatModelName(modelName)}` :
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
            {visibleMessages.length === 0 && (
              <Box sx={{ textAlign: 'center', mt: 4, color: 'text.secondary' }}>
                <Typography variant="body2">
                  Ask me to filter your spending, navigate to a different view, or search for a specific transaction!
                </Typography>
              </Box>
            )}
            {visibleMessages.map((m, i) => (
              <ChatMessageItem
                key={i}
                message={m}
                loading={loading}
                onSendPromptText={stableSendPromptText}
                onApplyFilters={stableHandleApplyFilters}
              />
            ))}
            {loading && !visibleMessages.some((m) => m.isStreaming) && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                <AnimatedLogo scale={0.8} spinSpeed={0.04} sx={{ ml: 1.5, my: 1 }} />
              </Box>
            )}
          </Box>

          {/* Text Input */}
          <ChatInput
            onSend={sendPromptText}
            disabled={loading}
            onStop={stopPromptExecution}
            loading={loading}
          />
        </>
      )}

      <DebugPromptModal open={debugModalOpen} onClose={() => setDebugModalOpen(false)} />
    </Box>
  );
}

function ThreadFiltersBanner() {
  const preset = useFilters((s) => s.preset);
  const searchQuery = useFilters((s) => s.searchQuery);
  const minPrice = useFilters((s) => s.minPrice);
  const maxPrice = useFilters((s) => s.maxPrice);
  const disabledCategories = useFilters((s) => s.disabledCategories);
  const resetFilters = useFilters((s) => s.reset);

  const hasActiveFilters =
    preset !== 'ytd' ||
    searchQuery !== '' ||
    minPrice !== undefined ||
    maxPrice !== undefined ||
    disabledCategories.length > 0;

  if (!hasActiveFilters) return null;

  return (
    <Box
      sx={{
        px: 2,
        py: 0.5,
        borderBottom: '1px solid',
        borderColor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(237, 108, 2, 0.3)' : '#ffe0b2'),
        bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(237, 108, 2, 0.15)' : '#fff3e0'),
        color: (theme) => (theme.palette.mode === 'dark' ? '#ffb74d' : '#e65100'),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 500 }}>
        Active UI filters may affect this chat.
      </Typography>
      <Button
        size="small"
        variant="text"
        color="warning"
        onClick={() => resetFilters()}
        sx={{
          py: 0,
          px: 1,
          minWidth: 0,
          fontSize: '0.72rem',
          textTransform: 'none',
          fontWeight: 700,
        }}
      >
        Reset Filters
      </Button>
    </Box>
  );
}

function DirectLlmModeBanner() {
  const directLlmMode = useChatStore((s) => s.directLlmMode);
  const setDirectLlmMode = useChatStore((s) => s.setDirectLlmMode);

  if (!directLlmMode) return null;

  return (
    <Box
      sx={{
        px: 2,
        py: 0.5,
        borderBottom: '1px solid',
        borderColor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(2, 136, 209, 0.3)' : '#b3e5fc'),
        bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(2, 136, 209, 0.15)' : '#e1f5fe'),
        color: (theme) => (theme.palette.mode === 'dark' ? '#29b6f6' : '#0288d1'),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 500 }}>
        Direct LLM Mode active (System prompt & financial tools disabled).
      </Typography>
      <Button
        size="small"
        variant="text"
        color="info"
        onClick={() => setDirectLlmMode(false)}
        sx={{
          py: 0,
          px: 1,
          minWidth: 0,
          fontSize: '0.72rem',
          textTransform: 'none',
          fontWeight: 700,
        }}
      >
        Switch to Copilot
      </Button>
    </Box>
  );
}
