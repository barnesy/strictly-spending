import { db } from "../db/drizzle";
import * as schema from "../db/schema";
import { eq } from 'drizzle-orm';
import React, { useState } from 'react';
import { useDbQuery } from '../hooks/useDbQuery';
import {
  Stack,
  Typography,
  Paper,
  Box,
  Button,
  Slider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
  Divider,
} from '@mui/material';


const THEME_PALETTES = [
  {
    name: 'Default',
    light: { primary: '#1976d2', secondary: '#5c6bc0', background: '#f5f7fa', paper: '#ffffff' },
    dark: { primary: '#1976d2', secondary: '#5c6bc0', background: '#0f172a', paper: '#1e293b' },
  },
  {
    name: 'Grand Budapest',
    light: { primary: '#E8A598', secondary: '#F3B562', background: '#FDE4D1', paper: '#FEF0E7' },
    dark: { primary: '#E8A598', secondary: '#F3B562', background: '#3D2B26', paper: '#4A342E' },
  },
  {
    name: 'Moonrise 1',
    light: { primary: '#E2C044', secondary: '#587B7F', background: '#EAE4D3', paper: '#F5F2E8' },
    dark: { primary: '#E2C044', secondary: '#587B7F', background: '#2B2B23', paper: '#38382E' },
  },
  {
    name: 'Royal 1',
    light: { primary: '#9C2A20', secondary: '#71828C', background: '#F5F0E6', paper: '#FCF9F5' },
    dark: { primary: '#E04A3D', secondary: '#8A9BA6', background: '#2B2624', paper: '#38322F' },
  },
  {
    name: 'Moonrise 2',
    light: { primary: '#C68A47', secondary: '#708A81', background: '#E6DECA', paper: '#F2EEDF' },
    dark: { primary: '#DBA15E', secondary: '#82A197', background: '#2E2B25', paper: '#3D3831' },
  },
  {
    name: 'Cavalcanti',
    light: { primary: '#B28F27', secondary: '#193E2B', background: '#E4DCC4', paper: '#F0EAD6' },
    dark: { primary: '#D1AC36', secondary: '#255C40', background: '#272621', paper: '#33322C' },
  },
  {
    name: 'Royal 2',
    light: { primary: '#F29D96', secondary: '#648C74', background: '#F0E4DB', paper: '#F8F1EB' },
    dark: { primary: '#F29D96', secondary: '#648C74', background: '#362E2A', paper: '#453C37' },
  },
  {
    name: 'Chevalier',
    light: { primary: '#F2C14E', secondary: '#3B5243', background: '#EBE1D4', paper: '#F5F0E8' },
    dark: { primary: '#F2C14E', secondary: '#53735E', background: '#2E2D2B', paper: '#3D3B38' },
  },
  {
    name: 'Zissou',
    light: { primary: '#E62729', secondary: '#33829E', background: '#DFE5E0', paper: '#EFF3F0' },
    dark: { primary: '#F05253', secondary: '#48A2C2', background: '#212626', paper: '#2C3333' },
  },
  {
    name: 'Fantastic Fox',
    light: { primary: '#D3612C', secondary: '#9A1622', background: '#EBDBC4', paper: '#F5EAD6' },
    dark: { primary: '#E87D4A', secondary: '#C22635', background: '#332921', paper: '#42362C' },
  },
  {
    name: 'Darjeeling',
    light: { primary: '#F37324', secondary: '#118C74', background: '#E6E4DB', paper: '#F3F1EC' },
    dark: { primary: '#F37324', secondary: '#1BA88D', background: '#262A29', paper: '#323837' },
  },
];

