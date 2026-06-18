import React, { useState, useEffect } from 'react';
import { Box, Stack, Paper, Button, TextField, Checkbox, Select, MenuItem, Typography, Divider } from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { refreshRecurrenceAll } from '../../recurrence';
import type { ProposedCategorizationItem, ProposedCategorizationReport } from '../../types';
import type { ChatMessage } from '../../ai';

export interface GenUXConfirmationProps {
  options: string[];
  onConfirm: (text: string) => void;
  disabled?: boolean;
}

export function GenUXConfirmation({ options, onConfirm, disabled }: GenUXConfirmationProps) {
  const [submitted, setSubmitted] = useState(false);
  const confirmText = options[0] || 'Confirm';
  const cancelText = options[1] || 'Cancel';

  const handleClick = (text: string) => {
    setSubmitted(true);
    onConfirm(text);
  };

  const isDisabled = disabled || submitted;

  return (
    <Box sx={{ width: '85%', mt: 0.5 }}>
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          bgcolor: 'background.paper',
          borderColor: 'divider',
          borderRadius: 1,
        }}
      >
        <Stack direction="row" spacing={2} justifyContent="flex-start">
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={() => handleClick(confirmText)}
            disabled={isDisabled}
            sx={{ textTransform: 'none', borderRadius: 1, fontWeight: 600 }}
          >
            {confirmText}
          </Button>
          <Button
            variant="outlined"
            color="inherit"
            size="small"
            onClick={() => handleClick(cancelText)}
            disabled={isDisabled}
            sx={{ textTransform: 'none', borderRadius: 1, fontWeight: 600 }}
          >
            {cancelText}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}

export interface GenUXFormProps {
  options: string[];
  onSubmit: (formattedResponse: string) => void;
  disabled?: boolean;
}

export function GenUXForm({ options, onSubmit, disabled }: GenUXFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const handleFieldChange = (field: string, val: string) => {
    setValues(prev => ({ ...prev, [field]: val }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const summary = `Submitted form details: ${options.map(opt => `${opt}: "${values[opt] || ''}"`).join(', ')}`;
    onSubmit(summary);
  };

  const isDisabled = disabled || submitted;

  return (
    <Box sx={{ width: '85%', mt: 0.5 }}>
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          bgcolor: 'background.paper',
          borderColor: 'divider',
          borderRadius: 1,
        }}
      >
        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2}>
            {options.map((opt) => (
              <TextField
                key={opt}
                label={opt}
                size="small"
                fullWidth
                value={values[opt] || ''}
                onChange={(e) => handleFieldChange(opt, e.target.value)}
                disabled={isDisabled}
                slotProps={{
                  inputLabel: { shrink: true }
                }}
              />
            ))}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                type="submit"
                variant="contained"
                size="small"
                disabled={isDisabled}
                sx={{ textTransform: 'none', borderRadius: 1, fontWeight: 600 }}
              >
                Submit Form
              </Button>
            </Box>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}

