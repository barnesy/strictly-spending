import { useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  Button,
  Paper,
  Slider,
  CardContent,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { useAnimationStore } from '../animationStore';
import AnimatedCard from '../components/AnimatedCard';

const MOCK_CARDS = [
  { name: 'Acme Corporation', amount: '$42.50 total', color: '#1976d2', subtitle: 'Card A' },
  { name: 'Whole Foods Market', amount: '$124.80 total', color: '#2e7d32', subtitle: 'Card B' },
  { name: 'Netflix Subscription', amount: '$15.99 recurring', color: '#9c27b0', subtitle: 'Card C' },
  { name: 'Starbucks Coffee', amount: '$6.75 total', color: '#e65100', subtitle: 'Card D' },
  { name: 'Chevron Gas Station', amount: '$45.00 total', color: '#006064', subtitle: 'Card E' },
  { name: 'Apple App Store', amount: '$2.99 total', color: '#311b92', subtitle: 'Card F' },
];

export default function AnimationSettings() {
  const config = useAnimationStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [previewState, setPreviewState] = useState<
    | 'idle'
    | 'exitRight'
    | 'entryRight'
    | 'inspectStart'
    | 'inspectMid'
    | 'inspectEnd'
  >('idle');

  const triggerPreview = (direction: 'right' | 'left') => {
    setPreviewState('idle');
    // Force reflow
    setTimeout(() => {
      if (direction === 'right') {
        setCurrentIndex((prev) => (prev + 1) % MOCK_CARDS.length);
        setPreviewState('exitRight');
      } else {
        setCurrentIndex((prev) => (prev - 1 + MOCK_CARDS.length) % MOCK_CARDS.length);
        setPreviewState('entryRight');
      }
    }, 10);
  };

  const handleReset = () => {
    config.resetConfig();
  };

  const bezierString = `cubic-bezier(${config.bezierX1}, ${config.bezierY1}, ${config.bezierX2}, ${config.bezierY2})`;

  return (
    <Stack spacing={2} sx={{ width: '100%', height: 'calc(100vh - 120px)', pb: 2 }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ flexShrink: 0 }}>
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

      {/* Resizable Panels Group */}
      <PanelGroup orientation="horizontal" style={{ flex: 1, minHeight: 0 }}>
        
        {/* Left Panel: Sliders (Scrollable) */}
        <Panel id="sliders-panel" defaultSize={45} minSize={30} style={{ display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ flex: 1, overflowY: 'auto', pr: 2 }}>
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

                </Stack>
              </Paper>
            </Stack>
          </Box>
        </Panel>

        {/* Separator / Drag Handle */}
        <PanelResizeHandle
          style={{
            width: 12,
            position: 'relative',
            cursor: 'col-resize',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 'calc(50% - 1px)',
              width: 2,
              bgcolor: 'divider',
              borderRadius: 1,
              transition: 'background-color 120ms ease, width 120ms ease, left 120ms ease',
              '&:hover, &[data-resize-handle-active]': {
                bgcolor: 'primary.main',
                width: 4,
                left: 'calc(50% - 2px)',
              },
            }}
          />
        </PanelResizeHandle>

        {/* Right Panel: Interactive Preview (Occupies remaining width and stretches 100%) */}
        <Panel id="preview-panel" defaultSize={55} minSize={35} style={{ display: 'flex', flexDirection: 'column' }}>
          <Paper
            sx={{
              p: 3,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              height: '100%',
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
                width: '100%',
              }}
            >
              {/* Stack Wrapper */}
              <Box sx={{ position: 'relative', width: '100%', maxWidth: 680, height: 560 }}>
                {(() => {
                  const slots = [
                    { slotIndex: 0, card: null as typeof MOCK_CARDS[0] | null, stackIndex: -2 },
                    { slotIndex: 1, card: null as typeof MOCK_CARDS[0] | null, stackIndex: -2 },
                    { slotIndex: 2, card: null as typeof MOCK_CARDS[0] | null, stackIndex: -2 },
                  ];

                  const prevIdx = (currentIndex - 1 + MOCK_CARDS.length) % MOCK_CARDS.length;
                  const activeIdx = currentIndex % MOCK_CARDS.length;
                  const nextIdx = (currentIndex + 1) % MOCK_CARDS.length;

                  slots[activeIdx % 3] = {
                    slotIndex: activeIdx % 3,
                    card: MOCK_CARDS[activeIdx],
                    stackIndex: 0,
                  };

                  slots[nextIdx % 3] = {
                    slotIndex: nextIdx % 3,
                    card: MOCK_CARDS[nextIdx],
                    stackIndex: 1,
                  };

                  slots[prevIdx % 3] = {
                    slotIndex: prevIdx % 3,
                    card: MOCK_CARDS[prevIdx],
                    stackIndex: -1,
                  };

                  const sortedSlots = [...slots].sort((a, b) => b.stackIndex - a.stackIndex);

                  return sortedSlots.map((slot) => {
                    if (!slot.card) return null;

                    const card = slot.card;
                    const stackIndex = slot.stackIndex;
                    const isAnimating = previewState === 'exitRight' || previewState === 'entryRight';

                    // z-index transitions
                    let zIndex = 9;
                    if (previewState === 'exitRight') {
                      zIndex = stackIndex === -1 ? (undefined as any) : (stackIndex === 0 ? 10 : 9);
                    } else if (previewState === 'entryRight') {
                      zIndex = stackIndex === 0 ? (undefined as any) : (stackIndex === 1 ? 9 : 0);
                    } else if (previewState === 'inspectMid') {
                      zIndex = stackIndex === 0 ? 0 : stackIndex === -1 ? 10 : 9;
                    } else if (previewState === 'inspectEnd') {
                      zIndex = stackIndex === 0 ? 0 : stackIndex === -1 ? 10 : 9;
                    } else {
                      zIndex = stackIndex === 0 ? 10 : stackIndex === -1 ? 0 : 9;
                    }

                    // transform transitions
                    let transform = 'none';
                    if (isAnimating) {
                      transform = 'none';
                    } else if (previewState === 'inspectStart' || previewState === 'idle') {
                      transform =
                        stackIndex === 0
                          ? `perspective(1200px) translate3d(${config.startX}px, ${config.startY}px, ${config.startZ}px) rotateX(${config.startRotationX}deg) rotateY(${config.startRotationY}deg) rotateZ(${config.startRotationZ}deg) scale(${config.startScale})`
                          : stackIndex === 1
                          ? 'perspective(1200px) translate3d(0, 16px, -45px) rotateX(7deg) rotateY(-7deg) rotateZ(-1.5deg) scale(0.96)'
                          : `perspective(1200px) translate3d(${config.finalXRight}px, ${config.finalY}px, ${config.finalZ}px) rotateX(${config.finalRotationX}deg) rotateY(${config.finalRotationY}deg) rotateZ(${config.finalRotationZ}deg) scale(${config.finalScale})`;
                    } else if (previewState === 'inspectMid') {
                      transform =
                        stackIndex === 0
                          ? `perspective(1200px) translate3d(${config.exitXRight}px, ${config.exitY}px, ${config.exitZ}px) rotateX(${config.midRotationX}deg) rotateY(${config.midRotationY}deg) rotateZ(${config.midRotationZ}deg) scale(${config.midScale})`
                          : stackIndex === 1
                          ? 'perspective(1200px) translate3d(0, 16px, -45px) rotateX(7deg) rotateY(-7deg) rotateZ(-1.5deg) scale(0.96)'
                          : `perspective(1200px) translate3d(${config.exitXRight}px, ${config.exitY}px, ${config.exitZ}px) rotateX(${config.midRotationX}deg) rotateY(${config.midRotationY}deg) rotateZ(${config.midRotationZ}deg) scale(${config.midScale})`;
                    } else if (previewState === 'inspectEnd') {
                      transform =
                        stackIndex === 0
                          ? `perspective(1200px) translate3d(${config.finalXRight}px, ${config.finalY}px, ${config.finalZ}px) rotateX(${config.finalRotationX}deg) rotateY(${config.finalRotationY}deg) rotateZ(${config.finalRotationZ}deg) scale(${config.finalScale})`
                          : stackIndex === 1
                          ? 'perspective(1200px) translate3d(0, 16px, -45px) rotateX(7deg) rotateY(-7deg) rotateZ(-1.5deg) scale(0.96)'
                          : `perspective(1200px) translate3d(${config.startX}px, ${config.startY}px, ${config.startZ}px) rotateX(${config.startRotationX}deg) rotateY(${config.startRotationY}deg) rotateZ(${config.startRotationZ}deg) scale(${config.startScale})`;
                    }

                    // keyframe animations
                    let animation = 'none';
                    if (previewState === 'exitRight' && stackIndex === -1) {
                      animation = `exitFlipRight ${config.duration}ms ${bezierString} forwards`;
                    } else if (previewState === 'entryRight' && stackIndex === 0) {
                      animation = `entryFlipRight ${config.duration}ms ${bezierString} forwards`;
                    }

                    return (
                      <AnimatedCard
                        key={slot.slotIndex}
                        suggestedColor={card.color}
                        stackIndex={stackIndex}
                        transformOverride={transform}
                        animationOverride={animation}
                        zIndexOverride={zIndex}
                        isAnimatingOverride={isAnimating}
                      >
                        <CardContent sx={{ p: 1, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <Box>
                            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                              {card.subtitle} ({stackIndex === 0 ? 'Active' : stackIndex === 1 ? 'Next' : 'Previous'})
                            </Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>
                              {card.name}
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mt: 0.5 }}>
                              {card.amount}
                            </Typography>
                          </Box>
                          {stackIndex === 0 && (
                            <Box sx={{ bgcolor: 'action.selected', p: 1, borderRadius: 2 }}>
                              <Typography variant="caption" color="text.secondary" display="block">
                                Animation Status:
                              </Typography>
                              <Typography variant="body2" sx={{ fontWeight: 700, textTransform: 'uppercase', color: 'primary.main' }}>
                                {previewState === 'idle'
                                  ? 'Ready to Flip'
                                  : previewState === 'inspectStart'
                                  ? 'Start (0%)'
                                  : previewState === 'inspectMid'
                                  ? 'Midpoint'
                                  : previewState === 'inspectEnd'
                                  ? 'Landing (100%)'
                                  : previewState === 'exitRight'
                                  ? 'Flipping (Sort)'
                                  : 'Flipping (Undo)'}
                              </Typography>
                            </Box>
                          )}
                        </CardContent>
                      </AnimatedCard>
                    );
                  });
                })()}
              </Box>
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
                  variant={previewState === 'inspectMid' ? 'contained' : 'outlined'}
                  color="secondary"
                  onClick={() => setPreviewState('inspectMid')}
                  sx={{ textTransform: 'none', borderRadius: 1.5, fontSize: 11, py: 0.5, px: 1, minWidth: 0, flex: '1 1 auto' }}
                >
                  Midpoint
                </Button>
                <Button
                  size="small"
                  variant={previewState === 'inspectEnd' ? 'contained' : 'outlined'}
                  color="success"
                  onClick={() => setPreviewState('inspectEnd')}
                  sx={{ textTransform: 'none', borderRadius: 1.5, fontSize: 11, py: 0.5, px: 1, minWidth: 0, flex: '1 1 auto' }}
                >
                  Landing (100%)
                </Button>
              </Stack>
            </Box>

            {/* Action buttons */}
            <Stack direction="row" spacing={1.5} sx={{ mt: 3, width: '100%' }}>
              <Button
                variant="contained"
                color="primary"
                startIcon={<ArrowForwardIcon />}
                onClick={() => triggerPreview('right')}
                sx={{ flex: 1, textTransform: 'none', borderRadius: 2, whiteSpace: 'nowrap', px: 1.5 }}
              >
                Arrow Right (Sort)
              </Button>
              <Button
                variant="contained"
                color="secondary"
                startIcon={<ArrowBackIcon />}
                onClick={() => triggerPreview('left')}
                sx={{ flex: 1, textTransform: 'none', borderRadius: 2, whiteSpace: 'nowrap', px: 1.5 }}
              >
                Arrow Left (Back / Undo)
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
        </Panel>
      </PanelGroup>
    </Stack>
  );
}
