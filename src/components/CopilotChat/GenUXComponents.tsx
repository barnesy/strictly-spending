import React, { useState } from 'react';
import { Box, Stack, Paper, Button, TextField } from '@mui/material';

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
          borderRadius: 2,
        }}
      >
        <Stack direction="row" spacing={2} justifyContent="flex-start">
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={() => handleClick(confirmText)}
            disabled={isDisabled}
            sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 600 }}
          >
            {confirmText}
          </Button>
          <Button
            variant="outlined"
            color="inherit"
            size="small"
            onClick={() => handleClick(cancelText)}
            disabled={isDisabled}
            sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 600 }}
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
          borderRadius: 2,
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
                sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 600 }}
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
