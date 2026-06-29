import { Box, Button, Typography, alpha, useTheme, Chip, Stack } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import DeleteIcon from '@mui/icons-material/Delete';

import { open } from '@tauri-apps/plugin-dialog';
import type { ChatArtifact } from '../types';

interface TaxDocumentUploadProps {
  documentId: string;
  label: string;
  accept: 'pdf' | 'spreadsheet';
  aiStatus: 'supported' | 'manual' | 'coming_soon';
  doc?: ChatArtifact;
  onUpload: (documentId: string, fileInfo: { filename: string; type: string; path: string; uploadedAt: string }) => void;
  onRemove?: (documentId: string) => void;
  onGenerateAi?: (documentId: string, label: string) => void;
}

export default function TaxDocumentUpload({ 
  documentId, 
  label, 
  accept, 
  doc, 
  aiStatus = 'manual', 
  onUpload,
  onRemove,
  onGenerateAi
}: TaxDocumentUploadProps) {
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
        const type = accept === 'pdf' ? 'application/pdf' : 'text/csv';
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

  const getStatusChip = () => {
    if (aiStatus === 'supported') {
      return (
        <Chip
          label="AI Generator"
          size="small"
          sx={{
            fontSize: '10px',
            fontWeight: 700,
            height: 20,
            bgcolor: alpha(theme.palette.secondary.main, 0.1),
            color: 'secondary.main',
            border: `1px solid ${alpha(theme.palette.secondary.main, 0.25)}`,
            '& .MuiChip-icon': { color: 'secondary.main' }
          }}
        />
      );
    } else if (aiStatus === 'coming_soon') {
      return (
        <Chip
          label="AI Coming Soon"
          size="small"
          icon={<AccessTimeIcon sx={{ fontSize: '12px !important' }} />}
          sx={{
            fontSize: '10px',
            fontWeight: 600,
            height: 20,
            bgcolor: alpha(theme.palette.info.main, 0.05),
            color: 'info.main',
            border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`,
            '& .MuiChip-icon': { color: 'info.main' }
          }}
        />
      );
    } else {
      return (
        <Chip
          label="Upload Required"
          size="small"
          icon={<UploadFileIcon sx={{ fontSize: '12px !important' }} />}
          sx={{
            fontSize: '10px',
            fontWeight: 600,
            height: 20,
            bgcolor: alpha(theme.palette.text.secondary, 0.05),
            color: 'text.secondary',
            border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
            '& .MuiChip-icon': { color: 'text.secondary' }
          }}
        />
      );
    }
  };

  const getHelperText = () => {
    if (isUploaded) {
      return `Attached: ${doc.title}`;
    }
    if (aiStatus === 'supported') {
      return "Ask the AI Copilot to generate this statement using your audited data.";
    }
    if (aiStatus === 'coming_soon') {
      return "Future integration will generate this automatically from bank feeds.";
    }
    return `Upload the official ${accept.toUpperCase()} document issued to you.`;
  };

  return (
    <Box sx={{ 
      mb: 2, 
      p: 2, 
      borderRadius: 2, 
      border: '1px dashed', 
      borderColor: isUploaded ? 'success.main' : 'divider', 
      bgcolor: isUploaded ? alpha(theme.palette.success.main, 0.04) : 'background.paper', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between', 
      gap: 2 
    }}>
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="body2" fontWeight="600" color={isUploaded ? 'success.main' : 'text.primary'} sx={{ mr: 1 }}>
            {label}
          </Typography>
          {getStatusChip()}
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block">
          {getHelperText()}
        </Typography>
      </Box>

      <Box>
        {isUploaded ? (
          <Stack direction="row" spacing={1}>
            <Button
              variant="text"
              color="success"
              size="small"
              startIcon={<CheckCircleIcon />}
              onClick={handleFileChange}
              sx={{ whiteSpace: 'nowrap', textTransform: 'none', borderRadius: `${theme.shape.borderRadius}px` }}
            >
              Replace
            </Button>
            {onRemove && (
              <Button
                variant="text"
                color="error"
                size="small"
                startIcon={<DeleteIcon />}
                onClick={() => onRemove(documentId)}
                sx={{ whiteSpace: 'nowrap', textTransform: 'none', borderRadius: `${theme.shape.borderRadius}px` }}
              >
                Remove
              </Button>
            )}
          </Stack>
        ) : (
          <Stack direction="row" spacing={1}>
            {aiStatus === 'supported' && onGenerateAi && (
              <Button
                variant="contained"
                color="secondary"
                size="small"
                onClick={() => onGenerateAi(documentId, label)}
                sx={{ whiteSpace: 'nowrap', textTransform: 'none', borderRadius: `${theme.shape.borderRadius}px`, fontWeight: 600 }}
              >
                Generate with AI
              </Button>
            )}
            <Button
              variant="outlined"
              color={aiStatus === 'supported' ? "secondary" : "primary"}
              size="small"
              startIcon={<UploadFileIcon />}
              onClick={handleFileChange}
              sx={{ whiteSpace: 'nowrap', textTransform: 'none', borderRadius: `${theme.shape.borderRadius}px` }}
            >
              Upload
            </Button>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
