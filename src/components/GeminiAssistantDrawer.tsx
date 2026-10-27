import { useState, useEffect, useRef } from 'react';
import {
  Drawer,
  Box,
  Stack,
  Typography,
  IconButton,
  Button,
  TextField,
  Chip,
  Alert,
  CircularProgress,
  Collapse,
  MenuItem,
  Divider,
  Tooltip,
  Link,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import IosShareIcon from '@mui/icons-material/IosShare';
import CheckIcon from '@mui/icons-material/Check';
import KeyIcon from '@mui/icons-material/Key';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import BuildCircleOutlinedIcon from '@mui/icons-material/BuildCircleOutlined';
import { useNavigate } from 'react-router-dom';
import {
  GEMINI_MODELS,
  getGeminiConfig,
  hydrateGeminiConfigFromSettings,
  saveGeminiConfig,
  loadGeminiChatHistory,
  saveGeminiChatHistory,
  copyFinancialBriefingForGemini,
  shareFinancialBriefingToGemini,
  sendGeminiChatMessage,
  type GeminiChatMessage,
} from '../domain/geminiFinanceAssistant';

const STARTER_PROMPTS = [
  'Summarize my cashflow and biggest expenses this month',
  'Where can I cut $300/mo from my variable spending?',
  'Recommend realistic monthly budgets based on my actual spend',
  'What is the fastest way to pay off my loans?',
  'Are there any unusual or duplicate charges recently?',
];

export default function GeminiAssistantDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState(() => getGeminiConfig().apiKey);
  const [model, setModel] = useState(() => getGeminiConfig().model);
  const [keyInput, setKeyInput] = useState(() => getGeminiConfig().apiKey);
  const [showKeyConfig, setShowKeyConfig] = useState(() => !getGeminiConfig().apiKey);
  const [messages, setMessages] = useState<GeminiChatMessage[]>(() => loadGeminiChatHistory());
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [copiedBriefing, setCopiedBriefing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    hydrateGeminiConfigFromSettings().then((cfg) => {
      setApiKey(cfg.apiKey);
      setKeyInput(cfg.apiKey);
      setModel(cfg.model);
      if (!cfg.apiKey) {
        setShowKeyConfig(true);
      }
    });
  }, [open]);

  useEffect(() => {
    const onConfigUpdated = () => {
      const cfg = getGeminiConfig();
      setApiKey(cfg.apiKey);
      setKeyInput(cfg.apiKey);
      setModel(cfg.model);
    };
    const onNavigate = (e: Event) => {
      const detail = (e as CustomEvent<{ page?: string }>).detail;
      if (detail?.page) {
        navigate(detail.page);
      }
    };
    window.addEventListener('gemini-config-updated', onConfigUpdated);
    window.addEventListener('strictly-gemini-navigate', onNavigate);
    return () => {
      window.removeEventListener('gemini-config-updated', onConfigUpdated);
      window.removeEventListener('strictly-gemini-navigate', onNavigate);
    };
  }, [navigate]);

  useEffect(() => {
    saveGeminiChatHistory(messages);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const handleSaveKey = async () => {
    const clean = keyInput.trim();
    await saveGeminiConfig(clean, model);
    setApiKey(clean);
    if (clean) {
      setShowKeyConfig(false);
      setErrorMsg(null);
    }
  };

  const handleCopyBriefing = async () => {
    setErrorMsg(null);
    try {
      const res = await copyFinancialBriefingForGemini();
      setCopiedBriefing(true);
      setCopyStatus(
        `Copied snapshot (${res.summaryStats.accountCount} accounts, ${res.summaryStats.transactionCount} transactions, ${res.summaryStats.loanCount} loans). Paste it into Gemini!`
      );
      setTimeout(() => setCopiedBriefing(false), 2500);
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleShareBriefing = async () => {
    setErrorMsg(null);
    try {
      const { shared, briefing } = await shareFinancialBriefingToGemini();
      if (!shared) {
        setCopiedBriefing(true);
        setCopyStatus(
          `Copied snapshot (${briefing.summaryStats.accountCount} accounts, ${briefing.summaryStats.transactionCount} transactions). Open Gemini and paste!`
        );
        setTimeout(() => setCopiedBriefing(false), 2500);
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleSend = async (promptText?: string) => {
    const text = (promptText ?? input).trim();
    if (!text || busy) return;

    const effectiveKey = keyInput.trim() || apiKey.trim();
    if (!effectiveKey) {
      setShowKeyConfig(true);
      setErrorMsg('Paste a free Google AI Studio API key below to chat in-app, or tap "Copy for Gemini" above to paste into the Gemini app.');
      return;
    }

    if (keyInput.trim() && keyInput.trim() !== apiKey) {
      await saveGeminiConfig(keyInput.trim(), model);
      setApiKey(keyInput.trim());
    }

    setErrorMsg(null);
    if (!promptText) {
      setInput('');
    }

    const userMsg: GeminiChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setBusy(true);

    try {
      const { replyText, toolActions } = await sendGeminiChatMessage(messages, text, {
        apiKey: effectiveKey,
        model,
      });
      const assistantMsg: GeminiChatMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        content: replyText,
        toolActions: toolActions.length > 0 ? toolActions : undefined,
        createdAt: Date.now(),
      };
      setMessages([...nextHistory, assistantMsg]);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100vw', sm: 450 },
          maxWidth: '100vw',
          display: 'flex',
          flexDirection: 'column',
          pt: 'env(safe-area-inset-top)',
          pb: 'env(safe-area-inset-bottom)',
        },
      }}
      sx={{ zIndex: (theme) => theme.zIndex.drawer + 3 }}
    >
      {/* Top Bar */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <AutoAwesomeIcon color="primary" fontSize="small" />
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Ask Gemini
          </Typography>
          <Chip
            size="small"
            icon={<KeyIcon sx={{ fontSize: '0.85rem !important' }} />}
            label={apiKey ? model.replace('gemini-', '') : 'API Key Setup'}
            color={apiKey ? 'success' : 'warning'}
            variant="outlined"
            onClick={() => setShowKeyConfig((v) => !v)}
            sx={{ height: 22, fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
          />
        </Stack>
        <Stack direction="row" spacing={0.5} alignItems="center">
          {messages.length > 0 && (
            <Tooltip title="Clear conversation">
              <IconButton
                size="small"
                onClick={() => {
                  setMessages([]);
                  saveGeminiChatHistory([]);
                }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      {/* Zero-Setup 1-Click Briefing Bar */}
      <Box
        sx={{
          px: 2,
          py: 1.25,
          bgcolor: 'action.hover',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 500 }}>
          <strong>No API key needed:</strong> Copy or share a live financial briefing directly into the Gemini app:
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button
            size="small"
            variant={copiedBriefing ? 'contained' : 'outlined'}
            color={copiedBriefing ? 'success' : 'primary'}
            startIcon={copiedBriefing ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
            onClick={handleCopyBriefing}
            sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.76rem' }}
          >
            {copiedBriefing ? 'Copied Briefing!' : 'Copy for Gemini'}
          </Button>
          {canNativeShare && (
            <Button
              size="small"
              variant="outlined"
              color="secondary"
              startIcon={<IosShareIcon fontSize="small" />}
              onClick={handleShareBriefing}
              sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.76rem' }}
            >
              Share to Gemini App
            </Button>
          )}
          <Button
            size="small"
            variant="text"
            color="primary"
            endIcon={<OpenInNewIcon sx={{ fontSize: '0.85rem !important' }} />}
            component="a"
            href="https://gemini.google.com/app"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem' }}
          >
            Open Gemini
          </Button>
        </Stack>
        {copyStatus && (
          <Alert severity="success" onClose={() => setCopyStatus(null)} sx={{ mt: 1, py: 0.25, fontSize: '0.75rem' }}>
            {copyStatus}
          </Alert>
        )}
      </Box>

      {/* Collapsible In-App Gemini API Key Setup */}
      <Collapse in={showKeyConfig}>
        <Box
          sx={{
            p: 2,
            bgcolor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack spacing={1.5}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                In-App Gemini Chat Setup (Free API Key)
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                Chat directly inside Strictly Spending with live access to search transactions, update budgets, and categorize merchants. Get a free key from{' '}
                <Link
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                   sx={{ fontWeight: 700 }}
                >
                  Google AI Studio
                </Link>
                . Stored only on your device.
              </Typography>
            </Box>
            <TextField
              size="small"
              fullWidth
              type="password"
              label="Gemini API Key (AIza...)"
              placeholder="Paste your Google AI Studio key..."
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                select
                size="small"
                label="Model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                sx={{ flex: 1 }}
              >
                {GEMINI_MODELS.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.label}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="contained"
                size="small"
                onClick={handleSaveKey}
                sx={{ textTransform: 'none', fontWeight: 700, height: 40, px: 2 }}
              >
                Save Key
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Collapse>

      {/* Chat Messages Area */}
      <Box
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
          <Stack spacing={1.5} sx={{ my: 'auto', py: 2 }}>
            <Box sx={{ textAlign: 'center', px: 1 }}>
              <AutoAwesomeIcon color="primary" sx={{ fontSize: 32, mb: 0.5 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Ask Anything About Your Finances
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Gemini automatically sees your connected accounts, net worth, loans, monthly cashflow, budgets, and transactions.
              </Typography>
            </Box>
            <Divider sx={{ my: 0.5 }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, px: 0.5 }}>
              Suggested Questions:
            </Typography>
            <Stack spacing={1}>
              {STARTER_PROMPTS.map((prompt) => (
                <Button
                  key={prompt}
                  variant="outlined"
                  size="small"
                  onClick={() => handleSend(prompt)}
                  disabled={busy}
                  sx={{
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    textTransform: 'none',
                    fontWeight: 500,
                    fontSize: '0.8rem',
                    py: 0.85,
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
          </Stack>
        ) : (
          messages.map((m) => (
            <Box
              key={m.id}
              sx={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '90%',
                p: 1.5,
                borderRadius: 2,
                bgcolor: m.role === 'user' ? 'primary.main' : 'action.hover',
                color: m.role === 'user' ? 'primary.contrastText' : 'text.primary',
                border: m.role === 'assistant' ? '1px solid' : 'none',
                borderColor: 'divider',
              }}
            >
              {m.toolActions && m.toolActions.length > 0 && (
                <Stack spacing={0.5} sx={{ mb: 1 }}>
                  {m.toolActions.map((act, idx) => (
                    <Chip
                      key={idx}
                      size="small"
                      icon={<BuildCircleOutlinedIcon sx={{ fontSize: '0.85rem !important' }} />}
                      label={act}
                      color="primary"
                      variant="outlined"
                      sx={{
                        height: 'auto',
                        py: 0.25,
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        '& .MuiChip-label': { whiteSpace: 'normal' },
                      }}
                    />
                  ))}
                </Stack>
              )}
              <Typography
                variant="body2"
                sx={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: '0.84rem',
                  lineHeight: 1.55,
                }}
              >
                {m.content}
              </Typography>
            </Box>
          ))
        )}

        {busy && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1, py: 0.5 }}>
            <CircularProgress size={16} />
            <Typography variant="caption" color="text.secondary">
              Gemini is analyzing your financial data...
            </Typography>
          </Stack>
        )}

        {errorMsg && (
          <Alert severity="error" onClose={() => setErrorMsg(null)} sx={{ fontSize: '0.78rem' }}>
            {errorMsg}
          </Alert>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* Bottom Input Bar */}
      <Box
        sx={{
          p: 1.5,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Stack direction="row" spacing={1} alignItems="flex-end">
          <TextField
            fullWidth
            multiline
            maxRows={4}
            size="small"
            placeholder="Ask Gemini about your spending, budgets, or loans..."
            value={input}
            disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <IconButton
            color="primary"
            disabled={busy || !input.trim()}
            onClick={() => void handleSend()}
            sx={{
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              '&:hover': { bgcolor: 'primary.dark' },
              '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
              width: 38,
              height: 38,
            }}
          >
            <SendIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>
    </Drawer>
  );
}
