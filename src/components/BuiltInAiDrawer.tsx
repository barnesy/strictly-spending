import { useState, useEffect, useRef, useMemo } from 'react';
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
import { useTheme } from '@mui/material/styles';
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
import {
  generateRoastAnimatedGif,
  drawRoastFrame,
  type RoastGifPayload,
  type RoastThemeStyle,
} from '../utils/roastGifGenerator';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  usedBuiltInModel?: boolean;
}

type PromptGroup = 'all' | 'roast' | 'wealth' | 'bills';

interface StarterPromptOption {
  icon: string;
  title: string;
  subtitle: string;
  prompt: string;
  group: Exclude<PromptGroup, 'all'>;
}

const STARTER_PROMPTS: StarterPromptOption[] = [
  {
    icon: '😈',
    title: 'Try Your Luck: My Most Embarrassing Roast',
    subtitle: 'Gives you a ridiculous spending nickname, wild assumptions & an animated Roast GIF',
    prompt: '😈 Try my luck and cook up the most embarrassing, brutal roast of my spending',
    group: 'roast',
  },
  {
    icon: '📈',
    title: 'Invest it vs. pay off car & loans early',
    subtitle: 'Roth IRA / S&P 500 growth vs. killing my car loan & mortgage early',
    prompt: 'What if I invested my extra spending into a Roth IRA or S&P 500 vs paying off my car loan early?',
    group: 'wealth',
  },
  {
    icon: '🏠',
    title: 'Tacos vs. my mortgage payoff',
    subtitle: 'What if I threw half my dining/shopping spend at my loan?',
    prompt: 'What if I threw half my dining and shopping spend at my mortgage or loans?',
    group: 'wealth',
  },
  {
    icon: '⏱️',
    title: 'Convert spending into work hours',
    subtitle: 'How many hours of my life did I sit at work to pay for this?',
    prompt: 'Convert my spending this month into hours of my life at work',
    group: 'roast',
  },
  {
    icon: '☕',
    title: 'Death by a thousand swipes (≤$25)',
    subtitle: 'Add up all my "harmless" little taps under $25 this month',
    prompt: 'Add up all my harmless little swipes under $25',
    group: 'roast',
  },
  {
    icon: '🎉',
    title: 'Weekend me vs. Weekday me',
    subtitle: 'Compare my Friday–Sunday burn rate vs. Monday–Thursday',
    prompt: 'Compare my Friday-Sunday weekend spending vs Monday-Thursday weekday',
    group: 'roast',
  },
  {
    icon: '🛑',
    title: 'Talk me out of spending $500',
    subtitle: 'Impulse check vs. unpaid bills & 10-yr compound growth',
    prompt: 'Can I spend $500 right now and it not hurt?',
    group: 'wealth',
  },
  {
    icon: '🕵️',
    title: 'My single worst spending day',
    subtitle: 'Crime-scene receipt of my most expensive 24 hours this month',
    prompt: 'What was my single worst spending day this month?',
    group: 'roast',
  },
  {
    icon: '🏆',
    title: 'Which merchant owns my paycheck?',
    subtitle: 'Rank who gets the biggest cut of my money & 10-yr cost',
    prompt: 'Which merchant is taking the biggest piece of my paycheck?',
    group: 'roast',
  },
  {
    icon: '🛟',
    title: 'How many days would my cash last?',
    subtitle: 'Survival runway at current pace vs. bare-bones bills mode',
    prompt: 'How many days would my cash last at my current spending pace?',
    group: 'wealth',
  },
  {
    icon: '💸',
    title: 'Safe to spend until next payday',
    subtitle: 'Available cash minus unpaid bills due before your next paycheck ($/day)',
    prompt: 'How much is safe to spend until my next payday after unpaid bills?',
    group: 'bills',
  },
  {
    icon: '⏳',
    title: 'Big bills still coming up?',
    subtitle: 'Unpaid month-end bills waiting to hit my checking cash',
    prompt: 'Are there any big payments coming up this month?',
    group: 'bills',
  },
  {
    icon: '🚨',
    title: 'What hit my accounts this week?',
    subtitle: '7-day damage report & largest recent charges',
    prompt: 'Has anything big hit my accounts recently?',
    group: 'bills',
  },
  {
    icon: '🍔',
    title: 'Roast my food & dining spend',
    subtitle: 'Restaurants, groceries & takeout burn rate vs. savings',
    prompt: 'How much did I spend on food & eating out?',
    group: 'roast',
  },
  {
    icon: '🛍️',
    title: 'Stop a $150 impulse buy today',
    subtitle: 'Show what $150 really costs my future self',
    prompt: 'Talk me out of a $150 impulse buy today',
    group: 'wealth',
  },
  {
    icon: '🔥',
    title: 'Roast my worst spending leaks',
    subtitle: 'Expose my top 4 discretionary habits & 30% cut savings',
    prompt: 'Where can I cut back to save more each month?',
    group: 'roast',
  },
  {
    icon: '🧛',
    title: 'Subscription & Bill Creep Radar',
    subtitle: 'Recurring autopays, price hikes & gray charges quietly bleeding you',
    prompt: 'Which subscriptions, recurring bills, and price hikes are draining me?',
    group: 'bills',
  },
  {
    icon: '📅',
    title: 'Last month’s full category receipt',
    subtitle: 'What did I actually spend on every category last month?',
    prompt: 'What did I actually spend on every category last month?',
    group: 'bills',
  },
  {
    icon: '📊',
    title: 'This month vs. last month',
    subtitle: 'Did I actually save money or just spend more?',
    prompt: 'How does this month compare to last month?',
    group: 'bills',
  },
  {
    icon: '📦',
    title: 'Roast my shopping spend',
    subtitle: 'Amazon, retail & impulse merchandise reality check',
    prompt: 'How much did I spend on shopping this month?',
    group: 'roast',
  },
  {
    icon: '🏦',
    title: 'Debt vs. cash reality check',
    subtitle: 'Loans & interest drag vs. my liquid cash & net worth',
    prompt: 'Reality check my debt vs liquid cash and net worth',
    group: 'wealth',
  },
];

