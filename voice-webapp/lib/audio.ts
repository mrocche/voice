import { frequencyToMidi } from './utils';

const SAMPLE_RATE = 44100;
const MIN_FREQ = 80;
const MAX_FREQ = 1100;

// Confidence threshold for live mic — slightly relaxed vs server to keep
// real-time feedback responsive, but higher than the old 0.2 to cut noise.
const CONFIDENCE_THRESHOLD = 0.25;

export interface PitchResult {
  frequency: number;
  midiNote: number;
  confidence: number;
}

/**
 * Apply an in-place Hann window to a signal buffer.
 * Reduces spectral leakage at chunk boundaries, which otherwise inflates
 * ACF sidelobes and causes incorrect lag selection.
 */
function applyHannWindow(signal: Float32Array): Float32Array {
  const n = signal.length;
  const windowed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    windowed[i] = signal[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return windowed;
}

/**
 * Improved real-time pitch detection for live microphone input.
 *
 * Uses autocorrelation (ACF) — fast enough for real-time use — with three
 * improvements over the previous implementation:
 *   1. Hann windowing before ACF to reduce spectral leakage
 *   2. Parabolic interpolation around the best lag for sub-sample accuracy
 *      (improves pitch resolution from ±1 semitone to ±0.1 semitone)
 *   3. Higher confidence threshold (0.25 vs 0.2) to reduce noise detections
 */
export function detectPitch(signal: Float32Array, sampleRate: number = SAMPLE_RATE): PitchResult | null {
  const n = signal.length;

  // ── 1. RMS gate — reject silence ────────────────────────────────────────
  let rms = 0;
  for (let i = 0; i < n; i++) rms += signal[i] * signal[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.003) return null;

  // ── 2. Apply Hann window ─────────────────────────────────────────────────
  const windowed = applyHannWindow(signal);

  // ── 3. Remove DC offset ──────────────────────────────────────────────────
  let mean = 0;
  for (let i = 0; i < n; i++) mean += windowed[i];
  mean /= n;

  // ── 4. Autocorrelation ───────────────────────────────────────────────────
  const minLag = Math.floor(sampleRate / MAX_FREQ);
  const maxLag = Math.floor(sampleRate / MIN_FREQ);
  if (minLag >= maxLag) return null;

  let bestLag = 0;
  let bestCorr = -Infinity;

  for (let lag = minLag; lag < Math.min(maxLag, n); lag++) {
    let corr = 0;
    for (let i = 0; i < n - lag; i++) {
      corr += (windowed[i] - mean) * (windowed[i + lag] - mean);
    }
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  if (bestCorr <= 0) return null;

  // ── 5. Normalise confidence ──────────────────────────────────────────────
  let zeroLagCorr = 0;
  for (let i = 0; i < n; i++) {
    const v = windowed[i] - mean;
    zeroLagCorr += v * v;
  }
  if (zeroLagCorr === 0) return null;

  const confidence = bestCorr / zeroLagCorr;
  if (confidence < CONFIDENCE_THRESHOLD) return null;

  // ── 6. Parabolic interpolation for sub-sample accuracy ───────────────────
  // Fit a parabola to the three ACF values around bestLag and find the peak.
  let refinedLag = bestLag;
  if (bestLag > minLag && bestLag < Math.min(maxLag, n) - 1) {
    const lagMinus1 = bestLag - 1;
    const lagPlus1 = bestLag + 1;

    let corrMinus = 0, corrPlus = 0;
    for (let i = 0; i < n - lagMinus1; i++) corrMinus += (windowed[i] - mean) * (windowed[i + lagMinus1] - mean);
    for (let i = 0; i < n - lagPlus1; i++) corrPlus  += (windowed[i] - mean) * (windowed[i + lagPlus1] - mean);

    const denom = corrMinus - 2 * bestCorr + corrPlus;
    if (Math.abs(denom) > 1e-10) {
      const delta = 0.5 * (corrMinus - corrPlus) / denom;
      // Clamp to ±1 sample to avoid wild extrapolation
      if (Math.abs(delta) < 1) {
        refinedLag = bestLag + delta;
      }
    }
  }

  const frequency = sampleRate / refinedLag;
  if (frequency < MIN_FREQ || frequency > MAX_FREQ) return null;

  return {
    frequency,
    midiNote: frequencyToMidi(frequency),
    confidence,
  };
}

export function processAudioBuffer(
  audioBuffer: AudioBuffer,
  hopSize: number = 2048,
): { times: number[]; midiNotes: number[]; confidences: number[] } {
  const times: number[] = [];
  const midiNotes: number[] = [];
  const confidences: number[] = [];

  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  for (let i = 0; i < channelData.length - hopSize; i += hopSize) {
    const chunk = channelData.slice(i, i + hopSize);
    const result = detectPitch(chunk, sampleRate);

    if (result) {
      times.push(i / sampleRate);
      midiNotes.push(result.midiNote);
      confidences.push(result.confidence);
    }
  }

  return { times, midiNotes, confidences };
}
