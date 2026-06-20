import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ p: 4, height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
          <Paper elevation={3} sx={{ p: 4, maxWidth: 600, width: '100%' }}>
            <Typography variant="h5" color="error" gutterBottom fontWeight="700">
              Something went wrong.
            </Typography>
            <Typography variant="body1" sx={{ mb: 3 }}>
              An unexpected error occurred in the React component tree.
            </Typography>
            
            <Box sx={{ bgcolor: 'background.default', p: 2, borderRadius: 1, overflowX: 'auto', mb: 3 }}>
              <Typography variant="body2" component="pre" sx={{ m: 0, color: 'error.main', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {this.state.error && this.state.error.toString()}
              </Typography>
              {this.state.errorInfo && (
                <Typography variant="caption" component="pre" sx={{ mt: 2, display: 'block', color: 'text.secondary', whiteSpace: 'pre-wrap' }}>
                  {this.state.errorInfo.componentStack}
                </Typography>
              )}
            </Box>
            
            <Button 
              variant="contained" 
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null });
                window.location.href = '/';
              }}
            >
              Reload Application
            </Button>
          </Paper>
        </Box>
      );
    }

    return this.props.children;
  }
}
