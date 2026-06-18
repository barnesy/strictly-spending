import { useState, useRef } from 'react';
import {
  Box,
  Stack,
  Typography,
  Button,
  Paper,
  Slider,
  Grid,
  Divider,
  Card,
  CardContent,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import { useAnimationStore } from '../animationStore';

export default function AnimationSettings() {
  const config = useAnimationStore();
  const [previewState, setPreviewState] = useState<
    | 'idle'
    | 'exitRight'
    | 'exitLeft'
    | 'inspectStart'
    | 'inspectMidRight'
    | 'inspectMidLeft'
    | 'inspectEndRight'
    | 'inspectEndLeft'
  >('idle');
  const previewCardRef = useRef<HTMLDivElement>(null);

  const triggerPreview = (direction: 'right' | 'left') => {
    setPreviewState('idle');
    // Force reflow
    setTimeout(() => {
      setPreviewState(direction === 'right' ? 'exitRight' : 'exitLeft');
    }, 10);
  };

  const handleReset = () => {
    config.resetConfig();
  };

  const bezierString = `cubic-bezier(${config.bezierX1}, ${config.bezierY1}, ${config.bezierX2}, ${config.bezierY2})`;

  return (
    <Stack spacing={3} sx={{ width: '100%', pb: 5 }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Animation Playground
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Customize the 3D card deck rolodex and magician-pass flip animation settings in real-time.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          color="warning"
          startIcon={<SettingsBackupRestoreIcon />}
          onClick={handleReset}
          sx={{ textTransform: 'none', borderRadius: 2 }}
        >
          Reset to Defaults
        </Button>
      </Stack>

      <Grid container spacing={4}>
        {/* Sliders Panel */}
        <Grid item xs={12} md={5}>
          <Stack spacing={3}>
            {/* Group 1: Timing & Easing */}
            <Paper sx={{ p: 3, borderRadius: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, color: 'primary.main' }}>
                1. Timing & Easing
              </Typography>
              <Stack spacing={2.5}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Duration (ms)</span>
                    <span style={{ color: '#1976d2' }}>{config.duration}ms</span>
                  </Typography>
                  <Slider
                    value={config.duration}
                    min={100}
                    max={2000}
                    step={50}
                    onChange={(_, val) => config.updateConfig({ duration: val as number })}
                  />
                </Box>

                <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <span>Transition Bezier Curve Parameters</span>
                    <span style={{ color: '#9c27b0', fontFamily: 'monospace', fontSize: 12 }}>{bezierString}</span>
                  </Typography>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 600 }} color="text.secondary">Bezier X1</Typography>
                      <Slider
                        value={config.bezierX1}
                        min={0.0}
                        max={1.0}
                        step={0.05}
                        onChange={(_, val) => config.updateConfig({ bezierX1: val as number })}
                      />
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 600 }} color="text.secondary">Bezier Y1</Typography>
                      <Slider
                        value={config.bezierY1}
                        min={0.0}
                        max={2.0}
                        step={0.05}
                        onChange={(_, val) => config.updateConfig({ bezierY1: val as number })}
                      />
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 600 }} color="text.secondary">Bezier X2</Typography>
                      <Slider
                        value={config.bezierX2}
                        min={0.0}
                        max={1.0}
                        step={0.05}
                        onChange={(_, val) => config.updateConfig({ bezierX2: val as number })}
                      />
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 600 }} color="text.secondary">Bezier Y2</Typography>
                      <Slider
                        value={config.bezierY2}
                        min={0.0}
                        max={2.0}
                        step={0.05}
                        onChange={(_, val) => config.updateConfig({ bezierY2: val as number })}
                      />
                    </Box>
                  </Stack>
                </Box>
              </Stack>
            </Paper>

            {/* Group 2: Step 1 - Start State (0% / Active Card) */}
            <Paper sx={{ p: 3, borderRadius: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, color: 'info.main' }}>
                2. Step 1: Start (0% Timeline / Active Card)
              </Typography>
              <Stack spacing={2.5}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Start X Offset</span>
                    <span>{config.startX}px</span>
                  </Typography>
                  <Slider
                    value={config.startX}
                    min={-150}
                    max={150}
                    step={5}
                    onChange={(_, val) => config.updateConfig({ startX: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Start Y Offset</span>
                    <span>{config.startY}px</span>
                  </Typography>
                  <Slider
                    value={config.startY}
                    min={-150}
                    max={150}
                    step={5}
                    onChange={(_, val) => config.updateConfig({ startY: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Start Z Offset</span>
                    <span>{config.startZ}px</span>
                  </Typography>
                  <Slider
                    value={config.startZ}
                    min={-200}
                    max={50}
                    step={5}
                    onChange={(_, val) => config.updateConfig({ startZ: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Start Rotation X</span>
                    <span>{config.startRotationX}°</span>
                  </Typography>
                  <Slider
                    value={config.startRotationX}
                    min={-90}
                    max={90}
                    step={5}
                    onChange={(_, val) => config.updateConfig({ startRotationX: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Start Rotation Y</span>
                    <span>{config.startRotationY}°</span>
                  </Typography>
                  <Slider
                    value={config.startRotationY}
                    min={-90}
                    max={90}
                    step={5}
                    onChange={(_, val) => config.updateConfig({ startRotationY: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Start Rotation Z</span>
                    <span>{config.startRotationZ}°</span>
                  </Typography>
                  <Slider
                    value={config.startRotationZ}
                    min={-180}
                    max={180}
                    step={5}
                    onChange={(_, val) => config.updateConfig({ startRotationZ: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Start Scale</span>
                    <span>{config.startScale}</span>
                  </Typography>
                  <Slider
                    value={config.startScale}
                    min={0.5}
                    max={1.5}
                    step={0.05}
                    onChange={(_, val) => config.updateConfig({ startScale: val as number })}
                  />
                </Box>
              </Stack>
            </Paper>

            {/* Group 3: Step 2 - Midpoint Flight */}
            <Paper sx={{ p: 3, borderRadius: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, color: 'secondary.main' }}>
                3. Step 2: Midpoint Flight
              </Typography>
              <Stack spacing={2.5}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between', color: 'secondary.dark' }}>
                    <span>Mid Step Timeline Percentage</span>
                    <span>{config.midStepPct}%</span>
                  </Typography>
                  <Slider
                    value={config.midStepPct}
                    min={10}
                    max={90}
                    step={5}
                    onChange={(_, val) => config.updateConfig({ midStepPct: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>X Swing (Right)</span>
                    <span>{config.exitXRight}px</span>
                  </Typography>
                  <Slider
                    value={config.exitXRight}
                    min={100}
                    max={600}
                    step={10}
                    onChange={(_, val) => config.updateConfig({ exitXRight: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>X Swing (Left)</span>
                    <span>{config.exitXLeft}px</span>
                  </Typography>
                  <Slider
                    value={config.exitXLeft}
                    min={-600}
                    max={-100}
                    step={10}
                    onChange={(_, val) => config.updateConfig({ exitXLeft: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Y Rise/Dip</span>
                    <span>{config.exitY}px</span>
                  </Typography>
                  <Slider
                    value={config.exitY}
                    min={-200}
                    max={200}
                    step={5}
                    onChange={(_, val) => config.updateConfig({ exitY: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Z Depth</span>
                    <span>{config.exitZ}px</span>
                  </Typography>
                  <Slider
                    value={config.exitZ}
                    min={-400}
                    max={0}
                    step={10}
                    onChange={(_, val) => config.updateConfig({ exitZ: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Mid Rotation X</span>
                    <span>{config.midRotationX}°</span>
                  </Typography>
                  <Slider
                    value={config.midRotationX}
                    min={-360}
                    max={360}
                    step={10}
                    onChange={(_, val) => config.updateConfig({ midRotationX: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Mid Rotation Y</span>
                    <span>{config.midRotationY}°</span>
                  </Typography>
                  <Slider
                    value={config.midRotationY}
                    min={-360}
                    max={360}
                    step={10}
                    onChange={(_, val) => config.updateConfig({ midRotationY: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Mid Rotation Z</span>
                    <span>{config.midRotationZ}°</span>
                  </Typography>
                  <Slider
                    value={config.midRotationZ}
                    min={-360}
                    max={360}
                    step={10}
                    onChange={(_, val) => config.updateConfig({ midRotationZ: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Mid Scale</span>
                    <span>{config.midScale}</span>
                  </Typography>
                  <Slider
                    value={config.midScale}
                    min={0.3}
                    max={1.5}
                    step={0.05}
                    onChange={(_, val) => config.updateConfig({ midScale: val as number })}
                  />
                </Box>
              </Stack>
            </Paper>

            {/* Group 4: Step 3 - Final Landing */}
            <Paper sx={{ p: 3, borderRadius: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, color: 'success.main' }}>
                4. Step 3: Final Landing (100% Timeline)
              </Typography>
              <Stack spacing={2.5}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Final X (Right)</span>
                    <span>{config.finalXRight}px</span>
                  </Typography>
                  <Slider
                    value={config.finalXRight}
                    min={10}
                    max={400}
                    step={5}
                    onChange={(_, val) => config.updateConfig({ finalXRight: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Final X (Left)</span>
                    <span>{config.finalXLeft}px</span>
                  </Typography>
                  <Slider
                    value={config.finalXLeft}
                    min={10}
                    max={400}
                    step={5}
                    onChange={(_, val) => config.updateConfig({ finalXLeft: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Final Y (Bottom)</span>
                    <span>{config.finalY}px</span>
                  </Typography>
                  <Slider
                    value={config.finalY}
                    min={-100}
                    max={200}
                    step={5}
                    onChange={(_, val) => config.updateConfig({ finalY: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Final Z (Depth)</span>
                    <span>{config.finalZ}px</span>
                  </Typography>
                  <Slider
                    value={config.finalZ}
                    min={-500}
                    max={-50}
                    step={10}
                    onChange={(_, val) => config.updateConfig({ finalZ: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Final Rotation X</span>
                    <span>{config.finalRotationX}°</span>
                  </Typography>
                  <Slider
                    value={config.finalRotationX}
                    min={-360}
                    max={360}
                    step={10}
                    onChange={(_, val) => config.updateConfig({ finalRotationX: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Final Rotation Y</span>
                    <span>{config.finalRotationY}°</span>
                  </Typography>
                  <Slider
                    value={config.finalRotationY}
                    min={-360}
                    max={360}
                    step={10}
                    onChange={(_, val) => config.updateConfig({ finalRotationY: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Final Rotation Z</span>
                    <span>{config.finalRotationZ}°</span>
                  </Typography>
                  <Slider
                    value={config.finalRotationZ}
                    min={-360}
                    max={360}
                    step={10}
                    onChange={(_, val) => config.updateConfig({ finalRotationZ: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Final Scale</span>
                    <span>{config.finalScale}</span>
                  </Typography>
                  <Slider
                    value={config.finalScale}
                    min={0.3}
                    max={1.2}
                    step={0.05}
                    onChange={(_, val) => config.updateConfig({ finalScale: val as number })}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Z-Index Shift Pct</span>
                    <span>{config.zSplitPct}%</span>
                  </Typography>
                  <Slider
                    value={config.zSplitPct}
                    min={10}
                    max={90}
                    step={5}
                    onChange={(_, val) => config.updateConfig({ zSplitPct: val as number })}
                  />
                </Box>
              </Stack>
            </Paper>
          </Stack>
        </Grid>

        {/* Live Preview Panel */}
        <Grid item xs={12} md={7}>
          <Box sx={{ position: 'sticky', top: 24 }}>
            <Paper
              sx={{
                p: 3,
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                height: 'calc(100vh - 140px)',
                minHeight: 580,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                bgcolor: 'background.default',
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, textAlign: 'center' }}>
                Interactive Preview
              </Typography>

              {/* Viewport container */}
              <Box
                sx={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  overflow: 'hidden',
                  borderRadius: 2,
                  bgcolor: (theme) => theme.palette.mode === 'dark' ? '#121212' : '#f5f5f5',
                  py: 4,
                }}
              >
                {/* Mock Card */}
                <Card
                  ref={previewCardRef}
                  sx={(theme) => ({
                    width: '100%',
                    maxWidth: 600,
                    minHeight: 460,
                    borderRadius: 4,
                    borderLeft: '5px solid #1976d2',
                    boxShadow: theme.palette.mode === 'dark'
                      ? '0 30px 60px -15px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08)'
                      : '0 30px 60px -15px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
                    bgcolor: 'background.paper',
                    display: 'flex',
                    flexDirection: 'column',
                    p: 2,
                    zIndex:
                      previewState === 'inspectMidRight' || previewState === 'inspectMidLeft'
                        ? config.midStepPct < config.zSplitPct ? 10 : 7
                        : previewState === 'inspectEndRight' || previewState === 'inspectEndLeft'
                        ? 7
                        : 10,
                    transform:
                      previewState === 'inspectStart' || previewState === 'idle'
                        ? `perspective(1200px) translate3d(${config.startX}px, ${config.startY}px, ${config.startZ}px) rotateX(${config.startRotationX}deg) rotateY(${config.startRotationY}deg) rotateZ(${config.startRotationZ}deg) scale(${config.startScale})`
                        : previewState === 'inspectMidRight'
                        ? `perspective(1200px) translate3d(${config.exitXRight}px, ${config.exitY}px, ${config.exitZ}px) rotateX(${config.midRotationX}deg) rotateY(${config.midRotationY}deg) rotateZ(${config.midRotationZ}deg) scale(${config.midScale})`
                        : previewState === 'inspectMidLeft'
                        ? `perspective(1200px) translate3d(${config.exitXLeft}px, ${config.exitY}px, ${config.exitZ}px) rotateX(${config.midRotationX}deg) rotateY(-${config.midRotationY}deg) rotateZ(${config.midRotationZ}deg) scale(${config.midScale})`
                        : previewState === 'inspectEndRight'
                        ? `perspective(1200px) translate3d(${config.finalXRight}px, ${config.finalY}px, ${config.finalZ}px) rotateX(${config.finalRotationX}deg) rotateY(${config.finalRotationY}deg) rotateZ(${config.finalRotationZ}deg) scale(${config.finalScale})`
                        : previewState === 'inspectEndLeft'
                        ? `perspective(1200px) translate3d(${config.finalXLeft}px, ${config.finalY}px, ${config.finalZ}px) rotateX(${config.finalRotationX}deg) rotateY(-${config.finalRotationY}deg) rotateZ(${config.finalRotationZ}deg) scale(${config.finalScale})`
                        : 'none',
                    animation:
                      previewState === 'exitRight'
                        ? `exitFlipRight ${config.duration}ms ${bezierString} forwards`
                        : previewState === 'exitLeft'
                        ? `exitFlipLeft ${config.duration}ms ${bezierString} forwards`
                        : 'none',
                  })}
                >
                  <CardContent sx={{ p: 1, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                        Preview Merchant
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>
                        Acme Corporation
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main', mt: 0.5 }}>
                        $42.50 total
                      </Typography>
                    </Box>
                    <Box sx={{ bgcolor: 'action.selected', p: 1, borderRadius: 2 }}>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Animation Status:
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'primary.main' }}>
                        {previewState === 'idle'
                          ? 'Ready to Flip'
                          : previewState === 'inspectStart'
                          ? 'Start (0%)'
                          : previewState === 'inspectMidRight'
                          ? 'Midpoint (Right)'
                          : previewState === 'inspectMidLeft'
                          ? 'Midpoint (Left)'
                          : previewState === 'inspectEndRight'
                          ? 'Landing (Right)'
                          : previewState === 'inspectEndLeft'
                          ? 'Landing (Left)'
                          : `Flipping ${previewState === 'exitRight' ? 'Right' : 'Left'}`}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Box>

              {/* Step Mode / Inspection controls */}
              <Box sx={{ mt: 2, borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1, textTransform: 'uppercase', textAlign: 'center', letterSpacing: '0.05em' }}>
                  Inspection Freeze / Step Mode
                </Typography>
                <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" gap={1}>
                  <Button
                    size="small"
                    variant={previewState === 'inspectStart' ? 'contained' : 'outlined'}
                    color="info"
                    onClick={() => setPreviewState('inspectStart')}
                    sx={{ textTransform: 'none', borderRadius: 1.5, fontSize: 11, py: 0.5, px: 1, minWidth: 0, flex: '1 1 auto' }}
                  >
                    Start (0%)
                  </Button>
                  <Button
                    size="small"
                    variant={previewState === 'inspectMidRight' ? 'contained' : 'outlined'}
                    color="secondary"
                    onClick={() => setPreviewState('inspectMidRight')}
                    sx={{ textTransform: 'none', borderRadius: 1.5, fontSize: 11, py: 0.5, px: 1, minWidth: 0, flex: '1 1 auto' }}
                  >
                    Mid Right
                  </Button>
                  <Button
                    size="small"
                    variant={previewState === 'inspectMidLeft' ? 'contained' : 'outlined'}
                    color="secondary"
                    onClick={() => setPreviewState('inspectMidLeft')}
                    sx={{ textTransform: 'none', borderRadius: 1.5, fontSize: 11, py: 0.5, px: 1, minWidth: 0, flex: '1 1 auto' }}
                  >
                    Mid Left
                  </Button>
                  <Button
                    size="small"
                    variant={previewState === 'inspectEndRight' ? 'contained' : 'outlined'}
                    color="success"
                    onClick={() => setPreviewState('inspectEndRight')}
                    sx={{ textTransform: 'none', borderRadius: 1.5, fontSize: 11, py: 0.5, px: 1, minWidth: 0, flex: '1 1 auto' }}
                  >
                    End Right
                  </Button>
                  <Button
                    size="small"
                    variant={previewState === 'inspectEndLeft' ? 'contained' : 'outlined'}
                    color="success"
                    onClick={() => setPreviewState('inspectEndLeft')}
                    sx={{ textTransform: 'none', borderRadius: 1.5, fontSize: 11, py: 0.5, px: 1, minWidth: 0, flex: '1 1 auto' }}
                  >
                    End Left
                  </Button>
                </Stack>
              </Box>

              {/* Action buttons */}
              <Stack direction="row" spacing={1.5} sx={{ mt: 3, width: '100%' }}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<PlayArrowIcon />}
                  onClick={() => triggerPreview('right')}
                  sx={{ flex: 1, textTransform: 'none', borderRadius: 2, whiteSpace: 'nowrap', px: 1.5 }}
                >
                  Flip Right
                </Button>
                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={<PlayArrowIcon />}
                  onClick={() => triggerPreview('left')}
                  sx={{ flex: 1, textTransform: 'none', borderRadius: 2, whiteSpace: 'nowrap', px: 1.5 }}
                >
                  Flip Left
                </Button>
                <Button
                  variant="outlined"
                  color="inherit"
                  onClick={() => setPreviewState('idle')}
                  sx={{ flex: 1, textTransform: 'none', borderRadius: 2, whiteSpace: 'nowrap', px: 1.5 }}
                >
                  Reset
                </Button>
              </Stack>
            </Paper>
          </Box>
        </Grid>
      </Grid>
    </Stack>
  );
}
