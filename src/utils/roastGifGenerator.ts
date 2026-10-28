export interface RoastGifPayload {
  crazyName: string;
  avatarEmoji: string;
  floatingEmojis?: string[];
  totalAmountFormatted: string;
  subtitleLine: string;
  roastQuote: string;
  stampText?: string;
}

export interface RoastThemeStyle {
  mode: 'light' | 'dark';
  bgDefault: string;
  bgPaper: string;
  primaryMain: string;
  primaryContrast: string;
  secondaryMain: string;
  errorMain: string;
  warningMain: string;
  textPrimary: string;
  textSecondary: string;
  divider: string;
  fontFamily: string;
  borderRadius: number;
}

export const DEFAULT_ROAST_THEME: RoastThemeStyle = {
  mode: 'dark',
  bgDefault: '#0f172a',
  bgPaper: '#1e293b',
  primaryMain: '#3b82f6',
  primaryContrast: '#ffffff',
  secondaryMain: '#f59e0b',
  errorMain: '#ef4444',
  warningMain: '#f59e0b',
  textPrimary: '#f8fafc',
  textSecondary: '#94a3b8',
  divider: '#334155',
  fontFamily: '"Atkinson Hyperlegible", "Inter", "Segoe UI", system-ui, sans-serif',
  borderRadius: 12,
};

function parseColorToRgb(color: string): [number, number, number] {
  const c = (color || '').trim();
  if (c.startsWith('#')) {
    if (c.length === 4) {
      return [
        parseInt(c[1] + c[1], 16) || 0,
        parseInt(c[2] + c[2], 16) || 0,
        parseInt(c[3] + c[3], 16) || 0,
      ];
    }
    if (c.length >= 7) {
      return [
        parseInt(c.slice(1, 3), 16) || 0,
        parseInt(c.slice(3, 5), 16) || 0,
        parseInt(c.slice(5, 7), 16) || 0,
      ];
    }
  }
  const match = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (match) {
    return [Number(match[1]) || 0, Number(match[2]) || 0, Number(match[3]) || 0];
  }
  return [30, 41, 59];
}

function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = parseColorToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Generates an animated looping GIF89a Blob + URL AND a crisp PNG Blob (for 1-click clipboard image copy)
 * completely client-side with zero external servers, styled to match the active app theme.
 */
export async function generateRoastAnimatedGif(
  payload: RoastGifPayload,
  themeStyle: RoastThemeStyle = DEFAULT_ROAST_THEME
): Promise<{
  gifBlob: Blob;
  gifUrl: string;
  pngBlob: Blob | null;
}> {
  const width = 540;
  const height = 560;
  const frameCount = 12;
  const delayHundredths = 9; // 90ms per frame (~11 fps)

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  const palette = buildThemeAwarePalette(themeStyle);
  const framesIndices: Uint8Array[] = [];

  for (let f = 0; f < frameCount; f++) {
    drawRoastFrame(ctx, width, height, payload, f, frameCount, themeStyle);
    const imgData = ctx.getImageData(0, 0, width, height).data;
    const indexed = mapRgbaToPaletteIndices(imgData, width * height, palette);
    framesIndices.push(indexed);
  }

  // Draw hero frame (frame 0) for crisp clipboard PNG copy
  drawRoastFrame(ctx, width, height, payload, 0, frameCount, themeStyle);
  const pngBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png');
  });

  const gifBytes = encodeGif89a(width, height, palette, framesIndices, delayHundredths);
  const gifBlob = new Blob([gifBytes.buffer as ArrayBuffer], { type: 'image/gif' });
  const gifUrl = URL.createObjectURL(gifBlob);
  return { gifBlob, gifUrl, pngBlob };
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function setFittedSingleLineFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxFontPx: number,
  minFontPx: number,
  fontWeight: string,
  fontFamily: string
): number {
  let size = maxFontPx;
  while (size > minFontPx) {
    ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxWidth) {
      return size;
    }
    size -= 0.5;
  }
  ctx.font = `${fontWeight} ${minFontPx}px ${fontFamily}`;
  return minFontPx;
}

function layoutFittedParagraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  maxFontPx: number,
  minFontPx: number,
  lineHeightMultiplier: number,
  fontWeight: string,
  fontFamily: string
): { lines: string[]; fontSize: number; lineHeight: number } {
  let size = maxFontPx;
  while (size >= minFontPx) {
    ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
    const lines = wrapTextLines(ctx, text, maxWidth);
    const lineHeight = Math.round(size * lineHeightMultiplier);
    if (lines.length * lineHeight <= maxHeight) {
      return { lines, fontSize: size, lineHeight };
    }
    size -= 0.5;
  }
  ctx.font = `${fontWeight} ${minFontPx}px ${fontFamily}`;
  const lineHeight = Math.round(minFontPx * lineHeightMultiplier);
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
  const lines = wrapTextLines(ctx, text, maxWidth).slice(0, maxLines);
  return { lines, fontSize: minFontPx, lineHeight };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function drawRoastFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  payload: RoastGifPayload,
  frame: number,
  totalFrames: number,
  themeStyle: RoastThemeStyle = DEFAULT_ROAST_THEME
) {
  const phase = (frame / totalFrames) * Math.PI * 2;
  const isAlt = frame % 2 === 0;
  const isFlash = frame % 4 < 2;
  const sansFamily = themeStyle.fontFamily || DEFAULT_ROAST_THEME.fontFamily;
  const cardRadius = Math.max(8, Math.min(20, themeStyle.borderRadius * 1.4));

  // 1. Solid theme background (never transparent, never hardcoded black)
  ctx.fillStyle = themeStyle.bgPaper;
  ctx.fillRect(0, 0, w, h);

  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, themeStyle.bgPaper);
  bgGrad.addColorStop(1, themeStyle.bgDefault);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 2. Subtle pulsing theme-colored spotlight glow
  const glowRadius = 230 + Math.sin(phase) * 24;
  const radGrad = ctx.createRadialGradient(w / 2, 225, 12, w / 2, 225, glowRadius);
  radGrad.addColorStop(0, withAlpha(themeStyle.primaryMain, themeStyle.mode === 'dark' ? 0.22 : 0.12));
  radGrad.addColorStop(1, withAlpha(themeStyle.primaryMain, 0));
  ctx.fillStyle = radGrad;
  ctx.fillRect(0, 0, w, h);

  // 3. Floating habit emojis drifting smoothly
  const floaters =
    payload.floatingEmojis && payload.floatingEmojis.length >= 4
      ? payload.floatingEmojis
      : ['🍺', '☕', '🚬', '💸', '🔥', '😈'];
  const emberSeeds = [
    { x: 42, baseY: 515, label: floaters[0 % floaters.length] },
    { x: 112, baseY: 530, label: floaters[1 % floaters.length] },
    { x: 428, baseY: 510, label: floaters[2 % floaters.length] },
    { x: 494, baseY: 525, label: floaters[3 % floaters.length] },
    { x: 64, baseY: 315, label: floaters[4 % floaters.length] },
    { x: 476, baseY: 305, label: floaters[5 % floaters.length] },
  ];
  ctx.save();
  ctx.font = '20px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < emberSeeds.length; i++) {
    const e = emberSeeds[i];
    const progress = ((frame / totalFrames) + i * 0.17) % 1;
    const yPos = e.baseY - progress * 195;
    const xWobble = e.x + Math.sin(phase + i * 1.4) * 9;
    ctx.globalAlpha = Math.max(0.14, (1 - progress * 0.8) * (themeStyle.mode === 'dark' ? 0.75 : 0.55));
    ctx.fillText(e.label, xWobble, yPos);
  }
  ctx.restore();

  // 4. Theme-colored animated bottom waves
  drawThemeWaves(ctx, w, h, phase, frame, themeStyle);

  // 5. Outer frame border following theme primary/secondary
  ctx.save();
  ctx.strokeStyle = isFlash ? themeStyle.primaryMain : themeStyle.secondaryMain;
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, 10, 10, w - 20, h - 20, cardRadius + 4);
  ctx.stroke();
  ctx.restore();

  // 6. Top Header Banner (y: 26..62) in theme.primaryMain
  const padX = 26;
  const innerW = w - padX * 2;
  ctx.save();
  drawRoundedRect(ctx, padX, 26, innerW, 36, Math.max(6, cardRadius - 2));
  ctx.fillStyle = themeStyle.primaryMain;
  ctx.fill();
  ctx.fillStyle = themeStyle.primaryContrast;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const sirenLeft = isAlt ? '😈' : '🚨';
  const sirenRight = isAlt ? '🚨' : '😈';
  const headerBannerText = `${sirenLeft}  ALL-TIME HABITUAL SPENDING ROAST  ${sirenRight}`;
  setFittedSingleLineFont(ctx, headerBannerText, innerW - 24, 12.5, 10, '800', sansFamily);
  ctx.fillText(headerBannerText, w / 2, 44);
  ctx.restore();

  // 7. Persona Header Row (y: 74..152)
  const bounceY = Math.sin(phase) * 3.5;
  const avatarX = padX + 34;
  const avatarY = 113;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY + bounceY, 31, 0, Math.PI * 2);
  ctx.fillStyle = themeStyle.bgDefault;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = isFlash ? themeStyle.primaryMain : themeStyle.secondaryMain;
  ctx.stroke();

  ctx.font = '30px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(payload.avatarEmoji || '😈', avatarX, avatarY + 2 + bounceY);
  ctx.restore();

  // Persona Title (right of avatar)
  const titleX = padX + 80;
  const titleMaxW = w - padX - titleX - 4;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 11px ${sansFamily}`;
  ctx.fillStyle = themeStyle.primaryMain;
  ctx.fillText('OFFICIAL HABIT DIAGNOSIS:', titleX, 88);

  const nameLayout = layoutFittedParagraph(
    ctx,
    payload.crazyName,
    titleMaxW,
    54,
    20,
    13,
    1.18,
    '800',
    sansFamily
  );
  ctx.font = `800 ${nameLayout.fontSize}px ${sansFamily}`;
  ctx.fillStyle = themeStyle.textPrimary;
  nameLayout.lines.forEach((line, idx) => {
    ctx.fillText(line, titleX, 112 + idx * nameLayout.lineHeight);
  });
  ctx.restore();

  // 8. Giant All-Time Amount Box (y: 162..292, height: 130)
  const boxY = 162;
  const boxH = 130;
  ctx.save();
  drawRoundedRect(ctx, padX, boxY, innerW, boxH, cardRadius);
  ctx.fillStyle = themeStyle.bgDefault;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = themeStyle.divider;
  ctx.stroke();

  // Top accent bar inside amount box
  ctx.save();
  ctx.beginPath();
  drawRoundedRect(ctx, padX, boxY, innerW, boxH, cardRadius);
  ctx.clip();
  ctx.fillStyle = isFlash ? themeStyle.errorMain : themeStyle.primaryMain;
  ctx.fillRect(padX, boxY, innerW, 4);
  ctx.restore();

  // Giant pulsing dollar amount
  const scaleJitter = 1 + Math.sin(phase * 2) * 0.028;
  ctx.save();
  ctx.translate(w / 2, boxY + 54);
  ctx.scale(scaleJitter, scaleJitter);
  setFittedSingleLineFont(
    ctx,
    payload.totalAmountFormatted,
    innerW - 48,
    50,
    28,
    '900',
    sansFamily
  );
  ctx.fillStyle = isFlash ? themeStyle.errorMain : themeStyle.primaryMain;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(payload.totalAmountFormatted, 0, 0);
  ctx.restore();

  // Subtitle line inside amount box
  ctx.save();
  const subText = payload.subtitleLine.toUpperCase();
  setFittedSingleLineFont(ctx, subText, innerW - 32, 12, 9.5, '700', sansFamily);
  ctx.fillStyle = themeStyle.textSecondary;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(subText, w / 2, boxY + 104);
  ctx.restore();
  ctx.restore();

  // 9. Roast & Statistical Assumption Card (y: 306..508, height: 202)
  const cardY = 306;
  const cardH = 202;
  const cardInnerPadX = 22;
  const cardTextW = innerW - cardInnerPadX * 2;

  ctx.save();
  drawRoundedRect(ctx, padX, cardY, innerW, cardH, cardRadius);
  ctx.fillStyle = themeStyle.bgDefault;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = themeStyle.divider;
  ctx.stroke();

  // Left accent bar matching app's verdict callout style
  ctx.save();
  drawRoundedRect(ctx, padX, cardY, innerW, cardH, cardRadius);
  ctx.clip();
  ctx.fillStyle = themeStyle.primaryMain;
  ctx.fillRect(padX, cardY, 5, cardH);
  ctx.restore();

  // Card Top Header Row (Left label + Right non-overlapping stamp pill)
  const headerRowCenterY = cardY + 24;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `800 11.5px ${sansFamily}`;
  ctx.fillStyle = themeStyle.primaryMain;
  ctx.fillText('🕵️ FORENSIC HABIT ASSUMPTION', padX + cardInnerPadX, headerRowCenterY);

  const stampLabel = payload.stampText || (isFlash ? 'CAUGHT IN 4K 📸' : 'STATISTICALLY COOKED 💀');
  ctx.font = `800 10.5px ${sansFamily}`;
  const stampTextW = ctx.measureText(stampLabel).width;
  const pillW = stampTextW + 18;
  const pillH = 22;
  const pillX = padX + innerW - cardInnerPadX - pillW;
  const pillY = headerRowCenterY - pillH / 2;

  drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 6);
  ctx.fillStyle = isFlash ? themeStyle.errorMain : themeStyle.secondaryMain;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(stampLabel, pillX + pillW / 2, headerRowCenterY + 0.5);

  // Divider under card header row
  ctx.beginPath();
  ctx.moveTo(padX + cardInnerPadX, cardY + 42);
  ctx.lineTo(padX + innerW - cardInnerPadX, cardY + 42);
  ctx.strokeStyle = themeStyle.divider;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Auto-fitted roast quote body inside [cardY + 52 .. cardY + cardH - 14]
  const bodyTopY = cardY + 52;
  const bodyAvailH = cardH - 66;
  const quoteLayout = layoutFittedParagraph(
    ctx,
    payload.roastQuote,
    cardTextW,
    bodyAvailH,
    16,
    12.5,
    1.4,
    '600',
    sansFamily
  );

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const totalTextH = quoteLayout.lines.length * quoteLayout.lineHeight;
  const startTextY = bodyTopY + Math.max(0, Math.floor((bodyAvailH - totalTextH) / 2));

  quoteLayout.lines.forEach((line, idx) => {
    const isLastLine = idx === quoteLayout.lines.length - 1;
    ctx.font = `${isLastLine ? '800' : '600'} ${quoteLayout.fontSize}px ${sansFamily}`;
    ctx.fillStyle = isLastLine ? themeStyle.primaryMain : themeStyle.textPrimary;
    ctx.fillText(line, padX + cardInnerPadX, startTextY + idx * quoteLayout.lineHeight);
  });
  ctx.restore();

  // 10. Footer watermark (y: h - 24)
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 11px ${sansFamily}`;
  ctx.fillStyle = themeStyle.textSecondary;
  ctx.fillText(
    '😈 Strictly Spending · 100% Offline All-Time Habit Roast',
    w / 2,
    h - 24
  );
  ctx.restore();
}

