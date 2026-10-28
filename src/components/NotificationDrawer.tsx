import { useState } from 'react';
import {
  Drawer,
  Box,
  Stack,
  Typography,
  IconButton,
  Button,
  Chip,
  Paper,
  Divider,
  Tooltip,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InsightsIcon from '@mui/icons-material/Insights';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore, type AppNotificationItem } from '../stores/notificationStore';
import { useBudgetStore } from '../stores/budgetStore';
import {
  buildSyncSpendImpactSummary,
  recordSyncImpactNotification,
  checkAndNotifyBudgetAlerts,
} from '../domain/syncImpactNotification';
import { usd } from '../lib';

function formatNotificationTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (isToday) {
      return `Today at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }
    return d.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function NotificationDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const {
    notifications,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
  } = useNotificationStore();
  const alertCategories = useBudgetStore((s) => s.alertCategories);
  const [isChecking, setIsChecking] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleRunSpendImpact = async () => {
    setIsChecking(true);
    try {
      const summary = await buildSyncSpendImpactSummary(0);
      if (summary) {
        recordSyncImpactNotification(summary);
      }
    } finally {
      setIsChecking(false);
    }
  };

  const handleCheckBudgetAlerts = async () => {
    setIsChecking(true);
    try {
      for (const cat of alertCategories) {
        await checkAndNotifyBudgetAlerts(cat);
      }
    } finally {
      setIsChecking(false);
    }
  };

  const handleOpenInAi = (item: AppNotificationItem) => {
    markAsRead(item.id);
    onClose();
    if (item.aiPrompt) {
      window.dispatchEvent(
        new CustomEvent('open-ai-with-prompt', { detail: { prompt: item.aiPrompt } })
      );
    }
  };

  const handleNavigate = (item: AppNotificationItem) => {
    markAsRead(item.id);
    onClose();
    if (item.navigateTo) {
      navigate(item.navigateTo);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100vw', sm: 420 },
          maxWidth: '100vw',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.default',
          borderLeft: '1px solid',
          borderColor: 'divider',
        },
      }}
      sx={{ zIndex: (theme) => theme.zIndex.drawer + 3 }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          pt: 'calc(16px + env(safe-area-inset-top))',
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center">
            <NotificationsActiveIcon color="primary" fontSize="small" />
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem' }}>
              Notifications
            </Typography>
            {unreadCount > 0 && (
              <Chip
                size="small"
                color="primary"
                label={`${unreadCount} unread`}
                sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700, borderRadius: 1 }}
              />
            )}
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            {unreadCount > 0 && (
              <Tooltip title="Mark all as read">
                <IconButton size="small" onClick={markAllAsRead}>
                  <DoneAllIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {notifications.length > 0 && (
              <Tooltip title="Clear all notifications">
                <IconButton size="small" onClick={clearAll}>
                  <DeleteSweepOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <IconButton size="small" onClick={onClose} aria-label="Close notifications">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Review triggered Daily Sync Spend Impact digests and Variable Category Budget Crossed alerts.
        </Typography>

        {/* Quick Check Actions */}
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
          <Button
            size="small"
            variant="outlined"
            disabled={isChecking}
            startIcon={<InsightsIcon sx={{ fontSize: 15 }} />}
            onClick={() => void handleRunSpendImpact()}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.75rem',
              borderRadius: 1,
              py: 0.4,
            }}
          >
            Log Today&apos;s Spend Impact
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={isChecking || alertCategories.size === 0}
            startIcon={<WarningAmberIcon sx={{ fontSize: 15 }} />}
            onClick={() => void handleCheckBudgetAlerts()}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.75rem',
              borderRadius: 1,
              py: 0.4,
            }}
          >
            Check Watched Budgets ({alertCategories.size})
          </Button>
        </Stack>
      </Box>

      {/* Notification List */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 2,
          pb: 'calc(16px + env(safe-area-inset-bottom))',
        }}
      >
        {notifications.length === 0 ? (
          <Paper
            variant="outlined"
            sx={{
              p: 3,
              textAlign: 'center',
              borderRadius: 1,
              bgcolor: 'background.paper',
            }}
          >
            <NotificationsNoneOutlinedIcon
              sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }}
            />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
              No Notifications Yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.82rem', mb: 2 }}>
              Notifications appear here automatically when a SimpleFIN bank sync brings in new transactions or when a watched variable category crosses its monthly budget.
            </Typography>
            <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap>
              <Button
                size="small"
                variant="contained"
                onClick={() => void handleRunSpendImpact()}
                disabled={isChecking}
                sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1 }}
              >
                Generate Today&apos;s Spend Digest
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  onClose();
                  navigate('/budget');
                }}
                sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 1 }}
              >
                Configure Budget Bells
              </Button>
            </Stack>
          </Paper>
        ) : (
          <Stack spacing={1.5}>
            {notifications.map((item) => {
              const isBreach = item.type === 'budget_breach';
              return (
                <Paper
                  key={item.id}
                  elevation={item.read ? 0 : 2}
                  onClick={() => {
                    if (!item.read) markAsRead(item.id);
                  }}
                  sx={{
                    p: 1.75,
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: !item.read
                      ? isBreach
                        ? 'error.main'
                        : 'primary.main'
                      : 'divider',
                    bgcolor: (t) =>
                      !item.read
                        ? alpha(
                            isBreach ? t.palette.error.main : t.palette.primary.main,
                            t.palette.mode === 'dark' ? 0.08 : 0.03
                          )
                        : t.palette.background.paper,
                    transition: 'border-color 0.15s ease, background-color 0.15s ease',
                  }}
                >
                  <Stack spacing={1}>
                    {/* Top Row: Badge + Timestamp + Dismiss */}
                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        {!item.read && (
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              bgcolor: isBreach ? 'error.main' : 'primary.main',
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <Chip
                          size="small"
                          color={isBreach ? 'error' : 'primary'}
                          variant={item.read ? 'outlined' : 'filled'}
                          label={isBreach ? 'Budget Crossed' : 'Sync Spend Impact'}
                          sx={{
                            height: 20,
                            fontSize: '0.66rem',
                            fontWeight: 700,
                            borderRadius: 1,
                          }}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          {formatNotificationTimestamp(item.createdAt)}
                        </Typography>
                      </Stack>
                      <Tooltip title="Remove notification">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeNotification(item.id);
                          }}
                          sx={{ p: 0.25, mr: -0.5 }}
                        >
                          <CloseIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>

                    {/* Title */}
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                      {item.title}
                    </Typography>

                    {/* Body */}
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', lineHeight: 1.45 }}>
                      {item.body}
                    </Typography>

                    {/* Meta summary chips */}
                    {item.meta && (
                      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                        {isBreach &&
                          typeof item.meta.actualSpend === 'number' &&
                          typeof item.meta.budgetAmount === 'number' && (
                            <>
                              <Chip
                                size="small"
                                variant="outlined"
                                color="error"
                                label={`Actual ${usd.format(item.meta.actualSpend)} / ${usd.format(item.meta.budgetAmount)}`}
                                sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, borderRadius: 1 }}
                              />
                              {typeof item.meta.overBy === 'number' && (
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  color="warning"
                                  label={`+${usd.format(item.meta.overBy)} over (${item.meta.pctUsed ?? 0}%)`}
                                  sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, borderRadius: 1 }}
                                />
                              )}
                            </>
                          )}
                        {!isBreach && typeof item.meta.monthSpendToDate === 'number' && (
                          <>
                            <Chip
                              size="small"
                              variant="outlined"
                              color="primary"
                              label={`MTD: ${usd.format(item.meta.monthSpendToDate)}`}
                              sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, borderRadius: 1 }}
                            />
                            {typeof item.meta.projectedAnnualSpend === 'number' && (
                              <Chip
                                size="small"
                                variant="outlined"
                                label={`Pace: ${usd.format(item.meta.projectedAnnualSpend)}/yr`}
                                sx={{ height: 20, fontSize: '0.68rem', fontWeight: 600, borderRadius: 1 }}
                              />
                            )}
                          </>
                        )}
                      </Stack>
                    )}

                    <Divider sx={{ my: 0.25 }} />

                    {/* Actions */}
                    <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                      {item.navigateTo && (
                        <Button
                          size="small"
                          variant="text"
                          endIcon={<OpenInNewIcon sx={{ fontSize: 13 }} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNavigate(item);
                          }}
                          sx={{
                            textTransform: 'none',
                            fontWeight: 600,
                            fontSize: '0.74rem',
                            borderRadius: 1,
                          }}
                        >
                          {item.navigateTo === '/budget' ? 'Open Budget' : 'Open Dashboard'}
                        </Button>
                      )}
                      {item.aiPrompt && (
                        <Button
                          size="small"
                          variant="contained"
                          color={isBreach ? 'error' : 'primary'}
                          startIcon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenInAi(item);
                          }}
                          sx={{
                            textTransform: 'none',
                            fontWeight: 700,
                            fontSize: '0.74rem',
                            borderRadius: 1,
                          }}
                        >
                          Review in Ask AI
                        </Button>
                      )}
                    </Stack>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Box>
    </Drawer>
  );
}
