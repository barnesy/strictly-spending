import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
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
import { db } from '../db';

const THEME_PALETTES = [
  {
    name: 'Grand Budapest',
    light: { primary: '#E8A598', secondary: '#F3B562', background: '#FAD9C1', paper: '#FCE5D7' },
    dark: { primary: '#E8A598', secondary: '#F3B562', background: '#3D2B26', paper: '#4A342E' },
  },
  {
    name: 'Moonrise 1',
    light: { primary: '#E2C044', secondary: '#587B7F', background: '#D9D0B8', paper: '#EAE4D3' },
    dark: { primary: '#E2C044', secondary: '#587B7F', background: '#2B2B23', paper: '#38382E' },
  },
  {
    name: 'Royal 1',
    light: { primary: '#9C2A20', secondary: '#71828C', background: '#EAE2D6', paper: '#F4F0EA' },
    dark: { primary: '#E04A3D', secondary: '#8A9BA6', background: '#2B2624', paper: '#38322F' },
  },
  {
    name: 'Moonrise 2',
    light: { primary: '#C68A47', secondary: '#708A81', background: '#D2C5A9', paper: '#E6DECA' },
    dark: { primary: '#DBA15E', secondary: '#82A197', background: '#2E2B25', paper: '#3D3831' },
  },
  {
    name: 'Cavalcanti',
    light: { primary: '#B28F27', secondary: '#193E2B', background: '#D3C6A6', paper: '#E4DCC4' },
    dark: { primary: '#D1AC36', secondary: '#255C40', background: '#272621', paper: '#33322C' },
  },
  {
    name: 'Royal 2',
    light: { primary: '#F29D96', secondary: '#648C74', background: '#E4D0C0', paper: '#F0E4DB' },
    dark: { primary: '#F29D96', secondary: '#648C74', background: '#362E2A', paper: '#453C37' },
  },
  {
    name: 'Chevalier',
    light: { primary: '#F2C14E', secondary: '#3B5243', background: '#DACBBA', paper: '#EBE1D4' },
    dark: { primary: '#F2C14E', secondary: '#53735E', background: '#2E2D2B', paper: '#3D3B38' },
  },
  {
    name: 'Zissou',
    light: { primary: '#E62729', secondary: '#33829E', background: '#C9D2CB', paper: '#DFE5E0' },
    dark: { primary: '#F05253', secondary: '#48A2C2', background: '#212626', paper: '#2C3333' },
  },
  {
    name: 'Fantastic Fox',
    light: { primary: '#D3612C', secondary: '#9A1622', background: '#DBC4A4', paper: '#EBDBC4' },
    dark: { primary: '#E87D4A', secondary: '#C22635', background: '#332921', paper: '#42362C' },
  },
  {
    name: 'Darjeeling',
    light: { primary: '#F37324', secondary: '#118C74', background: '#D0CDC0', paper: '#E6E4DB' },
    dark: { primary: '#F37324', secondary: '#1BA88D', background: '#262A29', paper: '#323837' },
  },
];

const FONTS = [
  { name: 'System Default', value: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif' },
  { name: 'Atkinson Hyperlegible (Accessible)', value: '"Atkinson Hyperlegible", sans-serif' },
  { name: 'Inter (Modern)', value: '"Inter", sans-serif' },
  { name: 'Open Sans (Humanist)', value: '"Open Sans", sans-serif' },
  { name: 'Outfit (Geometric)', value: '"Outfit", sans-serif' },
  { name: 'Lora (Serif)', value: '"Lora", serif' },
  { name: 'Fira Code (Monospace)', value: '"Fira Code", monospace' },
];

export default function ThemeManager() {
  const themeSetting = useLiveQuery(() => db.settings.get('themeConfig'), []);
  const config = (themeSetting?.value as any) || {};

  const mode = config.mode || 'light';
  const paletteName = config.paletteName || '';
  const borderRadius = config.borderRadius ?? 8;
  const fontFamily = config.fontFamily || FONTS[0].value;

  const updateTheme = async (updates: any) => {
    let newMode = updates.mode || mode;
    let nextConfig = { ...config, mode: newMode, ...updates };

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

    await db.settings.put({ key: 'themeConfig', value: nextConfig });
  };

  const [localRadius, setLocalRadius] = useState(borderRadius);
  useEffect(() => {
    setLocalRadius(borderRadius);
  }, [borderRadius]);

  const handleRadiusChangeCommitted = (_event: Event | React.SyntheticEvent, value: number | number[]) => {
    updateTheme({ borderRadius: value as number });
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
                      borderRadius: localRadius,
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
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              Typography
            </Typography>
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
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
              Live Preview
            </Typography>
            <Paper variant="outlined" sx={{ p: 3, borderRadius: localRadius }}>
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
