import { useState } from 'react';
import {
  Box,
  Button,
  Stack,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { db } from '../db';
import type { Category } from '../types';

interface Props {
  categories: Category[];
  /** Suggested category name (for highlight ring + Enter shortcut). */
  suggested: string | null;
  onPick: (categoryName: string) => void;
  /** When true, hide non-spend categories. */
  spendOnly?: boolean;
}

const PALETTE = [
  '#4caf50', '#ff7043', '#5c6bc0', '#ab47bc', '#26a69a',
  '#42a5f5', '#ec407a', '#ffa726', '#66bb6a', '#8d6e63',
];

/**
 * Renders all categories as colored buttons. The first 9 visible buttons
 * show keyboard hints (1-9). The "More" toggle reveals everything else.
 * The suggested category gets a thicker border + small label.
 */
export default function SortCategoryGrid({
  categories,
  suggested,
  onPick,
  spendOnly = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PALETTE[0]);

  // Sort: suggested first, then spend categories, then income/transfer if
  // not in spend-only mode. Within each band, preserve sortOrder.
  const visible = (() => {
    const filtered = spendOnly
      ? categories.filter((c) => c.type === 'spend')
      : categories;
    const dropped = filtered.filter((c) => c.name !== 'Uncategorized');
    const sug = dropped.find((c) => c.name === suggested);
    const rest = dropped.filter((c) => c.name !== suggested);
    rest.sort((a, b) => a.sortOrder - b.sortOrder);
    return sug ? [sug, ...rest] : rest;
  })();

  const PRIMARY_COUNT = 9;
  const primary = visible.slice(0, PRIMARY_COUNT);
  const overflow = visible.slice(PRIMARY_COUNT);

  const onCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    const existing = await db.categories.where('name').equals(name).first();
    if (existing) {
      onPick(existing.name);
    } else {
      const maxSort = Math.max(...categories.map((c) => c.sortOrder), 0);
      await db.categories.add({
        name,
        color: newColor,
        type: 'spend',
        sortOrder: maxSort + 1,
      } as Category);
      onPick(name);
    }
    setCreateOpen(false);
    setNewName('');
  };

  const renderButton = (cat: Category, idx: number | null) => {
    const isSuggested = cat.name === suggested;
    return (
      <Button
        key={cat.name}
        onClick={() => onPick(cat.name)}
        variant="outlined"
        sx={{
          textTransform: 'none',
          justifyContent: 'flex-start',
          gap: 1,
          px: 1.5,
          py: 1,
          minWidth: 0,
          flex: '1 1 calc(33.333% - 8px)',
          borderColor: isSuggested ? cat.color : 'divider',
          borderWidth: isSuggested ? 2 : 1,
          color: 'text.primary',
          bgcolor: 'background.paper',
          '&:hover': {
            bgcolor: cat.color + '14',
            borderColor: cat.color,
          },
          position: 'relative',
        }}
      >
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            bgcolor: cat.color,
            flexShrink: 0,
          }}
        />
        <Typography
          variant="body2"
          sx={{
            fontWeight: isSuggested ? 600 : 500,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'left',
          }}
        >
          {cat.name}
        </Typography>
        {idx !== null && (
          <Box
            sx={{
              fontSize: 11,
              fontWeight: 600,
              color: 'text.secondary',
              bgcolor: 'action.hover',
              borderRadius: 1,
              px: 0.75,
              py: 0.125,
              minWidth: 18,
              textAlign: 'center',
              flexShrink: 0,
            }}
          >
            {idx + 1}
          </Box>
        )}
      </Button>
    );
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" flexWrap="wrap" gap={1}>
        {primary.map((c, i) => renderButton(c, i))}
      </Stack>

      {(overflow.length > 0 || true) && (
        <Stack direction="row" spacing={1} alignItems="center">
          {overflow.length > 0 && (
            <Button
              size="small"
              startIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              onClick={() => setExpanded((v) => !v)}
              sx={{ textTransform: 'none', color: 'text.secondary' }}
            >
              {expanded ? 'Less' : `${overflow.length} more`}
            </Button>
          )}
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setCreateOpen(true)}
            sx={{ textTransform: 'none', color: 'text.secondary' }}
          >
            New category
          </Button>
        </Stack>
      )}

      {expanded && overflow.length > 0 && (
        <Stack direction="row" flexWrap="wrap" gap={1}>
          {overflow.map((c) => renderButton(c, null))}
        </Stack>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New category</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              fullWidth
              size="small"
            />
            <Stack direction="row" spacing={0.5} flexWrap="wrap">
              {PALETTE.map((color) => (
                <IconButton
                  key={color}
                  onClick={() => setNewColor(color)}
                  sx={{
                    width: 32,
                    height: 32,
                    bgcolor: color,
                    border: newColor === color ? '3px solid' : '1px solid',
                    borderColor: newColor === color ? 'text.primary' : 'divider',
                    '&:hover': { bgcolor: color, opacity: 0.85 },
                  }}
                />
              ))}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={onCreate} disabled={!newName.trim()}>
            Create &amp; apply
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