function drawThemeWaves(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  phase: number,
  frame: number,
  themeStyle: RoastThemeStyle
) {
  ctx.save();
  const tongues = 16;
  const step = w / tongues;

  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i <= tongues; i++) {
    const x = i * step;
    const peakH = 20 + Math.sin(phase + i * 0.9) * 10 + ((i + frame) % 3) * 4;
    const midX = x - step / 2;
    if (i > 0) {
      ctx.quadraticCurveTo(midX, h - peakH - 10, x, h - 6);
    } else {
      ctx.lineTo(x, h - 8);
    }
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = withAlpha(themeStyle.primaryMain, themeStyle.mode === 'dark' ? 0.18 : 0.10);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i <= tongues; i++) {
    const x = i * step;
    const peakH = 12 + Math.cos(phase + i * 1.1) * 7;
    const midX = x - step / 2;
    if (i > 0) {
      ctx.quadraticCurveTo(midX, h - peakH - 5, x, h - 3);
    } else {
      ctx.lineTo(x, h - 5);
    }
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = withAlpha(themeStyle.secondaryMain, themeStyle.mode === 'dark' ? 0.15 : 0.08);
  ctx.fill();
  ctx.restore();
}

/**
 * Builds a 256-color palette where indices 0..15 are exact theme colors + blends,
 * indices 16..231 are the 6x6x6 RGB web cube (216 colors), and 232..255 are a 24-step grayscale ramp.
 */
