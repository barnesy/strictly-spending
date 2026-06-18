import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  Box,
  Typography,
  Paper,
  Chip,
} from '@mui/material';

export interface DiagnosticResult {
  running: boolean;
  success?: boolean;
  score?: number;
  reasoning?: string;
  error?: string;
  output?: string;
}

export interface InspectDiagnosticData {
  index: number;
  prompt: string;
  criteria: string;
  result: DiagnosticResult;
}

export interface InspectDiagnosticModalProps {
  selectedInspectTest: InspectDiagnosticData | null;
  onClose: () => void;
}

export const InspectDiagnosticModal: React.FC<InspectDiagnosticModalProps> = ({
  selectedInspectTest,
  onClose,
}) => {
  return (
    <Dialog
      open={selectedInspectTest !== null}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { borderRadius: (theme) => `${theme.shape.borderRadius}px` }
      }}
    >
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
        Inspect Diagnostic Completion (Test #{selectedInspectTest ? selectedInspectTest.index + 1 : 0})
      </DialogTitle>
      <DialogContent dividers>
        {selectedInspectTest && (
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
                Test Prompt / Input
              </Typography>
              <Paper variant="outlined" sx={{ p: 1.5, mt: 0.5, bgcolor: 'action.hover', fontFamily: 'monospace', fontSize: 12 }}>
                {selectedInspectTest.prompt}
              </Paper>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
                Expected Target Criteria
              </Typography>
              <Paper variant="outlined" sx={{ p: 1.5, mt: 0.5, bgcolor: 'action.hover', fontSize: 12 }}>
                {selectedInspectTest.criteria}
              </Paper>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
                Evaluated Score & Status
              </Typography>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 0.5 }}>
                <Chip
                  label={selectedInspectTest.result.success ? 'PASS' : 'FAIL'}
                  color={selectedInspectTest.result.success ? 'success' : 'error'}
                  size="small"
                  sx={{ fontWeight: 700 }}
                />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Score: {selectedInspectTest.result.score ?? 0}/100
                </Typography>
              </Stack>
              <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic', color: 'text.secondary' }}>
                <strong>Evaluator Reasoning:</strong> {selectedInspectTest.result.reasoning ?? ''}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
                Raw Assistant Model Output
              </Typography>
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  mt: 0.5,
                  bgcolor: (theme) => theme.palette.mode === 'dark' ? 'background.default' : 'grey.950',
                  color: 'success.main',
                  fontFamily: 'monospace',
                  fontSize: 12.5,
                  whiteSpace: 'pre-wrap',
                  maxHeight: 300,
                  overflowY: 'auto'
                }}
              >
                {selectedInspectTest.result.output || 'No output captured.'}
              </Paper>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained" sx={{ textTransform: 'none', px: 3 }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};
