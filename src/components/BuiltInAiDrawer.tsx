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
  'Are there any big payments coming up this month?',
  'Can I spend $500 right now and it not hurt?',
  'Has anything big hit my accounts recently?',
  'How does this month compare to last month?',
  'How much did I spend on food & eating out?',
  'Where can I cut back to save more each month?',
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
  const [scanStage, setScanStage] = useState(0);
  const [activePromptText, setActivePromptText] = useState('');
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
    if (!isGenerating) {
      setScanStage(0);
      return;
    }
    const timer = window.setTimeout(() => {
      setScanStage(1);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [isGenerating]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    const followTimer = window.setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }
    }, 380);
    return () => window.clearTimeout(followTimer);
  }, [messages, isGenerating, scanStage]);

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
    setActivePromptText(q);
    setScanStage(0);
    setMessages((prev) => [...prev, userMsg, placeholderMsg]);
    setIsGenerating(true);

    const minScanDelay = new Promise<void>((resolve) => window.setTimeout(resolve, 540));
    let streamedChunks = 0;

    try {
      const [result] = await Promise.all([
        askBuiltInFinancialAi({
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
            streamedChunks++;
            if (streamedChunks > 2) {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsgId ? { ...m, content: partial } : m))
              );
            }
          },
        }),
        minScanDelay,
      ]);

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
          width: { xs: '100%', sm: 500 },
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.paper',
          '@keyframes aiSparklePulse': {
            '0%, 100%': { transform: 'scale(1) rotate(0deg)', opacity: 0.9 },
            '50%': { transform: 'scale(1.18) rotate(12deg)', opacity: 1 },
          },
          '@keyframes aiShimmerSweep': {
            '0%': { backgroundPosition: '-200% 0' },
            '100%': { backgroundPosition: '200% 0' },
          },
          '@keyframes aiCardReveal': {
            '0%': {
              opacity: 0,
              transform: 'translateY(10px) scale(0.985)',
              boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.35), 0 12px 28px -8px rgba(59, 130, 246, 0.22)',
            },
            '60%': {
              opacity: 1,
              transform: 'translateY(-1px) scale(1.003)',
              boxShadow: '0 0 0 1px rgba(16, 185, 129, 0.32), 0 8px 20px -6px rgba(16, 185, 129, 0.16)',
            },
            '100%': {
              opacity: 1,
              transform: 'translateY(0) scale(1)',
              boxShadow: 'none',
            },
          },
          '@keyframes aiBlockSlideUp': {
            '0%': {
              opacity: 0,
              transform: 'translateY(8px)',
              filter: 'blur(2px)',
            },
            '100%': {
              opacity: 1,
              transform: 'translateY(0)',
              filter: 'blur(0px)',
            },
          },
          '@keyframes aiVerdictPop': {
            '0%': {
              opacity: 0,
              transform: 'translateY(6px) scale(0.98)',
            },
            '70%': {
              opacity: 1,
              transform: 'translateY(0) scale(1.01)',
            },
            '100%': {
              opacity: 1,
              transform: 'translateY(0) scale(1)',
            },
          },
          '@keyframes aiRowSlideIn': {
            '0%': {
              opacity: 0,
              transform: 'translateX(-8px)',
            },
            '100%': {
              opacity: 1,
              transform: 'translateX(0)',
            },
          },
          '@keyframes aiTotalDopaminePop': {
            '0%': {
              opacity: 0,
              transform: 'scale(0.975)',
              backgroundColor: 'rgba(16, 185, 129, 0.22)',
            },
            '65%': {
              opacity: 1,
              transform: 'scale(1.012)',
              backgroundColor: 'rgba(16, 185, 129, 0.14)',
            },
            '100%': {
              opacity: 1,
              transform: 'scale(1)',
            },
          },
          '@keyframes aiUserBubblePop': {
            '0%': { opacity: 0, transform: 'translateY(6px) scale(0.96)' },
            '100%': { opacity: 1, transform: 'translateY(0) scale(1)' },
          },
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
          <AutoAwesomeIcon
            color="primary"
            sx={{
              fontSize: 20,
              animation: isGenerating ? 'aiSparklePulse 1.1s ease-in-out infinite' : 'none',
            }}
          />
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
                    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                    '&:hover': {
                      borderColor: 'primary.main',
                      bgcolor: 'action.hover',
                      transform: 'translateX(3px)',
                    },
                  }}
                >
                  {prompt}
                </Button>
              ))}
            </Stack>
          </Box>
        ) : (
          messages.map((m) => {
            const isLoadingBubble = m.role === 'assistant' && !m.content && isGenerating;
            return (
              <Box
                key={m.id}
                sx={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: m.role === 'user' ? '85%' : '100%',
                  width: m.role === 'assistant' ? '100%' : 'auto',
                  animation:
                    m.role === 'user'
                      ? 'aiUserBubblePop 0.22s cubic-bezier(0.16, 1, 0.3, 1) both'
                      : 'none',
                }}
              >
                <Paper
                  elevation={0}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    position: 'relative',
                    overflow: 'hidden',
                    bgcolor: m.role === 'user' ? 'primary.main' : 'action.hover',
                    color: m.role === 'user' ? 'primary.contrastText' : 'text.primary',
                    border: m.role === 'assistant' ? '1px solid' : 'none',
                    borderColor: isLoadingBubble ? 'primary.main' : 'divider',
                    animation:
                      m.role === 'assistant' && m.content
                        ? 'aiCardReveal 0.65s cubic-bezier(0.16, 1, 0.3, 1) both'
                        : 'none',
                  }}
                >
                  {isLoadingBubble ? (
                    <AiLedgerScanner prompt={activePromptText} stage={scanStage} />
                  ) : (
                    <FormattedAiMessage key={m.content ? 'ready' : 'empty'} content={m.content} isUser={m.role === 'user'} />
                  )}
                </Paper>
              </Box>
            );
          })
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