function buildThemeAwarePalette(themeStyle: RoastThemeStyle): Uint8Array {
  const pal = new Uint8Array(256 * 3);
  const exactColors = [
    parseColorToRgb(themeStyle.bgPaper),
    parseColorToRgb(themeStyle.bgDefault),
    parseColorToRgb(themeStyle.primaryMain),
    parseColorToRgb(themeStyle.primaryContrast),
    parseColorToRgb(themeStyle.secondaryMain),
    parseColorToRgb(themeStyle.errorMain),
    parseColorToRgb(themeStyle.warningMain),
    parseColorToRgb(themeStyle.textPrimary),
    parseColorToRgb(themeStyle.textSecondary),
    parseColorToRgb(themeStyle.divider),
  ];

  let idx = 0;
  for (let i = 0; i < 16; i++) {
    const c = exactColors[i % exactColors.length];
    pal[idx * 3] = c[0];
    pal[idx * 3 + 1] = c[1];
    pal[idx * 3 + 2] = c[2];
    idx++;
  }

  const levels = [0, 51, 102, 153, 204, 255];
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        pal[idx * 3] = levels[r];
        pal[idx * 3 + 1] = levels[g];
        pal[idx * 3 + 2] = levels[b];
        idx++;
      }
    }
  }

  for (let i = 0; i < 24; i++) {
    const v = Math.round((i / 23) * 255);
    pal[idx * 3] = v;
    pal[idx * 3 + 1] = v;
    pal[idx * 3 + 2] = v;
    idx++;
  }
  return pal;
}

