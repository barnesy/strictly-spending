import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Paper,
  Box,
  Stack,
  Chip,
} from '@mui/material';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import IosShareIcon from '@mui/icons-material/IosShare';
import AddBoxOutlinedIcon from '@mui/icons-material/AddBoxOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import ShareIcon from '@mui/icons-material/Share';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StorageIcon from '@mui/icons-material/Storage';
import { getDirectPwaTesterUrl } from '../utils/pwaInstall';
import { api } from '../api';

interface IphoneInstallModalProps {
  open: boolean;
  onClose: () => void;
  onLaunchAppNow?: () => void;
}

export default function IphoneInstallModal({
  open,
  onClose,
  onLaunchAppNow,
}: IphoneInstallModalProps) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [pcSqliteUrls, setPcSqliteUrls] = useState<string[]>([]);
  const testerUrl = getDirectPwaTesterUrl();
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    if (!open) return;
    api
      .getMcpServerInfo()
      .then((info) => {
        if (info?.localUrls && info.localUrls.length > 0) {
          setPcSqliteUrls(info.localUrls.map((u) => `${u.replace(/\/+$/, '')}/?pwa=1`));
        } else if (
          typeof window !== 'undefined' &&
          (window.location.hostname.startsWith('192.168.') || window.location.hostname.startsWith('100.'))
        ) {
          setPcSqliteUrls([`${window.location.origin}/?pwa=1`]);
        }
      })
      .catch(() => {});
  }, [open]);

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleNativeShare = async (url: string, title: string) => {
    if (canNativeShare) {
      try {
        await navigator.share({
          title,
          text: 'Open in Safari/Chrome and choose Share → Add to Home Screen:',
          url,
        });
        return;
      } catch {
        // user cancelled or share failed; fall back to copy
      }
    }
    await handleCopyUrl(url);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '14px',
          p: 0.5,
          bgcolor: '#FFFFFF',
          color: '#111827',
        },
      }}
    >
      <DialogTitle
        sx={{
          fontWeight: 800,
          color: '#111827',
          pb: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <PhoneIphoneIcon sx={{ color: '#2563EB' }} />
        <span>Install on iPhone / Mobile Home Screen</span>
        <Chip
          label="No App Store / $0"
          size="small"
          sx={{
            ml: 'auto',
            bgcolor: 'rgba(37,99,235,0.1)',
            color: '#1D4ED8',
            fontWeight: 700,
            fontSize: '0.72rem',
          }}
        />
      </DialogTitle>

      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, borderColor: '#E5E7EB' }}>
        {pcSqliteUrls.length > 0 && (
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: '10px',
              bgcolor: 'rgba(5,150,105,0.07)',
              border: '1px solid rgba(5,150,105,0.35)',
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <StorageIcon sx={{ fontSize: 18, color: '#059669' }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#065F46' }}>
                Option A (Recommended): Live PC SQLite Home Screen App
              </Typography>
              <Chip
                label="Uses spending-viz.sqlite"
                size="small"
                sx={{
                  bgcolor: '#D1FAE5',
                  color: '#065F46',
                  fontWeight: 700,
                  fontSize: '0.68rem',
                  height: 20,
                }}
              />
            </Stack>
            <Typography variant="body2" sx={{ color: '#374151', lineHeight: 1.5, mb: 1.25 }}>
              Open this Wi-Fi / Tailscale link on your phone and tap <b>Share → Add to Home Screen</b>. Every read and write on your phone goes directly to your PC&apos;s real SQLite database instead of browser LocalStorage:
            </Typography>

            <Stack spacing={1}>
              {pcSqliteUrls.map((sqlUrl) => {
                const isCopied = copiedUrl === sqlUrl;
                return (
                  <Box
                    key={sqlUrl}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                      bgcolor: '#FFFFFF',
                      borderRadius: '8px',
                      p: 1,
                      pl: 1.5,
                      border: '1px solid #A7F3D0',
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: '#065F46',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {sqlUrl}
                    </Typography>
                    <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => handleCopyUrl(sqlUrl)}
                        startIcon={isCopied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                        sx={{
                          bgcolor: isCopied ? '#047857' : '#059669',
                          color: '#FFFFFF',
                          '&:hover': { bgcolor: '#047857' },
                          textTransform: 'none',
                          fontWeight: 700,
                        }}
                      >
                        {isCopied ? 'Copied!' : 'Copy'}
                      </Button>
                      {canNativeShare && (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleNativeShare(sqlUrl, 'Strictly Spending (PC SQLite)')}
                          startIcon={<ShareIcon fontSize="small" />}
                          sx={{
                            borderColor: '#6EE7B7',
                            color: '#065F46',
                            textTransform: 'none',
                            fontWeight: 700,
                          }}
                        >
                          Share
                        </Button>
                      )}
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </Paper>
        )}

        {/* Direct Tester Link Card */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderRadius: '10px',
            bgcolor: 'rgba(37,99,235,0.06)',
            border: '1px solid rgba(37,99,235,0.25)',
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#1E40AF', mb: 0.5 }}>
            {pcSqliteUrls.length > 0
              ? 'Option B: Standalone Cloud PWA (On-Device LocalStorage)'
              : '1. Direct iPhone Tester Link (Skips Landing Page)'}
          </Typography>
          <Typography variant="body2" sx={{ color: '#374151', lineHeight: 1.5, mb: 1.25 }}>
            Hosted on GitHub Pages with isolated phone <code>localStorage</code> (does not require your PC to be on, or you can sync a snapshot from your PC in Settings):
          </Typography>

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              bgcolor: '#FFFFFF',
              borderRadius: '8px',
              p: 1,
              pl: 1.5,
              border: '1px solid #D1D5DB',
            }}
          >
            <Typography
              variant="body2"
              sx={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '0.78rem',
                color: '#111827',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {testerUrl}
            </Typography>
            <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
              <Button
                size="small"
                variant="contained"
                onClick={() => handleCopyUrl(testerUrl)}
                startIcon={copiedUrl === testerUrl ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                sx={{
                  bgcolor: copiedUrl === testerUrl ? '#059669' : '#2563EB',
                  color: '#FFFFFF',
                  '&:hover': { bgcolor: copiedUrl === testerUrl ? '#047857' : '#1D4ED8' },
                  textTransform: 'none',
                  fontWeight: 700,
                }}
              >
                {copiedUrl === testerUrl ? 'Copied!' : 'Copy'}
              </Button>
              {canNativeShare && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => handleNativeShare(testerUrl, 'Strictly Spending (Cloud PWA)')}
                  startIcon={<ShareIcon fontSize="small" />}
                  sx={{
                    borderColor: '#93C5FD',
                    color: '#1D4ED8',
                    textTransform: 'none',
                    fontWeight: 700,
                  }}
                >
                  Share
                </Button>
              )}
            </Stack>
          </Box>
        </Paper>

        {/* 3-Step Add to Home Screen Guide */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderRadius: '10px',
            bgcolor: '#F9FAFB',
            border: '1px solid #E5E7EB',
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#111827', mb: 1 }}>
            How to Add to Home Screen (iPhone &amp; Android)
          </Typography>
          <Typography variant="body2" sx={{ color: '#4B5563', lineHeight: 1.5, mb: 1.5 }}>
            Adding either link above to your Home Screen creates a full-screen standalone app icon:
          </Typography>

          <Stack spacing={1.25}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
              <Chip
                label="Step 1"
                size="small"
                sx={{ fontWeight: 700, bgcolor: '#E0E7FF', color: '#1E40AF', height: 22, fontSize: '0.72rem', mt: 0.2 }}
              />
              <Typography variant="body2" sx={{ color: '#1F2937', lineHeight: 1.5 }}>
                Open the link in <b>Safari</b> (iOS) or <b>Chrome</b> (Android) and tap the <b>Share / Menu</b> button{' '}
                <IosShareIcon sx={{ fontSize: 16, verticalAlign: 'text-bottom', color: '#2563EB' }} />.
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
              <Chip
                label="Step 2"
                size="small"
                sx={{ fontWeight: 700, bgcolor: '#E0E7FF', color: '#1E40AF', height: 22, fontSize: '0.72rem', mt: 0.2 }}
              />
              <Typography variant="body2" sx={{ color: '#1F2937', lineHeight: 1.5 }}>
                Tap <b>&ldquo;Add to Home Screen&rdquo;</b>{' '}
                <AddBoxOutlinedIcon sx={{ fontSize: 16, verticalAlign: 'text-bottom', color: '#2563EB' }} />.
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
              <Chip
                label="Step 3"
                size="small"
                sx={{ fontWeight: 700, bgcolor: '#E0E7FF', color: '#1E40AF', height: 22, fontSize: '0.72rem', mt: 0.2 }}
              />
              <Typography variant="body2" sx={{ color: '#1F2937', lineHeight: 1.5 }}>
                Launch <b>Strictly</b> from your Home Screen. You can verify which database engine is active anytime under <b>Settings → Mobile Web &amp; Database Connection</b>!
              </Typography>
            </Box>
          </Stack>
        </Paper>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5, justifyContent: 'space-between' }}>
        {onLaunchAppNow ? (
          <Button
            variant="contained"
            startIcon={<PlayArrowIcon />}
            onClick={() => {
              try {
                localStorage.setItem('strictly_installed_pwa', '1');
              } catch {
                // ignore storage errors
              }
              onClose();
              onLaunchAppNow();
            }}
            sx={{
              bgcolor: '#2563EB',
              color: '#FFFFFF',
              '&:hover': { bgcolor: '#1D4ED8' },
              textTransform: 'none',
              fontWeight: 700,
            }}
          >
            Open Full iPhone App Now
          </Button>
        ) : (
          <Box />
        )}
        <Button onClick={onClose} sx={{ textTransform: 'none', fontWeight: 600, color: '#4B5563' }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
