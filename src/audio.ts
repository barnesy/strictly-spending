// Simple Web Audio API synthesizer for AI feedback sounds

let audioCtx: AudioContext | null = null;

function getContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

let thinkingOscillators: OscillatorNode[] = [];
let thinkingInterval: number | null = null;

export function playThinkingSound() {
  stopThinkingSound();
  const ctx = getContext();
  
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  // Play a little 8-bit style "thinking" sequence
  const notes = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5
  let step = 0;

  thinkingInterval = window.setInterval(() => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = notes[step % notes.length];
    
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    
    thinkingOscillators.push(osc);
    // Cleanup old oscillators from array occasionally
    if (thinkingOscillators.length > 20) {
      thinkingOscillators = thinkingOscillators.slice(-10);
    }
    
    step++;
  }, 250);
}

export function stopThinkingSound() {
  if (thinkingInterval) {
    clearInterval(thinkingInterval);
    thinkingInterval = null;
  }
  thinkingOscillators.forEach(osc => {
    try {
      osc.stop();
    } catch (e) {
      // Ignore if already stopped
    }
  });
  thinkingOscillators = [];
}

export function playSuccessSound() {
  stopThinkingSound();
  const ctx = getContext();
  if (ctx.state === 'suspended') ctx.resume();

  // Success chime (maj arpeggio fast)
  const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
  
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.value = freq;
    
    const startTime = ctx.currentTime + (i * 0.1);
    
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.1, startTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, startTime + 0.3);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(startTime);
    osc.stop(startTime + 0.3);
  });
}

export function playFailSound() {
  stopThinkingSound();
  const ctx = getContext();
  if (ctx.state === 'suspended') ctx.resume();

  // Fail buzz (descending dissonant)
  const notes = [300, 250]; 
  
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + (i * 0.2));
    osc.frequency.exponentialRampToValueAtTime(freq - 50, ctx.currentTime + (i * 0.2) + 0.2);
    
    const startTime = ctx.currentTime + (i * 0.2);
    
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.1, startTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, startTime + 0.2);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(startTime);
    osc.stop(startTime + 0.2);
  });
}