interface BuiltInAiDrawerProps {
  open: boolean;
  onClose: () => void;
  initialPrompt?: string | null;
  onConsumeInitialPrompt?: () => void;
}

export default function BuiltInAiDrawer({
  open,
  onClose,
  initialPrompt,
  onConsumeInitialPrompt,
}: BuiltInAiDrawerProps) {
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
  const latestExchangeRef = useRef<HTMLDivElement>(null);

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
    if (latestExchangeRef.current) {
      latestExchangeRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length, isGenerating]);

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

  useEffect(() => {
    if (open && initialPrompt && !isGenerating) {
      onConsumeInitialPrompt?.();
      void handleSend(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPrompt, isGenerating]);

  const askedSet = new Set(
    messages.filter((m) => m.role === 'user').map((m) => m.content.trim().toLowerCase())
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      transitionDuration={{ enter: 300, exit: 240 }}
      SlideProps={{
        appear: true,
        easing: {
          enter: 'cubic-bezier(0.16, 1, 0.3, 1)',
          exit: 'cubic-bezier(0.4, 0, 1, 1)',
        },
      }}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 520 },
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
                sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, borderRadius: 1 }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              100% private & on-device · Tough-love savings coach
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={0.5} alignItems="center">
          {availability === 'unavailable' && (
            <Tooltip title="How to enable Chrome / Edge Built-in AI (Gemini Nano)">
              <IconButton size="small" onClick={() => setShowBrowserHint((v) => !v)} sx={{ borderRadius: 1 }}>
                <InfoOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {messages.length > 0 && (
            <Tooltip title="Reset & show full prompt board">
              <IconButton size="small" onClick={() => setMessages([])} disabled={isGenerating} sx={{ borderRadius: 1 }}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <IconButton size="small" onClick={onClose} aria-label="Close AI drawer" sx={{ borderRadius: 1 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      {downloadProgress !== null && (
        <Box sx={{ px: 2, py: 1, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
            Initializing browser on-device AI model ({downloadProgress}%)...
          </Typography>
          <LinearProgress variant="determinate" value={downloadProgress} sx={{ height: 5, borderRadius: 1 }} />
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

      {/* Messages & Prominent Prompt Board Area */}
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
          <Box sx={{ my: 'auto', py: 1 }}>
            <Box sx={{ textAlign: 'center', mb: 2.25, px: 1 }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 1,
                  mx: 'auto',
                  mb: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'action.hover',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <AutoAwesomeIcon sx={{ fontSize: 26, color: 'primary.main' }} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.08rem', mb: 0.4 }}>
                Get Roasted Into Saving More
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.82rem', maxWidth: 400, mx: 'auto' }}>
                Pick a reality check below. Instant math from your real accounts to talk you out of spending.
              </Typography>
            </Box>

            <PromptCardGrid
              prompts={STARTER_PROMPTS}
              askedSet={askedSet}
              disabled={isGenerating}
              onSelect={(p) => handleSend(p)}
            />
          </Box>
        ) : (
          <>
            {messages.map((m, idx) => {
              const isLoadingBubble = m.role === 'assistant' && !m.content && isGenerating;
              const isLatestUserMsg = m.role === 'user' && idx >= messages.length - 2;
              return (
                <Box
                  key={m.id}
                  ref={isLatestUserMsg ? latestExchangeRef : undefined}
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
                      p: m.role === 'assistant' ? { xs: 2, sm: 2.5 } : 1.5,
                      borderRadius: 1,
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
            })}

            {/* Persistent Prompt Picker right below the answer so you can keep tapping */}
            {!isGenerating && (
              <Box
                sx={{
                  mt: 1,
                  pt: 1.5,
                  borderTop: '1px dashed',
                  borderColor: 'divider',
                  animation: 'aiBlockSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
                  animationDelay: '220ms',
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1, px: 0.5 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'text.secondary',
                      fontSize: '0.7rem',
                    }}
                  >
                    🔥 Pick Another Reality Check
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => setMessages([])}
                    sx={{ textTransform: 'none', fontSize: '0.72rem', py: 0, minHeight: 22, borderRadius: 1 }}
                  >
                    Clear chat
                  </Button>
                </Stack>
                <PromptCardGrid
                  prompts={STARTER_PROMPTS}
                  askedSet={askedSet}
                  disabled={isGenerating}
                  onSelect={(p) => handleSend(p)}
                  compact={false}
                />
              </Box>
            )}
          </>
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
          placeholder="Or type your own question (e.g. 'Talk me out of $300')..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isGenerating}
        />
        <IconButton
          type="submit"
          color="primary"
          disabled={!input.trim() || isGenerating}
          sx={{
            borderRadius: 1,
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

function PromptCardGrid({
  prompts,
  askedSet,
  disabled,
  onSelect,
  compact = false,
}: {
  prompts: StarterPromptOption[];
  askedSet: Set<string>;
  disabled: boolean;
  onSelect: (promptText: string) => void;
  compact?: boolean;
}) {
  const [activeGroup, setActiveGroup] = useState<PromptGroup>('all');

  const filtered = prompts.filter((p) => (activeGroup === 'all' ? true : p.group === activeGroup));

  // Put unasked prompts first so fresh options are always top-of-list after a response
  const ordered = [...filtered].sort((a, b) => {
    const aAsked = askedSet.has(a.prompt.toLowerCase()) ? 1 : 0;
    const bAsked = askedSet.has(b.prompt.toLowerCase()) ? 1 : 0;
    return aAsked - bAsked;
  });

  const groups: { key: PromptGroup; label: string }[] = [
    { key: 'all', label: `All (${prompts.length})` },
    { key: 'roast', label: '🔥 Roast Me' },
    { key: 'wealth', label: '🏠 Debt & Wealth' },
    { key: 'bills', label: '⏳ Bills & Cash' },
  ];

  return (
    <Box>
      <Stack
        direction="row"
        spacing={0.75}
        sx={{
          mb: 1.5,
          flexWrap: 'wrap',
          rowGap: 0.75,
        }}
      >
        {groups.map((g) => {
          const selected = activeGroup === g.key;
          return (
            <Chip
              key={g.key}
              label={g.label}
              size="small"
              clickable
              onClick={() => setActiveGroup(g.key)}
              color={selected ? 'primary' : 'default'}
              variant={selected ? 'filled' : 'outlined'}
              sx={{
                fontWeight: 700,
                fontSize: '0.74rem',
                height: 28,
                borderRadius: 1,
              }}
            />
          );
        })}
      </Stack>

      <Stack spacing={1.25}>
        {ordered.map((opt) => {
          const alreadyAsked = askedSet.has(opt.prompt.toLowerCase());
          const isDevilDare = opt.icon === '😈';
          return (
            <Button
              key={opt.prompt}
              variant="outlined"
              disabled={disabled}
              onClick={() => onSelect(opt.prompt)}
              sx={{
                height: 'auto !important',
                minHeight: compact ? 64 : 72,
                width: '100%',
                textTransform: 'none',
                justifyContent: 'flex-start',
                alignItems: 'center',
                textAlign: 'left',
                whiteSpace: 'normal',
                overflow: 'visible',
                py: compact ? 1.25 : 1.5,
                px: 1.75,
                borderRadius: 1,
                borderWidth: '1.5px',
                borderColor: alreadyAsked
                  ? 'divider'
                  : isDevilDare
                    ? 'rgba(239, 68, 68, 0.55)'
                    : 'rgba(59, 130, 246, 0.32)',
                bgcolor: alreadyAsked
                  ? 'transparent'
                  : isDevilDare
                    ? 'rgba(239, 68, 68, 0.08)'
                    : 'action.hover',
                opacity: alreadyAsked ? 0.75 : 1,
                color: 'text.primary',
                transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                '&:hover': {
                  borderWidth: '1.5px',
                  borderColor: isDevilDare ? 'error.main' : 'primary.main',
                  bgcolor: isDevilDare ? 'rgba(239, 68, 68, 0.14)' : 'action.selected',
                  transform: 'translateY(-2px)',
                  boxShadow: isDevilDare
                    ? '0 8px 22px -6px rgba(239, 68, 68, 0.35)'
                    : '0 8px 20px -6px rgba(59, 130, 246, 0.28)',
                  opacity: 1,
                },
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: '100%' }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: isDevilDare ? 'rgba(239, 68, 68, 0.15)' : 'background.paper',
                    border: '1px solid',
                    borderColor: isDevilDare ? 'rgba(239, 68, 68, 0.45)' : 'divider',
                    fontSize: '1.3rem',
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  {opt.icon}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 800,
                        fontSize: '0.94rem',
                        lineHeight: 1.3,
                        color: 'text.primary',
                        whiteSpace: 'normal',
                      }}
                    >
                      {opt.title}
                    </Typography>
                    {alreadyAsked ? (
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: '0.66rem',
                          fontWeight: 700,
                          px: 0.75,
                          py: 0.15,
                          borderRadius: 1,
                          bgcolor: 'action.selected',
                          color: 'text.secondary',
                          flexShrink: 0,
                        }}
                      >
                        Asked
                      </Typography>
                    ) : isDevilDare ? (
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: '0.65rem',
                          fontWeight: 800,
                          px: 0.8,
                          py: 0.2,
                          borderRadius: 1,
                          bgcolor: 'error.main',
                          color: '#fff',
                          letterSpacing: '0.04em',
                          flexShrink: 0,
                        }}
                      >
                        🎲 TRY YOUR LUCK
                      </Typography>
                    ) : null}
                  </Stack>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      display: 'block',
                      fontSize: '0.8rem',
                      lineHeight: 1.38,
                      mt: 0.35,
                      whiteSpace: 'normal',
                    }}
                  >
                    {opt.subtitle}
                  </Typography>
                </Box>
              </Stack>
            </Button>
          );
        })}
      </Stack>
    </Box>
  );
}

function AiLedgerScanner({ prompt, stage }: { prompt: string; stage: number }) {
  const lower = prompt.toLowerCase();
  let steps: [string, string] = [
    'Scanning accounts & posted transactions...',
    'Reconciling recurring bills & math ledger...',
  ];
  if (lower.includes('embarrassing') || lower.includes('try my luck') || lower.includes('try your luck') || lower.includes('dare me') || lower.includes('😈')) {
    steps = [
      'Digging up your most embarrassing merchant swipes & binges...',
      'Preparing your Hall of Shame receipt & animated Roast GIF...',
    ];
  } else if (lower.includes('mortgage') || lower.includes('threw half')) {
    steps = [
      'Pulling loan principal, APR & amortization schedule...',
      'Calculating years shaved & bank interest erased...',
    ];
  } else if (lower.includes('hours') || lower.includes('life at work')) {
    steps = [
      'Calculating your true after-tax hourly wage...',
      'Converting category spending into hours at your desk...',
    ];
  } else if (lower.includes('under $25') || lower.includes('harmless')) {
    steps = [
      'Rounding up every "harmless" card tap under $25...',
      'Annualizing your micro-swipe leak...',
    ];
  } else if (lower.includes('weekend') || lower.includes('friday')) {
    steps = [
      'Splitting Fri–Sun vs. Mon–Thu card activity...',
      'Comparing Weekend You against Weekday You...',
    ];
  } else if (lower.includes('worst spending day')) {
    steps = [
      'Grouping non-bill charges by 24-hour window...',
      'Reconstructing your single most expensive day...',
    ];
  } else if (lower.includes('cash last') || lower.includes('runway')) {
    steps = [
      'Summing liquid checking & savings balances...',
      'Computing survival days at current vs. lean burn rate...',
    ];
  } else if (lower.includes('$') || lower.includes('spend') || lower.includes('afford') || lower.includes('hurt')) {
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
          borderRadius: 1,
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

function RoastAnimatedGifWidget({ cards }: { cards: RoastGifPayload[] }) {
  const muiTheme = useTheme();
  const [cardIdx, setCardIdx] = useState(0);
  const payload = cards[cardIdx % cards.length] || cards[0];

  const themeStyle = useMemo<RoastThemeStyle>(
    () => ({
      mode: muiTheme.palette.mode,
      bgDefault: muiTheme.palette.background.default,
      bgPaper: muiTheme.palette.background.paper,
      primaryMain: muiTheme.palette.primary.main,
      primaryContrast: muiTheme.palette.primary.contrastText || '#ffffff',
      secondaryMain: muiTheme.palette.secondary.main,
      errorMain: muiTheme.palette.error.main,
      warningMain: muiTheme.palette.warning.main,
      textPrimary: muiTheme.palette.text.primary,
      textSecondary: muiTheme.palette.text.secondary,
      divider: muiTheme.palette.divider,
      fontFamily: muiTheme.typography.fontFamily || '"Inter", "Segoe UI", sans-serif',
      borderRadius: Number(muiTheme.shape.borderRadius) ?? 8,
    }),
    [muiTheme]
  );

  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [pngBlob, setPngBlob] = useState<Blob | null>(null);
  const [copiedImg, setCopiedImg] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setGifUrl(null);
    setPngBlob(null);

    generateRoastAnimatedGif(payload, themeStyle)
      .then(({ gifUrl: url, pngBlob: pBlob }) => {
        if (!cancelled) {
          createdUrl = url;
          setGifUrl(url);
          setPngBlob(pBlob);
        } else {
          URL.revokeObjectURL(url);
        }
      })
      .catch(() => {
        // Keep live canvas running if GIF encoding fails
      });

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [payload, themeStyle]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const logicalW = 540;
    const logicalH = 560;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = logicalW * dpr;
    canvas.height = logicalH * dpr;

    const renderFrame = (f: number, total: number) => {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRoastFrame(ctx, logicalW, logicalH, payload, f, total, themeStyle);
      ctx.restore();
    };

    let frame = 0;
    const totalFrames = 12;
    renderFrame(0, totalFrames);
    const timer = window.setInterval(() => {
      frame = (frame + 1) % totalFrames;
      renderFrame(frame, totalFrames);
    }, 90);

    return () => window.clearInterval(timer);
  }, [payload, themeStyle]);

  const handleCopyImage = async () => {
    try {
      if (pngBlob && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
        setCopiedImg(true);
        setTimeout(() => setCopiedImg(false), 2500);
        return;
      }
    } catch {
      // Fallback to text copy if image clipboard permission denied
    }
    try {
      await navigator.clipboard.writeText(
        `😈 ${payload.crazyName} (${payload.totalAmountFormatted}) — "${payload.roastQuote}"`
      );
      setCopiedImg(true);
      setTimeout(() => setCopiedImg(false), 2500);
    } catch {
      // ignore
    }
  };

  const handleDownloadGif = () => {
    if (!gifUrl) return;
    const a = document.createElement('a');
    a.href = gifUrl;
    const slug = payload.crazyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    a.download = `roast-${slug || 'habit'}.gif`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1.5,
        animation: 'aiBlockSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 460,
          borderRadius: 1,
          overflow: 'hidden',
          border: '1.5px solid',
          borderColor: 'divider',
          boxShadow: 3,
          bgcolor: 'background.paper',
          lineHeight: 0,
        }}
      >
        <canvas
          ref={canvasRef}
          width={540}
          height={560}
          style={{
            width: '100%',
            height: 'auto',
            aspectRatio: '540 / 560',
            display: 'block',
          }}
        />
      </Box>

      <Stack
        direction="row"
        spacing={1}
        justifyContent="center"
        sx={{ width: '100%', flexWrap: 'wrap', rowGap: 1 }}
      >
        <Button
          size="small"
          variant="contained"
          color="error"
          onClick={handleCopyImage}
          sx={{
            textTransform: 'none',
            fontWeight: 800,
            fontSize: '0.78rem',
            py: 0.65,
            px: 1.5,
            borderRadius: 1,
          }}
        >
          {copiedImg ? '✅ Copied Roast Image!' : '📋 Copy Roast Image'}
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={!gifUrl}
          onClick={handleDownloadGif}
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '0.76rem',
            py: 0.65,
            px: 1.35,
            borderRadius: 1,
          }}
        >
          ⬇️ Download .GIF
        </Button>
        {cards.length > 1 && (
          <Button
            size="small"
            variant="outlined"
            color="warning"
            onClick={() => setCardIdx((prev) => (prev + 1) % cards.length)}
            sx={{
              textTransform: 'none',
              fontWeight: 800,
              fontSize: '0.76rem',
              py: 0.65,
              px: 1.35,
              borderRadius: 1,
            }}
          >
            🎲 Next Suspicious Habit ({(cardIdx % cards.length) + 1}/{cards.length})
          </Button>
        )}
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
      i++;
      continue;
    }

    // Check for embedded Animated Roast GIF Card
    if (trimmed.startsWith('[ROAST_GIF_CARD]') && trimmed.endsWith('[/ROAST_GIF_CARD]')) {
      const jsonStr = trimmed
        .slice('[ROAST_GIF_CARD]'.length, -'[/ROAST_GIF_CARD]'.length)
        .trim();
      try {
        const parsed = JSON.parse(jsonStr) as { cards?: RoastGifPayload[] } | RoastGifPayload;
        const cardList =
          'cards' in parsed && Array.isArray(parsed.cards) && parsed.cards.length > 0
            ? parsed.cards
            : [parsed as RoastGifPayload];
        elements.push(<RoastAnimatedGifWidget key={`gif-${i}`} cards={cardList} />);
      } catch {
        // Ignore malformed payload
      }
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
          variant="subtitle1"
          sx={{
            fontWeight: 800,
            fontSize: '0.98rem',
            lineHeight: 1.35,
            pt: elements.length > 0 ? 0.5 : 0,
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
          variant="subtitle1"
          sx={{
            fontWeight: 800,
            fontSize: '0.98rem',
            lineHeight: 1.35,
            pt: elements.length > 0 ? 0.5 : 0,
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
            px: 1.6,
            py: 1.3,
            borderRadius: 1,
            bgcolor: 'background.paper',
            borderLeft: '4px solid',
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
          <Typography variant="body2" sx={{ lineHeight: 1.6, fontSize: '0.86rem' }}>
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
        <Box
          key={`li-${i}`}
          sx={{
            px: 1.35,
            py: 1.05,
            borderRadius: 1,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            animation: 'aiBlockSlideUp 0.32s cubic-bezier(0.16, 1, 0.3, 1) both',
            animationDelay: `${delay}ms`,
          }}
        >
          <Typography
            variant="body2"
            sx={{
              lineHeight: 1.6,
              fontSize: '0.84rem',
            }}
          >
            {renderInlineBold(trimmed.slice(2))}
          </Typography>
        </Box>
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
          lineHeight: 1.6,
          fontSize: '0.85rem',
          animation: 'aiBlockSlideUp 0.32s cubic-bezier(0.16, 1, 0.3, 1) both',
          animationDelay: `${delay}ms`,
        }}
      >
        {renderInlineBold(lines[i])}
      </Typography>
    );
    i++;
  }

  return <Stack spacing={1.75}>{elements}</Stack>;
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
        my: 0.25,
        borderRadius: 1,
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
          fontSize: '0.81rem',
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
                    py: 0.95,
                    px: 1.25,
                    textAlign: colIsNumeric ? 'right' : 'left',
                    fontWeight: 700,
                    fontSize: '0.73rem',
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
                        py: isTotalRow ? 1.15 : 0.85,
                        px: 1.25,
                        lineHeight: 1.45,
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
