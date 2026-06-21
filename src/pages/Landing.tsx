import { Box, Button, Container, Typography, Grid, Paper } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AppleIcon from '@mui/icons-material/Apple';
import WindowIcon from '@mui/icons-material/Window';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import SecurityIcon from '@mui/icons-material/Security';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import RuleIcon from '@mui/icons-material/Rule';
import AnimatedLogo from '../components/AnimatedLogo';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {/* Header */}
      <Box component="header" sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <AnimatedLogo />
        <Button 
          variant="outlined" 
          color="primary" 
          onClick={() => navigate('/dashboard')}
          startIcon={<PlayCircleOutlineIcon />}
          sx={{ borderRadius: 8, textTransform: 'none', fontWeight: 600 }}
        >
          Web Demo
        </Button>
      </Box>

      {/* Hero Section */}
      <Container maxWidth="lg" sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', py: { xs: 8, md: 12 } }}>
        <Grid container spacing={8} alignItems="center">
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="h2" component="h1" fontWeight={800} gutterBottom sx={{ 
              background: 'linear-gradient(45deg, #1976d2 30%, #9c27b0 90%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Your Local-First Spending Dashboard
            </Typography>
            <Typography variant="h5" color="text.secondary" paragraph sx={{ mb: 4, lineHeight: 1.6 }}>
              Ingest multi-bank CSVs, apply rule-based categorization, and manage your budget entirely in your browser. No cloud, no servers, full privacy.
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button 
                variant="contained" 
                size="large" 
                startIcon={<AppleIcon />}
                href="https://github.com/barnesy/strictly-spending/releases/latest"
                target="_blank"
                sx={{ 
                  borderRadius: 2, 
                  py: 1.5, 
                  px: 3, 
                  textTransform: 'none', 
                  fontWeight: 600,
                  bgcolor: '#000',
                  color: '#fff',
                  '&:hover': { bgcolor: '#333' }
                }}
              >
                Download for Mac
              </Button>
              <Button 
                variant="contained" 
                size="large" 
                startIcon={<WindowIcon />}
                href="https://github.com/barnesy/strictly-spending/releases/latest"
                target="_blank"
                sx={{ 
                  borderRadius: 2, 
                  py: 1.5, 
                  px: 3, 
                  textTransform: 'none', 
                  fontWeight: 600,
                  bgcolor: '#0078D7',
                  color: '#fff',
                  '&:hover': { bgcolor: '#005A9E' }
                }}
              >
                Download for Windows
              </Button>
            </Box>
            <Box sx={{ mt: 3 }}>
              <Button 
                variant="text" 
                size="large" 
                onClick={() => navigate('/dashboard')}
                endIcon={<PlayCircleOutlineIcon />}
                sx={{ textTransform: 'none', fontWeight: 600, fontSize: '1.1rem' }}
              >
                Or try the live web demo
              </Button>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Box sx={{ 
              position: 'relative',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: -20, left: -20, right: -20, bottom: -20,
                background: 'linear-gradient(45deg, rgba(25,118,210,0.1) 0%, rgba(156,39,176,0.1) 100%)',
                borderRadius: 8,
                zIndex: -1,
                filter: 'blur(40px)'
              }
            }}>
              <Paper elevation={24} sx={{ 
                borderRadius: 4, 
                overflow: 'hidden',
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                boxShadow: '0 20px 40px rgba(0,0,0,0.1)'
              }}>
                {/* Mockup Window Header */}
                <Box sx={{ bgcolor: 'action.hover', p: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', gap: 1 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#ff5f56' }} />
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#ffbd2e' }} />
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#27c93f' }} />
                </Box>
                {/* Mockup Content */}
                <Box sx={{ p: 4, textAlign: 'center', height: 350, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(25,118,210,0.05) 0%, rgba(156,39,176,0.05) 100%)' }}>
                  <AutoGraphIcon sx={{ fontSize: 100, color: 'primary.main', mb: 3, opacity: 0.9 }} />
                  <Typography variant="h5" color="text.primary" fontWeight={600} gutterBottom>
                    Strictly Spending
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    Your financial dashboard awaits.
                  </Typography>
                </Box>
              </Paper>
            </Box>
          </Grid>
        </Grid>

        {/* Features Section */}
        <Grid container spacing={4} sx={{ mt: { xs: 8, md: 12 }, mb: 8 }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper elevation={0} sx={{ p: 4, height: '100%', borderRadius: 4, border: '1px solid', borderColor: 'divider', transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 } }}>
              <SecurityIcon sx={{ fontSize: 40, color: 'primary.main', mb: 2 }} />
              <Typography variant="h6" gutterBottom fontWeight={700}>100% Local-First</Typography>
              <Typography color="text.secondary">Your data never leaves your device. No cloud syncing, no required accounts, total privacy.</Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper elevation={0} sx={{ p: 4, height: '100%', borderRadius: 4, border: '1px solid', borderColor: 'divider', transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 } }}>
              <RuleIcon sx={{ fontSize: 40, color: 'secondary.main', mb: 2 }} />
              <Typography variant="h6" gutterBottom fontWeight={700}>Smart Categorization</Typography>
              <Typography color="text.secondary">Set up rules to automatically categorize transactions from multiple bank CSV formats instantly.</Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper elevation={0} sx={{ p: 4, height: '100%', borderRadius: 4, border: '1px solid', borderColor: 'divider', transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 } }}>
              <AutoGraphIcon sx={{ fontSize: 40, color: 'success.main', mb: 2 }} />
              <Typography variant="h6" gutterBottom fontWeight={700}>Insightful Dashboards</Typography>
              <Typography color="text.secondary">Visualize your spending patterns, track your budget, and plan for taxes and loans with ease.</Typography>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
