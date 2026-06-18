import { useState, useMemo, useRef, useEffect } from 'react';
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
  Button,
} from '@mui/material';
import RepeatIcon from '@mui/icons-material/Repeat';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { usdCents } from '../lib';
import { recurrenceLabel, isRecurring } from '../recurrence';
import { useAnimationStore } from '../animationStore';
import type { SortCard as SortCardData } from '../sort';

interface Props {
  card: SortCardData;
  /** Color of the suggested category, drives the suggestion-highlight stripe. */
  suggestedColor?: string;
  /** Animation state — when 'leaving', card slides off in the destination color. */
  leaving?: { color: string } | null;
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
  leaving,
  suggestedCategoryOverride,
  aiSuggesting = false,
  aiError = null,
  stackIndex = 0,
  zipDirection = 'left',
}: Props) {
  const { merchantKey, txns, totalAbs, sampleTxns, recurrence, suggestedCategory } = card;

  const config = useAnimationStore();
  const [expanded, setExpanded] = useState(false);

  const prevStackIndexRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    prevStackIndexRef.current = stackIndex;
  }, [stackIndex]);

  const sortedTxns = useMemo(() => {
    return [...txns].sort((a, b) => b.date.localeCompare(a.date));
  }, [txns]);

  const displayedTxns = expanded ? sortedTxns : sampleTxns;

  const cadence =
    recurrence && isRecurring(recurrence.kind)
      ? recurrenceLabel(recurrence.kind).toLowerCase()
      : null;

  return (
    <Paper
      sx={(theme) => ({
        p: 3,
        borderRadius: 4,
        borderLeft: suggestedColor ? `5px solid ${suggestedColor}` : '5px solid transparent',
        transition: leaving || stackIndex <= -1
          ? `transform ${config.duration}ms cubic-bezier(${config.bezierX1}, ${config.bezierY1}, ${config.bezierX2}, ${config.bezierY2}), opacity 150ms ease ${config.duration}ms, background-color 200ms ease, box-shadow 450ms ease`
          : stackIndex === 0
          ? `transform ${config.duration}ms cubic-bezier(${config.bezierX1}, ${config.bezierY1}, ${config.bezierX2}, ${config.bezierY2}), opacity 100ms ease-out, background-color 200ms ease, box-shadow 450ms ease`
          : `transform ${config.duration}ms cubic-bezier(${config.bezierX1}, ${config.bezierY1}, ${config.bezierX2}, ${config.bezierY2}), opacity 300ms ease-out, background-color 200ms ease, box-shadow 450ms ease`,
        transform: leaving
          ? `perspective(1200px) translate3d(${config.finalXRight}px, ${config.finalY}px, ${config.finalZ}px) rotateX(${config.finalRotationX}deg) rotateY(${config.finalRotationY}deg) rotateZ(${config.finalRotationZ}deg) scale(${config.finalScale})`
          : stackIndex === 0
          ? `perspective(1200px) translate3d(${config.startX}px, ${config.startY}px, ${config.startZ}px) rotateX(${config.startRotationX}deg) rotateY(${config.startRotationY}deg) rotateZ(${config.startRotationZ}deg) scale(${config.startScale})`
          : stackIndex === 1
          ? 'perspective(1200px) translate3d(0, 16px, -45px) rotateX(7deg) rotateY(-7deg) rotateZ(-1.5deg) scale(0.96)'
          : stackIndex === 2
          ? 'perspective(1200px) translate3d(0, 32px, -90px) rotateX(9deg) rotateY(-9deg) rotateZ(-3deg) scale(0.92)'
          : stackIndex <= -1
          ? zipDirection === 'right'
            ? `perspective(1200px) translate3d(${config.finalXRight}px, ${config.finalY}px, ${config.finalZ}px) rotateX(${config.finalRotationX}deg) rotateY(${config.finalRotationY}deg) rotateZ(${config.finalRotationZ}deg) scale(${config.finalScale})`
            : `perspective(1200px) translate3d(${config.finalXLeft}px, ${config.finalY}px, ${config.finalZ}px) rotateX(${config.finalRotationX}deg) rotateY(-${config.finalRotationY}deg) rotateZ(${config.finalRotationZ}deg) scale(${config.finalScale})`
          : 'perspective(1200px) translate3d(0, 48px, -135px) rotateX(11deg) rotateY(-11deg) rotateZ(-4.5deg) scale(0.88)',
        opacity: leaving
          ? 0
          : stackIndex >= 0 && stackIndex <= 2
          ? 1
          : 0,
        boxShadow: stackIndex === 0 || leaving
          ? theme.palette.mode === 'dark'
            ? '0 1px 0 #2c2c2c, 0 2px 0 #242424, 0 3px 0 #1c1c1c, 0 4px 0 #141414, 0 30px 60px -15px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08)'
            : '0 1px 0 #e5e5e5, 0 2px 0 #dbdbdb, 0 3px 0 #d1d1d1, 0 4px 0 #c7c7c7, 0 30px 60px -15px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)'
          : stackIndex === 1
          ? theme.palette.mode === 'dark'
            ? '0 1px 0 #282828, 0 2px 0 #202020, 0 3px 0 #181818, 0 20px 40px -10px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)'
            : '0 1px 0 #e0e0e0, 0 2px 0 #d6d6d6, 0 3px 0 #cccccc, 0 20px 40px -10px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)'
          : theme.palette.mode === 'dark'
          ? '0 1px 0 #242424, 0 2px 0 #1c1c1c, 0 10px 20px -5px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)'
          : '0 1px 0 #dbdbdb, 0 2px 0 #d1d1d1, 0 10px 20px -5px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.03)',
        bgcolor: leaving ? leaving.color + '22' : 'background.paper',
        position: stackIndex === 0 ? 'relative' : 'absolute',
        top: stackIndex === 0 ? 'auto' : 0,
        left: stackIndex === 0 ? 'auto' : 0,
        width: '100%',
        minHeight: 480,
        zIndex: leaving ? 11 : stackIndex <= -1 ? 7 : 10 - stackIndex,
        pointerEvents: stackIndex === 0 ? 'auto' : 'none',
        overflow: 'hidden',
        animation: leaving
          ? zipDirection === 'right'
            ? `exitFlipRight ${config.duration}ms cubic-bezier(${config.bezierX1}, ${config.bezierY1}, ${config.bezierX2}, ${config.bezierY2}) forwards`
            : `exitFlipLeft ${config.duration}ms cubic-bezier(${config.bezierX1}, ${config.bezierY1}, ${config.bezierX2}, ${config.bezierY2}) forwards`
          : stackIndex === 0 && prevStackIndexRef.current === -1
          ? zipDirection === 'right'
            ? `entryFlipRight ${config.duration}ms cubic-bezier(${config.bezierX1}, ${config.bezierY1}, ${config.bezierX2}, ${config.bezierY2}) forwards`
            : `entryFlipLeft ${config.duration}ms cubic-bezier(${config.bezierX1}, ${config.bezierY1}, ${config.bezierX2}, ${config.bezierY2}) forwards`
          : stackIndex <= -1 && prevStackIndexRef.current === 0
          ? zipDirection === 'right'
            ? `exitFlipRight ${config.duration}ms cubic-bezier(${config.bezierX1}, ${config.bezierY1}, ${config.bezierX2}, ${config.bezierY2}) forwards`
            : `exitFlipLeft ${config.duration}ms cubic-bezier(${config.bezierX1}, ${config.bezierY1}, ${config.bezierX2}, ${config.bezierY2}) forwards`
          : 'none',
      })}
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
      <Box sx={{ mt: 2 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}
        >
          {expanded ? 'All transactions' : 'Recent transactions'}
        </Typography>
        <Table size="small" sx={{ mt: 0.5 }}>
          <TableBody>
            {displayedTxns.map((t) => (
              <TableRow key={t.id} sx={{ '& td': { borderBottom: 'none', py: 0.5 } }}>
                <TableCell sx={{ width: 140, whiteSpace: 'nowrap', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
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
            {txns.length > 10 && (
              <TableRow sx={{ '& td': { borderBottom: 'none', py: 0.5 } }}>
                <TableCell colSpan={3} sx={{ textAlign: 'center', py: 1 }}>
                  <Button
                    size="small"
                    variant="text"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded(!expanded);
                    }}
                    sx={{ textTransform: 'none', fontWeight: 600, py: 0 }}
                  >
                    {expanded ? 'Show less' : `Show ${txns.length - 10} more...`}
                  </Button>
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
