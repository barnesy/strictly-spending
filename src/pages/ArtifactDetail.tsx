import { useParams, useNavigate } from 'react-router-dom';
import { Box, IconButton, Typography, Button, Paper } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useArtifacts } from '../hooks/queries';
import SimpleMarkdown from '../components/SimpleMarkdown';
import ArticleIcon from '@mui/icons-material/Article';

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

  return (
    <Box sx={{ pb: 6, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center' }}>
        <IconButton onClick={() => navigate('/artifacts')} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {artifact.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5, fontWeight: 600, mb: artifact.summary ? 1 : 0 }}>
            {artifact.type === 'skill' ? 'Capability' : artifact.type === 'spreadsheet' ? 'Spreadsheet' : artifact.type === 'pdf' ? 'PDF Document' : 'Document'}
          </Typography>
          {artifact.summary && (
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 700, mt: 0.5 }}>
              {artifact.summary}
            </Typography>
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
