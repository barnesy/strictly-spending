import {
  Box,
  Chip,
  Paper,
  Stack,
  Typography,
  Table,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material';
import RepeatIcon from '@mui/icons-material/Repeat';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { usdCents } from '../lib';
import { recurrenceLabel, isRecurring } from '../recurrence';
import type { SortCard as SortCardData } from '../sort';

interface Props {
  card: SortCardData;
  /** Color of the suggested category, drives the suggestion-highlight stripe. */
  suggestedColor?: string;
  /** Animation state — when 'leaving', card slides off in the destination color. */
  leaving?: { color: string } | null;
}

/**
 * The presentational card: merchant name, occurrence/total/recurrence meta,
 * sample transactions, and a "Suggested" badge tinted to the suggestion's
 * color. The category grid is rendered separately by the Sort page.
 */
export default function SortCard({ card, suggestedColor, leaving }: Props) {
  const { merchantKey, txns, totalAbs, sampleTxns, recurrence, suggestedCategory } = card;

  const cadence =
    recurrence && isRecurring(recurrence.kind)
      ? recurrenceLabel(recurrence.kind).toLowerCase()
      : null;

  return (
    <Paper
      sx={{
        p: 3,
        borderRadius: 3,
        borderLeft: suggestedColor ? `4px solid ${suggestedColor}` : '4px solid transparent',
        transition: 'transform 250ms ease, opacity 200ms ease, background-color 200ms ease',
        transform: leaving ? 'translateX(60%) rotate(2deg) scale(0.98)' : 'none',
        opacity: leaving ? 0 : 1,
        bgcolor: leaving ? leaving.color + '22' : 'background.paper',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        spacing={2}
        alignItems="flex-start"
        justifyContent="space-between"
        flexWrap="wrap"
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              textTransform: 'capitalize',
              wordBreak: 'break-word',
            }}
          >
            {merchantKey || '(no merchant key)'}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }} flexWrap="wrap">
            <Typography variant="body2" color="text.secondary">
              {txns.length} occurrence{txns.length === 1 ? '' : 's'}
            </Typography>
            <Typography variant="body2" color="text.secondary">·</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {usdCents.format(totalAbs)} total
            </Typography>
            {cadence && (
              <>
                <Typography variant="body2" color="text.secondary">·</Typography>
                <Chip
                  size="small"
                  icon={<RepeatIcon sx={{ fontSize: 14 }} />}
                  label={`seen ${cadence}`}
                  variant="outlined"
                  sx={{ height: 22 }}
                />
              </>
            )}
            {card.amountSign === 'income' && (
              <Chip
                size="small"
                icon={<TrendingUpIcon sx={{ fontSize: 14 }} />}
                label="net positive"
                color="success"
                variant="outlined"
                sx={{ height: 22 }}
              />
            )}
          </Stack>
        </Box>

        {suggestedCategory && (
          <Stack alignItems="flex-end" spacing={0.5}>
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 600,
              }}
            >
              Suggested
            </Typography>
            <Chip
              size="small"
              label={suggestedCategory}
              sx={{
                bgcolor: (suggestedColor ?? '#9e9e9e') + '22',
                color: suggestedColor ?? 'text.primary',
                fontWeight: 600,
                border: `1px solid ${suggestedColor ?? 'divider'}`,
              }}
            />
            <Typography variant="caption" color="text.secondary">
              Press <kbd style={kbdStyle}>Enter</kbd> to accept
            </Typography>
          </Stack>
        )}
      </Stack>

      {/* Recent samples */}
      <Box sx={{ mt: 2 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}
        >
          Recent transactions
        </Typography>
        <Table size="small" sx={{ mt: 0.5 }}>
          <TableBody>
            {sampleTxns.map((t) => (
              <TableRow key={t.id} sx={{ '& td': { borderBottom: 'none', py: 0.5 } }}>
                <TableCell sx={{ width: 110, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                  {t.date}
                </TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary' }}>
                  {t.description.slice(0, 60)}
                </TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                  {usdCents.format(t.amount)}
                </TableCell>
              </TableRow>
            ))}
            {txns.length > sampleTxns.length && (
              <TableRow sx={{ '& td': { borderBottom: 'none', py: 0.5 } }}>
                <TableCell colSpan={3} sx={{ color: 'text.secondary', fontStyle: 'italic', fontSize: 12 }}>
                  …and {txns.length - sampleTxns.length} more
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
}

const kbdStyle: React.CSSProperties = {
  border: '1px solid currentColor',
  borderRadius: 3,
  padding: '0 4px',
  fontSize: 10,
  fontFamily: 'inherit',
  opacity: 0.7,
};
