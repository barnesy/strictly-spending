import { Box, Typography, Stack, Grid, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Button, Divider } from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';

interface Props {
  selectedTxn: any;
  setSelectedTxn: (txn: any) => void;
  showRecategorize: boolean;
  setShowRecategorize: (show: boolean) => void;
}

export function QueryResultTransactionModal({
  selectedTxn,
  setSelectedTxn,
  showRecategorize,
  setShowRecategorize,
}: Props) {
  const dbAccounts = useLiveQuery(() => db.accounts.toArray(), []) || [];
  const dbCategories = useLiveQuery(() => db.categories.toArray(), []) || [];

  if (!selectedTxn) return null;

  return (
    <Dialog
      open={!!selectedTxn && !showRecategorize}
      onClose={() => setSelectedTxn(null)}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 1,
            p: 1,
            bgcolor: 'background.paper',
            backgroundImage: 'none',
          }
        }
      }}
    >
      <DialogTitle sx={{ p: 2, pb: 1, fontWeight: 700, fontSize: '1.1rem' }}>
        Transaction Details
      </DialogTitle>
      <DialogContent sx={{ p: 2, py: 1 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
              Description
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600, mt: 0.5 }}>
              {selectedTxn.description}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
              Amount
            </Typography>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
                mt: 0.5,
                color: selectedTxn.category.toLowerCase() === 'income' ? 'success.main' : 'error.main'
              }}
            >
              {(() => {
                const val = selectedTxn.amount;
                const isIncome = selectedTxn.category.toLowerCase() === 'income';
                const absVal = Math.abs(val);
                const formatted = absVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                if (isIncome) return `+$${formatted}`;
                if (val < 0) return `-$${formatted}`;
                return `$${formatted}`;
              })()}
            </Typography>
          </Box>

          <Divider />

          <Grid container spacing={2}>
            <Grid size={6}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                Date
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 500 }}>
                {selectedTxn.date}
              </Typography>
            </Grid>
            <Grid size={6}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                Category
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                <Chip
                  label={selectedTxn.category}
                  size="small"
                  sx={{
                    fontWeight: 600,
                    bgcolor: dbCategories?.find(c => c.name.toLowerCase() === selectedTxn.category.toLowerCase())?.color + '20' || 'action.selected',
                    color: dbCategories?.find(c => c.name.toLowerCase() === selectedTxn.category.toLowerCase())?.color || 'text.primary',
                    borderColor: dbCategories?.find(c => c.name.toLowerCase() === selectedTxn.category.toLowerCase())?.color || 'divider',
                    border: '1px solid',
                  }}
                />
              </Box>
            </Grid>
            <Grid size={12}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                Account
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 500 }}>
                {(() => {
                  const account = dbAccounts?.find(a => a.id === selectedTxn.accountId);
                  return account ? `${account.institution} - ${account.name}` : `Account #${selectedTxn.accountId}`;
                })()}
              </Typography>
            </Grid>
            <Grid size={6}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                Source
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 500, textTransform: 'capitalize' }}>
                {selectedTxn.source || 'Unknown'}
              </Typography>
            </Grid>
          </Grid>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5, gap: 1 }}>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setShowRecategorize(true)}
          sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600 }}
        >
          Recategorize
        </Button>
        <Button
          variant="contained"
          size="small"
          onClick={() => setSelectedTxn(null)}
          sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600 }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
