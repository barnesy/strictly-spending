import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { Link as RouterLink } from 'react-router-dom';
import { sessionStats, useSortStore } from '../sortStore';

/** Stats-driven empty state shown when the Sort queue is empty. */
export default function SortEmptyState() {
  const history = useSortStore((s) => s.history);
  const stats = sessionStats(history);
  const sortedThisSession = stats.merchants > 0;
  const totalDollars = history.reduce(
    (s, d) =>
      s +
      d.txnIds.length *
        (history.find((h) => h.merchantKey === d.merchantKey)?.txnIds.length ?? 0),
    0
  );
  // Better: sum the total |amount| at decision time. Since we don't store it,
  // approximate by counting decisions.
  void totalDollars;

  return (
    <Paper
      sx={{
        p: 6,
        borderRadius: 3,
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Soft celebratory background */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 30% 20%, rgba(52, 211, 153, 0.18), transparent 40%), radial-gradient(circle at 70% 80%, rgba(99, 102, 241, 0.15), transparent 40%)',
          pointerEvents: 'none',
        }}
      />

      <Stack spacing={2} alignItems="center" sx={{ position: 'relative' }}>
        <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main' }} />
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          All caught up.
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 420 }}>
          No uncategorized transactions left. The dashboard reflects every dollar.
        </Typography>

        {sortedThisSession && (
          <Box
            sx={{
              mt: 3,
              p: 2,
              borderRadius: 2,
              bgcolor: 'action.hover',
              minWidth: { xs: 'auto', sm: 320 },
              width: { xs: '100%', sm: 'auto' },
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}
            >
              This session
            </Typography>
            <Stack
              direction="row"
              spacing={3}
              justifyContent="center"
              sx={{ mt: 1, fontVariantNumeric: 'tabular-nums' }}
            >
              <Stat label="Merchants" value={stats.merchants.toString()} />
              <Stat label="Transactions" value={stats.txnCount.toString()} />
              <Stat label="Rules saved" value={stats.rulesCreated.toString()} />
            </Stack>
          </Box>
        )}

        <Stack
          direction="row"
          spacing={1}
          flexWrap="wrap"
          justifyContent="center"
          useFlexGap
          sx={{ mt: 3 }}
        >
          <Button
            variant="contained"
            component={RouterLink}
            to="/"
            sx={{ textTransform: 'none' }}
          >
            Back to dashboard
          </Button>
          <Button
            variant="outlined"
            component={RouterLink}
            to="/import"
            sx={{ textTransform: 'none' }}
          >
            Import more
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}
