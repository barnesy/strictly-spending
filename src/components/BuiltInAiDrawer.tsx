import { useState, useEffect, useRef } from 'react';
import {
  Drawer,
  Box,
  Stack,
  Typography,
  IconButton,
  TextField,
  Button,
  Chip,
  Paper,
  CircularProgress,
  LinearProgress,
  Collapse,
  Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SendIcon from '@mui/icons-material/Send';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useAccounts, useBudgets, useCategories, useLoans } from '../hooks/queries';
import {
  askBuiltInFinancialAi,
  checkBuiltInAiAvailability,
  type BuiltInAiAvailability,
} from '../domain/builtInAi';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  usedBuiltInModel?: boolean;
}

const STARTER_PROMPTS = [
  'Where is most of my money going?',
  'How is my budget & safe spend looking?',
  'Summarize my net worth, cash, and debt',
  'What are my top merchants this period?',
];

interface BuiltInAiDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function BuiltInAiDrawer({ open, onClose }: BuiltInAiDrawerProps) {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: budgets = [] } = useBudgets();
  const { data: loans = [] } = useLoans();

  const [availability, setAvailability] = useState<BuiltInAiAvailability>('unavailable');
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [showBrowserHint, setShowBrowserHint] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    checkBuiltInAiAvailability().then((status) => {
      if (active) setAvailability(status);
    });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isGenerating]);

  const handleSend = async (questionText?: string) => {
    const q = (questionText ?? input).trim();
    if (!q || isGenerating) return;
    if (!questionText) setInput('');

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: q,
    };
    const assistantMsgId = `a-${Date.now() + 1}`;
    const placeholderMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
    };

    const priorHistory = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, userMsg, placeholderMsg]);
    setIsGenerating(true);

    try {
      const result = await askBuiltInFinancialAi({
        question: q,
        history: priorHistory,
        data: { accounts, categories, budgets, loans },
        onDownloadProgress: (pct) => {
          setDownloadProgress(pct);
          if (pct >= 100) {
            setDownloadProgress(null);
            setAvailability('available');
          }
        },
        onChunk: (partial) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, content: partial } : m))
          );
        },
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: result.text, usedBuiltInModel: result.usedBuiltInModel }
            : m
        )
      );
      if (result.usedBuiltInModel) {
        setAvailability('available');
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `Unable to generate answer: ${err?.message || String(err)}` }
            : m
        )
      );
    } finally {
      setIsGenerating(false);
      setDownloadProgress(null);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 430 },
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.paper',
        },
      }}
      sx={{ zIndex: (theme) => theme.zIndex.drawer + 3 }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          pt: 'calc(16px + env(safe-area-inset-top))',
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
          <AutoAwesomeIcon color="primary" sx={{ fontSize: 20 }} />
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                Ask Strictly AI
              </Typography>
              <Chip
                size="small"
                color={availability === 'available' ? 'success' : 'default'}
                variant="outlined"
                label={
                  availability === 'available'
                    ? 'On-Device AI'
                    : availability === 'downloading' || downloadProgress !== null
                      ? `Downloading ${downloadProgress ?? 0}%`
                      : availability === 'downloadable'
                        ? 'On-Device Ready'
                        : 'Local Analyst'
                }
                sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              100% private & on-device · Zero API keys
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={0.5} alignItems="center">
          {availability === 'unavailable' && (
            <Tooltip title="How to enable Chrome / Edge Built-in AI (Gemini Nano)">
              <IconButton size="small" onClick={() => setShowBrowserHint((v) => !v)}>
                <InfoOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {messages.length > 0 && (
            <Tooltip title="Clear conversation">
              <IconButton size="small" onClick={() => setMessages([])} disabled={isGenerating}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <IconButton size="small" onClick={onClose} aria-label="Close AI drawer">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      {downloadProgress !== null && (
        <Box sx={{ px: 2, py: 1, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
            Initializing browser on-device AI model ({downloadProgress}%)...
          </Typography>
          <LinearProgress variant="determinate" value={downloadProgress} sx={{ height: 5, borderRadius: 2 }} />
        </Box>
      )}

      <Collapse in={showBrowserHint && availability === 'unavailable'}>
        <Box
          sx={{
            p: 1.75,
            bgcolor: 'action.hover',
            borderBottom: '1px solid',
            borderColor: 'divider',
            fontSize: '0.78rem',
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
            Want full generative Chrome / Edge Built-in AI (Gemini Nano)?
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.45 }}>
            In desktop Chrome or Edge, enable <code>#optimization-guide-on-device-model</code> and{' '}
            <code>#prompt-api-for-gemini-nano</code> in <code>chrome://flags</code> (or <code>edge://flags</code>) and relaunch.
            Even without flags enabled, the built-in Local Analyst below answers questions directly from your live accounts and transactions.
          </Typography>
        </Box>
      </Collapse>

      {/* Messages Area */}
      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
        }}
      >
        {messages.length === 0 ? (
          <Box sx={{ my: 'auto', textAlign: 'center', px: 1 }}>
            <AutoAwesomeIcon sx={{ fontSize: 36, color: 'primary.main', opacity: 0.85, mb: 1 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
              Ask anything about your finances
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, fontSize: '0.82rem' }}>
              Powered by your browser&apos;s built-in on-device AI and live transaction engine. Your financial data never leaves your device.
            </Typography>
            <Stack spacing={1}>
              {STARTER_PROMPTS.map((prompt) => (
                <Button
                  key={prompt}
                  variant="outlined"
                  size="small"
                  onClick={() => handleSend(prompt)}
                  sx={{
                    textTransform: 'none',
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    fontWeight: 600,
                    py: 1,
                    px: 1.5,
                    borderColor: 'divider',
                    color: 'text.primary',
                    '&:hover': {
                      borderColor: 'primary.main',
                      bgcolor: 'action.hover',
                    },
                  }}
                >
                  {prompt}
                </Button>
              ))}
            </Stack>
          </Box>
        ) : (
          messages.map((m) => (
            <Box
              key={m.id}
              sx={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '90%',
              }}
            >
              <Paper
                elevation={0}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: m.role === 'user' ? 'primary.main' : 'action.hover',
                  color: m.role === 'user' ? 'primary.contrastText' : 'text.primary',
                  border: m.role === 'assistant' ? '1px solid' : 'none',
                  borderColor: 'divider',
                }}
              >
                {m.role === 'assistant' && !m.content && isGenerating ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={14} />
                    <Typography variant="body2" color="text.secondary">
                      Analyzing your finances...
                    </Typography>
                  </Stack>
                ) : (
                  <FormattedAiMessage content={m.content} isUser={m.role === 'user'} />
                )}
              </Paper>
            </Box>
          ))
        )}
      </Box>

      {/* Input Area */}
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        sx={{
          p: 1.5,
          pb: 'calc(12px + env(safe-area-inset-bottom))',
          borderTop: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          gap: 1,
          alignItems: 'center',
        }}
      >
        <TextField
          size="small"
          fullWidth
          placeholder="Ask about spending, budgets, merchants, or debt..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isGenerating}
          autoFocus
        />
        <IconButton
          type="submit"
          color="primary"
          disabled={!input.trim() || isGenerating}
          sx={{
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            '&:hover': { bgcolor: 'primary.dark' },
            '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
          }}
        >
          <SendIcon fontSize="small" />
        </IconButton>
      </Box>
    </Drawer>
  );
}

