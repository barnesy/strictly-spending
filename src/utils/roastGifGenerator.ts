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
  const width = 520;
  const height = 540;
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

  // 1. Dark dramatic arcade poster background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, '#13070c');
  bgGrad.addColorStop(0.55, '#1d0b14');
  bgGrad.addColorStop(1, '#350910');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 2. Pulsing radial spotlight
  const glowRadius = 230 + Math.sin(phase) * 28;
  const radGrad = ctx.createRadialGradient(w / 2, 230, 12, w / 2, 230, glowRadius);
  radGrad.addColorStop(0, 'rgba(239, 68, 68, 0.30)');
  radGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.fillStyle = radGrad;
  ctx.fillRect(0, 0, w, h);

  // 3. Floating habit emojis rising in the background
  const floaters =
    payload.floatingEmojis && payload.floatingEmojis.length >= 4
      ? payload.floatingEmojis
      : ['🍺', '☕', '🚬', '💸', '🔥', '😈'];
  const emberSeeds = [
    { x: 44, baseY: 500, label: floaters[0 % floaters.length] },
    { x: 112, baseY: 520, label: floaters[1 % floaters.length] },
    { x: 416, baseY: 495, label: floaters[2 % floaters.length] },
    { x: 474, baseY: 515, label: floaters[3 % floaters.length] },
    { x: 68, baseY: 310, label: floaters[4 % floaters.length] },
    { x: 452, baseY: 300, label: floaters[5 % floaters.length] },
  ];
  ctx.save();
  ctx.font = '22px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < emberSeeds.length; i++) {
    const e = emberSeeds[i];
    const progress = ((frame / totalFrames) + i * 0.17) % 1;
    const yPos = e.baseY - progress * 210;
    const xWobble = e.x + Math.sin(phase + i * 1.4) * 11;
    ctx.globalAlpha = Math.max(0.18, 1 - progress * 0.8);
    ctx.fillText(e.label, xWobble, yPos);
  }
  ctx.restore();

  // 4. Animated bottom cartoon flames
  drawBottomFlames(ctx, w, h, phase, frame);

  // 5. Outer neon border pulsing between crimson and gold
  ctx.save();
  ctx.strokeStyle = isFlash ? '#ef4444' : '#f59e0b';
  ctx.lineWidth = 4;
  drawRoundedRect(ctx, 10, 10, w - 20, h - 20, 18);
  ctx.stroke();
  ctx.restore();

  // 6. Flashing Siren Top Banner
  ctx.save();
  drawRoundedRect(ctx, 24, 22, w - 48, 36, 9);
  ctx.fillStyle = isFlash ? '#dc2626' : '#b91c1c';
  ctx.fill();
  ctx.font = 'bold 13px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  const sirenLeft = isAlt ? '🚨' : '😈';
  const sirenRight = isAlt ? '😈' : '🚨';
  ctx.fillText(
    `${sirenLeft}  SUSPICIOUS SPENDING HABIT DETECTED  ${sirenRight}`,
    w / 2,
    45
  );
  ctx.restore();

  // 7. Bouncing Avatar + Crazy Nickname
  const bounceY = Math.sin(phase) * 4.5;
  ctx.save();
  ctx.beginPath();
  ctx.arc(68, 108 + bounceY, 32, 0, Math.PI * 2);
  ctx.fillStyle = '#2d0e16';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = isFlash ? '#fbbf24' : '#ef4444';
  ctx.stroke();

  ctx.font = '32px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(payload.avatarEmoji || '😈', 68, 120 + bounceY);
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'left';
  ctx.font = 'bold 11.5px "Inter", "Segoe UI", sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('OFFICIAL SPENDING DIAGNOSIS:', 114, 85);

  ctx.font = '900 21px "Inter", "Segoe UI", Arial Black, sans-serif';
  ctx.fillStyle = '#ffffff';
  const nameLines = wrapTextLines(ctx, payload.crazyName.toUpperCase(), w - 140).slice(0, 2);
  nameLines.forEach((line, idx) => {
    ctx.fillText(line, 114, 111 + idx * 24);
  });
  ctx.restore();

  // 8. Giant Pulsing Amount Centerpiece
  const boxY = 154;
  const boxH = 126;
  ctx.save();
  drawRoundedRect(ctx, 24, boxY, w - 48, boxH, 14);
  ctx.fillStyle = '#0c0407';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = isAlt ? '#ef4444' : '#f97316';
  ctx.stroke();

  const scaleJitter = 1 + Math.sin(phase * 2) * 0.04;
  ctx.save();
  ctx.translate(w / 2, boxY + 64);
  ctx.scale(scaleJitter, scaleJitter);
  ctx.font = '900 54px "Inter", "Segoe UI", Arial Black, monospace';
  ctx.fillStyle = isFlash ? '#ff4d4d' : '#fbbf24';
  ctx.textAlign = 'center';
  ctx.fillText(payload.totalAmountFormatted, 0, 0);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.font = 'bold 13px "Inter", "Segoe UI", sans-serif';
  ctx.fillStyle = '#fca5a5';
  ctx.fillText(payload.subtitleLine.toUpperCase(), w / 2, boxY + 104);
  ctx.restore();

  // 9. Big Punchy Roast + Assumption Box
  const cardY = 298;
  const cardH = 192;
  ctx.save();
  drawRoundedRect(ctx, 24, cardY, w - 48, cardH, 14);
  ctx.fillStyle = '#1e1017';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#5c1d27';
  ctx.stroke();

  // Tilted flashing rubber stamp in top-right corner
  ctx.save();
  ctx.translate(w - 94, cardY + 26);
  ctx.rotate(-0.12 + Math.sin(phase) * 0.035);
  drawRoundedRect(ctx, -62, -15, 124, 28, 6);
  ctx.fillStyle = isFlash ? 'rgba(220, 38, 38, 0.95)' : 'rgba(245, 158, 11, 0.95)';
  ctx.fill();
  ctx.font = '900 11px "Inter", "Segoe UI", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(payload.stampText || (isFlash ? 'CAUGHT IN 4K 📸' : 'EXPOSED 💀'), 0, 3);
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.font = 'bold 12px "Inter", "Segoe UI", sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('🕵️ THE ROAST:', 42, cardY + 32);

  ctx.font = '700 16.5px "Inter", "Segoe UI", sans-serif';
  ctx.fillStyle = '#ffffff';
  const quoteLines = wrapTextLines(ctx, payload.roastQuote, w - 84).slice(0, 5);
  quoteLines.forEach((line, idx) => {
    ctx.fillStyle = idx === quoteLines.length - 1 ? '#fde047' : '#f8fafc';
    ctx.fillText(line, 42, cardY + 64 + idx * 25);
  });
  ctx.restore();

  // 10. Footer watermark
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 11.5px "Inter", "Segoe UI", sans-serif';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(
    '😈 Strictly Spending · 100% Offline Financial Roast',
    w / 2,
    h - 20
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
    const peakH = 26 + Math.sin(phase + i * 0.9) * 14 + ((i + frame) % 3) * 6;
    const midX = x - step / 2;
    if (i > 0) {
      ctx.quadraticCurveTo(midX, h - peakH - 16, x, h - 10);
    } else {
      ctx.lineTo(x, h - 12);
    }
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i <= tongues; i++) {
    const x = i * step;
    const peakH = 15 + Math.cos(phase + i * 1.1) * 10;
    const midX = x - step / 2;
    if (i > 0) {
      ctx.quadraticCurveTo(midX, h - peakH - 8, x, h - 4);
    } else {
      ctx.lineTo(x, h - 6);
    }
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(245, 158, 11, 0.28)';
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
