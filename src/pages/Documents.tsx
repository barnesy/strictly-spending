import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  IconButton,
  Tooltip,
  Chip,
  alpha,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { open } from '@tauri-apps/plugin-shell';
import type { AppDocument } from '../types';
import SimpleMarkdown from '../components/SimpleMarkdown';
import Papa from 'papaparse';
import { generatePnlData } from '../pnlGenerator';
import { writeTextFile } from '@tauri-apps/plugin-fs';

export default function Documents() {
  const [searchParams, setSearchParams] = useSearchParams();
  const previewId = searchParams.get('previewId');
  const activeTabParam = searchParams.get('tab') || 'All';

  const [previewDoc, setPreviewDoc] = useState<AppDocument | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');

  const documents = useLiveQuery(() => db.documents?.orderBy('createdAt').reverse().toArray(), []) || [];
  const categoriesList = useLiveQuery(() => db.categories.toArray(), []) || [];

  // Derive activePreviewDoc from the live database state using previewId
  const derivedPreviewDoc = previewId ? (documents.find(d => d.id === previewId) || previewDoc) : null;

  const handleOpen = async (doc: AppDocument) => {
    if (doc.content) {
      setSearchParams({ previewId: doc.id, tab: 'All' });
      return;
    }

    const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
    if (isTauri) {
      try {
        await open(doc.path);
        return;
      } catch (err) {
        console.error('Failed to open file via Tauri:', err);
      }
    }
    
    setSnackbarMessage('Tauri is not active and this document has no cached preview content.');
  };

  const handleClosePreview = () => {
    setSearchParams({});
    setPreviewDoc(null);
    setEditingRowId(null);
  };

  const handleDeleteClick = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = async () => {
    if (deleteConfirmId) {
      await db.documents.delete(deleteConfirmId);
      setDeleteConfirmId(null);
      setSnackbarMessage('Document record removed.');
    }
  };

  const parsedCsvData = useMemo(() => {
    if (!derivedPreviewDoc || derivedPreviewDoc.type !== 'text/csv' || !derivedPreviewDoc.content) {
      return { data: [], headers: [] };
    }
    const parsedCsv = Papa.parse(derivedPreviewDoc.content, { header: true, skipEmptyLines: true });
    return {
      data: parsedCsv.data as any[],
      headers: parsedCsv.meta.fields || []
    };
  }, [derivedPreviewDoc?.content, derivedPreviewDoc?.type]);

  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const row of parsedCsvData.data) {
      if (row.Category) {
        cats.add(row.Category);
      }
    }
    return Array.from(cats).sort();
  }, [parsedCsvData.data]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setSearchParams({ previewId: previewId || '', tab: newValue });
    setEditingRowId(null);
  };

  const filteredRows = useMemo(() => {
    if (activeTabParam === 'All') {
      return parsedCsvData.data;
    }
    return parsedCsvData.data.filter(row => row.Category === activeTabParam);
  }, [parsedCsvData.data, activeTabParam]);

  const handleStartEdit = (row: any) => {
    setEditingRowId(row.ID);
    setEditDate(row.Date || '');
    setEditCategory(row.Category || '');
    setEditDescription(row.Description || '');
    setEditAmount(row['Original Amount'] || row.OriginalAmount || row.Original_Amount || row.amount || '');
  };

  const handleSaveEdit = async (rowId: string) => {
    try {
      const txId = Number(rowId);
      if (isNaN(txId)) return;

      const numAmt = Number(editAmount);
      if (isNaN(numAmt)) {
        setSnackbarMessage('Please enter a valid numeric amount.');
        return;
      }

      const originalTx = await db.transactions.get(txId);
      if (!originalTx) {
        setSnackbarMessage('Transaction not found in database.');
        return;
      }

      await db.transactions.update(txId, {
        date: editDate,
        category: editCategory,
        description: editDescription,
        amount: numAmt
      });

      // Now regenerate P&L if metadata exists on the document
      if (derivedPreviewDoc?.metadata && derivedPreviewDoc.metadata.docType === 'business_pnl') {
        const metadata = derivedPreviewDoc.metadata;
        const { pnlReportMarkdown, pnlSpreadsheetCsv } = await generatePnlData({
          start: metadata.start,
          end: metadata.end,
          resolvedCats: metadata.resolvedCats,
          resolvedAccts: metadata.resolvedAccts,
          search: metadata.search,
          minPrice: metadata.minPrice,
          maxPrice: metadata.maxPrice,
          markdownDocId: metadata.markdownDocId,
          spreadsheetDocId: metadata.spreadsheetDocId
        });

        // Update MD Document in Dexie
        const mdDoc = await db.documents.get(metadata.markdownDocId);
        if (mdDoc) {
          await db.documents.update(metadata.markdownDocId, { content: pnlReportMarkdown });
          const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
          if (isTauri && mdDoc.path) {
            try {
              await writeTextFile(mdDoc.path, pnlReportMarkdown);
            } catch (err) {
              console.error('Failed to write MD to disk:', err);
            }
          }
        }

        // Update CSV Document in Dexie
        const csvDoc = await db.documents.get(metadata.spreadsheetDocId);
        if (csvDoc) {
          await db.documents.update(metadata.spreadsheetDocId, { content: pnlSpreadsheetCsv });
          const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
          if (isTauri && csvDoc.path) {
            try {
              await writeTextFile(csvDoc.path, pnlSpreadsheetCsv);
            } catch (err) {
              console.error('Failed to write CSV to disk:', err);
            }
          }
        }
      }

      setEditingRowId(null);
      setSnackbarMessage('Transaction updated successfully. P&L statement totals recalculated.');
    } catch (err: any) {
      console.error(err);
      setSnackbarMessage(`Failed to save: ${err.message}`);
    }
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 0 } }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight="800" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <FolderIcon fontSize="large" color="primary" />
          Documents
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Track and manage documents generated by the AI or uploaded for taxes.
        </Typography>
      </Box>

      {documents.length > 0 ? (
        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            overflow: 'hidden',
            borderColor: 'divider',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
          }}
        >
          <Table sx={{ minWidth: 650 }}>
            <TableHead sx={{ bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'grey.50' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, fontSize: '13px', py: 1.5, pl: 3, color: 'text.secondary' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '13px', py: 1.5, color: 'text.secondary' }}>Date Created</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '13px', py: 1.5, color: 'text.secondary' }}>Source</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '13px', py: 1.5, color: 'text.secondary' }}>Tax Checklist Item</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '13px', py: 1.5, color: 'text.secondary' }}>Local Path</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '13px', py: 1.5, pr: 3, color: 'text.secondary' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {documents.map((doc: AppDocument) => (
                <TableRow key={doc.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                  <TableCell sx={{ py: 1.5, pl: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{
                        p: 1,
                        borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                        color: 'primary.main',
                        display: 'flex',
                        alignItems: 'center',
                      }}>
                        <InsertDriveFileIcon fontSize="small" />
                      </Box>
                      <Typography variant="body2" fontWeight="600" color="text.primary">
                        {doc.name}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ py: 1.5, fontSize: '13px', color: 'text.secondary' }}>
                    {new Date(doc.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell sx={{ py: 1.5 }}>
                    <Chip
                      label={doc.source === 'generated' ? 'AI' : 'Uploaded'}
                      size="small"
                      color={doc.source === 'generated' ? 'secondary' : 'default'}
                      variant={doc.source === 'generated' ? 'filled' : 'outlined'}
                      sx={{ borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
                    />
                  </TableCell>
                  <TableCell sx={{ py: 1.5 }}>
                    {doc.associatedChecklistId ? (
                      <Chip
                        label={doc.associatedChecklistId === 'business_pnl' ? 'Business P&L' : doc.associatedChecklistId}
                        size="small"
                        color="success"
                        variant="outlined"
                        sx={{ borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
                      />
                    ) : (
                      <Typography variant="caption" color="text.disabled">—</Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ py: 1.5, fontSize: '13px', color: 'text.secondary', fontFamily: 'monospace', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.path}>
                    {doc.path}
                  </TableCell>
                  <TableCell align="right" sx={{ py: 1.5, pr: 3 }}>
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                      <Tooltip title="Open File">
                        <IconButton size="small" onClick={() => handleOpen(doc)} sx={{ borderRadius: (theme) => `${theme.shape.borderRadius}px` }}>
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove record">
                        <IconButton size="small" color="error" onClick={() => handleDeleteClick(doc.id)} sx={{ borderRadius: (theme) => `${theme.shape.borderRadius}px` }}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Paper
          elevation={0}
          sx={{
            p: 6,
            textAlign: 'center',
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            border: '1px dashed',
            borderColor: 'divider',
            bgcolor: 'transparent'
          }}
        >
          <FolderIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" fontWeight="600" gutterBottom>
            No Documents Yet
          </Typography>
          <Typography variant="body2" color="text.disabled">
            Ask the AI Copilot to generate a report or upload a document in the Tax Center.
          </Typography>
        </Paper>
      )}

      {/* Document Preview Modal */}
      <Dialog
        open={Boolean(derivedPreviewDoc)}
        onClose={handleClosePreview}
        maxWidth={derivedPreviewDoc?.type === 'text/csv' ? 'lg' : 'md'}
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            p: 1,
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, pr: 6, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <InsertDriveFileIcon color="primary" />
          {derivedPreviewDoc?.name}
        </DialogTitle>
        <DialogContent dividers sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
          {derivedPreviewDoc?.content ? (
            derivedPreviewDoc.type === 'text/markdown' ? (
              <SimpleMarkdown
                content={derivedPreviewDoc.content}
                onLinkClick={(url) => {
                  const match = url.match(/^doc:\/\/([^#]+)(?:#tab=(.+))?$/);
                  if (match) {
                    setSearchParams({ previewId: match[1], tab: match[2] || 'All' });
                  }
                }}
              />
            ) : derivedPreviewDoc.type === 'text/csv' ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Tabs
                  value={activeTabParam}
                  onChange={handleTabChange}
                  variant="scrollable"
                  scrollButtons="auto"
                  sx={{
                    borderBottom: 1,
                    borderColor: 'divider',
                    '& .MuiTab-root': {
                      textTransform: 'none',
                      fontWeight: 600,
                      fontSize: '13px',
                    }
                  }}
                >
                  <Tab label="All" value="All" />
                  {uniqueCategories.map(cat => (
                    <Tab key={cat} label={cat} value={cat} />
                  ))}
                </Tabs>
                
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: (theme) => `${theme.shape.borderRadius}px`, maxHeight: '60vh', overflowY: 'auto' }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'action.hover' }}>
                        <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Category</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Description</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: 12 }} align="right">Original Amount</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: 12 }} align="right">Computation Value</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: 12 }}>Account</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: 12 }} align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredRows.map((row, index) => {
                        const isEditing = row.ID && row.ID === editingRowId;
                        const rowCompVal = Number(row['Computation Value'] || row.ComputationValue || 0);
                        const rowAmount = Number(row['Original Amount'] || row.OriginalAmount || row.Original_Amount || row.amount || 0);
                        
                        return (
                          <TableRow key={row.ID || index} hover>
                            {isEditing ? (
                              <>
                                <TableCell sx={{ py: 1 }}>
                                  <input
                                    type="date"
                                    value={editDate}
                                    onChange={e => setEditDate(e.target.value)}
                                    style={{
                                      padding: '6px 8px',
                                      border: '1px solid #ccc',
                                      borderRadius: '4px',
                                      fontSize: '13px',
                                      fontFamily: 'inherit',
                                    }}
                                  />
                                </TableCell>
                                <TableCell sx={{ py: 1 }}>
                                  <select
                                    value={editCategory}
                                    onChange={e => setEditCategory(e.target.value)}
                                    style={{
                                      padding: '6px 8px',
                                      border: '1px solid #ccc',
                                      borderRadius: '4px',
                                      fontSize: '13px',
                                      fontFamily: 'inherit',
                                      background: 'transparent',
                                    }}
                                  >
                                    {categoriesList.map(c => (
                                      <option key={c.id} value={c.name}>{c.name}</option>
                                    ))}
                                  </select>
                                </TableCell>
                                <TableCell sx={{ py: 1 }}>
                                  <input
                                    type="text"
                                    value={editDescription}
                                    onChange={e => setEditDescription(e.target.value)}
                                    style={{
                                      padding: '6px 8px',
                                      border: '1px solid #ccc',
                                      borderRadius: '4px',
                                      fontSize: '13px',
                                      fontFamily: 'inherit',
                                      width: '100%',
                                    }}
                                  />
                                </TableCell>
                                <TableCell align="right" sx={{ py: 1 }}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editAmount}
                                    onChange={e => setEditAmount(e.target.value)}
                                    style={{
                                      padding: '6px 8px',
                                      border: '1px solid #ccc',
                                      borderRadius: '4px',
                                      fontSize: '13px',
                                      fontFamily: 'inherit',
                                      width: '80px',
                                      textAlign: 'right',
                                    }}
                                  />
                                </TableCell>
                                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', py: 1 }}>
                                  ${(editCategory.toLowerCase() === 'income' ? Number(editAmount) : -Number(editAmount)).toFixed(2)}
                                </TableCell>
                                <TableCell sx={{ py: 1 }}>
                                  {row.Account}
                                </TableCell>
                                <TableCell align="right" sx={{ py: 1 }}>
                                  <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                                    <IconButton size="small" color="success" onClick={() => handleSaveEdit(row.ID)} sx={{ borderRadius: (theme) => `${theme.shape.borderRadius}px` }}>
                                      <CheckIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton size="small" color="error" onClick={() => setEditingRowId(null)} sx={{ borderRadius: (theme) => `${theme.shape.borderRadius}px` }}>
                                      <CloseIcon fontSize="small" />
                                    </IconButton>
                                  </Box>
                                </TableCell>
                              </>
                            ) : (
                              <>
                                <TableCell sx={{ fontSize: '13px' }}>{row.Date}</TableCell>
                                <TableCell sx={{ fontSize: '13px' }}>
                                  <Chip label={row.Category} size="small" variant="outlined" sx={{ borderRadius: (theme) => `${theme.shape.borderRadius}px` }} />
                                </TableCell>
                                <TableCell sx={{ fontSize: '13px' }}>{row.Description}</TableCell>
                                <TableCell align="right" sx={{ fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                                  ${rowAmount.toFixed(2)}
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: '13px', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: rowCompVal >= 0 ? 'success.main' : 'error.main' }}>
                                  {rowCompVal >= 0 ? `$${rowCompVal.toFixed(2)}` : `($${Math.abs(rowCompVal).toFixed(2)})`}
                                </TableCell>
                                <TableCell sx={{ fontSize: '13px' }}>{row.Account}</TableCell>
                                <TableCell align="right">
                                  {row.ID ? (
                                    <IconButton size="small" onClick={() => handleStartEdit(row)} sx={{ borderRadius: (theme) => `${theme.shape.borderRadius}px` }}>
                                      <EditIcon fontSize="small" />
                                    </IconButton>
                                  ) : (
                                    <Typography variant="caption" color="text.disabled">—</Typography>
                                  )}
                                </TableCell>
                              </>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            ) : (
              <Box component="pre" sx={{ m: 0, p: 2, bgcolor: 'action.hover', borderRadius: (theme) => `${theme.shape.borderRadius}px`, fontFamily: 'monospace', fontSize: 13, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {derivedPreviewDoc.content}
              </Box>
            )
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', textAlign: 'center', py: 4 }}>
              No text content available for preview. This may be an uploaded binary or local file.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          {derivedPreviewDoc?.content && (
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                const blob = new Blob([derivedPreviewDoc.content || ''], { type: derivedPreviewDoc.type });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = derivedPreviewDoc.name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              sx={{ borderRadius: (theme) => `${theme.shape.borderRadius}px`, textTransform: 'none' }}
            >
              Download File
            </Button>
          )}
          <Button variant="contained" size="small" onClick={handleClosePreview} sx={{ borderRadius: (theme) => `${theme.shape.borderRadius}px`, textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteConfirmId)}
        onClose={() => setDeleteConfirmId(null)}
        PaperProps={{
          sx: {
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>Confirm Deletion</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2">
            Are you sure you want to remove this document from the tracker? The actual file will not be deleted from your hard drive.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteConfirmId(null)} color="inherit" variant="outlined" size="small" sx={{ borderRadius: (theme) => `${theme.shape.borderRadius}px`, textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            onClick={confirmDelete}
            color="error"
            variant="contained"
            size="small"
            autoFocus
            sx={{ borderRadius: (theme) => `${theme.shape.borderRadius}px`, textTransform: 'none' }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Alert Snackbar */}
      <Snackbar
        open={Boolean(snackbarMessage)}
        autoHideDuration={4000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage || ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
