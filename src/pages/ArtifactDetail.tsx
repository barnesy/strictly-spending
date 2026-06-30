import { useParams, useNavigate } from 'react-router-dom';
import { Box, IconButton, Typography, Button, Paper, Table, TableHead, TableRow, TableCell, TableBody, Stack } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useArtifacts } from '../hooks/queries';
import SimpleMarkdown from '../components/SimpleMarkdown';
import ArticleIcon from '@mui/icons-material/Article';
import GridOnIcon from '@mui/icons-material/GridOn';
import { parseSpreadsheet } from '../spreadsheetUtils';
import { downloadFile } from '../downloadUtils';
import Papa from 'papaparse';

export default function ArtifactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: artifacts = [], isLoading } = useArtifacts();
  
  const artifact = artifacts.find(a => a.id === id);

  if (isLoading) return <Box sx={{ p: 4 }}>Loading...</Box>;

  if (!artifact) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6">Artifact not found</Typography>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/artifacts')} sx={{ mt: 2 }}>
          Back to Gallery
        </Button>
      </Box>
    );
  }

  const isSpreadsheet = artifact.type === 'spreadsheet';

  const handleDownloadCSV = () => {
    const data = parseSpreadsheet(artifact.content);
    if (!data) return;
    
    const csvContent = Papa.unparse({
      fields: data.headers,
      data: data.rows
    });
    
    downloadFile(csvContent, `${artifact.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`, 'text/csv;charset=utf-8;');
  };

  return (
    <Box sx={{ pb: 6, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton onClick={() => navigate('/artifacts')} sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {artifact.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5, fontWeight: 600, mb: artifact.summary ? 1 : 0 }}>
              {artifact.type === 'skill' ? 'Capability' : isSpreadsheet ? 'Spreadsheet' : artifact.type === 'pdf' ? 'PDF Document' : 'Document'}
            </Typography>
            {artifact.summary && (
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 700, mt: 0.5 }}>
                {artifact.summary}
              </Typography>
            )}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {artifact.path && (
            <Button
              variant="outlined"
              color="primary"
              startIcon={<ArticleIcon />}
              onClick={() => {
                import('@tauri-apps/api/core').then(({ invoke }) => {
                  invoke('open_document', { path: artifact.path! }).catch(console.error);
                });
              }}
            >
              Open Original
            </Button>
          )}
          {isSpreadsheet && (
            <Button
              variant="outlined"
              color="success"
              startIcon={<GridOnIcon />}
              onClick={handleDownloadCSV}
            >
              Download CSV
            </Button>
          )}
        </Box>
      </Box>

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Box sx={{ width: '100%', maxWidth: 900 }}>
          {artifact.type === 'skill' ? (
            <Paper
              variant="outlined"
              sx={(theme) => ({
                p: 3,
                bgcolor: '#18181c',
                color: '#e2e8f0',
                borderColor: 'rgba(0,0,0,0.12)',
                borderRadius: 2,
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: 12.5,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                scrollbarWidth: 'thin',
                scrollbarColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.15) transparent' : 'rgba(0,0,0,0.15) transparent',
              })}
            >
              {artifact.content}
            </Paper>
          ) : isSpreadsheet ? (
            <Paper
              variant="outlined"
              sx={{
                p: 0,
                bgcolor: 'background.paper',
                borderRadius: 2,
                borderColor: 'rgba(0,0,0,0.06)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.02)',
                overflowX: 'auto',
                minHeight: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {(() => {
                const data = parseSpreadsheet(artifact.content);
                if (!data) {
                  return (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                        Invalid or empty spreadsheet format.
                      </Typography>
                    </Box>
                  );
                }
                const { headers, rows } = data;
                return (
                  <Table size="small" sx={{ borderCollapse: 'collapse', minWidth: 500 }}>
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#f4f5f8', height: 26 }}>
                        <TableCell sx={{ width: 40, p: '4px', borderRight: '1px solid #e0e0e0', borderBottom: '1px solid #e0e0e0', bgcolor: '#eaecef' }} />
                        {headers.map((_, i) => (
                          <TableCell
                            key={i}
                            align="center"
                            sx={{
                              p: '4px',
                              fontWeight: 600,
                              fontSize: 10,
                              color: 'text.secondary',
                              borderRight: '1px solid #e0e0e0',
                              borderBottom: '1px solid #e0e0e0',
                              fontFamily: 'monospace, sans-serif',
                              bgcolor: '#eaecef',
                            }}
                          >
                            {String.fromCharCode(65 + i)}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow sx={{ bgcolor: '#fafafa' }}>
                        <TableCell sx={{ bgcolor: '#f4f5f8', width: 40, p: 1, borderRight: '1px solid #e0e0e0', borderBottom: '2px solid #d0d0d0' }} />
                        {headers.map((h, i) => (
                          <TableCell
                            key={i}
                            sx={{
                              p: 1.25,
                              fontWeight: 700,
                              fontSize: 11.5,
                              color: 'text.primary',
                              borderRight: '1px solid #e0e0e0',
                              borderBottom: '2px solid #d0d0d0',
                            }}
                          >
                            {h}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row, rowIdx) => (
                        <TableRow key={rowIdx} hover>
                          <TableCell
                            align="center"
                            sx={{
                              bgcolor: '#f4f5f8',
                              width: 40,
                              p: 1,
                              fontWeight: 600,
                              color: 'text.secondary',
                              fontSize: 11,
                              borderRight: '1px solid #e0e0e0',
                              borderBottom: '1px solid #e0e0e0',
                              userSelect: 'none',
                            }}
                          >
                            {rowIdx + 1}
                          </TableCell>
                          {row.map((cell, cellIdx) => {
                            const cleanCell = cell.trim();
                            const isNum = /^\$?\-?\d+(\.\d+)?%?$/.test(cleanCell.replace(/,/g, ''));
                            const isNegative = cleanCell.startsWith('-') || cleanCell.startsWith('-$');
                            return (
                              <TableCell
                                key={cellIdx}
                                align={isNum ? 'right' : 'left'}
                                sx={{
                                  p: 1.25,
                                  fontSize: 12,
                                  borderRight: '1px solid #e0e0e0',
                                  borderBottom: '1px solid #e0e0e0',
                                  fontFamily: isNum ? 'monospace, sans-serif' : 'inherit',
                                  color: isNegative ? 'error.main' : 'text.primary',
                                  fontWeight: isNum ? 500 : 400,
                                }}
                              >
                                {cell}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              })()}
            </Paper>
          ) : artifact.type === 'pdf' ? (
            <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
              <ArticleIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6">PDF Document</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                This is a PDF document. Open it in the gallery to view externally.
              </Typography>
            </Paper>
          ) : (
            <Paper
              variant="outlined"
              sx={{
                p: 3,
                bgcolor: 'background.paper',
                borderRadius: 2,
                borderColor: 'rgba(0,0,0,0.06)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.02)',
              }}
            >
              <SimpleMarkdown content={artifact.content} />
            </Paper>
          )}
        </Box>
      </Box>
    </Box>
  );
}