function AiLedgerScanner({ prompt, stage }: { prompt: string; stage: number }) {
  const lower = prompt.toLowerCase();
  let steps: [string, string] = [
    'Scanning accounts & posted transactions...',
    'Reconciling recurring bills & math ledger...',
  ];
  if (lower.includes('$') || lower.includes('spend') || lower.includes('afford') || lower.includes('hurt')) {
    steps = [
      'Checking liquid cash & credit card balances...',
      'Simulating purchase impact & upcoming bill reserve...',
    ];
  } else if (lower.includes('upcoming') || lower.includes('payment') || lower.includes('bill') || lower.includes('due')) {
    steps = [
      'Scanning recurring bills & loan schedules...',
      'Projecting remaining month-end obligations...',
    ];
  } else if (lower.includes('hit') || lower.includes('recent') || lower.includes('charge')) {
    steps = [
      'Auditing recent posted transactions...',
      'Ranking largest outflows & anomalies...',
    ];
  } else if (lower.includes('compare') || lower.includes('last month')) {
    steps = [
      'Aggregating current vs. prior month ledgers...',
      'Computing category deltas & net cashflow...',
    ];
  }

  return (
    <Box sx={{ py: 0.25 }}>
      {/* Top shimmer accent bar */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background:
            'linear-gradient(90deg, transparent 0%, rgba(59,130,246,0.85) 35%, rgba(16,185,129,0.9) 65%, transparent 100%)',
          backgroundSize: '200% 100%',
          animation: 'aiShimmerSweep 1.1s linear infinite',
        }}
      />
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1 }}>
        <AutoAwesomeIcon
          color="primary"
          sx={{
            fontSize: 18,
            animation: 'aiSparklePulse 0.9s ease-in-out infinite',
          }}
        />
        <Typography
          variant="body2"
          sx={{
            fontWeight: 700,
            fontSize: '0.82rem',
            color: 'text.primary',
            animation: 'aiBlockSlideUp 0.22s ease-out both',
          }}
          key={stage}
        >
          {steps[stage] ?? steps[0]}
        </Typography>
      </Stack>

      {/* Mini skeleton math ledger preview */}
      <Stack
        spacing={0.6}
        sx={{
          p: 1,
          borderRadius: 1.25,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        {[0.72, 0.56, 0.84].map((w, idx) => (
          <Stack key={idx} direction="row" justifyContent="space-between" alignItems="center">
            <Box
              sx={{
                height: 8,
                width: `${Math.round(w * 60)}%`,
                borderRadius: 1,
                background:
                  'linear-gradient(90deg, rgba(148,163,184,0.16) 0%, rgba(148,163,184,0.34) 50%, rgba(148,163,184,0.16) 100%)',
                backgroundSize: '200% 100%',
                animation: 'aiShimmerSweep 1.2s linear infinite',
              }}
            />
            <Box
              sx={{
                height: 8,
                width: '22%',
                borderRadius: 1,
                background:
                  'linear-gradient(90deg, rgba(59,130,246,0.14) 0%, rgba(16,185,129,0.32) 50%, rgba(59,130,246,0.14) 100%)',
                backgroundSize: '200% 100%',
                animation: 'aiShimmerSweep 1.2s linear infinite',
              }}
            />
          </Stack>
        ))}
      </Stack>
    </Box>
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
  const elements: React.ReactNode[] = [];
  let i = 0;
  let animIndex = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      elements.push(<Box key={`sp-${i}`} sx={{ height: 4 }} />);
      i++;
      continue;
    }

    // Group consecutive markdown table lines (`| ... |`)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      const blockDelay = Math.min(animIndex * 55, 360);
      animIndex++;
      elements.push(<MathLedgerTable key={`tbl-${i}`} rawRows={tableLines} baseDelayMs={blockDelay} />);
      continue;
    }

    if (trimmed.startsWith('### ')) {
      const delay = Math.min(animIndex * 55, 360);
      animIndex++;
      elements.push(
        <Typography
          key={`h3-${i}`}
          variant="subtitle2"
          sx={{
            fontWeight: 700,
            pt: elements.length > 0 ? 0.75 : 0,
            pb: 0.25,
            animation: 'aiBlockSlideUp 0.34s cubic-bezier(0.16, 1, 0.3, 1) both',
            animationDelay: `${delay}ms`,
          }}
        >
          {renderInlineBold(trimmed.slice(4))}
        </Typography>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('## ')) {
      const delay = Math.min(animIndex * 55, 360);
      animIndex++;
      elements.push(
        <Typography
          key={`h2-${i}`}
          variant="subtitle2"
          sx={{
            fontWeight: 700,
            pt: elements.length > 0 ? 0.75 : 0,
            pb: 0.25,
            animation: 'aiBlockSlideUp 0.34s cubic-bezier(0.16, 1, 0.3, 1) both',
            animationDelay: `${delay}ms`,
          }}
        >
          {renderInlineBold(trimmed.slice(3))}
        </Typography>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('> ')) {
      const delay = Math.min(animIndex * 55, 360);
      animIndex++;
      const quoteBody = trimmed.slice(2);
      const isPositiveVerdict = /yes|comfortable|ahead|lower|surplus/i.test(quoteBody);
      const isCautionVerdict = /tight|Wait|caution|higher|exceed/i.test(quoteBody);

      elements.push(
        <Box
          key={`q-${i}`}
          sx={{
            px: 1.25,
            py: 0.85,
            my: 0.35,
            borderRadius: 1.25,
            bgcolor: 'background.paper',
            borderLeft: '3.5px solid',
            borderColor: isPositiveVerdict
              ? 'success.main'
              : isCautionVerdict
                ? 'warning.main'
                : 'primary.main',
            boxShadow: '0 2px 10px -4px rgba(0,0,0,0.12)',
            animation: 'aiVerdictPop 0.42s cubic-bezier(0.16, 1, 0.3, 1) both',
            animationDelay: `${delay}ms`,
          }}
        >
          <Typography variant="body2" sx={{ lineHeight: 1.45, fontSize: '0.84rem' }}>
            {renderInlineBold(quoteBody)}
          </Typography>
        </Box>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const delay = Math.min(animIndex * 45, 420);
      animIndex++;
      elements.push(
        <Typography
          key={`li-${i}`}
          variant="body2"
          sx={{
            pl: 1,
            lineHeight: 1.45,
            fontSize: '0.83rem',
            animation: 'aiBlockSlideUp 0.32s cubic-bezier(0.16, 1, 0.3, 1) both',
            animationDelay: `${delay}ms`,
          }}
        >
          • {renderInlineBold(trimmed.slice(2))}
        </Typography>
      );
      i++;
      continue;
    }

    const delay = Math.min(animIndex * 50, 380);
    animIndex++;
    elements.push(
      <Typography
        key={`p-${i}`}
        variant="body2"
        sx={{
          lineHeight: 1.45,
          fontSize: '0.84rem',
          pt: 0.25,
          animation: 'aiBlockSlideUp 0.32s cubic-bezier(0.16, 1, 0.3, 1) both',
          animationDelay: `${delay}ms`,
        }}
      >
        {renderInlineBold(lines[i])}
      </Typography>
    );
    i++;
  }

  return <Stack spacing={0.5}>{elements}</Stack>;
}

function MathLedgerTable({ rawRows, baseDelayMs = 0 }: { rawRows: string[]; baseDelayMs?: number }) {
  const parsedRows = rawRows
    .map((r) =>
      r
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim())
    )
    .filter((cells) => !cells.every((c) => /^[:\-]+$/.test(c)));

  if (parsedRows.length === 0) return null;

  const header = parsedRows[0];
  const body = parsedRows.slice(1);
  const colCount = header.length;

  const isNumericCell = (text: string, colIdx: number) => {
    if (colIdx === 0) return false;
    if (colIdx === colCount - 1) return true;
    const clean = text.replace(/\*\*/g, '').trim();
    return (
      /^[+\-=~\s]*\$[0-9,]+(\.\d+)?(\/mo|\/yr|\s*\([^)]+\))?$/i.test(clean) ||
      /^[+\-]?\d+(\.\d+)?%$/.test(clean)
    );
  };

  return (
    <Box
      sx={{
        my: 0.5,
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        overflowX: 'auto',
        animation: 'aiBlockSlideUp 0.36s cubic-bezier(0.16, 1, 0.3, 1) both',
        animationDelay: `${baseDelayMs}ms`,
      }}
    >
      <Box
        component="table"
        sx={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.79rem',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <Box component="thead">
          <Box
            component="tr"
            sx={{
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: 'action.hover',
            }}
          >
            {header.map((cell, cIdx) => {
              const colIsNumeric =
                cIdx === colCount - 1 ||
                (body.length > 0 && cIdx > 0 && isNumericCell(body[0][cIdx] || '', cIdx));
              return (
                <Box
                  component="th"
                  key={cIdx}
                  sx={{
                    py: 0.6,
                    px: 1,
                    textAlign: colIsNumeric ? 'right' : 'left',
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {renderInlineBold(cell)}
                </Box>
              );
            })}
          </Box>
        </Box>
        <Box component="tbody">
          {body.map((row, rIdx) => {
            const firstPlain = (row[0] || '').replace(/\*\*/g, '').trim();
            const isTotalRow =
              firstPlain.startsWith('=') ||
              firstPlain.startsWith('Total') ||
              firstPlain.startsWith('Subtotal');
            const rowDelay = baseDelayMs + 70 + rIdx * 48;

            return (
              <Box
                component="tr"
                key={rIdx}
                sx={{
                  borderTop: isTotalRow ? '1.5px solid' : rIdx > 0 ? '1px solid' : 'none',
                  borderColor: isTotalRow ? 'text.secondary' : 'divider',
                  bgcolor: isTotalRow ? 'action.selected' : 'transparent',
                  animation: isTotalRow
                    ? 'aiTotalDopaminePop 0.52s cubic-bezier(0.16, 1, 0.3, 1) both'
                    : 'aiRowSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
                  animationDelay: `${rowDelay}ms`,
                }}
              >
                {row.map((cell, cIdx) => {
                  const numAlign = isNumericCell(cell, cIdx);
                  const plain = cell.replace(/\*\*/g, '').trim();
                  const isPositiveAmt = numAlign && (plain.startsWith('+$') || plain.startsWith('= +$'));
                  const isNegativeTotal = isTotalRow && numAlign && (plain.startsWith('-$') || plain.startsWith('= -$'));

                  return (
                    <Box
                      component="td"
                      key={cIdx}
                      sx={{
                        py: isTotalRow ? 0.8 : 0.55,
                        px: 1,
                        textAlign: numAlign ? 'right' : 'left',
                        fontWeight: isTotalRow || numAlign ? 700 : cIdx === 0 ? 600 : 400,
                        fontFamily: numAlign ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' : 'inherit',
                        whiteSpace: numAlign ? 'nowrap' : 'normal',
                        color: isNegativeTotal
                          ? 'error.main'
                          : isPositiveAmt
                            ? 'success.main'
                            : cIdx > 0 && !numAlign && !isTotalRow
                              ? 'text.secondary'
                              : 'text.primary',
                      }}
                    >
                      {renderInlineBold(cell)}
                    </Box>
                  );
                })}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
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
