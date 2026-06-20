import { Box, Button, Typography, alpha, useTheme } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

import { open } from '@tauri-apps/plugin-dialog';
import type { AppDocument } from '../types';

interface TaxDocumentUploadProps {
  documentId: string;
  label: string;
  accept: 'pdf' | 'spreadsheet';
  doc?: AppDocument;
  onUpload: (documentId: string, fileInfo: { filename: string; type: string; path: string; uploadedAt: string }) => void;
}

export default function TaxDocumentUpload({ documentId, label, accept, doc, onUpload }: TaxDocumentUploadProps) {
  const theme = useTheme();

  const isUploaded = !!doc;


  const handleFileChange = async () => {
    try {
      const selectedPath = await open({
        multiple: false,
        directory: false,
        filters: accept === 'pdf' 
          ? [{ name: 'PDF', extensions: ['pdf'] }] 
          : [{ name: 'Spreadsheet', extensions: ['csv', 'xlsx', 'xls'] }]
      });

      if (selectedPath && typeof selectedPath === 'string') {
        const filename = selectedPath.split(/[/\\]/).pop() || 'Unknown File';
        const type = accept === 'pdf' ? 'application/pdf' : 'text/csv'; // Approximate type
        onUpload(documentId, {
          filename,
          type,
          path: selectedPath,
          uploadedAt: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error("Failed to open file dialog", err);
    }
  };

  return (
    <Box sx={{ mb: 2, p: 2, borderRadius: 2, border: '1px dashed', borderColor: isUploaded ? 'success.main' : 'divider', bgcolor: isUploaded ? alpha(theme.palette.success.main, 0.05) : 'background.paper', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <Typography variant="body2" fontWeight="600" color={isUploaded ? 'success.main' : 'text.primary'} noWrap>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          {accept === 'pdf' ? 'Requires PDF' : 'Requires Spreadsheet'}
        </Typography>
        {isUploaded && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ mt: 0.5, display: 'block' }}>
            Attached: {doc.name}
          </Typography>
        )}
      </Box>

      <Box>
        <Button
          variant={isUploaded ? "text" : "outlined"}
          color={isUploaded ? "success" : "primary"}
          size="small"
          startIcon={isUploaded ? <CheckCircleIcon /> : <UploadFileIcon />}
          onClick={handleFileChange}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {isUploaded ? 'Replace' : 'Upload'}
        </Button>
      </Box>
    </Box>
  );
}