function mapRgbaToPaletteIndices(
  rgba: Uint8ClampedArray,
  pixelCount: number,
  palette: Uint8Array
): Uint8Array {
  const out = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    const r = rgba[offset];
    const g = rgba[offset + 1];
    const b = rgba[offset + 2];

    // Check exact/near match against the 10 theme slots first for crisp theme surfaces
    let bestThemeIdx = -1;
    let bestThemeDist = 140; // threshold for snapping to exact theme color
    for (let t = 0; t < 10; t++) {
      const dr = r - palette[t * 3];
      const dg = g - palette[t * 3 + 1];
      const db = b - palette[t * 3 + 2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestThemeDist) {
        bestThemeDist = dist;
        bestThemeIdx = t;
      }
    }
    if (bestThemeIdx !== -1) {
      out[i] = bestThemeIdx;
      continue;
    }

    const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    if (maxDiff <= 8) {
      const lum = Math.round(((r + g + b) / (3 * 255)) * 23);
      out[i] = 232 + lum;
    } else {
      const ri = Math.round((r / 255) * 5);
      const gi = Math.round((g / 255) * 5);
      const bi = Math.round((b / 255) * 5);
      out[i] = 16 + ri * 36 + gi * 6 + bi;
    }
  }
  return out;
}

function encodeGif89a(
  width: number,
  height: number,
  palette: Uint8Array,
  frames: Uint8Array[],
  delayHundredths: number
): Uint8Array {
  const bytes: number[] = [];
  const writeByte = (b: number) => bytes.push(b & 0xff);
  const writeShort = (s: number) => {
    bytes.push(s & 0xff, (s >> 8) & 0xff);
  };
  const writeAscii = (str: string) => {
    for (let i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i));
  };

  writeAscii('GIF89a');
  writeShort(width);
  writeShort(height);
  writeByte(0xf7);
  writeByte(0);
  writeByte(0);

  for (let i = 0; i < palette.length; i++) {
    writeByte(palette[i]);
  }

  writeByte(0x21);
  writeByte(0xff);
  writeByte(0x0b);
  writeAscii('NETSCAPE2.0');
  writeByte(0x03);
  writeByte(0x01);
  writeShort(0);
  writeByte(0x00);

  for (const indexedPixels of frames) {
    writeByte(0x21);
    writeByte(0xf9);
    writeByte(0x04);
    writeByte(0x04); // Disposal method 1: Do not dispose (prevents any blanking between frames)
    writeShort(delayHundredths);
    writeByte(0x00);
    writeByte(0x00);

    writeByte(0x2c);
    writeShort(0);
    writeShort(0);
    writeShort(width);
    writeShort(height);
    writeByte(0x00);

    writeByte(8);
    const lzwBlocks = lzwCompressFrame(indexedPixels);
    for (let i = 0; i < lzwBlocks.length; i++) {
      writeByte(lzwBlocks[i]);
    }
    writeByte(0x00);
  }

  writeByte(0x3b);
  return new Uint8Array(bytes);
}

