import { NextRequest, NextResponse } from 'next/server';
import { getSongs, addSong, updateSong } from '@/lib/storage';
import { frequencyToMidi } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Paths
const DEMUCS_PATH = '/Users/mrocche/projects/voice/venv/bin/demucs';
const FFMPEG_PATH = '/opt/homebrew/bin/ffmpeg';
const AUDIO_DIR = path.join(process.cwd(), 'public', 'audio');
const TEMP_DIR = path.join(process.cwd(), 'temp_processing');

// ─────────────────────────────────────────────────────────────────────────────
// YIN pitch detection (de Cheveigné & Kawahara, 2002)
//
// YIN uses a Cumulative Mean Normalised Difference Function (CMND) which
// specifically suppresses subharmonic candidates — the main failure mode of
// plain autocorrelation. It also uses parabolic interpolation for sub-sample
// lag accuracy.
// ─────────────────────────────────────────────────────────────────────────────

const YIN_THRESHOLD  = 0.10; // CMND minimum threshold — lower = stricter (0.10–0.15 is standard)
const CONFIDENCE_MIN = 0.40; // Reject frames below this after normalization
const MIN_FREQ = 80;          // ~E2 — below typical singing range
const MAX_FREQ = 1100;        // ~C6 — above typical singing range
const WINDOW_SIZE = 2048;     // ~46ms at 44100 Hz
const HOP_SIZE    = 1024;     // ~23ms — finer than before, catches faster passages

/**
 * Apply a Hann window to reduce spectral leakage at chunk boundaries.
 */