const FONTS = [
  { name: 'System Default', value: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif' },
  { name: 'Atkinson Hyperlegible (Accessible)', value: '"Atkinson Hyperlegible", sans-serif' },
  { name: 'Helvetica (Classic Sans)', value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { name: 'Georgia (Standard Serif)', value: 'Georgia, serif' },
  { name: 'EB Garamond (Premium Serif)', value: '"EB Garamond", Garamond, serif' },
  { name: 'Futura (Wes Anderson Sans)', value: '"Futura", "Trebuchet MS", sans-serif' },
  { name: 'Courier Prime (Wes Anderson Typewriter)', value: '"Courier Prime", Courier, monospace' },
];

export default function ThemeManager() {
  const themeSetting = useDbQuery(async () => (await db.select().from(schema.settings).where(eq(schema.settings.key, 'themeConfig')))[0], []);
  const config = (themeSetting?.value as Record<string, unknown>) || {};

  const mode = (config.mode as string) || 'light';
  const paletteName = (config.paletteName as string) || '';
  const borderRadius = (config.borderRadius as number) ?? 8;
  const fontFamily = (config.fontFamily as string) || FONTS[0].value;
  const fontSize = (config.fontSize as number) ?? 14;

  const updateTheme = async (updates: Record<string, unknown>) => {
    const newMode = updates.mode || mode;
    const nextConfig: any = { ...config, mode: newMode, ...updates };

    // If we just toggled mode, and we are using a preset palette, we need to swap the bg/paper colors
    if (updates.mode && nextConfig.paletteName) {
      const preset = THEME_PALETTES.find(p => p.name === nextConfig.paletteName);
      if (preset) {
        const colors = preset[newMode as 'light' | 'dark'];
        nextConfig.primaryColor = colors.primary;
        nextConfig.secondaryColor = colors.secondary;
        nextConfig.backgroundColor = colors.background;
        nextConfig.paperColor = colors.paper;
      }
    }

    await db.insert(schema.settings)
      .values({ key: 'themeConfig', value: nextConfig })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: nextConfig },
      });
  };

  const [localRadius, setLocalRadius] = useState(borderRadius);
  const [prevRadius, setPrevRadius] = useState(borderRadius);
  if (borderRadius !== prevRadius) {
    setPrevRadius(borderRadius);
    setLocalRadius(borderRadius);
  }

  const [localFontSize, setLocalFontSize] = useState(fontSize);
  const [prevFontSize, setPrevFontSize] = useState(fontSize);
  if (fontSize !== prevFontSize) {
    setPrevFontSize(fontSize);
    setLocalFontSize(fontSize);
  }

  const handleRadiusChangeCommitted = (_event: Event | React.SyntheticEvent, value: number | number[]) => {
    updateTheme({ borderRadius: value as number });
  };

  const handleFontSizeChangeCommitted = (_event: Event | React.SyntheticEvent, value: number | number[]) => {
    updateTheme({ fontSize: value as number });
  };

  return (
    <Stack spacing={3}>
      <Typography variant="h5">Theme Manager</Typography>

      <Paper sx={{ p: 3 }}>
        <Stack spacing={4}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              Mode
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={mode}
              onChange={(_, v) => v && updateTheme({ mode: v })}
            >
              <ToggleButton value="light">Light Mode</ToggleButton>
              <ToggleButton value="dark">Dark Mode</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
              Wes Anderson Palettes
            </Typography>
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ gap: 1.5 }}>
              {THEME_PALETTES.map((preset) => {
                const isActive = paletteName === preset.name;
                const colors = preset[mode as 'light' | 'dark'];
                return (
                  <Button
                    key={preset.name}
                    variant={isActive ? 'contained' : 'outlined'}
                    onClick={() =>
                      updateTheme({
                        primaryColor: colors.primary,
                        secondaryColor: colors.secondary,
                        backgroundColor: colors.background,
                        paperColor: colors.paper,
                        paletteName: preset.name,
                      })
                    }
                    sx={{
                      textTransform: 'none',
                      px: 2,
                      py: 1,
                      borderRadius: `${localRadius}px`,
                      borderColor: isActive ? 'primary.main' : 'divider',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      fontWeight: isActive ? 600 : 500,
                    }}
                  >
                    <Box sx={{ display: 'flex', gap: 0.25 }}>
                      <Box
                        sx={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          bgcolor: colors.primary,
                          border: '1px solid rgba(0,0,0,0.1)',
                        }}
                      />
                      <Box
                        sx={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          bgcolor: colors.secondary,
                          border: '1px solid rgba(0,0,0,0.1)',
                        }}
                      />
                    </Box>
                    {preset.name}
                  </Button>
                );
              })}
            </Stack>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              Border Radius ({localRadius}px)
            </Typography>
            <Box sx={{ px: 2 }}>
              <Slider
                value={localRadius}
                onChange={(_, v) => setLocalRadius(v as number)}
                onChangeCommitted={handleRadiusChangeCommitted}
                step={2}
                marks
                min={0}
                max={24}
              />
            </Box>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
              Typography
            </Typography>
            <Stack spacing={3}>
              <FormControl size="small" sx={{ width: 300 }}>
                <InputLabel>Font Family</InputLabel>
                <Select
                  value={fontFamily}
                  label="Font Family"
                  onChange={(e) => updateTheme({ fontFamily: e.target.value })}
                >
                  {FONTS.map((font) => (
                    <MenuItem key={font.name} value={font.value} sx={{ fontFamily: font.value }}>
                      {font.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Box sx={{ width: 300 }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, mb: 1 }}>
                  Base Font Size ({localFontSize}px)
                </Typography>
                <Box sx={{ px: 1 }}>
                  <Slider
                    value={localFontSize}
                    onChange={(_, v) => setLocalFontSize(v as number)}
                    onChangeCommitted={handleFontSizeChangeCommitted}
                    step={1}
                    marks={[
                      { value: 12, label: '12px' },
                      { value: 14, label: '14px' },
                      { value: 16, label: '16px' },
                      { value: 18, label: '18px' },
                      { value: 20, label: '20px' },
                    ]}
                    min={12}
                    max={20}
                  />
                </Box>
              </Box>
            </Stack>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
              Live Preview
            </Typography>
            <Paper variant="outlined" sx={{ p: 3, borderRadius: `${localRadius}px` }}>
              <Stack spacing={2}>
                <Typography variant="h6">Preview Header</Typography>
                <Typography variant="body2" color="text.secondary">
                  This is how text will look with the current font and colors. Buttons and cards will respect the border radius.
                </Typography>
                <Stack direction="row" spacing={2}>
                  <Button variant="contained" color="primary">Primary Action</Button>
                  <Button variant="outlined" color="secondary">Secondary</Button>
                </Stack>
              </Stack>
            </Paper>
          </Box>
        </Stack>
      </Paper>
    </Stack>
  );
}
