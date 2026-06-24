import { Box, Button, Container, Typography, Grid, Paper, Chip } from '@mui/material';
import AppleIcon from '@mui/icons-material/Apple';
import WindowIcon from '@mui/icons-material/Window';
import SecurityIcon from '@mui/icons-material/Security';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import RuleIcon from '@mui/icons-material/Rule';
import MemoryIcon from '@mui/icons-material/Memory';
import TerminalIcon from '@mui/icons-material/Terminal';
import NoAccountsIcon from '@mui/icons-material/NoAccounts';
import AllInclusiveIcon from '@mui/icons-material/AllInclusive';
import AnimatedLogo from '../components/AnimatedLogo';

export default function Landing() {
  const handleDownload = async (platform: 'mac' | 'windows') => {
    try {
      const response = await fetch('https://api.github.com/repos/barnesy/strictly-spending/releases/latest');
      if (!response.ok) throw new Error('Failed to fetch release');
      const data = await response.json();
      
      let asset;
      if (platform === 'mac') {
        asset = data.assets.find((a: any) => a.name.endsWith('.dmg') || a.name.endsWith('.app.tar.gz'));
      } else if (platform === 'windows') {
        asset = data.assets.find((a: any) => a.name.endsWith('.exe') || a.name.endsWith('.msi'));
      }

      if (asset && asset.browser_download_url) {
        window.location.href = asset.browser_download_url;
      } else {
        window.open('https://github.com/barnesy/strictly-spending/releases/latest', '_blank');
      }
    } catch (error) {
      console.error('Failed to fetch release info:', error);
      window.open('https://github.com/barnesy/strictly-spending/releases/latest', '_blank');
    }
  };

  return (
    <Box sx={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      overflowY: 'auto',
      bgcolor: '#FAFAFA', // Clean light background
      color: '#111827', 
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      letterSpacing: '-0.02em',
    }}>
      {/* Header */}
      <Box component="header" sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <AnimatedLogo />
          <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: '-0.03em', color: '#111827' }}>
            Strictly Spending
          </Typography>
        </Box>
      </Box>

      {/* Hero Section */}
      <Container maxWidth="lg" sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', py: { xs: 8, md: 12 }, textAlign: 'center' }}>
        
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
          <Chip 
            label="Fully Private Budgeting & Local AI" 
            sx={{ 
              bgcolor: 'rgba(0,0,0,0.04)', 
              color: '#374151', 
              fontWeight: 600, 
              border: '1px solid rgba(0,0,0,0.1)',
              backdropFilter: 'blur(10px)',
            }} 
          />
        </Box>

        <Typography variant="h1" component="h1" sx={{ 
          fontWeight: 800, 
          fontSize: { xs: '3rem', md: '4.5rem' },
          lineHeight: 1.1,
          mb: 3,
          background: 'linear-gradient(180deg, #111827 0%, #4B5563 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textShadow: '0px 4px 20px rgba(0,0,0,0.05)'
        }}>
          Infinite Intelligence,<br />Absolute Privacy.
        </Typography>
        
        <Typography variant="h5" sx={{ mb: 6, maxWidth: '700px', mx: 'auto', lineHeight: 1.5, color: '#4B5563', fontWeight: 400 }}>
          Ingest multi-bank CSVs, apply intelligent categorization, and manage your budget entirely on your machine. Featuring an unlimited, free, and completely local AI assistant.
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap', mb: 10 }}>
          <Button 
            variant="contained" 
            size="large" 
            startIcon={<AppleIcon />}
            onClick={() => handleDownload('mac')}
            sx={{ 
              borderRadius: '8px', 
              py: 3.5, 
              px: 6, 
              textTransform: 'none', 
              fontWeight: 600,
              fontSize: '1.1rem',
              bgcolor: '#000000',
              color: '#FFFFFF',
              '&:hover': { bgcolor: '#333333', transform: 'translateY(-2px)' },
              transition: 'all 0.2s'
            }}
          >
            Download for Mac
          </Button>
          <Button 
            variant="contained" 
            size="large" 
            startIcon={<WindowIcon />}
            onClick={() => handleDownload('windows')}
            sx={{ 
              borderRadius: '8px', 
              py: 3.5, 
              px: 6, 
              textTransform: 'none', 
              fontWeight: 600,
              fontSize: '1.1rem',
              bgcolor: '#FFFFFF',
              color: '#111827',
              border: '1px solid #D1D5DB',
              '&:hover': { bgcolor: '#F9FAFB', transform: 'translateY(-2px)' },
              transition: 'all 0.2s',
              boxShadow: 'none',
            }}
          >
            Download for Windows
          </Button>
        </Box>

        {/* Video Demo Section */}
        <Box sx={{ maxWidth: '1000px', mx: 'auto', width: '100%' }}>
          <Paper elevation={12} sx={{ 
            borderRadius: '12px',
            overflow: 'hidden',
            bgcolor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            boxShadow: '0 24px 80px rgba(0,0,0,0.1)',
          }}>
            {/* Mockup Window Header */}
            <Box sx={{ bgcolor: '#F3F4F6', p: 1.5, display: 'flex', gap: 1, alignItems: 'center', borderBottom: '1px solid #E5E7EB' }}>
              <Box sx={{ display: 'flex', gap: 1, pl: 1 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#FF5F56', border: '1px solid #E0443E' }} />
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#FFBD2E', border: '1px solid #DEA123' }} />
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#27C93F', border: '1px solid #1AAB29' }} />
              </Box>
            </Box>
            {/* Mockup Content - Video */}
            <Box sx={{ width: '100%', lineHeight: 0 }}>
              <video 
                src={`${import.meta.env.BASE_URL}strictly-spending.mp4`} 
                autoPlay 
                loop 
                muted 
                playsInline 
                style={{ width: '100%', height: 'auto', display: 'block' }} 
              />
            </Box>
          </Paper>
        </Box>

        {/* Features Section */}
        <Grid container spacing={4} sx={{ mt: { xs: 10, md: 16 } }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper elevation={0} sx={{ p: 4, height: '100%', bgcolor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', textAlign: 'left', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: '0 8px 30px rgba(0,0,0,0.04)' } }}>
              <Box sx={{ width: 48, height: 48, borderRadius: '8px', bgcolor: 'rgba(10,132,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
                <SecurityIcon sx={{ color: '#0A84FF' }} />
              </Box>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, color: '#111827' }}>
                Absolute Secrecy
              </Typography>
              <Typography sx={{ color: '#4B5563', lineHeight: 1.6 }}>
                Your data never leaves your device. No cloud syncing, no mandatory accounts, total offline privacy for your most sensitive financial data.
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper elevation={0} sx={{ p: 4, height: '100%', bgcolor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', textAlign: 'left', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: '0 8px 30px rgba(0,0,0,0.04)' } }}>
              <Box sx={{ width: 48, height: 48, borderRadius: '8px', bgcolor: 'rgba(48,209,88,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
                <RuleIcon sx={{ color: '#30D158' }} />
              </Box>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, color: '#111827' }}>
                Smart Rules
              </Typography>
              <Typography sx={{ color: '#4B5563', lineHeight: 1.6 }}>
                Set up precise logic to automatically categorize transactions from multiple bank CSV formats instantly. Spend less time tagging, more time analyzing.
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper elevation={0} sx={{ p: 4, height: '100%', bgcolor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', textAlign: 'left', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: '0 8px 30px rgba(0,0,0,0.04)' } }}>
              <Box sx={{ width: 48, height: 48, borderRadius: '8px', bgcolor: 'rgba(255,159,10,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
                <AutoGraphIcon sx={{ color: '#FF9F0A' }} />
              </Box>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, color: '#111827' }}>
                Visual Grandeur
              </Typography>
              <Typography sx={{ color: '#4B5563', lineHeight: 1.6 }}>
                Visualize your spending patterns, track your budget, and plan for taxes with meticulous detail and beautiful interactive charts.
              </Typography>
            </Paper>
          </Grid>
        </Grid>

        {/* AI Deep Dive Section */}
        <Box sx={{ mt: { xs: 12, md: 20 }, textAlign: 'center' }}>
          <Typography variant="h2" sx={{ fontWeight: 800, fontSize: { xs: '2.5rem', md: '3.5rem' }, mb: 2, color: '#111827' }}>
            Meet Your Free, Local AI Assistant.
          </Typography>
          <Typography sx={{ maxWidth: '800px', mx: 'auto', color: '#4B5563', fontSize: '1.2rem', lineHeight: 1.6, mb: 8 }}>
            Ask questions about your spending, get summaries, and find anomalous transactions. Our AI copilot runs entirely on your local machine using Ollama.
          </Typography>

          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper elevation={0} sx={{ p: 5, height: '100%', bgcolor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: '0 8px 30px rgba(0,0,0,0.04)' } }}>
                <NoAccountsIcon sx={{ fontSize: 40, color: '#FF3B30', mb: 2 }} />
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: '#111827' }}>No Subscriptions Required</Typography>
                <Typography sx={{ color: '#4B5563', lineHeight: 1.6 }}>
                  You don't need a ChatGPT, Gemini, or Claude account. No API keys, no monthly fees, no hidden costs. It's completely free to use.
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper elevation={0} sx={{ p: 5, height: '100%', bgcolor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: '0 8px 30px rgba(0,0,0,0.04)' } }}>
                <AllInclusiveIcon sx={{ fontSize: 40, color: '#007AFF', mb: 2 }} />
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: '#111827' }}>Unlimited Tokens</Typography>
                <Typography sx={{ color: '#4B5563', lineHeight: 1.6 }}>
                  Chat as much as you want. Because the model runs on your hardware, there are no token limits or usage quotas to worry about.
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper elevation={0} sx={{ p: 5, height: '100%', bgcolor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: '0 8px 30px rgba(0,0,0,0.04)' } }}>
                <MemoryIcon sx={{ fontSize: 40, color: '#34C759', mb: 2 }} />
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: '#111827' }}>100% Data Privacy</Typography>
                <Typography sx={{ color: '#4B5563', lineHeight: 1.6 }}>
                  Your sensitive financial data is never sent to the cloud. The AI analyzes your data locally, ensuring your finances remain strictly confidential.
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper elevation={0} sx={{ p: 5, height: '100%', bgcolor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: '0 8px 30px rgba(0,0,0,0.04)' } }}>
                <TerminalIcon sx={{ fontSize: 40, color: '#AF52DE', mb: 2 }} />
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: '#111827' }}>Model Flexibility</Typography>
                <Typography sx={{ color: '#4B5563', lineHeight: 1.6 }}>
                  Choose the right model for your hardware. Run lightweight 8B models on laptops, or scale up to massive 70B models if you have the compute.
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </Box>

        <Box sx={{ mt: 16, mb: 8, py: 8, borderTop: '1px solid rgba(0,0,0,0.08)', textAlign: 'center' }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 4, color: '#111827' }}>
            Ready to take control?
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button 
              variant="contained" 
              size="large" 
              startIcon={<AppleIcon />}
              href="https://github.com/barnesy/strictly-spending/releases/latest"
              target="_blank"
              sx={{ 
                borderRadius: '8px', 
                py: 4, 
                px: 6, 
                textTransform: 'none', 
                fontWeight: 700,
                fontSize: '1.2rem',
                bgcolor: '#000000',
                color: '#FFFFFF',
                '&:hover': { bgcolor: '#333333', transform: 'translateY(-2px)' },
                transition: 'all 0.2s'
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
                borderRadius: '8px', 
                py: 4, 
                px: 6, 
                textTransform: 'none', 
                fontWeight: 700,
                fontSize: '1.2rem',
                bgcolor: '#FFFFFF',
                color: '#111827',
                border: '1px solid #D1D5DB',
                '&:hover': { bgcolor: '#F9FAFB', transform: 'translateY(-2px)' },
                transition: 'all 0.2s',
                boxShadow: 'none',
              }}
            >
              Download for Windows
            </Button>
          </Box>
        </Box>

      </Container>
    </Box>
  );
}