function hannWindow(signal: Float64Array): Float64Array {
  const n = signal.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = signal[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return out;
}

/**
 * YIN pitch detection on a single frame.
 * Returns frequency, MIDI note and a confidence value (1 - CMND minimum).
 */
function yinDetect(
  signal: Float64Array,
  sampleRate: number,
): { frequency: number; midiNote: number; confidence: number } | null {

  const n = signal.length;
  const half = Math.floor(n / 2);

  // ── RMS gate ────────────────────────────────────────────────────────────
  let rms = 0;
  for (let i = 0; i < n; i++) rms += signal[i] * signal[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.003) return null;

  const windowed = hannWindow(signal);

  // ── Step 1: Difference function d(τ) ────────────────────────────────────
  // d(τ) = Σ (x[j] - x[j+τ])²  for j = 0..half
  const d = new Float64Array(half);
  for (let tau = 1; tau < half; tau++) {
    for (let j = 0; j < half; j++) {
      const diff = windowed[j] - windowed[j + tau];
      d[tau] += diff * diff;
    }
  }

  // ── Step 2: Cumulative Mean Normalised Difference (CMND) ─────────────────
  // cmnd[τ] = d[τ] / ((1/τ) * Σ d[j]  for j = 1..τ)
  // This normalises each lag by the running mean up to that lag, which
  // penalises lower-frequency (longer-lag) candidates — killing subharmonics.
  const cmnd = new Float64Array(half);
  cmnd[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < half; tau++) {
    runningSum += d[tau];
    cmnd[tau] = runningSum === 0 ? 0 : d[tau] * tau / runningSum;
  }

  // ── Step 3: Find first minimum of CMND below threshold ──────────────────
  const minLag = Math.floor(sampleRate / MAX_FREQ);
  const maxLag = Math.min(Math.floor(sampleRate / MIN_FREQ), half - 1);
  if (minLag >= maxLag) return null;

  let bestTau = -1;
  for (let tau = minLag; tau <= maxLag; tau++) {
    if (cmnd[tau] < YIN_THRESHOLD) {
      // Find the local minimum in this dip
      while (tau + 1 <= maxLag && cmnd[tau + 1] < cmnd[tau]) tau++;
      bestTau = tau;
      break;
    }
  }

  // If no dip below threshold, fall back to global CMND minimum in range
  if (bestTau === -1) {
    let minVal = Infinity;
    for (let tau = minLag; tau <= maxLag; tau++) {
      if (cmnd[tau] < minVal) {
        minVal = cmnd[tau];
        bestTau = tau;
      }
    }
    // Still too noisy — reject
    if (minVal > 0.4) return null;
  }

  // ── Step 4: Parabolic interpolation for sub-sample accuracy ─────────────
  let refinedTau = bestTau;
  if (bestTau > 1 && bestTau < half - 1) {
    const denom = cmnd[bestTau - 1] - 2 * cmnd[bestTau] + cmnd[bestTau + 1];
    if (Math.abs(denom) > 1e-10) {
      const delta = 0.5 * (cmnd[bestTau - 1] - cmnd[bestTau + 1]) / denom;
      if (Math.abs(delta) < 1) refinedTau = bestTau + delta;
    }
  }

  const frequency = sampleRate / refinedTau;
  if (frequency < MIN_FREQ || frequency > MAX_FREQ) return null;

  const confidence = 1 - cmnd[bestTau]; // High confidence = low CMND value
  if (confidence < CONFIDENCE_MIN) return null;

  return { frequency, midiNote: frequencyToMidi(frequency), confidence };
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-processing filters
// ─────────────────────────────────────────────────────────────────────────────

type PitchPoint = { time: number; midiNote: number; confidence: number };

/**
 * Median filter over midiNote values.
 * Eliminates single-frame spikes without blurring real note transitions.
 */
function medianFilter(points: PitchPoint[], windowSize: number = 5): PitchPoint[] {
  if (points.length < windowSize) return points;
  const half = Math.floor(windowSize / 2);
  return points.map((p, i) => {
    const start = Math.max(0, i - half);
    const end   = Math.min(points.length - 1, i + half);
    const window = points.slice(start, end + 1).map(x => x.midiNote).sort((a, b) => a - b);
    const median = window[Math.floor(window.length / 2)];
    return { ...p, midiNote: median };
  });
}

/**
 * Jump filter — drops isolated points that are >12 semitones away from both
 * neighbors. Catches octave errors that YIN occasionally still makes.
 */
function jumpFilter(points: PitchPoint[]): PitchPoint[] {
  if (points.length < 3) return points;
  return points.filter((p, i) => {
    if (i === 0 || i === points.length - 1) return true;
    const prev = points[i - 1].midiNote;
    const next = points[i + 1].midiNote;
    const jumpPrev = Math.abs(p.midiNote - prev);
    const jumpNext = Math.abs(p.midiNote - next);
    // Keep if close to at least one neighbor
    return jumpPrev <= 12 || jumpNext <= 12;
  });
}

/**
 * Run-length filter — removes runs of the same approximate pitch lasting
 * fewer than minRun consecutive frames. Short bursts are artifacts (breath,
 * consonants, noise). Real vocal notes last longer.
 */
function runLengthFilter(points: PitchPoint[], minRun: number = 2): PitchPoint[] {
  if (points.length === 0) return [];

  // Group consecutive points within ±1 semitone into runs
  const runs: PitchPoint[][] = [];
  let current: PitchPoint[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const timeDiff = points[i].time - points[i - 1].time;
    const pitchDiff = Math.abs(points[i].midiNote - current[current.length - 1].midiNote);
    // Continue run if consecutive frames and pitch is stable
    if (timeDiff < 0.1 && pitchDiff <= 1.5) {
      current.push(points[i]);
    } else {
      runs.push(current);
      current = [points[i]];
    }
  }
  runs.push(current);

  // Keep only runs long enough to be a real note
  return runs.filter(run => run.length >= minRun).flat();
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio file I/O helpers
// ─────────────────────────────────────────────────────────────────────────────

async function convertToRawPCM(inputPath: string): Promise<{ data: Float64Array; sampleRate: number } | null> {
  const ext = path.extname(inputPath).toLowerCase();
  const sampleRate = 44100;
  const rawPath = path.join(TEMP_DIR, `${path.basename(inputPath, ext)}_${Date.now()}.raw`);

  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

  // Convert to raw 32-bit float, mono, 44100 Hz
  const command = `${FFMPEG_PATH} -i "${inputPath}" -ar ${sampleRate} -ac 1 -f f32le -y "${rawPath}"`;

  try {
    await execAsync(command);
    const rawData = await fs.promises.readFile(rawPath);
    const samples = new Float64Array(rawData.length / 4);
    const view = new DataView(rawData.buffer, rawData.byteOffset, rawData.byteLength);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = view.getFloat32(i * 4, true);
    }
    try { fs.unlinkSync(rawPath); } catch {}
    return { data: samples, sampleRate };
  } catch (error) {
    console.error('FFmpeg conversion error:', error);
    return null;
  }
}

async function convertToWav(inputPath: string): Promise<string | null> {
  const ext = path.extname(inputPath).toLowerCase();
  if (ext === '.wav') return inputPath;

  const wavPath = path.join(TEMP_DIR, `${path.basename(inputPath, ext)}_${Date.now()}.wav`);
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

  const command = `${FFMPEG_PATH} -i "${inputPath}" -ar 44100 -ac 1 -y "${wavPath}"`;
  try {
    await execAsync(command);
    return wavPath;
  } catch (error) {
    console.error('FFmpeg conversion error:', error);
    return null;
  }
}

async function analyzeAudioFile(audioPath: string): Promise<PitchPoint[]> {
  const audioData = await convertToRawPCM(audioPath);
  if (!audioData) {
    console.error('Failed to convert audio to PCM');
    return [];
  }

  const { data: channelData, sampleRate } = audioData;
  console.log(`Analyzing ${channelData.length} samples at ${sampleRate} Hz with YIN...`);

  const rawPoints: PitchPoint[] = [];

  for (let i = 0; i + WINDOW_SIZE <= channelData.length; i += HOP_SIZE) {
    const chunk = channelData.slice(i, i + WINDOW_SIZE);
    const result = yinDetect(chunk, sampleRate);
    if (result) {
      rawPoints.push({ time: i / sampleRate, midiNote: result.midiNote, confidence: result.confidence });
    }
  }

  console.log(`YIN raw: ${rawPoints.length} points`);

  // ── Post-processing pipeline ─────────────────────────────────────────────
  let filtered = medianFilter(rawPoints, 5);    // Kill single-frame spikes
  filtered     = jumpFilter(filtered);           // Kill octave-jump outliers
  filtered     = runLengthFilter(filtered, 2);   // Kill sub-90ms noise bursts

  console.log(`After filtering: ${filtered.length} points (removed ${rawPoints.length - filtered.length} outliers) over ${(channelData.length / sampleRate).toFixed(1)}s`);

  return filtered;
}

function parseWav(buffer: Buffer): { channelData: Float64Array; sampleRate: number } | null {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (riff !== 'RIFF') return null;
  
  const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  if (wave !== 'WAVE') return null;
  
  let offset = 12;
  let format: any = null;
  
  while (offset < buffer.length - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset), view.getUint8(offset + 1),
      view.getUint8(offset + 2), view.getUint8(offset + 3)
    );
    const chunkSize = view.getUint32(offset + 4, true);
    
    if (chunkId === 'fmt ') {
      const audioFormat = view.getUint16(offset + 8, true);
      const numChannels = view.getUint16(offset + 10, true);
      const sampleRate = view.getUint32(offset + 12, true);
      const bitsPerSample = view.getUint16(offset + 22, true);
      
      format = { audioFormat, numChannels, sampleRate, bitsPerSample };
    } else if (chunkId === 'data' && format) {
      const numSamples = Math.floor(chunkSize / (format.bitsPerSample / 8));
      const channelData = new Float64Array(numSamples);
      
      const bytesPerSample = format.bitsPerSample / 8;
      for (let i = 0; i < numSamples; i++) {
        const sampleOffset = offset + 8 + i * bytesPerSample;
        if (format.bitsPerSample === 16) {
          channelData[i] = view.getInt16(sampleOffset, true) / 32768;
        } else if (format.bitsPerSample === 32 && format.audioFormat === 3) {
          channelData[i] = view.getFloat32(sampleOffset, true);
        } else {
          channelData[i] = 0;
        }
      }
      
      return { channelData, sampleRate: format.sampleRate };
    }
    
    offset += 8 + chunkSize;
    if (chunkSize % 2 !== 0) offset++;
  }
  
  return null;
}

