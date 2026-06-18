import { useState, useMemo, useEffect } from 'react';
import {
  Box,
  Chip,
  Stack,
  Typography,
  Table,
  TableBody,
  TableRow,
  TableCell,
  Button,
} from '@mui/material';
import RepeatIcon from '@mui/icons-material/Repeat';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { usdCents } from '../lib';
import { recurrenceLabel, isRecurring } from '../recurrence';
import type { SortCard as SortCardData } from '../sort';
import AnimatedCard from './AnimatedCard';

interface Props {
  card: SortCardData;
  /** Color of the suggested category, drives the suggestion-highlight stripe. */
  suggestedColor?: string;
  /** The color of the chosen category when a card is sorted. */
  chosenColor?: string;
  /** Optional override for suggestion, e.g. from the background AI process */
  suggestedCategoryOverride?: string | null;
  /** Whether the AI guess is loading in the background */
  aiSuggesting?: boolean;
  /** Any error returned from the AI guess */
  aiError?: string | null;
  /** Position of the card in the 3D stack (0 is active card on top, 1 is next, etc.) */
  stackIndex?: number;
  /** Direction to zip off: 'left' (history/skipped) or 'right' (completed/leaving) */
  zipDirection?: 'left' | 'right';
}

/**
 * The presentational card: merchant name, occurrence/total/recurrence meta,
 * sample transactions, and a "Suggested" badge tinted to the suggestion's
 * color. The category grid is rendered separately by the Sort page.
 */
export default function SortCard({
  card,
  suggestedColor,
  chosenColor,
  suggestedCategoryOverride,
  aiSuggesting = false,
  aiError = null,
  stackIndex = 0,
  zipDirection = 'right',
}: Props) {
  const { merchantKey, txns, totalAbs, recurrence, suggestedCategory } = card;

  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [merchantKey]);

  const sortedTxns = useMemo(() => {
    return [...txns].sort((a, b) => b.date.localeCompare(a.date));
  }, [txns]);

  const displayedTxns = expanded ? sortedTxns : sortedTxns.slice(0, 6);

  const cadence =
    recurrence && isRecurring(recurrence.kind)
      ? recurrenceLabel(recurrence.kind).toLowerCase()
      : null;

  return (
    <AnimatedCard
      suggestedColor={suggestedColor}
      chosenColor={chosenColor}
      stackIndex={stackIndex}
      zipDirection={zipDirection}
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

        {aiSuggesting ? (
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
              AI Suggestion
            </Typography>
            <Chip
              size="small"
              label="Thinking..."
              color="primary"
              variant="outlined"
              sx={{
                fontWeight: 600,
                animation: 'pulse 1.5s infinite ease-in-out',
                '@keyframes pulse': {
                  '0%': { opacity: 0.6 },
                  '50%': { opacity: 1 },
                  '100%': { opacity: 0.6 },
                },
              }}
            />
            <Typography variant="caption" color="text.secondary">
              Querying local LLM...
            </Typography>
          </Stack>
        ) : aiError ? (
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
              AI Suggestion
            </Typography>
            <Chip
              size="small"
              label="Ollama Offline"
              color="error"
              variant="outlined"
              sx={{ fontWeight: 600 }}
            />
            <Typography variant="caption" color="error" sx={{ maxWidth: 150, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {aiError}
            </Typography>
          </Stack>
        ) : suggestedCategoryOverride ? (
          <Stack alignItems="flex-end" spacing={0.5}>
            <Typography
              variant="caption"
              sx={{
                color: 'primary.main',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 700,
              }}
            >
              AI Suggested
            </Typography>
            <Chip
              size="small"
              label={suggestedCategoryOverride}
              sx={{
                bgcolor: (suggestedColor ?? '#1976d2') + '22',
                color: suggestedColor ?? 'primary.main',
                fontWeight: 600,
                border: `1px solid ${suggestedColor ?? 'primary.main'}`,
              }}
            />
            <Typography variant="caption" color="text.secondary">
              Press <kbd style={kbdStyle}>Enter</kbd> to accept
            </Typography>
          </Stack>
        ) : suggestedCategory ? (
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
        ) : null}
      </Stack>

      {/* Recent samples */}
      <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, mb: 0.5 }}
        >
          {expanded ? 'All transactions' : 'Recent transactions'}
        </Typography>
        <Box sx={{ flex: 1, overflowY: 'auto', pr: 0.5 }}>
          <Table size="small">
            <TableBody>
              {displayedTxns.map((t) => (
                <TableRow key={t.id} sx={{ '& td': { borderBottom: 'none', py: 0.5 } }}>
                  <TableCell sx={{ width: 140, whiteSpace: 'nowrap', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                    {t.date}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary' }}>
                    {t.description.slice(0, 60)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    {usdCents.format(t.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        {txns.length > 6 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
            <Button
              size="small"
              variant="text"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              sx={{ textTransform: 'none', fontWeight: 600, py: 0 }}
            >
              {expanded ? 'Show less' : `Show ${txns.length - 6} more...`}
            </Button>
          </Box>
        )}
      </Box>
    </AnimatedCard>
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