export function ProposedCategorizationReportUX({
  message,
  onUpdateMessageResult,
  disabled,
}: {
  message: ChatMessage;
  onUpdateMessageResult: (actionResult: any) => Promise<void>;
  disabled?: boolean;
}) {
  const [items, setItems] = useState<ProposedCategorizationItem[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), []);
  const reportSetting = useLiveQuery(() => db.settings.get('app:pendingCategorizationReport'), []);
  const report = reportSetting?.value as ProposedCategorizationReport | undefined;

  const status = message.actionResult?.status || 'pending';

  // Initialize items from the database setting when it loads
  useEffect(() => {
    if (report && report.id === message.actionResult?.reportId && !initialized) {
      setItems(report.items);
      setInitialized(true);
    }
  }, [report, message.actionResult?.reportId, initialized]);

  if (status === 'applied') {
    return (
      <Box sx={{ width: '85%', mt: 0.5 }}>
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            bgcolor: 'background.paper',
            borderColor: 'success.main',
            borderRadius: 1,
          }}
        >
          <Typography
            variant="subtitle2"
            color="success.main"
            sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}
          >
            ✅ Categorization Applied
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Successfully categorized **{message.actionResult.processedCount}.00** transaction(s). The dashboard and budgets have been updated.
          </Typography>
        </Paper>
      </Box>
    );
  }

  if (status === 'discarded') {
    return (
      <Box sx={{ width: '85%', mt: 0.5 }}>
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            bgcolor: 'background.paper',
            borderColor: 'divider',
            borderRadius: 1,
          }}
        >
          <Typography
            variant="subtitle2"
            color="text.secondary"
            sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}
          >
            ❌ Categorization Discarded
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            The categorization proposal was discarded. No transactions were modified.
          </Typography>
        </Paper>
      </Box>
    );
  }

  // If there is no active matching report, show fallback
  if (!report || report.id !== message.actionResult?.reportId) {
    return (
      <Box sx={{ width: '85%', mt: 0.5 }}>
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            bgcolor: 'background.paper',
            borderColor: 'divider',
            borderRadius: 1,
          }}
        >
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Categorization Report Expired
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            These AI suggestions have already been processed, discarded, or overwritten by a newer categorization run.
          </Typography>
        </Paper>
      </Box>
    );
  }

  const handleToggleApprove = (idx: number) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], approved: !updated[idx].approved };
    setItems(updated);
    // Persist local edit back to settings so it survives reload/navigation
    db.settings.put({
      key: 'app:pendingCategorizationReport',
      value: { ...report, items: updated },
    });
  };

  const handleChangeCategory = (idx: number, newCat: string) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], proposedCategory: newCat };
    setItems(updated);
    // Persist local edit back to settings
    db.settings.put({
      key: 'app:pendingCategorizationReport',
      value: { ...report, items: updated },
    });
  };

  const handleApply = async () => {
    setIsSubmitting(true);
    try {
      const approvedItems = items.filter((item) => item.approved);
      if (approvedItems.length > 0) {
        // Write to DB
        await db.transaction('rw', db.transactions, async () => {
          for (const item of approvedItems) {
            await db.transactions.update(item.transactionId, {
              category: item.proposedCategory,
              userOverridden: true, // Mark userOverridden since the user manually reviewed and approved
            });
          }
        });
        await refreshRecurrenceAll();
      }

      // Clear report from settings
      await db.settings.delete('app:pendingCategorizationReport');

      // Update message status
      await onUpdateMessageResult({
        ...message.actionResult,
        status: 'applied',
        processedCount: approvedItems.length,
      });
    } catch (err) {
      console.error('Failed to apply categorization suggestions:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDiscard = async () => {
    setIsSubmitting(true);
    try {
      // Clear report from settings
      await db.settings.delete('app:pendingCategorizationReport');

      // Update message status
      await onUpdateMessageResult({
        ...message.actionResult,
        status: 'discarded',
      });
    } catch (err) {
      console.error('Failed to discard suggestions:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const approvedCount = items.filter((item) => item.approved).length;
  const isBtnDisabled = disabled || isSubmitting;

  return (
    <Box sx={{ width: '85%', mt: 0.5 }}>
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          bgcolor: 'background.paper',
          borderColor: 'divider',
          borderRadius: 1,
          boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
        }}
      >
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Proposed AI Categorization
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Review, adjust, and approve suggestions before updating records.
            </Typography>
          </Box>

          <Divider />

          {/* List of items */}
          <Stack
            spacing={1}
            sx={{
              maxHeight: 280,
              overflowY: 'auto',
              pr: 0.5,
              '&::-webkit-scrollbar': {
                width: 6,
              },
              '&::-webkit-scrollbar-thumb': {
                bgcolor: 'action.selected',
                borderRadius: 1,
              },
            }}
          >
            {items.map((item, idx) => (
              <Box
                key={item.transactionId}
                sx={{
                  p: 1,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: item.approved ? 'divider' : 'action.disabledBackground',
                  bgcolor: item.approved ? 'transparent' : 'action.hover',
                  opacity: item.approved ? 1 : 0.6,
                  transition: 'all 150ms ease',
                }}
              >
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Checkbox
                    size="small"
                    checked={item.approved}
                    onChange={() => handleToggleApprove(idx)}
                    disabled={isBtnDisabled}
                    sx={{ p: 0.5 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                      <Typography
                        variant="body2"
                        noWrap
                        sx={{ fontWeight: 600, fontSize: '0.85rem' }}
                      >
                        {item.description}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, fontSize: '0.85rem', pl: 1, flexShrink: 0 }}
                      >
                        ${item.amount.toFixed(2)}
                      </Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                        {item.date}
                      </Typography>
                      
                      {/* Dropdown selector for category */}
                      <Select
                        size="small"
                        value={item.proposedCategory}
                        onChange={(e) => handleChangeCategory(idx, e.target.value as string)}
                        disabled={isBtnDisabled || !item.approved}
                        variant="standard"
                        sx={{
                          fontSize: '0.75rem',
                          height: 24,
                          '& .MuiSelect-select': {
                            py: 0.25,
                            fontSize: '0.75rem',
                            fontWeight: 500,
                          },
                        }}
                      >
                        {categories?.map((cat) => (
                          <MenuItem key={cat.id} value={cat.name} sx={{ fontSize: '0.85rem' }}>
                            {cat.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </Stack>
                  </Box>
                </Stack>
              </Box>
            ))}
          </Stack>

          <Divider />

          <Stack direction="row" spacing={1.5} justifyContent="space-between" alignItems="center">
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {approvedCount} of {items.length} approved
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                onClick={handleDiscard}
                disabled={isBtnDisabled}
                sx={{ textTransform: 'none', borderRadius: 1 }}
              >
                Discard
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={handleApply}
                disabled={isBtnDisabled}
                sx={{ textTransform: 'none', borderRadius: 1 }}
              >
                Approve & Apply
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}











