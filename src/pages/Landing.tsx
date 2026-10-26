import { Box, Button, Container, Typography, Grid, Paper, Chip, IconButton, Tooltip, Accordion, AccordionSummary, AccordionDetails, Alert, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { useState, useEffect } from 'react';
import AppleIcon from '@mui/icons-material/Apple';
import WindowIcon from '@mui/icons-material/Window';
import AndroidIcon from '@mui/icons-material/Android';
import SecurityIcon from '@mui/icons-material/Security';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import RuleIcon from '@mui/icons-material/Rule';
import MemoryIcon from '@mui/icons-material/Memory';
import TerminalIcon from '@mui/icons-material/Terminal';
import NoAccountsIcon from '@mui/icons-material/NoAccounts';
import AllInclusiveIcon from '@mui/icons-material/AllInclusive';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GitHubIcon from '@mui/icons-material/GitHub';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import AnimatedLogo from '../components/AnimatedLogo';
import { usePwaInstall } from '../utils/pwaInstall';
import packageJson from '../../package.json';

function InstallationNotes({ onOpenAndroidHelp }: { onOpenAndroidHelp?: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopyCommand = () => {
    navigator.clipboard.writeText('xattr -cr /Applications/Strictly\\ Spending.app');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Accordion sx={{ width: '100%', bgcolor: 'rgba(0,0,0,0.02)', borderRadius: '12px', '&:before': { display: 'none' }, border: '1px solid rgba(0,0,0,0.06)', boxShadow: 'none' }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ '& .MuiAccordionSummary-content': { my: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <InfoOutlinedIcon sx={{ color: '#6B7280', fontSize: 20 }} />
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>
            Installation Notes & Troubleshooting (Mac, Windows & Android Play Protect)
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0, pb: 2.5, px: 2.5, textAlign: 'left' }}>
        <Alert severity="info" sx={{ mb: 2, borderRadius: '8px', '& .MuiAlert-message': { width: '100%' } }}>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
            Android Users — Blocked by Play Protect or Advanced Protection?
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            1. <b>No-APK Install (Play Protect Safe):</b> Tap <b>"Install Android WebApp (Play Protect Safe)"</b> above, or tap Chrome's <b>⋮</b> menu → <b>Add to Home screen</b> → <b>Install</b>. Google Play Services mints and signs a native WebAPK automatically without triggering Play Protect.<br />
            2. <b>For the .apk installer:</b> If <b>Advanced Protection</b> blocks the APK, open <b>Settings → Security & privacy → Advanced Protection</b> (or <b>Play Store → Profile → Play Protect → ⚙️</b>) and temporarily pause protection while installing <code>Strictly-Spending-Android-arm64.apk</code>, or tap <b>"More details" → "Install anyway"</b>.
          </Typography>
          {onOpenAndroidHelp && (
            <Button size="small" variant="outlined" onClick={onOpenAndroidHelp} sx={{ textTransform: 'none', fontWeight: 600 }}>
              View Step-by-Step Android Guide
            </Button>
          )}
        </Alert>

        <Alert severity="warning" sx={{ mb: 2, borderRadius: '8px', '& .MuiAlert-message': { width: '100%' } }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>Mac Users</Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            If macOS warns that the app is "damaged" or cannot be verified, you must allow it to run. As a fallback to Right-Clicking and opening, run this command in your terminal after installing the application:
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: 'rgba(255,255,255,0.7)', borderRadius: '6px', p: 1, pl: 1.5, border: '1px solid rgba(0,0,0,0.1)' }}>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#111827' }}>
              xattr -cr /Applications/Strictly\ Spending.app
            </Typography>
            <Tooltip title={copied ? "Copied!" : "Copy command"}>
              <IconButton size="small" onClick={handleCopyCommand} sx={{ color: copied ? '#10B981' : '#6B7280', p: 0.5 }}>
                {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Box>
        </Alert>

        <Typography variant="body2" sx={{ color: '#6B7280', lineHeight: 1.5, mt: 2 }}>
          <b>Windows:</b> You may need to allow the app to run on your PC. If Windows SmartScreen prevents the app from starting, click <b>"More info"</b> and then <b>"Run anyway"</b>.
        </Typography>
      </AccordionDetails>
    </Accordion>
  );
}

interface LandingProps {
  onLaunchDemo?: () => void;
}

const DEFAULT_DOWNLOAD_URLS = {
  mac: 'https://github.com/barnesy/strictly-spending/releases/latest/download/Strictly.Spending_0.2.0_aarch64.dmg',
  windows: 'https://github.com/barnesy/strictly-spending/releases/latest/download/Strictly.Spending_0.2.0_x64-setup.exe',
  android: 'https://github.com/barnesy/strictly-spending/releases/latest/download/Strictly-Spending-Android-arm64.apk',
};

export default function Landing({ onLaunchDemo }: LandingProps) {
  const [downloadUrls, setDownloadUrls] = useState(DEFAULT_DOWNLOAD_URLS);
  const [androidModalOpen, setAndroidModalOpen] = useState(false);
  const { canInstall, promptInstall } = usePwaInstall();

  const handlePlayProtectSafeInstall = async () => {
    if (canInstall) {
      const accepted = await promptInstall();
      if (accepted) return;
    }
    setAndroidModalOpen(true);
  };

  useEffect(() => {
    let cancelled = false;
    fetch('https://api.github.com/repos/barnesy/strictly-spending/releases/latest')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.assets)) return;
        const macAsset =
          data.assets.find((a: any) => a.name.endsWith('aarch64.dmg')) ||
          data.assets.find((a: any) => a.name.endsWith('.dmg') || a.name.endsWith('.app.tar.gz'));
        const winAsset =
          data.assets.find((a: any) => a.name.endsWith('.exe')) ||
          data.assets.find((a: any) => a.name.endsWith('.msi'));
        const androidAsset = data.assets.find((a: any) => a.name.endsWith('.apk'));

        setDownloadUrls((prev) => ({
          mac: macAsset?.browser_download_url || prev.mac,
          windows: winAsset?.browser_download_url || prev.windows,
          android: androidAsset?.browser_download_url || prev.android,
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      bgcolor: '#FAFAFA', // Clean light background
      color: '#111827',
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      letterSpacing: '-0.02em',
    }}>
      {/* Header */}
      <Box
        component="header"
        sx={{
          px: { xs: 2, sm: 3 },
          py: { xs: 2, sm: 2.5 },
          display: 'flex',
          alignItems: 'center',
          justifyContent: { xs: 'center', sm: onLaunchDemo ? 'space-between' : 'center' },
          maxWidth: '1200px',
          width: '100%',
          mx: 'auto',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <AnimatedLogo />
          <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: '-0.03em', color: '#111827' }}>
            Strictly Spending
          </Typography>
        </Box>
        {onLaunchDemo && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<PlayArrowIcon />}
            onClick={onLaunchDemo}
            sx={{
              display: { xs: 'none', sm: 'inline-flex' },
              borderRadius: '8px',
              textTransform: 'none',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              borderColor: '#D1D5DB',
              color: '#111827',
              '&:hover': { bgcolor: '#F3F4F6', borderColor: '#9CA3AF' },
            }}
          >
            Try Live Demo
          </Button>
        )}
      </Box>

      {/* Hero Section */}
      <Container maxWidth="lg" sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', py: { xs: 5, md: 12 }, textAlign: 'center' }}>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', mb: { xs: 2.5, md: 3 }, gap: 1 }}>
          <Chip
            label="Free Early Access · No Subscription"
            size="small"
            sx={{
              bgcolor: 'rgba(16,185,129,0.1)',
              color: '#047857',
              fontWeight: 700,
              fontSize: { xs: '0.75rem', sm: '0.8125rem' },
              height: { xs: 28, sm: 32 },
              border: '1px solid rgba(16,185,129,0.25)',
              backdropFilter: 'blur(10px)',
            }}
          />
          <Chip
            label="100% Local SQLite & Private AI"
            size="small"
            sx={{
              bgcolor: 'rgba(0,0,0,0.04)',
              color: '#374151',
              fontWeight: 600,
              fontSize: { xs: '0.75rem', sm: '0.8125rem' },
              height: { xs: 28, sm: 32 },
              border: '1px solid rgba(0,0,0,0.1)',
              backdropFilter: 'blur(10px)',
            }}
          />
        </Box>

        <Typography variant="h1" component="h1" sx={{
          fontWeight: 800,
          fontSize: { xs: '2.5rem', sm: '3.25rem', md: '4.5rem' },
          lineHeight: 1.1,
          mb: { xs: 2, md: 3 },
          background: 'linear-gradient(180deg, #111827 0%, #4B5563 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textShadow: '0px 4px 20px rgba(0,0,0,0.05)'
        }}>
          Unlimited intelligence,<br />Absolute Privacy.
        </Typography>

        <Typography variant="h5" sx={{ mb: { xs: 4, md: 5 }, maxWidth: '700px', mx: 'auto', lineHeight: 1.5, color: '#4B5563', fontWeight: 400, fontSize: { xs: '1.05rem', md: '1.5rem' }, px: 1 }}>
          Ingest multi-bank CSVs, sync 12,000+ banks via SimpleFIN, automate categorization rules, and forecast your net worth—without monthly cloud fees.
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxWidth: '780px', width: '100%', mx: 'auto', px: { xs: 1, sm: 2 }, mb: { xs: 6, md: 10 } }}>
          {onLaunchDemo && (
            <Button
              variant="contained"
              size="large"
              startIcon={<PlayArrowIcon />}
              onClick={onLaunchDemo}
              sx={{
                width: '100%',
                borderRadius: '8px',
                py: { xs: 1.75, md: 2.25 },
                px: 2.5,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: { xs: '1rem', md: '1.05rem' },
                whiteSpace: 'nowrap',
                bgcolor: '#2563EB',
                color: '#FFFFFF',
                boxShadow: 'none',
                '&:hover': {
                  bgcolor: '#1D4ED8',
                  transform: 'translateY(-2px)',
                  boxShadow: 'none',
                },
                transition: 'all 0.2s'
              }}
            >
              Try Interactive Live Demo
            </Button>
          )}

          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 1.5, justifyContent: 'center' }}>
            <Button
              component="a"
              href={downloadUrls.mac}
              variant="contained"
              size="large"
              startIcon={<AppleIcon />}
              sx={{
                flex: 1,
                width: { xs: '100%', md: 'auto' },
                borderRadius: '8px',
                py: { xs: 1.75, md: 2.5 },
                px: 2.5,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: { xs: '1rem', md: '1.05rem' },
                whiteSpace: 'nowrap',
                bgcolor: '#000000',
                color: '#FFFFFF',
                boxShadow: 'none',
                '&:hover': { bgcolor: '#333333', transform: 'translateY(-2px)', boxShadow: 'none' },
                transition: 'all 0.2s'
              }}
            >
              Download for Mac
            </Button>
            <Button
              component="a"
              href={downloadUrls.windows}
              variant="contained"
              size="large"
              startIcon={<WindowIcon />}
              sx={{
                flex: 1,
                width: { xs: '100%', md: 'auto' },
                borderRadius: '8px',
                py: { xs: 1.75, md: 2.5 },
                px: 2.5,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: { xs: '1rem', md: '1.05rem' },
                whiteSpace: 'nowrap',
                bgcolor: '#FFFFFF',
                color: '#111827',
                border: '1px solid #D1D5DB',
                '&:hover': { bgcolor: '#F9FAFB', transform: 'translateY(-2px)', boxShadow: 'none' },
                transition: 'all 0.2s',
                boxShadow: 'none',
              }}
            >
              Download for Windows
            </Button>
            <Button
              component="a"
              href={downloadUrls.android}
              variant="contained"
              size="large"
              startIcon={<AndroidIcon />}
              sx={{
                flex: 1,
                width: { xs: '100%', md: 'auto' },
                borderRadius: '8px',
                py: { xs: 1.75, md: 2.5 },
                px: 2.5,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: { xs: '1rem', md: '1.05rem' },
                whiteSpace: 'nowrap',
                bgcolor: '#059669',
                color: '#FFFFFF',
                '&:hover': { bgcolor: '#047857', transform: 'translateY(-2px)', boxShadow: 'none' },
                transition: 'all 0.2s',
                boxShadow: 'none',
              }}
            >
              Download for Android (APK)
            </Button>
          </Box>

          <Button
            variant="outlined"
            size="medium"
            startIcon={<VerifiedUserIcon sx={{ color: '#059669' }} />}
            onClick={handlePlayProtectSafeInstall}
            sx={{
              width: '100%',
              borderRadius: '8px',
              py: 1.25,
              px: 2,
              textTransform: 'none',
              fontWeight: 700,
              fontSize: { xs: '0.875rem', sm: '0.9375rem' },
              bgcolor: 'rgba(16,185,129,0.06)',
              color: '#065F46',
              borderColor: 'rgba(16,185,129,0.35)',
              '&:hover': {
                bgcolor: 'rgba(16,185,129,0.12)',
                borderColor: '#059669',
              },
            }}
          >
            {canInstall
              ? 'Install Android App Directly (Play Protect Safe · No APK)'
              : 'Blocked by Android Play Protect / Advanced Protection? Tap Here'}
          </Button>

          <Box sx={{ width: '100%' }}>
            <InstallationNotes onOpenAndroidHelp={() => setAndroidModalOpen(true)} />
          </Box>
        </Box>

        {/* Video Demo Section */}
        <Box sx={{ maxWidth: '1200px', mx: 'auto', width: '100%' }}>
          <Paper elevation={12} sx={{
            borderRadius: '12px',
            overflow: 'hidden',
            bgcolor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            boxShadow: '0 24px 80px rgba(0,0,0,0.1)',
          }}>
            {/* Mockup Window Header */}
            <Box sx={{ bgcolor: '#F3F4F6', p: 1.5, display: 'flex', gap: 1, alignItems: 'center', borderBottom: '1px solid #E5E7EB' }}>
              <Box sx={{ display: 'flex', gap: 1, pl: 1 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#FF5F56', border: '1px solid #E0443E' }} />
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#FFBD2E', border: '1px solid #DEA123' }} />
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#27C93F', border: '1px solid #1AAB29' }} />
              </Box>
            </Box>
            {/* Mockup Content - Video */}
            <Box sx={{ width: '100%', lineHeight: 0 }}>
              <video
                src={`${import.meta.env.BASE_URL}strictly-spending.mp4`}
                autoPlay
                loop
                muted
                playsInline
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </Box>
          </Paper>
        </Box>



        {/* Features Section */}
        <Grid container spacing={4} sx={{ mt: { xs: 10, md: 16 } }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper elevation={0} sx={{ p: 4, height: '100%', bgcolor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', textAlign: 'left', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: '0 8px 30px rgba(0,0,0,0.04)' } }}>
              <Box sx={{ width: 48, height: 48, borderRadius: '8px', bgcolor: 'rgba(10,132,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
                <SecurityIcon sx={{ color: '#0A84FF' }} />
              </Box>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, color: '#111827' }}>
                Absolute Secrecy
              </Typography>
              <Typography sx={{ color: '#4B5563', lineHeight: 1.6 }}>
                Your data never leaves your device. No cloud syncing, no mandatory accounts, total offline privacy for your most sensitive financial data.
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper elevation={0} sx={{ p: 4, height: '100%', bgcolor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', textAlign: 'left', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: '0 8px 30px rgba(0,0,0,0.04)' } }}>
              <Box sx={{ width: 48, height: 48, borderRadius: '8px', bgcolor: 'rgba(48,209,88,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
                <RuleIcon sx={{ color: '#30D158' }} />
              </Box>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, color: '#111827' }}>
                Smart Rules
              </Typography>
              <Typography sx={{ color: '#4B5563', lineHeight: 1.6 }}>
                Set up precise logic to automatically categorize transactions from multiple bank CSV formats instantly. Spend less time tagging, more time analyzing.
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper elevation={0} sx={{ p: 4, height: '100%', bgcolor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', textAlign: 'left', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: '0 8px 30px rgba(0,0,0,0.04)' } }}>
              <Box sx={{ width: 48, height: 48, borderRadius: '8px', bgcolor: 'rgba(255,159,10,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
                <AutoGraphIcon sx={{ color: '#FF9F0A' }} />
              </Box>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, color: '#111827' }}>
                Visual Grandeur
              </Typography>
              <Typography sx={{ color: '#4B5563', lineHeight: 1.6 }}>
                Visualize your spending patterns, track your budget, and plan for taxes with meticulous detail and beautiful interactive charts.
              </Typography>
            </Paper>
          </Grid>
        </Grid>

        {/* AI Deep Dive Section */}
        <Box sx={{ mt: { xs: 12, md: 20 }, textAlign: 'center' }}>
          <Typography variant="h2" sx={{ fontWeight: 800, fontSize: { xs: '2.5rem', md: '3.5rem' }, mb: 2, color: '#111827' }}>
            Meet Your Free, Local AI Assistant.
          </Typography>
          <Typography sx={{ maxWidth: '800px', mx: 'auto', color: '#4B5563', fontSize: '1.2rem', lineHeight: 1.6, mb: 8 }}>
            Ask questions about your spending, get summaries, and find anomalous transactions. Our AI copilot runs entirely on your local machine using Ollama.
          </Typography>

          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper elevation={0} sx={{ p: 5, height: '100%', bgcolor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: '0 8px 30px rgba(0,0,0,0.04)' } }}>
                <NoAccountsIcon sx={{ fontSize: 40, color: '#FF3B30', mb: 2 }} />
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: '#111827' }}>No Subscriptions Required</Typography>
                <Typography sx={{ color: '#4B5563', lineHeight: 1.6 }}>
                  You don't need a ChatGPT, Gemini, or Claude account. No API keys, no monthly fees, no hidden costs. It's completely free to use.
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper elevation={0} sx={{ p: 5, height: '100%', bgcolor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: '0 8px 30px rgba(0,0,0,0.04)' } }}>
                <AllInclusiveIcon sx={{ fontSize: 40, color: '#007AFF', mb: 2 }} />
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: '#111827' }}>Unlimited Tokens</Typography>
                <Typography sx={{ color: '#4B5563', lineHeight: 1.6 }}>
                  Chat as much as you want. Because the model runs on your hardware, there are no token limits or usage quotas to worry about.
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper elevation={0} sx={{ p: 5, height: '100%', bgcolor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: '0 8px 30px rgba(0,0,0,0.04)' } }}>
                <MemoryIcon sx={{ fontSize: 40, color: '#34C759', mb: 2 }} />
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: '#111827' }}>100% Data Privacy</Typography>
                <Typography sx={{ color: '#4B5563', lineHeight: 1.6 }}>
                  Your sensitive financial data is never sent to the cloud. The AI analyzes your data locally, ensuring your finances remain strictly confidential.
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper elevation={0} sx={{ p: 5, height: '100%', bgcolor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: '0 8px 30px rgba(0,0,0,0.04)' } }}>
                <TerminalIcon sx={{ fontSize: 40, color: '#AF52DE', mb: 2 }} />
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: '#111827' }}>Model Flexibility</Typography>
                <Typography sx={{ color: '#4B5563', lineHeight: 1.6 }}>
                  Choose the right model for your hardware. Run lightweight 8B models on laptops, or scale up to massive 70B models if you have the compute.
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </Box>

        <Box sx={{ mt: 16, mb: 8, py: 8, borderTop: '1px solid rgba(0,0,0,0.08)', textAlign: 'center' }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 4, color: '#111827' }}>
            Ready to take control?
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxWidth: '700px', width: '100%', mx: 'auto', px: { xs: 1, sm: 2 }, mb: 4 }}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 1.5, justifyContent: 'center' }}>
              <Button
                component="a"
                href={downloadUrls.mac}
                variant="contained"
                size="large"
                startIcon={<AppleIcon />}
                sx={{
                  flex: 1,
                  width: { xs: '100%', md: 'auto' },
                  borderRadius: '8px',
                  py: { xs: 1.75, md: 2.5 },
                  px: 2.5,
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: { xs: '1rem', md: '1.05rem' },
                  whiteSpace: 'nowrap',
                  bgcolor: '#000000',
                  color: '#FFFFFF',
                  boxShadow: 'none',
                  '&:hover': { bgcolor: '#333333', transform: 'translateY(-2px)', boxShadow: 'none' },
                  transition: 'all 0.2s'
                }}
              >
                Download for Mac
              </Button>
              <Button
                component="a"
                href={downloadUrls.windows}
                variant="contained"
                size="large"
                startIcon={<WindowIcon />}
                sx={{
                  flex: 1,
                  width: { xs: '100%', md: 'auto' },
                  borderRadius: '8px',
                  py: { xs: 1.75, md: 2.5 },
                  px: 2.5,
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: { xs: '1rem', md: '1.05rem' },
                  whiteSpace: 'nowrap',
                  bgcolor: '#FFFFFF',
                  color: '#111827',
                  border: '1px solid #D1D5DB',
                  '&:hover': { bgcolor: '#F9FAFB', transform: 'translateY(-2px)', boxShadow: 'none' },
                  transition: 'all 0.2s',
                  boxShadow: 'none',
                }}
              >
                Download for Windows
              </Button>
              <Button
                component="a"
                href={downloadUrls.android}
                variant="contained"
                size="large"
                startIcon={<AndroidIcon />}
                sx={{
                  flex: 1,
                  width: { xs: '100%', md: 'auto' },
                  borderRadius: '8px',
                  py: { xs: 1.75, md: 2.5 },
                  px: 2.5,
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: { xs: '1rem', md: '1.05rem' },
                  whiteSpace: 'nowrap',
                  bgcolor: '#059669',
                  color: '#FFFFFF',
                  '&:hover': { bgcolor: '#047857', transform: 'translateY(-2px)', boxShadow: 'none' },
                  transition: 'all 0.2s',
                  boxShadow: 'none',
                }}
              >
                Download for Android (APK)
              </Button>
            </Box>

            <Button
              variant="outlined"
              size="medium"
              startIcon={<VerifiedUserIcon sx={{ color: '#059669' }} />}
              onClick={handlePlayProtectSafeInstall}
              sx={{
                width: '100%',
                borderRadius: '8px',
                py: 1.25,
                px: 2,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: { xs: '0.875rem', sm: '0.9375rem' },
                bgcolor: 'rgba(16,185,129,0.06)',
                color: '#065F46',
                borderColor: 'rgba(16,185,129,0.35)',
                '&:hover': {
                  bgcolor: 'rgba(16,185,129,0.12)',
                  borderColor: '#059669',
                },
              }}
            >
              {canInstall
                ? 'Install Android App Directly (Play Protect Safe · No APK)'
                : 'Blocked by Android Play Protect / Advanced Protection? Tap Here'}
            </Button>

            <Box sx={{ width: '100%' }}>
              <InstallationNotes onOpenAndroidHelp={() => setAndroidModalOpen(true)} />
            </Box>

            <Paper elevation={0} sx={{ p: 3, width: '100%', bgcolor: 'rgba(0,0,0,0.02)', borderRadius: '12px', border: '1px dashed rgba(0,0,0,0.15)', textAlign: 'left' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                <GitHubIcon sx={{ color: '#374151' }} />
                <Typography variant="body1" sx={{ fontWeight: 600, color: '#111827' }}>
                  Open Source & Developer Friendly
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ color: '#4B5563', lineHeight: 1.6, mb: 2 }}>
                Strictly Spending is an open-source project. We invite developers and tinkerers to install via GitHub. Feel free to collaborate, fork the project, and contribute to building the most private budgeting app available!
              </Typography>
              <Button
                variant="outlined"
                size="small"
                onClick={() => window.open('https://github.com/barnesy/strictly-spending', '_blank')}
                sx={{ textTransform: 'none', fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.15)', '&:hover': { bgcolor: 'rgba(0,0,0,0.04)', borderColor: 'rgba(0,0,0,0.3)' } }}
              >
                View on GitHub
              </Button>
            </Paper>
          </Box>
        </Box>

        {/* Footer Version & Privacy Policy */}
        <Box sx={{ mt: 8, textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
          <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
            v{packageJson.version}
          </Typography>
          <Typography variant="caption" sx={{ color: '#D1D5DB' }}>•</Typography>
          <Typography
            component="a"
            href="./privacy.html"
            variant="caption"
            sx={{ color: '#6B7280', textDecoration: 'none', fontWeight: 600, '&:hover': { textDecoration: 'underline', color: '#111827' } }}
          >
            Privacy Policy
          </Typography>
        </Box>

      </Container>

      <Dialog
        open={androidModalOpen}
        onClose={() => setAndroidModalOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: '14px', p: 0.5 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#111827', pb: 1 }}>
          Installing on Android (Bypassing Play Protect)
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2.25 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: '10px',
              bgcolor: 'rgba(16,185,129,0.07)',
              border: '1px solid rgba(16,185,129,0.3)',
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#065F46', mb: 0.75 }}>
              Option 1 (Recommended): Install as Google-Signed WebAPK (Zero Warnings)
            </Typography>
            <Typography variant="body2" sx={{ color: '#1F2937', lineHeight: 1.55, mb: 1.25 }}>
              When Android <b>Advanced Protection</b> is enabled, Google blocks sideloading raw <code>.apk</code> files from Chrome. Instead, let Chrome & Google Play Services mint a trusted WebAPK directly:
            </Typography>
            <Typography variant="body2" component="div" sx={{ color: '#111827', pl: 1, lineHeight: 1.7 }}>
              1. Tap the <b>⋮ (three-dot menu)</b> at the top-right of Chrome.<br />
              2. Tap <b>"Add to Home screen"</b> → choose <b>"Install"</b>.<br />
              3. Strictly Spending installs into your Android app drawer and launches full-screen without any Play Protect block.
            </Typography>
            {canInstall && (
              <Button
                variant="contained"
                fullWidth
                onClick={async () => {
                  const ok = await promptInstall();
                  if (ok) setAndroidModalOpen(false);
                }}
                sx={{ mt: 1.5, bgcolor: '#059669', '&:hover': { bgcolor: '#047857' }, textTransform: 'none', fontWeight: 700 }}
              >
                Install Android WebAPK Now
              </Button>
            )}
          </Paper>

          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: '10px',
              bgcolor: '#F9FAFB',
              border: '1px solid #E5E7EB',
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#111827', mb: 0.75 }}>
              Option 2: Allow the Native <code>Strictly-Spending-Android-arm64.apk</code>
            </Typography>
            <Typography variant="body2" component="div" sx={{ color: '#374151', lineHeight: 1.65 }}>
              • <b>If Android 15/16 Advanced Protection blocks the install:</b> Open <b>Settings → Security & privacy → Advanced Protection</b> and temporarily toggle off <b>Device protection</b> (or open <b>Google Play Store → Profile icon → Play Protect → ⚙️ Settings → Pause "Scan apps with Play Protect"</b>). Install the APK from your <b>Files / Downloads</b> app, then turn protection right back on.<br />
              • <b>If you see "Unsafe app blocked":</b> Tap <b>"More details"</b> (small link below the text) → tap <b>"Install anyway"</b>.<br />
              • <b>If on Samsung Galaxy (Fold / S-series):</b> Temporarily toggle off <b>Settings → Security and privacy → Auto Blocker</b> during installation.
            </Typography>
          </Paper>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, py: 1.5, justifyContent: 'space-between' }}>
          {onLaunchDemo && (
            <Button
              variant="contained"
              onClick={() => {
                try {
                  localStorage.setItem('strictly_installed_pwa', '1');
                } catch {
                  // ignore
                }
                setAndroidModalOpen(false);
                onLaunchDemo();
              }}
              sx={{ bgcolor: '#2563EB', '&:hover': { bgcolor: '#1D4ED8' }, textTransform: 'none', fontWeight: 700 }}
            >
              Open Full App Right Now
            </Button>
          )}
          <Button onClick={() => setAndroidModalOpen(false)} sx={{ textTransform: 'none', fontWeight: 600, color: '#4B5563' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}


