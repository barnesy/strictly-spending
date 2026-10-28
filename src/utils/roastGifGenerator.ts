export interface RoastGifPayload {
  crazyName: string;
  avatarEmoji: string;
  floatingEmojis?: string[];
  totalAmountFormatted: string;
  subtitleLine: string;
  roastQuote: string;
  stampText?: string;
}

/**
 * Generates an animated looping GIF89a Blob + URL AND a crisp PNG Blob (for 1-click clipboard image copy)
 * completely client-side with zero external servers.
 */
export async function generateRoastAnimatedGif(payload: RoastGifPayload): Promise<{
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

  const palette = buildFixedPalette();
  const framesIndices: Uint8Array[] = [];

  for (let f = 0; f < frameCount; f++) {
    drawRoastFrame(ctx, width, height, payload, f, frameCount);
    const imgData = ctx.getImageData(0, 0, width, height).data;
    const indexed = mapRgbaToPaletteIndices(imgData, width * height);
    framesIndices.push(indexed);
  }

  // Draw hero frame (frame 0) for crisp clipboard PNG copy
  drawRoastFrame(ctx, width, height, payload, 0, frameCount);
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

/**
 * Automatically steps down font size until a single-line string fits within maxWidth.
 */
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

/**
 * Automatically selects the largest font size where the wrapped paragraph fits both
 * maxWidth and maxHeight cleanly.
 */
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
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function drawRoastFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  payload: RoastGifPayload,
  frame: number,
  totalFrames: number
) {
  const phase = (frame / totalFrames) * Math.PI * 2;
  const isAlt = frame % 2 === 0;
  const isFlash = frame % 4 < 2;
  const sansFamily = '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif';
  const displayFamily = '"Inter", "Segoe UI", "Arial Black", sans-serif';

  // 1. Dark dramatic poster background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, '#13070c');
  bgGrad.addColorStop(0.55, '#1d0b14');
  bgGrad.addColorStop(1, '#320810');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 2. Pulsing radial spotlight
  const glowRadius = 230 + Math.sin(phase) * 26;
  const radGrad = ctx.createRadialGradient(w / 2, 230, 12, w / 2, 230, glowRadius);
  radGrad.addColorStop(0, 'rgba(239, 68, 68, 0.28)');
  radGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.fillStyle = radGrad;
  ctx.fillRect(0, 0, w, h);

  // 3. Floating habit emojis rising in the background
  const floaters =
    payload.floatingEmojis && payload.floatingEmojis.length >= 4
      ? payload.floatingEmojis
      : ['🍺', '☕', '🚬', '💸', '🔥', '😈'];
  const emberSeeds = [
    { x: 42, baseY: 515, label: floaters[0 % floaters.length] },
    { x: 110, baseY: 530, label: floaters[1 % floaters.length] },
    { x: 430, baseY: 510, label: floaters[2 % floaters.length] },
    { x: 494, baseY: 525, label: floaters[3 % floaters.length] },
    { x: 64, baseY: 315, label: floaters[4 % floaters.length] },
    { x: 476, baseY: 305, label: floaters[5 % floaters.length] },
  ];
  ctx.save();
  ctx.font = '21px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < emberSeeds.length; i++) {
    const e = emberSeeds[i];
    const progress = ((frame / totalFrames) + i * 0.17) % 1;
    const yPos = e.baseY - progress * 200;
    const xWobble = e.x + Math.sin(phase + i * 1.4) * 10;
    ctx.globalAlpha = Math.max(0.16, 1 - progress * 0.8);
    ctx.fillText(e.label, xWobble, yPos);
  }
  ctx.restore();

  // 4. Animated bottom cartoon flames
  drawBottomFlames(ctx, w, h, phase, frame);

  // 5. Outer neon border pulsing between crimson and gold
  ctx.save();
  ctx.strokeStyle = isFlash ? '#ef4444' : '#f59e0b';
  ctx.lineWidth = 4;
  drawRoundedRect(ctx, 12, 12, w - 24, h - 24, 18);
  ctx.stroke();
  ctx.restore();

  // 6. Top Siren Header Banner (y: 26..62)
  const padX = 28;
  const innerW = w - padX * 2;
  ctx.save();
  drawRoundedRect(ctx, padX, 26, innerW, 36, 9);
  ctx.fillStyle = isFlash ? '#dc2626' : '#b91c1c';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const sirenLeft = isAlt ? '🚨' : '😈';
  const sirenRight = isAlt ? '😈' : '🚨';
  const headerBannerText = `${sirenLeft}  ALL-TIME HABITUAL SPENDING ROAST  ${sirenRight}`;
  setFittedSingleLineFont(ctx, headerBannerText, innerW - 24, 13, 10, '800', sansFamily);
  ctx.fillText(headerBannerText, w / 2, 44);
  ctx.restore();

  // 7. Persona Header Row (y: 74..152)
  const bounceY = Math.sin(phase) * 3.5;
  const avatarX = padX + 34;
  const avatarY = 113;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY + bounceY, 31, 0, Math.PI * 2);
  ctx.fillStyle = '#2d0e16';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = isFlash ? '#fbbf24' : '#ef4444';
  ctx.stroke();

  ctx.font = '30px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(payload.avatarEmoji || '😈', avatarX, avatarY + 2 + bounceY);
  ctx.restore();

  // Persona Title (right of avatar, guaranteed to fit inside width & height)
  const titleX = padX + 80;
  const titleMaxW = w - padX - titleX - 4;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 11px ${sansFamily}`;
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('OFFICIAL HABIT DIAGNOSIS:', titleX, 88);

  const nameLayout = layoutFittedParagraph(
    ctx,
    payload.crazyName.toUpperCase(),
    titleMaxW,
    54,
    20,
    13,
    1.18,
    '900',
    displayFamily
  );
  ctx.font = `900 ${nameLayout.fontSize}px ${displayFamily}`;
  ctx.fillStyle = '#ffffff';
  nameLayout.lines.forEach((line, idx) => {
    ctx.fillText(line, titleX, 112 + idx * nameLayout.lineHeight);
  });
  ctx.restore();

  // 8. Giant All-Time Amount Box (y: 162..292, height: 130)
  const boxY = 162;
  const boxH = 130;
  ctx.save();
  drawRoundedRect(ctx, padX, boxY, innerW, boxH, 14);
  ctx.fillStyle = '#0d0407';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = isAlt ? '#ef4444' : '#f97316';
  ctx.stroke();

  // Giant shaking/pulsing dollar amount (auto-fitted to box width)
  const scaleJitter = 1 + Math.sin(phase * 2) * 0.03;
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
    displayFamily
  );
  ctx.fillStyle = isFlash ? '#ff4d4d' : '#fbbf24';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(payload.totalAmountFormatted, 0, 0);
  ctx.restore();

  // Subtitle line inside amount box (auto-fitted so it NEVER overflows horizontally)
  ctx.save();
  const subText = payload.subtitleLine.toUpperCase();
  setFittedSingleLineFont(ctx, subText, innerW - 32, 12.5, 9.5, '800', sansFamily);
  ctx.fillStyle = '#fca5a5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(subText, w / 2, boxY + 104);
  ctx.restore();
  ctx.restore();

  // 9. Roast & Statistical Assumption Card (y: 306..508, height: 202)
  const cardY = 306;
  const cardH = 202;
  const cardInnerPadX = 20;
  const cardTextW = innerW - cardInnerPadX * 2;

  ctx.save();
  drawRoundedRect(ctx, padX, cardY, innerW, cardH, 14);
  ctx.fillStyle = '#1e1017';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#5c1d27';
  ctx.stroke();

  // Card Top Header Row (Left label + Right non-overlapping stamp pill)
  const headerRowCenterY = cardY + 24;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `800 11.5px ${sansFamily}`;
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('🕵️ FORENSIC HABIT ASSUMPTION:', padX + cardInnerPadX, headerRowCenterY);

  // Stamp badge neatly aligned in top-right of header row
  const stampLabel = payload.stampText || (isFlash ? 'CAUGHT IN 4K 📸' : 'STATISTICALLY COOKED 💀');
  ctx.font = `900 10.5px ${sansFamily}`;
  const stampTextW = ctx.measureText(stampLabel).width;
  const pillW = stampTextW + 18;
  const pillH = 22;
  const pillX = padX + innerW - cardInnerPadX - pillW;
  const pillY = headerRowCenterY - pillH / 2;

  drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 6);
  ctx.fillStyle = isFlash ? '#dc2626' : '#d97706';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(stampLabel, pillX + pillW / 2, headerRowCenterY + 0.5);

  // Subtle horizontal divider under card header row
  ctx.beginPath();
  ctx.moveTo(padX + cardInnerPadX, cardY + 42);
  ctx.lineTo(padX + innerW - cardInnerPadX, cardY + 42);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Auto-fitted roast quote body inside [cardY + 52 .. cardY + cardH - 14]
  const bodyTopY = cardY + 52;
  const bodyAvailH = cardH - 66; // 136px height budget
  const quoteLayout = layoutFittedParagraph(
    ctx,
    payload.roastQuote,
    cardTextW,
    bodyAvailH,
    16.5,
    12.5,
    1.38,
    '700',
    sansFamily
  );

  ctx.font = `700 ${quoteLayout.fontSize}px ${sansFamily}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const totalTextH = quoteLayout.lines.length * quoteLayout.lineHeight;
  const startTextY = bodyTopY + Math.max(0, Math.floor((bodyAvailH - totalTextH) / 2));

  quoteLayout.lines.forEach((line, idx) => {
    const isLastLine = idx === quoteLayout.lines.length - 1;
    ctx.fillStyle = isLastLine ? '#fde047' : '#f8fafc';
    ctx.fillText(line, padX + cardInnerPadX, startTextY + idx * quoteLayout.lineHeight);
  });
  ctx.restore();

  // 10. Footer watermark (y: h - 24)
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 11.5px ${sansFamily}`;
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(
    '😈 Strictly Spending · 100% Offline All-Time Habit Roast',
    w / 2,
    h - 24
  );
  ctx.restore();
}

function drawBottomFlames(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  phase: number,
  frame: number
) {
  ctx.save();
  const tongues = 18;
  const step = w / tongues;

  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i <= tongues; i++) {
    const x = i * step;
    const peakH = 24 + Math.sin(phase + i * 0.9) * 12 + ((i + frame) % 3) * 5;
    const midX = x - step / 2;
    if (i > 0) {
      ctx.quadraticCurveTo(midX, h - peakH - 14, x, h - 8);
    } else {
      ctx.lineTo(x, h - 10);
    }
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(239, 68, 68, 0.32)';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i <= tongues; i++) {
    const x = i * step;
    const peakH = 14 + Math.cos(phase + i * 1.1) * 9;
    const midX = x - step / 2;
    if (i > 0) {
      ctx.quadraticCurveTo(midX, h - peakH - 6, x, h - 4);
    } else {
      ctx.lineTo(x, h - 6);
    }
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
  ctx.fill();
  ctx.restore();
}

function buildFixedPalette(): Uint8Array {
  const pal = new Uint8Array(256 * 3);
  const levels = [0, 51, 102, 153, 204, 255];
  let idx = 0;
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
  for (let i = 0; i < 40; i++) {
    const v = Math.round((i / 39) * 255);
    pal[idx * 3] = v;
    pal[idx * 3 + 1] = v;
    pal[idx * 3 + 2] = v;
    idx++;
  }
  return pal;
}

function mapRgbaToPaletteIndices(rgba: Uint8ClampedArray, pixelCount: number): Uint8Array {
  const out = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    const r = rgba[offset];
    const g = rgba[offset + 1];
    const b = rgba[offset + 2];

    const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    if (maxDiff <= 10) {
      const lum = Math.round(((r + g + b) / (3 * 255)) * 39);
      out[i] = 216 + lum;
    } else {
      const ri = Math.round((r / 255) * 5);
      const gi = Math.round((g / 255) * 5);
      const bi = Math.round((b / 255) * 5);
      out[i] = ri * 36 + gi * 6 + bi;
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
    writeByte(0x00);
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

      if (nextCode < 4096) {
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
  emitCode(endCode, codeSize);

  if (bitCount > 0) {
    subBlock[subBlockLen++] = bitBuf & 0xff;
  }
  flushSubBlock();

  return new Uint8Array(outBytes);
}
