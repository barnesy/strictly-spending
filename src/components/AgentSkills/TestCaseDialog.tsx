import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  TextField,
} from '@mui/material';

export interface TestCaseDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (prompt: string, criteria: string) => void;
  initialPrompt?: string;
  initialCriteria?: string;
  type: 'custom' | 'baseline';
  isEdit?: boolean;
}

export const TestCaseDialog: React.FC<TestCaseDialogProps> = ({
  open,
  onClose,
  onSave,
  initialPrompt = '',
  initialCriteria = '',
  type,
  isEdit = false,
}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [criteria, setCriteria] = useState(initialCriteria);

  useEffect(() => {
    if (open) {
      setPrompt(initialPrompt);
      setCriteria(initialCriteria);
    }
  }, [open, initialPrompt, initialCriteria]);

  const handleSave = () => {
    onSave(prompt, criteria);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: (theme) => `${theme.shape.borderRadius}px` }
      }}
    >
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
        {isEdit ? 'Edit Test Case' : 'New Test Case'}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <TextField
            label="Test Prompt"
            placeholder={type === 'baseline' ? "e.g., Show food spending" : "e.g., Audit subscription costs"}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            size="small"
            fullWidth
            multiline
            rows={3}
            required
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Expected Criteria"
            placeholder={type === 'baseline' ? "e.g., Must map to Groceries" : "e.g., Must suggest double charge audits"}
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            size="small"
            fullWidth
            multiline
            rows={3}
            required
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          disabled={!prompt.trim() || !criteria.trim()}
          sx={{ textTransform: 'none', px: 3 }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};
