import { useSettings } from './hooks/queries';
import { useEffect, useMemo } from 'react';
import { queryClient } from './queryClient';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3';
import { getAppTheme } from './theme';

import { useChatStore } from './chatStore';
import DynamicAnimationStyles from './components/DynamicAnimationStyles';
import Landing from './pages/Landing';
import { LANDING_ONLY_BUILD } from './env';
import { Layout } from './components/Layout';
import { AppRoutes } from './AppRoutes';

export default function App() {
  const { data: settings = [] } = useSettings();
  const themeSetting = settings.find(s => s.key === 'themeConfig');
  const themeConfig = themeSetting?.value as { mode: 'light' | 'dark'; primaryColor: string; secondaryColor: string; backgroundColor?: string; paperColor?: string; textColor?: string; borderRadius?: number; fontFamily?: string; fontSize?: number } | undefined;

  const parsedFontSize = Number(themeConfig?.fontSize);
  const fontSize = !isNaN(parsedFontSize) && parsedFontSize > 0 ? parsedFontSize : 14;
  
  useEffect(() => {
    const rootSize = (fontSize / 14) * 16;
    document.documentElement.style.fontSize = `${rootSize}px`;
  }, [fontSize]);

  useEffect(() => {
    const handleDbUpdate = () => {
      queryClient.invalidateQueries();
    };
    window.addEventListener('db-update', handleDbUpdate);
    return () => window.removeEventListener('db-update', handleDbUpdate);
  }, []);

  const dynamicTheme = useMemo(() => {
    const mode = themeConfig?.mode || 'light';
    const primaryColor = themeConfig?.primaryColor || '#1976d2';
    const secondaryColor = themeConfig?.secondaryColor || '#5c6bc0';
    return getAppTheme({
      mode,
      primaryColor,
      secondaryColor,
      backgroundColor: themeConfig?.backgroundColor,
      paperColor: themeConfig?.paperColor,
      textColor: themeConfig?.textColor,
      borderRadius: themeConfig?.borderRadius,
      fontFamily: themeConfig?.fontFamily,
      fontSize,
    });
  }, [
    themeConfig?.mode,
    themeConfig?.primaryColor,
    themeConfig?.secondaryColor,
    themeConfig?.backgroundColor,
    themeConfig?.paperColor,
    themeConfig?.textColor,
    themeConfig?.borderRadius,
    themeConfig?.fontFamily,
    fontSize,
  ]);

  if (LANDING_ONLY_BUILD) {
    return (
      <ThemeProvider theme={dynamicTheme}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <CssBaseline />
          <Landing />
        </LocalizationProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={dynamicTheme}>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <CssBaseline />
        <DynamicAnimationStyles />
        <Layout>
          <AppRoutes />
        </Layout>
      </LocalizationProvider>
    </ThemeProvider>
  );
}
