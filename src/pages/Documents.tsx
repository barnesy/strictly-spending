import { useState, useMemo, useEffect } from 'react';
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
  Tab,
  TablePagination,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  useTheme,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Select,
  MenuItem
} from '@mui/material';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle
} from 'react-resizable-panels';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { open } from '@tauri-apps/plugin-shell';
import type { AppDocument } from '../types';
import SimpleMarkdown from '../components/SimpleMarkdown';
import Papa from 'papaparse';
import { generatePnlData } from '../pnlGenerator';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useDataStore } from '../dataStore';


export default function Documents() {
  const theme = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const previewId = searchParams.get('previewId');
  const activeTabParam = searchParams.get('tab') || 'All';

  const [previewDoc, setPreviewDoc] = useState<AppDocument | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const [editTitleText, setEditTitleText] = useState('');

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  // Lazy-loaded content states
  const [loadedContent, setLoadedContent] = useState<string | null>(null);
  const [isContentLoading, setIsContentLoading] = useState(false);

  // Smart P&L auditing filters/paging
  const [selectedAuditCat, setSelectedAuditCat] = useState('All');
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [auditPage, setAuditPage] = useState(0);
  const [auditPageSize, setAuditPageSize] = useState(25);

  const documents = useLiveQuery(() => db.documents?.orderBy('createdAt').reverse().toArray(), []) || [];
  const categoriesList = useLiveQuery(() => db.categories.toArray(), []) || [];

  const allTxns = useDataStore((s) => s.transactions);
  const allCats = useDataStore((s) => s.categories);

  // Derive activePreviewDoc from live db state
  const derivedPreviewDoc = previewId ? (documents.find(d => d.id === previewId) || previewDoc) : null;



  // Extract Table of Contents headings from Markdown
  const tocItems = useMemo(() => {
    if (!loadedContent) return [];
    const lines = loadedContent.split('\n');
    const items: Array<{ text: string; id: string; level: number }> = [];
    const seen: Record<string, number> = {};
    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim().replace(/[*_`]/g, '');
        let slug = text.toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
        if (seen[slug] !== undefined) {
          seen[slug]++;
          slug = `${slug}-${seen[slug]}`;
        } else {
          seen[slug] = 0;
        }
        items.push({ text, id: slug, level });
      }
    }
    return items;
  }, [loadedContent]);

  const handleScrollToHeading = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Lazy load content when a document is opened
  useEffect(() => {
    if (!previewId) {
      setLoadedContent(null);
      setIsContentLoading(false);
      return;
    }

    let isMounted = true;
    setIsContentLoading(true);

    db.documentContents.get(previewId)
      .then((record) => {
        if (!isMounted) return;
        if (record) {
          setLoadedContent(record.content);
          setIsContentLoading(false);
        } else {
          db.documents.get(previewId)
            .then((docObj) => {
              if (!isMounted) return;
              setLoadedContent(docObj?.content || null);
              setIsContentLoading(false);
            })
            .catch(() => {
              if (isMounted) {
                setLoadedContent(null);
                setIsContentLoading(false);
              }
            });
        }
      })
      .catch((err) => {
        console.error('Error lazy loading content:', err);
        if (isMounted) {
          setIsContentLoading(false);
          setLoadedContent(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [previewId]);

  useEffect(() => {
    if (derivedPreviewDoc) {
      setEditTitleText(derivedPreviewDoc.name);
    } else {
      setEditTitleText('');
    }
  }, [derivedPreviewDoc?.id]);

  const handleSaveTitle = async () => {
    if (!derivedPreviewDoc || !editTitleText.trim()) return;
    if (editTitleText.trim() === derivedPreviewDoc.name) return;
    try {
      await db.documents.update(derivedPreviewDoc.id, {
        name: editTitleText.trim()
      });
      setSnackbarMessage('Document title updated.');
    } catch (err: any) {
      console.error('Failed to update title:', err);
      setSnackbarMessage(`Failed to update title: ${err.message}`);
    }
  };

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

  // Parse CSV content reactively
  const parsedCsvData = useMemo(() => {
    if (!derivedPreviewDoc || derivedPreviewDoc.type !== 'text/csv' || !loadedContent) {
      return { data: [], headers: [] };
    }
    const parsedCsv = Papa.parse(loadedContent, { header: true, skipEmptyLines: true });
    return {
      data: parsedCsv.data as any[],
      headers: parsedCsv.meta.fields || []
    };
  }, [loadedContent, derivedPreviewDoc?.type]);

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
  };

  const filteredRows = useMemo(() => {
    if (activeTabParam === 'All') {
      return parsedCsvData.data;
    }
    return parsedCsvData.data.filter(row => row.Category === activeTabParam);
  }, [parsedCsvData.data, activeTabParam]);

  const pageRows = useMemo(() => {
    return filteredRows.slice(page * pageSize, page * pageSize + pageSize);
  }, [filteredRows, page, pageSize]);

  // Reset page when dataset or active tab changes
  useEffect(() => {
    setPage(0);
  }, [filteredRows.length, activeTabParam]);

  const handleRecategorize = async (txId: number, newCategory: string) => {
    try {
      await db.transactions.update(txId, {
        category: newCategory
      });

      // Now regenerate P&L if metadata exists on the document
      if (derivedPreviewDoc?.metadata && derivedPreviewDoc.metadata.docType === 'business_pnl') {
        const metadata = derivedPreviewDoc.metadata;
        const currentDocId = derivedPreviewDoc.id;

        const { pnlReportMarkdown, pnlSpreadsheetCsv } = await generatePnlData({
          start: metadata.start,
          end: metadata.end,
          resolvedCats: metadata.resolvedCats,
          resolvedAccts: metadata.resolvedAccts,
          search: metadata.search,
          minPrice: metadata.minPrice,
          maxPrice: metadata.maxPrice,
          markdownDocId: metadata.markdownDocId || currentDocId,
          spreadsheetDocId: metadata.spreadsheetDocId || currentDocId
        });

        // Update the main document content in Dexie documentContents
        await db.documentContents.put({
          id: currentDocId,
          content: pnlReportMarkdown
        });

        // Immediately update local preview cache
        setLoadedContent(pnlReportMarkdown);

        const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
        if (isTauri && derivedPreviewDoc.path) {
          try {
            await writeTextFile(derivedPreviewDoc.path, pnlReportMarkdown);
            
            // Also write updated companion CSV if applicable
            const csvPath = derivedPreviewDoc.path.replace(/\.md$/i, '.csv');
            if (csvPath !== derivedPreviewDoc.path) {
              await writeTextFile(csvPath, pnlSpreadsheetCsv);
            }
          } catch (err) {
            console.error('Failed to write updated files to disk:', err);
          }
        }

        // Keep backward compatible separate files updated if they exist
        if (metadata.markdownDocId && metadata.markdownDocId !== currentDocId) {
          const mdDoc = await db.documents.get(metadata.markdownDocId);
          if (mdDoc) {
            await db.documentContents.put({ id: metadata.markdownDocId, content: pnlReportMarkdown });
            if (isTauri && mdDoc.path) {
              try { await writeTextFile(mdDoc.path, pnlReportMarkdown); } catch (e) {}
            }
          }
        }
        if (metadata.spreadsheetDocId && metadata.spreadsheetDocId !== currentDocId) {
          const csvDoc = await db.documents.get(metadata.spreadsheetDocId);
          if (csvDoc) {
            await db.documentContents.put({ id: metadata.spreadsheetDocId, content: pnlSpreadsheetCsv });
            if (isTauri && csvDoc.path) {
              try { await writeTextFile(csvDoc.path, pnlSpreadsheetCsv); } catch (e) {}
            }
          }
        }
      }

      setSnackbarMessage('Transaction category updated. P&L totals recalculated.');
    } catch (err: any) {
      console.error(err);
      setSnackbarMessage(`Failed to update category: ${err.message}`);
    }
  };

  const handleExport = async (format: 'csv' | 'md') => {
    if (!derivedPreviewDoc || !derivedPreviewDoc.metadata) return;

    const metadata = derivedPreviewDoc.metadata;
    try {
      const { pnlReportMarkdown, pnlSpreadsheetCsv } = await generatePnlData({
        start: metadata.start,
        end: metadata.end,
        resolvedCats: metadata.resolvedCats,
        resolvedAccts: metadata.resolvedAccts,
        search: metadata.search,
        minPrice: metadata.minPrice,
        maxPrice: metadata.maxPrice,
        markdownDocId: derivedPreviewDoc.id,
        spreadsheetDocId: derivedPreviewDoc.id
      });

      const exportContent = format === 'md' ? pnlReportMarkdown : pnlSpreadsheetCsv;
      const exportExt = format;
      const baseFilename = derivedPreviewDoc.name.replace(/\.(md|csv)$/i, '');
      const defaultFilename = `${baseFilename}.${exportExt}`;

      const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
      if (isTauri) {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        const filePath = await save({
          filters: [{ name: format === 'md' ? 'Markdown Statement' : 'CSV Spreadsheet', extensions: [exportExt] }],
          defaultPath: defaultFilename
        });
        if (filePath) {
          await writeTextFile(filePath, exportContent);
          setSnackbarMessage(`Document exported successfully to ${filePath}`);
        }
      } else {
        const blob = new Blob([exportContent], { type: format === 'md' ? 'text/markdown' : 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setSnackbarMessage(`Document downloaded successfully as ${defaultFilename}`);
      }
    } catch (err: any) {
      console.error(err);
      setSnackbarMessage(`Export failed: ${err.message}`);
    }
  };

  // Derive matched transactions for active P&L scope
  const matchedPnlTxns = useMemo(() => {
    if (!derivedPreviewDoc || derivedPreviewDoc.metadata?.docType !== 'business_pnl') {
      return [];
    }
    const meta = derivedPreviewDoc.metadata;
    const start = meta.start || `${new Date().getFullYear()}-01-01`;
    const end = meta.end || `${new Date().getFullYear()}-12-31`;
    const resolvedCats = meta.resolvedCats || [];
    const resolvedAccts = meta.resolvedAccts || [];
    const searchVal = meta.search || '';
    const minPriceVal = meta.minPrice;
    const maxPriceVal = meta.maxPrice;

    return allTxns.filter(t => {
      if (t.date < start || t.date > end) return false;
      if (resolvedAccts.length > 0 && !resolvedAccts.includes(t.accountId)) return false;
      if (resolvedCats.length > 0 && !resolvedCats.some(c => c.toLowerCase() === t.category.toLowerCase())) return false;
      if (t.category.toLowerCase() === 'transfers') return false;

      if (searchVal) {
        const q = searchVal.toLowerCase();
        if (!t.description.toLowerCase().includes(q) && !t.merchantKey.toLowerCase().includes(q)) return false;
      }
      if (minPriceVal !== undefined) {
        if (Math.abs(t.amount) < minPriceVal) return false;
      }
      if (maxPriceVal !== undefined) {
        if (Math.abs(t.amount) > maxPriceVal) return false;
      }
      return true;
    });
  }, [allTxns, derivedPreviewDoc]);

  // Derive category types
  const categoryTypes = useMemo(() => {
    const types: Record<string, string> = {};
    for (const c of allCats) {
      types[c.name.toLowerCase()] = c.type;
    }
    return types;
  }, [allCats]);

  // Calculate live P&L summaries
  const pnlSummary = useMemo(() => {
    let revenue = 0;
    let expenses = 0;
    const catTotals: Record<string, number> = {};

    for (const t of matchedPnlTxns) {
      const catLower = t.category.toLowerCase();
      const type = categoryTypes[catLower] || 'spend';

      if (type === 'income') {
        const amt = t.amount;
        revenue += amt;
        catTotals[t.category] = (catTotals[t.category] || 0) + amt;
      } else {
        const amt = -t.amount;
        expenses += amt;
        catTotals[t.category] = (catTotals[t.category] || 0) + amt;
      }
    }

    const net = revenue - expenses;
    return { revenue, expenses, net, catTotals };
  }, [matchedPnlTxns, categoryTypes]);

  const revenueCats = useMemo(() => {
    return Object.keys(pnlSummary.catTotals).filter(catName => categoryTypes[catName.toLowerCase()] === 'income');
  }, [pnlSummary.catTotals, categoryTypes]);

  const expenseCats = useMemo(() => {
    return Object.keys(pnlSummary.catTotals).filter(catName => categoryTypes[catName.toLowerCase()] !== 'income');
  }, [pnlSummary.catTotals, categoryTypes]);

  // Audited items query
  const auditedTxns = useMemo(() => {
    return matchedPnlTxns.filter(t => {
      if (selectedAuditCat !== 'All' && t.category !== selectedAuditCat) {
        return false;
      }
      if (auditSearchQuery) {
        const q = auditSearchQuery.toLowerCase();
        return t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [matchedPnlTxns, selectedAuditCat, auditSearchQuery]);

  const paginatedAuditTxns = useMemo(() => {
    return auditedTxns.slice(auditPage * auditPageSize, auditPage * auditPageSize + auditPageSize);
  }, [auditedTxns, auditPage, auditPageSize]);




  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: derivedPreviewDoc ? '100%' : 1200,
        mx: 'auto',
        p: { xs: 2, md: 0 },
        ...(derivedPreviewDoc ? {
          height: 'calc(100vh - 120px)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        } : {})
      }}
    >
      {derivedPreviewDoc ? (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, width: '100%' }}>
          {/* Back button and Title header */}
          <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Button
              startIcon={<ArrowBackIcon />}
              onClick={handleClosePreview}
              sx={{ borderRadius: (theme) => `${theme.shape.borderRadius}px`, textTransform: 'none', fontWeight: 600 }}
              variant="outlined"
              size="small"
            >
              Back to Documents
            </Button>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <InsertDriveFileIcon color="primary" fontSize="medium" />
              <TextField
                value={editTitleText}
                onChange={(e) => setEditTitleText(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                size="small"
                variant="outlined"
                sx={{
                  width: '320px',
                  '& .MuiOutlinedInput-root': {
                    borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                    fontSize: '16px',
                    fontWeight: 700,
                  },
                  '& .MuiOutlinedInput-input': {
                    py: 0.5,
                    px: 1,
                  }
                }}
              />
            </Box>
          </Box>

          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', width: '100%' }}>
            {isContentLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress />
              </Box>
            ) : (
              derivedPreviewDoc.metadata?.docType === 'business_pnl' ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  
                  {/* Top Action buttons */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                    <Typography variant="body2" color="text.secondary">
                      Auditing statements for period: <strong>{derivedPreviewDoc.metadata.start}</strong> to <strong>{derivedPreviewDoc.metadata.end}</strong>
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1.5 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => handleExport('md')}
                        sx={{ borderRadius: `${theme.shape.borderRadius}px`, textTransform: 'none', fontWeight: 600 }}
                      >
                        Export as Markdown
                      </Button>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => handleExport('csv')}
                        sx={{ borderRadius: `${theme.shape.borderRadius}px`, textTransform: 'none', fontWeight: 600 }}
                      >
                        Export as CSV
                      </Button>
                    </Box>
                  </Box>

                  {/* Summary cards */}
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 4 }}>
                      <Card variant="outlined" sx={{ borderRadius: `${theme.shape.borderRadius}px`, borderColor: 'divider', bgcolor: alpha(theme.palette.success.main, 0.02) }}>
                        <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                          <Typography variant="overline" color="text.secondary" fontWeight="700" sx={{ display: 'block', mb: 0.5 }}>Total Revenue</Typography>
                          <Typography variant="h4" fontWeight="800" color="success.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            ${pnlSummary.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid size={{ xs: 12, md: 4 }}>
                      <Card variant="outlined" sx={{ borderRadius: `${theme.shape.borderRadius}px`, borderColor: 'divider', bgcolor: alpha(theme.palette.error.main, 0.02) }}>
                        <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                          <Typography variant="overline" color="text.secondary" fontWeight="700" sx={{ display: 'block', mb: 0.5 }}>Operating Expenses</Typography>
                          <Typography variant="h4" fontWeight="800" color="error.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            ${pnlSummary.expenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid size={{ xs: 12, md: 4 }}>
                      <Card variant="outlined" sx={{ borderRadius: `${theme.shape.borderRadius}px`, borderColor: 'divider', bgcolor: alpha(pnlSummary.net >= 0 ? theme.palette.success.main : theme.palette.error.main, 0.04) }}>
                        <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                          <Typography variant="overline" color="text.secondary" fontWeight="700" sx={{ display: 'block', mb: 0.5 }}>Net Profit / Loss</Typography>
                          <Typography variant="h4" fontWeight="800" color={pnlSummary.net >= 0 ? 'success.main' : 'error.main'} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            {pnlSummary.net >= 0 ? '' : '-'}${Math.abs(pnlSummary.net).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>

                  {/* Resizable Audit Panels */}
                  <PanelGroup
                    orientation="horizontal"
                    style={{
                      height: '65vh',
                      border: `1px solid ${theme.palette.divider}`,
                      borderRadius: `${theme.shape.borderRadius}px`,
                      overflow: 'hidden'
                    }}
                  >
                    {/* Left Column: Categories list */}
                    <Panel id="pnl-categories" defaultSize={25} minSize={15} maxSize={45}>
                      <Box sx={{ height: '100%', overflowY: 'auto', p: 2 }}>
                        <Typography variant="subtitle2" fontWeight="700" color="text.secondary" sx={{ mb: 1.5 }}>
                          Category Breakdown
                        </Typography>
                        <TableContainer component={Box} sx={{ border: 'none' }}>
                          <Table size="small">
                            <TableHead>
                              <TableRow sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'grey.50' }}>
                                <TableCell sx={{ fontWeight: 700, fontSize: '11px', color: 'text.secondary' }}>Category</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '11px', color: 'text.secondary' }}>Total</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              <TableRow
                                hover
                                selected={selectedAuditCat === 'All'}
                                onClick={() => setSelectedAuditCat('All')}
                                sx={{ cursor: 'pointer', '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.08) } }}
                              >
                                <TableCell sx={{ fontWeight: 600, fontSize: '13px' }}>All Categories</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600, fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                                  ${(pnlSummary.revenue + pnlSummary.expenses).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </TableCell>
                              </TableRow>

                              <TableRow sx={{ bgcolor: alpha(theme.palette.text.secondary, 0.04) }}>
                                <TableCell colSpan={2} sx={{ fontWeight: 700, py: 0.5, fontSize: '11px', color: 'text.secondary' }}>REVENUE</TableCell>
                              </TableRow>
                              {revenueCats.map(cat => (
                                <TableRow
                                  key={cat}
                                  hover
                                  selected={selectedAuditCat === cat}
                                  onClick={() => setSelectedAuditCat(cat)}
                                  sx={{ cursor: 'pointer', '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.08) } }}
                                >
                                  <TableCell sx={{ pl: 3, fontSize: '13px' }}>{cat}</TableCell>
                                  <TableCell align="right" sx={{ fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                                    ${(pnlSummary.catTotals[cat] || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </TableCell>
                                </TableRow>
                              ))}

                              <TableRow sx={{ bgcolor: alpha(theme.palette.text.secondary, 0.04) }}>
                                <TableCell colSpan={2} sx={{ fontWeight: 700, py: 0.5, fontSize: '11px', color: 'text.secondary' }}>OPERATING EXPENSES</TableCell>
                              </TableRow>
                              {expenseCats.map(cat => (
                                <TableRow
                                  key={cat}
                                  hover
                                  selected={selectedAuditCat === cat}
                                  onClick={() => setSelectedAuditCat(cat)}
                                  sx={{ cursor: 'pointer', '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.08) } }}
                                >
                                  <TableCell sx={{ pl: 3, fontSize: '13px' }}>{cat}</TableCell>
                                  <TableCell align="right" sx={{ fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                                    ${(pnlSummary.catTotals[cat] || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </Box>
                    </Panel>

                    {/* Resizable Divider Handle */}
                    <StyledResizeHandle ariaLabel="Resize panels" />

                    {/* Right Column: Transactions list */}
                    <Panel id="pnl-transactions" defaultSize={75} minSize={50}>
                      <Box sx={{ height: '100%', overflowY: 'auto', p: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, gap: 2, flexWrap: 'wrap' }}>
                          <Typography variant="subtitle2" fontWeight="700" color="text.secondary">
                            Auditing Transactions: {selectedAuditCat === 'All' ? 'All Items' : selectedAuditCat}
                          </Typography>
                          <TextField
                            placeholder="Search audited items..."
                            value={auditSearchQuery}
                            onChange={(e) => setAuditSearchQuery(e.target.value)}
                            size="small"
                            variant="outlined"
                            sx={{
                              width: '200px',
                              '& .MuiOutlinedInput-root': {
                                borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                                fontSize: '12px',
                              },
                              '& .MuiOutlinedInput-input': {
                                py: 0.5,
                                px: 1,
                              }
                            }}
                          />
                        </Box>

                        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: `${theme.shape.borderRadius}px`, border: `1px solid ${theme.palette.divider}`, maxHeight: '55vh', overflowY: 'auto' }}>
                          <Table size="small" stickyHeader>
                            <TableHead>
                              <TableRow sx={{ bgcolor: 'action.hover' }}>
                                <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Date</TableCell>
                                <TableCell sx={{ fontWeight: 700, fontSize: 11, width: '150px' }}>Category</TableCell>
                                <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Description</TableCell>
                                <TableCell sx={{ fontWeight: 700, fontSize: 11 }} align="right">Original Amount</TableCell>
                                <TableCell sx={{ fontWeight: 700, fontSize: 11 }} align="right">Comp Value</TableCell>
                                <TableCell sx={{ fontWeight: 700, fontSize: 11 }}>Account</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {paginatedAuditTxns.map((row) => {
                                const isIncome = row.category.toLowerCase() === 'income';
                                const rowCompVal = isIncome ? row.amount : -row.amount;
                                
                                return (
                                  <TableRow key={row.id} hover>
                                    <TableCell sx={{ fontSize: '12px' }}>{row.date}</TableCell>
                                    <TableCell sx={{ py: 0.5 }}>
                                      <Select
                                        value={row.category}
                                        onChange={async (e) => {
                                          await handleRecategorize(row.id, e.target.value as string);
                                        }}
                                        size="small"
                                        variant="outlined"
                                        sx={{
                                          fontSize: '12px',
                                          width: '100%',
                                          borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                                          '& .MuiSelect-select': {
                                            py: 0.5,
                                            px: 1,
                                          }
                                        }}
                                      >
                                        {categoriesList.map(c => (
                                          <MenuItem key={c.id} value={c.name} sx={{ fontSize: '12px' }}>{c.name}</MenuItem>
                                        ))}
                                      </Select>
                                    </TableCell>
                                    <TableCell sx={{ fontSize: '12px' }}>{row.description}</TableCell>
                                    <TableCell align="right" sx={{ fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
                                      ${row.amount.toFixed(2)}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontSize: '12px', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: rowCompVal >= 0 ? 'success.main' : 'error.main' }}>
                                      {rowCompVal >= 0 ? `$${rowCompVal.toFixed(2)}` : `($${Math.abs(rowCompVal).toFixed(2)})`}
                                    </TableCell>
                                    <TableCell sx={{ fontSize: '12px' }}>{row.accountId}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                          <TablePagination
                            component="div"
                            count={auditedTxns.length}
                            page={auditPage}
                            onPageChange={(_, p) => setAuditPage(p)}
                            rowsPerPage={auditPageSize}
                            onRowsPerPageChange={(e) => {
                              setAuditPageSize(Number(e.target.value));
                              setAuditPage(0);
                            }}
                            rowsPerPageOptions={[10, 25, 50, 100]}
                            sx={{ borderTop: '1px solid rgba(0, 0, 0, 0.08)' }}
                          />
                        </TableContainer>
                      </Box>
                    </Panel>
                  </PanelGroup>
                </Box>
              ) : loadedContent ? (
                derivedPreviewDoc.type === 'text/markdown' ? (
                  <PanelGroup
                    orientation="horizontal"
                    style={{
                      height: '65vh',
                      border: `1px solid ${theme.palette.divider}`,
                      borderRadius: `${theme.shape.borderRadius}px`,
                      overflow: 'hidden'
                    }}
                  >
                    {/* Table of Contents Column */}
                    <Panel id="pnl-toc" defaultSize={25} minSize={15} maxSize={45}>
                      <Box sx={{ height: '100%', overflowY: 'auto', p: 2 }}>
                        <Typography variant="subtitle2" fontWeight="700" color="text.secondary" sx={{ mb: 1.5 }}>
                          Table of Contents
                        </Typography>
                        {tocItems.length > 0 ? (
                          <List dense disablePadding>
                            {tocItems.map((item, idx) => (
                              <ListItemButton
                                key={idx}
                                onClick={() => handleScrollToHeading(item.id)}
                                sx={{
                                  pl: (item.level - 1) * 2,
                                  py: 0.5,
                                  borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                                  mb: 0.5
                                }}
                              >
                                <ListItemText
                                  primary={item.text}
                                  primaryTypographyProps={{
                                    fontSize: '13px',
                                    fontWeight: item.level === 1 ? 600 : 400,
                                    color: item.level === 1 ? 'text.primary' : 'text.secondary',
                                    noWrap: true
                                  }}
                                />
                              </ListItemButton>
                            ))}
                          </List>
                        ) : (
                          <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                            No headings found
                          </Typography>
                        )}
                      </Box>
                    </Panel>

                    {/* Resizable Divider Handle */}
                    <StyledResizeHandle ariaLabel="Resize panels" />

                    {/* Right Column: Content */}
                    <Panel id="pnl-markdown-content" defaultSize={75} minSize={50}>
                      <Box sx={{ height: '100%', overflowY: 'auto', p: 3 }}>
                        <SimpleMarkdown
                          content={loadedContent}
                          onLinkClick={(url) => {
                            const match = url.match(/^doc:\/\/([^#]+)(?:#tab=(.+))?$/);
                            if (match) {
                              setSearchParams({ previewId: match[1], tab: match[2] || 'All' });
                            }
                          }}
                        />
                      </Box>
                    </Panel>
                  </PanelGroup>
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
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {pageRows.map((row, index) => {
                            const rowCompVal = Number(row['Computation Value'] || row.ComputationValue || 0);
                            const rowAmount = Number(row['Original Amount'] || row.OriginalAmount || row.Original_Amount || row.amount || 0);
                            const txId = row.ID ? Number(row.ID) : null;
                            const hasTx = txId !== null && !isNaN(txId);
                            
                            return (
                              <TableRow key={row.ID || index} hover>
                                <TableCell sx={{ fontSize: '13px' }}>{row.Date}</TableCell>
                                <TableCell sx={{ py: 0.5 }}>
                                  {hasTx ? (
                                    <Select
                                      value={row.Category}
                                      onChange={async (e) => {
                                        await handleRecategorize(txId!, e.target.value as string);
                                      }}
                                      size="small"
                                      variant="outlined"
                                      sx={{
                                        fontSize: '12px',
                                        width: '100%',
                                        borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                                        '& .MuiSelect-select': {
                                          py: 0.5,
                                          px: 1,
                                        }
                                      }}
                                    >
                                      {categoriesList.map(c => (
                                        <MenuItem key={c.id} value={c.name} sx={{ fontSize: '12px' }}>{c.name}</MenuItem>
                                      ))}
                                    </Select>
                                  ) : (
                                    <Chip label={row.Category} size="small" variant="outlined" sx={{ borderRadius: (theme) => `${theme.shape.borderRadius}px` }} />
                                  )}
                                </TableCell>
                                <TableCell sx={{ fontSize: '13px' }}>{row.Description}</TableCell>
                                <TableCell align="right" sx={{ fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                                  ${rowAmount.toFixed(2)}
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: '13px', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: rowCompVal >= 0 ? 'success.main' : 'error.main' }}>
                                  {rowCompVal >= 0 ? `$${rowCompVal.toFixed(2)}` : `($${Math.abs(rowCompVal).toFixed(2)})`}
                                </TableCell>
                                <TableCell sx={{ fontSize: '13px' }}>{row.Account}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      <TablePagination
                        component="div"
                        count={filteredRows.length}
                        page={page}
                        onPageChange={(_, p) => setPage(p)}
                        rowsPerPage={pageSize}
                        onRowsPerPageChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setPage(0);
                        }}
                        rowsPerPageOptions={[25, 50, 100, 250]}
                        sx={{ borderTop: '1px solid rgba(0, 0, 0, 0.08)' }}
                      />
                    </TableContainer>
                  </Box>
                ) : (
                  <Box component="pre" sx={{ m: 0, p: 2, bgcolor: 'action.hover', borderRadius: (theme) => `${theme.shape.borderRadius}px`, fontFamily: 'monospace', fontSize: 13, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {loadedContent}
                  </Box>
                )
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', textAlign: 'center', py: 4 }}>
                  No text content available for preview. This may be an uploaded binary or local file.
                </Typography>
              )
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
        <Box>
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
        </Box>
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

function StyledResizeHandle({ ariaLabel }: { ariaLabel: string }) {
  return (
    <PanelResizeHandle aria-label={ariaLabel} style={{ width: 16, position: 'relative' }}>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          margin: '0 auto',
          width: 2,
          bgcolor: 'divider',
          borderRadius: 1,
          transition: 'background-color 120ms ease',
          '[data-resize-handle-active] &, &:hover': {
            bgcolor: 'primary.main',
            width: 3,
          },
        }}
      />
    </PanelResizeHandle>
  );
}