function FormattedAiMessage({ content, isUser }: { content: string; isUser: boolean }) {
  if (isUser) {
    return (
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
        {content}
      </Typography>
    );
  }

  const lines = content.split('\n');
  return (
    <Stack spacing={0.5}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <Box key={idx} sx={{ height: 4 }} />;
        if (trimmed.startsWith('### ')) {
          return (
            <Typography key={idx} variant="subtitle2" sx={{ fontWeight: 700, pt: idx > 0 ? 0.5 : 0 }}>
              {renderInlineBold(trimmed.slice(4))}
            </Typography>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <Typography key={idx} variant="subtitle2" sx={{ fontWeight: 700, pt: idx > 0 ? 0.5 : 0 }}>
              {renderInlineBold(trimmed.slice(3))}
            </Typography>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <Typography key={idx} variant="body2" sx={{ pl: 1, lineHeight: 1.45, fontSize: '0.84rem' }}>
              • {renderInlineBold(trimmed.slice(2))}
            </Typography>
          );
        }
        return (
          <Typography key={idx} variant="body2" sx={{ lineHeight: 1.45, fontSize: '0.84rem' }}>
            {renderInlineBold(line)}
          </Typography>
        );
      })}
    </Stack>
  );
}

function renderInlineBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Box component="strong" key={i} sx={{ fontWeight: 700 }}>
          {part.slice(2, -2)}
        </Box>
      );
    }
    return part;
  });
}
