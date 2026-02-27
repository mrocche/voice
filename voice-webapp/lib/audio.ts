import { frequencyToMidi } from './utils';

const SAMPLE_RATE = 44100;
const VOLUME_THRESHOLD = 0.002;
const MIN_FREQ = 80;
const MAX_FREQ = 1000;

export interface PitchResult {
  frequency: number;
  midiNote: number;
  confidence: number;
}

export function detectPitch(signal: Float32Array, sampleRate: number = SAMPLE_RATE): PitchResult | null {
  const n = signal.length;
  
  // Calculate RMS volume
  let rms = 0;
  for (let i = 0; i < n; i++) {
    rms += signal[i] * signal[i];
  }
  rms = Math.sqrt(rms / n);
  
  if (rms < VOLUME_THRESHOLD) {
    return null;
  }
  
  // Remove DC offset
  let mean = 0;
  for (let i = 0; i < n; i++) {
    mean += signal[i];
  }
  mean /= n;
  
  // Compute autocorrelation with parabolic interpolation for better accuracy
  const minLag = Math.floor(sampleRate / MAX_FREQ);
  const maxLag = Math.floor(sampleRate / MIN_FREQ);
  
  if (minLag >= maxLag) {
    return null;
  }
  
  let bestLag = 0;
  let bestCorrelation = 0;
  
  for (let lag = minLag; lag < Math.min(maxLag, n); lag++) {
    let correlation = 0;
    for (let i = 0; i < n - lag; i++) {
      correlation += (signal[i] - mean) * (signal[i + lag] - mean);
    }
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }
  
  if (bestCorrelation <= 0) {
    return null;
  }
  
  // Normalize by zero-lag autocorrelation
  let zeroLagCorr = 0;
  for (let i = 0; i < n; i++) {
    zeroLagCorr += (signal[i] - mean) * (signal[i] - mean);
  }
  
  const confidence = bestCorrelation / zeroLagCorr;
  
  if (confidence < 0.2) {
    return null;
  }
  
  // Convert lag to frequency
  const frequency = sampleRate / bestLag;
  
  if (frequency < MIN_FREQ || frequency > MAX_FREQ) {
    return null;
  }
  
  const midiNote = frequencyToMidi(frequency);
  
  return {
    frequency,
    midiNote,
    confidence
  };
}

export function processAudioBuffer(
  audioBuffer: AudioBuffer,
  hopSize: number = 2048,
  threshold: number = VOLUME_THRESHOLD
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
