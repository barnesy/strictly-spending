import { useState } from 'react';
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
import { getDirectPwaTesterUrl } from '../utils/pwaInstall';

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
  const [copied, setCopied] = useState(false);
  const testerUrl = getDirectPwaTesterUrl();
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(testerUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleNativeShare = async () => {
    if (canNativeShare) {
      try {
        await navigator.share({
          title: 'Strictly Spending (iPhone Tester App)',
          text: 'Test Strictly Spending on iPhone — tap to open the app or choose Share → Add to Home Screen:',
          url: testerUrl,
        });
        return;
      } catch {
        // user cancelled or share failed; fall back to copy
      }
    }
    await handleCopyLink();
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
        <span>Install & Test on iPhone (iOS)</span>
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
            1. Direct iPhone Tester Link (Skips Landing Page)
          </Typography>
          <Typography variant="body2" sx={{ color: '#374151', lineHeight: 1.5, mb: 1.25 }}>
            Send this link via iMessage or AirDrop to any iPhone tester. Opening it with <code>?pwa=1</code> boots straight into the full mobile app with sample household data ready to test:
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
                onClick={handleCopyLink}
                startIcon={copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                sx={{
                  bgcolor: copied ? '#059669' : '#2563EB',
                  color: '#FFFFFF',
                  '&:hover': { bgcolor: copied ? '#047857' : '#1D4ED8' },
                  textTransform: 'none',
                  fontWeight: 700,
                }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </Button>
              {canNativeShare && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleNativeShare}
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
            2. Install Full-Screen iPhone App (Add to Home Screen)
          </Typography>
          <Typography variant="body2" sx={{ color: '#4B5563', lineHeight: 1.5, mb: 1.5 }}>
            iOS supports standalone WebApps with a native Home Screen icon, full-screen safe-area layout, and persistent on-device storage:
          </Typography>

          <Stack spacing={1.25}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
              <Chip
                label="Step 1"
                size="small"
                sx={{ fontWeight: 700, bgcolor: '#E0E7FF', color: '#1E40AF', height: 22, fontSize: '0.72rem', mt: 0.2 }}
              />
              <Typography variant="body2" sx={{ color: '#1F2937', lineHeight: 1.5 }}>
                Open the link in <b>Safari</b> (or Chrome) on iPhone and tap the <b>Share</b> button{' '}
                <IosShareIcon sx={{ fontSize: 16, verticalAlign: 'text-bottom', color: '#2563EB' }} /> in the browser toolbar.
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
              <Chip
                label="Step 2"
                size="small"
                sx={{ fontWeight: 700, bgcolor: '#E0E7FF', color: '#1E40AF', height: 22, fontSize: '0.72rem', mt: 0.2 }}
              />
              <Typography variant="body2" sx={{ color: '#1F2937', lineHeight: 1.5 }}>
                Scroll down the share sheet and tap <b>&ldquo;Add to Home Screen&rdquo;</b>{' '}
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
                Tap <b>&ldquo;Add&rdquo;</b> in the top-right corner. Launch <b>Strictly</b> from your Home Screen — it runs full-screen with sample data, CSV import, SimpleFIN bank sync, and on-device AI!
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
