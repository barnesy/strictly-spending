import { useState, useCallback } from 'react';
import { DocumentsList } from './DocumentsList';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Snackbar,
  IconButton,
  TextField,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { open } from '@tauri-apps/plugin-shell';
import type { AppDocument } from '../../types';
import { useDataStore } from '../../dataStore';
import { useDocumentContent } from './useDocumentContent';
import { usePnL } from './usePnL';
import { DocumentMarkdownView } from './DocumentMarkdownView';
import { DocumentCsvView } from './DocumentCsvView';
import { DocumentAuditView } from './DocumentAuditView';
import Papa from 'papaparse';

export default function Documents() {
  const [searchParams, setSearchParams] = useSearchParams();
  const previewId = searchParams.get('previewId');
  const activeTabParam = searchParams.get('tab') || 'All';

  const [previewDoc, setPreviewDoc] = useState<AppDocument | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  
  // Smart P&L auditing filters/paging
  const [selectedAuditCat, setSelectedAuditCat] = useState('All');
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [auditPage, setAuditPage] = useState(0);
  const [auditPageSize, setAuditPageSize] = useState(25);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');

  const handleSaveName = async () => {
    if (!derivedPreviewDoc) return;
    const trimmed = editNameValue.trim();
    if (!trimmed) {
      setSnackbarMessage('Name cannot be empty.');
      return;
    }
    try {
      await db.documents.update(derivedPreviewDoc.id, { name: trimmed });
      setIsEditingName(false);
      setSnackbarMessage('Document renamed successfully.');
    } catch (err) {
      console.error('Failed to rename document:', err);
      setSnackbarMessage('Failed to rename document.');
    }
  };

  const documents = useLiveQuery(() => db.documents?.orderBy('createdAt').reverse().toArray(), []) || [];
  const categoriesList = useLiveQuery(() => db.categories.toArray(), []) || [];

  const allTxns = useDataStore((s) => s.transactions);
  const allCats = useDataStore((s) => s.categories);

  // Derive activePreviewDoc from live db state
  const derivedPreviewDoc = previewId ? (documents.find(d => d.id === previewId) || previewDoc) : null;

  const { loadedContent } = useDocumentContent(previewId);

  const {
    pnlSummary,
    revenueCats,
    expenseCats,
    auditedTxns,
    paginatedAuditTxns,
  } = usePnL({
    derivedPreviewDoc,
    allTxns,
    allCats,
    selectedAuditCat,
    auditSearchQuery,
    auditPage,
    auditPageSize,
  });

  

  

  const handleOpen = async (doc: AppDocument) => {
    setSelectedAuditCat('All');
    setAuditSearchQuery('');
    setAuditPage(0);

    const hasContent = doc.content || doc.metadata?.docType === 'business_pnl' || (await db.documentContents.get(doc.id));
    if (hasContent) {
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
    setSelectedAuditCat('All');
    setAuditSearchQuery('');
    setAuditPage(0);
    setIsEditingName(false);
  };

  const handleDeleteClick = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = async () => {
    if (deleteConfirmId) {
      await db.documents.delete(deleteConfirmId);
      await db.documentContents.delete(deleteConfirmId);
      setDeleteConfirmId(null);
      setSnackbarMessage('Document record removed.');
    }
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setSearchParams({ previewId: previewId || '', tab: newValue });
  };

  const handleRecategorize = useCallback(async (txId: number, newCategory: string) => {
    try {
      const dbTxns = await db.transactions.where('id').equals(txId).toArray();
      if (dbTxns.length > 0) {
        await db.transactions.update(dbTxns[0].id!, { category: newCategory });
        useDataStore.getState().refresh();
      }
    } catch (error) {
      console.error('Failed to recategorize transaction:', error);
      setSnackbarMessage('Failed to update category.');
    }
  }, []);

  const handleExport = useCallback(async (format: 'csv' | 'md') => {
    if (format === 'csv') {
      const csv = Papa.unparse(auditedTxns);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit_export.csv';
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [auditedTxns]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {derivedPreviewDoc ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {/* Top Bar for Preview Mode */}
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 2 }}>
            <Button
              variant="text"
              color="inherit"
              onClick={handleClosePreview}
              sx={{ minWidth: 'auto', p: 1, borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
            >
              Back to list
            </Button>
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              {isEditingName ? (
                <>
                  <TextField
                    size="small"
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveName();
                      } else if (e.key === 'Escape') {
                        setIsEditingName(false);
                      }
                    }}
                    autoFocus
                    sx={{
                      '& .MuiInputBase-input': {
                        fontWeight: 700,
                        fontSize: '1.25rem',
                        py: 0.5,
                      }
                    }}
                  />
                  <IconButton 
                    size="small" 
                    color="primary"
                    onClick={handleSaveName}
                  >
                    <CheckIcon fontSize="small" />
                  </IconButton>
                  <IconButton 
                    size="small" 
                    color="error"
                    onClick={() => setIsEditingName(false)}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </>
              ) : (
                <>
                  <Typography variant="h6" fontWeight="700">
                    {derivedPreviewDoc.name}
                  </Typography>
                  <IconButton 
                    size="small" 
                    onClick={() => {
                      setEditNameValue(derivedPreviewDoc.name);
                      setIsEditingName(true);
                    }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </>
              )}
            </Box>
          </Box>

          {/* Document Content Viewers */}
          <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {derivedPreviewDoc.metadata?.docType === 'business_pnl' ? (
              <DocumentAuditView
                derivedPreviewDoc={derivedPreviewDoc}
                pnlSummary={pnlSummary}
                revenueCats={revenueCats}
                expenseCats={expenseCats}
                selectedAuditCat={selectedAuditCat}
                setSelectedAuditCat={setSelectedAuditCat}
                auditSearchQuery={auditSearchQuery}
                setAuditSearchQuery={setAuditSearchQuery}
                paginatedAuditTxns={paginatedAuditTxns}
                auditedTxns={auditedTxns}
                auditPage={auditPage}
                setAuditPage={setAuditPage}
                auditPageSize={auditPageSize}
                setAuditPageSize={setAuditPageSize}
                categoriesList={categoriesList}
                handleRecategorize={handleRecategorize}
                handleExport={handleExport}
              />
            ) : loadedContent ? (
              derivedPreviewDoc.type === 'text/markdown' ? (
                <DocumentMarkdownView
                  loadedContent={loadedContent}
                  setSearchParams={setSearchParams}
                />
              ) : derivedPreviewDoc.type === 'text/csv' ? (
                <DocumentCsvView
                  loadedContent={loadedContent}
                  derivedPreviewDoc={derivedPreviewDoc}
                  activeTabParam={activeTabParam}
                  handleTabChange={handleTabChange}
                  categoriesList={categoriesList}
                  handleRecategorize={handleRecategorize}
                />
              ) : (
                <Box component="pre" sx={{ m: 0, p: 2, bgcolor: 'action.hover', borderRadius: (theme) => `${theme.shape.borderRadius}px`, fontFamily: 'monospace', fontSize: 13, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {loadedContent}
                </Box>
              )
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', textAlign: 'center', py: 4 }}>
                No text content available for preview. This may be an uploaded binary or local file.
              </Typography>
            )}

            {/* Download/export actions at bottom for non-P&L documents */}
            {derivedPreviewDoc.metadata?.docType !== 'business_pnl' && loadedContent && (
              <Box sx={{ display: 'flex', gap: 1.5, mt: 3, justifyContent: 'flex-end' }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    const blob = new Blob([loadedContent || ''], { type: derivedPreviewDoc.type });
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
              </Box>
            )}
          </Box>
        </Box>
      ) : (
        <DocumentsList 
          documents={documents}
          handleOpen={handleOpen}
          handleDeleteClick={handleDeleteClick}
        />
      )}

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
