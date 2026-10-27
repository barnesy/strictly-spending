export interface RoastGifPayload {
  crazyName: string;
  avatarEmoji: string;
  totalAmountFormatted: string;
  subtitleLine: string;
  assumptions: string[];
  roastOneLiner: string;
  opportunityCostLine: string;
  topMerchantLabel: string;
}

/**
 * Generates an animated looping GIF89a Blob + data/object URL completely client-side
 * using HTML5 Canvas and a fast 256-color LZW encoder.
 */
export async function generateRoastAnimatedGif(payload: RoastGifPayload): Promise<{
  blob: Blob;
  url: string;
}> {
  const width = 520;
  const height = 640;
  const frameCount = 12;
  const delayHundredths = 9; // 90ms per frame (~11 fps)

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  // Build fixed 256-color palette (6x6x6 RGB cube = 216 colors + 40 grays/accents)
  const palette = buildFixedPalette();
  const framesIndices: Uint8Array[] = [];

  for (let f = 0; f < frameCount; f++) {
    drawRoastFrame(ctx, width, height, payload, f, frameCount);
    const imgData = ctx.getImageData(0, 0, width, height).data;
    const indexed = mapRgbaToPaletteIndices(imgData, width * height);
    framesIndices.push(indexed);
  }

  const gifBytes = encodeGif89a(width, height, palette, framesIndices, delayHundredths);
  const blob = new Blob([gifBytes.buffer as ArrayBuffer], { type: 'image/gif' });
  const url = URL.createObjectURL(blob);
  return { blob, url };
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

  // 1. Dark dramatic arcade/wanted-poster background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, '#14080e');
  bgGrad.addColorStop(0.55, '#1b0c14');
  bgGrad.addColorStop(1, '#310a10');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 2. Animated background radial glow + rising embers
  const glowRadius = 220 + Math.sin(phase) * 25;
  const radGrad = ctx.createRadialGradient(w / 2, 235, 10, w / 2, 235, glowRadius);
  radGrad.addColorStop(0, 'rgba(239, 68, 68, 0.28)');
  radGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.fillStyle = radGrad;
  ctx.fillRect(0, 0, w, h);

  // Floating burning dollar bills / embers in background
  const emberSeeds = [
    { x: 42, baseY: 560, speed: 42, label: '💸' },
    { x: 118, baseY: 590, speed: 55, label: '🔥' },
    { x: 410, baseY: 540, speed: 48, label: '💸' },
    { x: 472, baseY: 585, speed: 60, label: '🔥' },
    { x: 76, baseY: 340, speed: 38, label: '💀' },
    { x: 448, baseY: 320, speed: 44, label: '🤡' },
  ];
  ctx.save();
  ctx.font = '20px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < emberSeeds.length; i++) {
    const e = emberSeeds[i];
    const progress = ((frame / totalFrames) + i * 0.17) % 1;
    const yPos = e.baseY - progress * 220;
    const xWobble = e.x + Math.sin(phase + i * 1.4) * 10;
    ctx.globalAlpha = Math.max(0.15, 1 - progress * 0.85);
    ctx.fillText(e.label, xWobble, yPos);
  }
  ctx.restore();

  // 3. Animated bottom cartoon flames
  drawBottomFlames(ctx, w, h, phase, frame);

  // 4. Outer neon border that pulses between crimson and amber
  ctx.save();
  ctx.strokeStyle = isFlash ? '#ef4444' : '#f59e0b';
  ctx.lineWidth = 4;
  drawRoundedRect(ctx, 10, 10, w - 20, h - 20, 18);
  ctx.stroke();
  ctx.restore();

  // 5. Flashing Siren Top Header Bar
  ctx.save();
  drawRoundedRect(ctx, 22, 22, w - 44, 36, 8);
  ctx.fillStyle = isFlash ? '#dc2626' : '#b91c1c';
  ctx.fill();
  ctx.font = 'bold 13px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  const sirenLeft = isAlt ? '🚨' : '😈';
  const sirenRight = isAlt ? '😈' : '🚨';
  ctx.fillText(
    `${sirenLeft}  OFFICIAL FINANCIAL ROAST · HALL OF SHAME  ${sirenRight}`,
    w / 2,
    45
  );
  ctx.restore();

  // 6. Bouncing Avatar + "OFFICIAL DIAGNOSIS" badge
  const bounceY = Math.sin(phase) * 4;
  ctx.save();
  ctx.beginPath();
  ctx.arc(66, 108 + bounceY, 30, 0, Math.PI * 2);
  ctx.fillStyle = '#2d0e16';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = isFlash ? '#f59e0b' : '#ef4444';
  ctx.stroke();

  ctx.font = '30px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(payload.avatarEmoji || '😈', 66, 119 + bounceY);
  ctx.restore();

  // "DIAGNOSED SPENDING ARCHETYPE:"
  ctx.save();
  ctx.textAlign = 'left';
  ctx.font = 'bold 11px "Inter", "Segoe UI", sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('DIAGNOSED SPENDING PERSONA:', 108, 86);

  // Crazy Name (wrapped up to 2 lines)
  ctx.font = '900 20px "Inter", "Segoe UI", Arial Black, sans-serif';
  ctx.fillStyle = '#ffffff';
  const nameLines = wrapTextLines(ctx, payload.crazyName.toUpperCase(), w - 134).slice(0, 2);
  nameLines.forEach((line, idx) => {
    ctx.fillText(line, 108, 111 + idx * 23);
  });
  ctx.restore();

  // 7. Giant Pulsing Amount Box (The centerpiece!)
  const boxY = 152;
  const boxH = 118;
  ctx.save();
  drawRoundedRect(ctx, 24, boxY, w - 48, boxH, 14);
  ctx.fillStyle = '#0f0508';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = isAlt ? '#ef4444' : '#f97316';
  ctx.stroke();

  // Amount label
  ctx.textAlign = 'center';
  ctx.font = 'bold 11px "Inter", "Segoe UI", sans-serif';
  ctx.fillStyle = '#fca5a5';
  ctx.fillText(payload.topMerchantLabel.toUpperCase(), w / 2, boxY + 23);

  // Giant shaking/pulsing dollar amount
  const scaleJitter = 1 + Math.sin(phase * 2) * 0.035;
  ctx.save();
  ctx.translate(w / 2, boxY + 68);
  ctx.scale(scaleJitter, scaleJitter);
  ctx.font = '900 46px "Inter", "Segoe UI", Arial Black, monospace';
  ctx.fillStyle = isFlash ? '#ff4d4d' : '#fbbf24';
  ctx.fillText(payload.totalAmountFormatted, 0, 0);
  ctx.restore();

  // Subtitle under amount (work hours / swipes)
  ctx.font = 'bold 12.5px "Inter", "Segoe UI", sans-serif';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(payload.subtitleLine, w / 2, boxY + 100);
  ctx.restore();

  // 8. "EMBARRASSING ASSUMPTIONS WE MADE ABOUT YOU" Dossier Card
  const cardY = 286;
  const cardH = 228;
  ctx.save();
  drawRoundedRect(ctx, 24, cardY, w - 48, cardH, 14);
  ctx.fillStyle = '#1e1118';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#4c1d24';
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.font = 'bold 12px "Inter", "Segoe UI", sans-serif';
  ctx.fillStyle = '#f87171';
  ctx.fillText('🕵️ EMBARRASSING ASSUMPTIONS BASED ON YOUR SWIPES:', 40, cardY + 26);

  // Render the assumptions list
  ctx.font = '600 13.5px "Inter", "Segoe UI", sans-serif';
  ctx.fillStyle = '#f8fafc';
  let curY = cardY + 52;
  for (const assumption of payload.assumptions.slice(0, 3)) {
    const wrapped = wrapTextLines(ctx, assumption, w - 84).slice(0, 3);
    for (let i = 0; i < wrapped.length; i++) {
      ctx.fillStyle = i === 0 ? '#ffffff' : '#cbd5e1';
      ctx.fillText(wrapped[i], 40, curY);
      curY += 19;
    }
    curY += 8;
  }

  // Tilted flashing rubber stamp in top-right of dossier card
  ctx.save();
  ctx.translate(w - 92, cardY + 30);
  ctx.rotate(-0.14 + Math.sin(phase) * 0.03);
  drawRoundedRect(ctx, -56, -15, 112, 28, 6);
  ctx.fillStyle = isFlash ? 'rgba(220, 38, 38, 0.92)' : 'rgba(245, 158, 11, 0.92)';
  ctx.fill();
  ctx.font = '900 11px "Inter", "Segoe UI", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(isFlash ? 'COOKED 💀' : 'CAUGHT IN 4K 📸', 0, 3);
  ctx.restore();
  ctx.restore();

  // 9. Bottom Opportunity Cost / Investing Regret Banner
  const oppY = 530;
  ctx.save();
  drawRoundedRect(ctx, 24, oppY, w - 48, 56, 12);
  ctx.fillStyle = '#062c1e';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = isFlash ? '#10b981' : '#34d399';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = 'bold 11px "Inter", "Segoe UI", sans-serif';
  ctx.fillStyle = '#6ee7b7';
  ctx.fillText('📈 WHAT THIS HABIT ACTUALLY COST YOUR FUTURE SELF:', w / 2, oppY + 21);

  ctx.font = 'bold 13.5px "Inter", "Segoe UI", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(payload.opportunityCostLine, w / 2, oppY + 42);
  ctx.restore();

  // 10. Footer watermark
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 11px "Inter", "Segoe UI", sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(
    '😈 Roasted 100% offline by Strictly Spending · Dare to post on Reddit',
    w / 2,
    h - 22
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

  // Outer red/orange flames
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i <= tongues; i++) {
    const x = i * step;
    const peakH = 28 + Math.sin(phase + i * 0.9) * 14 + ((i + frame) % 3) * 6;
    const midX = x - step / 2;
    if (i > 0) {
      ctx.quadraticCurveTo(midX, h - peakH - 18, x, h - 10);
    } else {
      ctx.lineTo(x, h - 12);
    }
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
  ctx.fill();

  // Inner amber flames
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i <= tongues; i++) {
    const x = i * step;
    const peakH = 16 + Math.cos(phase + i * 1.1) * 10;
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

/**
 * 256-color palette: 6x6x6 RGB web cube (indices 0..215) + 40 grayscale ramp (216..255).
 */
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

    // Near-grayscale check for smoother dark backgrounds & white text
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

  // Header
  writeAscii('GIF89a');

  // Logical Screen Descriptor
  writeShort(width);
  writeShort(height);
  writeByte(0xf7); // Global color table, 256 entries (2^(7+1))
  writeByte(0); // Background color index
  writeByte(0); // Aspect ratio

  // Global Color Table (768 bytes)
  for (let i = 0; i < palette.length; i++) {
    writeByte(palette[i]);
  }

  // Netscape 2.0 loop extension (infinite loop)
  writeByte(0x21);
  writeByte(0xff);
  writeByte(0x0b);
  writeAscii('NETSCAPE2.0');
  writeByte(0x03);
  writeByte(0x01);
  writeShort(0); // Loop forever
  writeByte(0x00);

  // Encode each frame
  for (const indexedPixels of frames) {
    // Graphic Control Extension
    writeByte(0x21);
    writeByte(0xf9);
    writeByte(0x04);
    writeByte(0x00);
    writeShort(delayHundredths);
    writeByte(0x00);
    writeByte(0x00);

    // Image Descriptor
    writeByte(0x2c);
    writeShort(0);
    writeShort(0);
    writeShort(width);
    writeShort(height);
    writeByte(0x00); // No local color table

    // LZW Minimum Code Size = 8
    writeByte(8);
    const lzwBlocks = lzwCompressFrame(indexedPixels);
    for (let i = 0; i < lzwBlocks.length; i++) {
      writeByte(lzwBlocks[i]);
    }
    writeByte(0x00); // Block terminator
  }

  // Trailer
  writeByte(0x3b);
  return new Uint8Array(bytes);
}

function lzwCompressFrame(indices: Uint8Array): Uint8Array {
  const minCodeSize = 8;
  const clearCode = 1 << minCodeSize; // 256
  const endCode = clearCode + 1; // 257

  let codeSize = minCodeSize + 1; // 9
  let nextCode = endCode + 1; // 258

  // Flat hash table: 4096 prefixes * 256 suffixes
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