function getAudioDuration(audioPath: string): number {
  try {
    const ffprobePath = '/opt/homebrew/bin/ffprobe';
    const command = `${ffprobePath} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`;
    const output = execSync(command, { encoding: 'utf8' }) as string;
    const duration = parseFloat(output.trim());
    if (!isNaN(duration) && duration > 0) {
      console.log(`Duration: ${duration}s`);
      return duration;
    }
  } catch (e) {
    console.error('Error getting duration:', e);
  }
  return 180;
}

export async function GET() {
  try {
    const songs = getSongs();
    return NextResponse.json(songs);
  } catch (error) {
    console.error('Error getting songs:', error);
    return NextResponse.json({ error: 'Failed to get songs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const isolateVocals = formData.get('isolateVocals') !== 'false';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const id = uuidv4();
    const ext = path.extname(file.name).toLowerCase();
    const filename = `${id}${ext}`;

    if (!fs.existsSync(AUDIO_DIR)) {
      fs.mkdirSync(AUDIO_DIR, { recursive: true });
    }

    const filePath = path.join(AUDIO_DIR, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    // Get actual duration
    const duration = getAudioDuration(filePath);

    // Create initial song entry with processing status
    const song = {
      id,
      name: file.name.replace(/\.[^/.]+$/, ''),
      filename,
      vocalFilename: null as string | null,
      duration,
      isProcessed: false,
      pitchDataOriginal: [] as { time: number; midiNote: number; confidence: number }[],
      pitchDataVocals: null as { time: number; midiNote: number; confidence: number }[] | null,
      processingStatus: 'processing' as const,
      createdAt: new Date().toISOString()
    };

    const savedSong = addSong(song);

    // Process audio in background
    (async () => {
      try {
        console.log('Starting pitch analysis for original audio...');
        const pitchDataOriginal = await analyzeAudioFile(filePath);
        console.log(`Found ${pitchDataOriginal.length} pitch points for original`);
        
        let pitchDataVocals: { time: number; midiNote: number; confidence: number }[] | null = null;
        let vocalFilename: string | null = null;
        
        if (isolateVocals) {
          console.log('Starting vocal isolation with demucs...');
          updateSong(id, { processingStatus: 'isolating' });
          
          // Convert input to WAV for demucs first
          const wavInputPath = await convertToWav(filePath);
          if (!wavInputPath) {
            console.error('Failed to convert input to WAV for demucs');
          } else {
            // Change to the directory containing the audio file so demucs uses default 'separated' folder
            const audioDir = path.dirname(wavInputPath);
            const stemName = path.basename(wavInputPath, '.wav');
            
            try {
              // Run demucs with full path - it outputs to ./separated/htdemucs/<name>/
              const command = `${DEMUCS_PATH} --two-stems=vocals "${wavInputPath}"`;
              console.log('Running demucs in', audioDir, '...');
              
              // Run with cwd set to audio directory
              await execAsync(command, { 
                timeout: 600000, // 10 min timeout
                cwd: audioDir 
              });
              
              // Demucs outputs to: separated/htdemucs/<stemName>/vocals.wav
              const separatedDir = path.join(audioDir, 'separated');
              const generatedVocalPath = path.join(separatedDir, 'htdemucs', stemName, 'vocals.wav');
              const targetVocalPath = path.join(AUDIO_DIR, 'vocals', `${stemName}_vocals.wav`);
              
              console.log('Looking for vocals at:', generatedVocalPath);
              
              if (fs.existsSync(generatedVocalPath)) {
                const vocalsDir = path.join(AUDIO_DIR, 'vocals');
                if (!fs.existsSync(vocalsDir)) {
                  fs.mkdirSync(vocalsDir, { recursive: true });
                }
                fs.copyFileSync(generatedVocalPath, targetVocalPath);
                vocalFilename = `vocals/${stemName}_vocals.wav`;
                
                console.log('Analyzing vocal track...');
                pitchDataVocals = await analyzeAudioFile(targetVocalPath);
                console.log(`Found ${pitchDataVocals.length} pitch points for vocals`);
                
                // Clean up separated folder
                try {
                  fs.rmSync(separatedDir, { recursive: true, force: true });
                } catch (e) {}
              } else {
                console.error('Vocal file not found at expected path:', generatedVocalPath);
              }
            } catch (demucsError) {
              console.error('Demucs error:', demucsError);
            }
            
            // Clean up temp WAV input
            if (wavInputPath !== filePath) {
              try { fs.unlinkSync(wavInputPath); } catch (e) {}
            }
          }
        }
        
        // Update song with pitch data
        console.log('Updating song with results...');
        updateSong(id, {
          pitchDataOriginal,
          pitchDataVocals,
          vocalFilename,
          isProcessed: !!vocalFilename,
          processingStatus: 'ready'
        });
        console.log('Song processing complete!');
        
      } catch (processingError) {
        console.error('Processing error:', processingError);
        updateSong(id, { processingStatus: 'failed' });
      }
    })();

    return NextResponse.json(savedSong);
  } catch (error) {
    console.error('Error uploading song:', error);
    return NextResponse.json({ error: 'Failed to upload song' }, { status: 500 });
  }
}