function lzwCompressFrame(indices: Uint8Array): Uint8Array {
  const minCodeSize = 8;
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;

  let codeSize = minCodeSize + 1;
  let nextCode = endCode + 1;

  const table = new Int32Array(4096 * 256);
  table.fill(-1);

  const subBlock = new Uint8Array(255);
  let subBlockLen = 0;
  const outBytes: number[] = [];

  let bitBuf = 0;
  let bitCount = 0;

  const flushSubBlock = () => {
    if (subBlockLen > 0) {
      outBytes.push(subBlockLen);
      for (let i = 0; i < subBlockLen; i++) {
        outBytes.push(subBlock[i]);
      }
      subBlockLen = 0;
    }
  };

  const emitCode = (code: number, bits: number) => {
    bitBuf |= code << bitCount;
    bitCount += bits;
    while (bitCount >= 8) {
      subBlock[subBlockLen++] = bitBuf & 0xff;
      if (subBlockLen === 255) {
        flushSubBlock();
      }
      bitBuf >>= 8;
      bitCount -= 8;
    }
  };

  emitCode(clearCode, codeSize);

  if (indices.length === 0) {
    emitCode(endCode, codeSize);
    if (bitCount > 0) {
      subBlock[subBlockLen++] = bitBuf & 0xff;
    }
    flushSubBlock();
    return new Uint8Array(outBytes);
  }

  let prefix = indices[0];

  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const hit = table[key];

    if (hit !== -1) {
      prefix = hit;
    } else {
      emitCode(prefix, codeSize);

      if (nextCode < 4094) {
        if (nextCode === 1 << codeSize && codeSize < 12) {
          codeSize++;
        }
        table[key] = nextCode++;
      } else {
        emitCode(clearCode, codeSize);
        table.fill(-1);
        codeSize = minCodeSize + 1;
        nextCode = endCode + 1;
      }

      prefix = k;
    }
  }

  emitCode(prefix, codeSize);
  if (nextCode === 1 << codeSize && codeSize < 12) {
    codeSize++;
  }
  emitCode(endCode, codeSize);

  if (bitCount > 0) {
    subBlock[subBlockLen++] = bitBuf & 0xff;
  }
  flushSubBlock();

  return new Uint8Array(outBytes);
}
