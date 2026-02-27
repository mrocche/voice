import { NextRequest, NextResponse } from 'next/server';
import { getSongs, addSong, updateSong } from '@/lib/storage';
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

function frequencyToMidi(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440.0);
}

function detectPitch(signal: Float64Array, sampleRate: number): { frequency: number; midiNote: number; confidence: number } | null {
  const VOLUME_THRESHOLD = 0.002;
  const MIN_FREQ = 80;
  const MAX_FREQ = 1000;
  
  const n = signal.length;
  
  let rms = 0;
  for (let i = 0; i < n; i++) {
    rms += signal[i] * signal[i];
  }
  rms = Math.sqrt(rms / n);
  
  if (rms < VOLUME_THRESHOLD) {
    return null;
  }
  
  let mean = 0;
  for (let i = 0; i < n; i++) {
    mean += signal[i];
  }
  mean /= n;
  
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
  
  let zeroLagCorr = 0;
  for (let i = 0; i < n; i++) {
    zeroLagCorr += (signal[i] - mean) * (signal[i] - mean);
  }
  
  const confidence = bestCorrelation / zeroLagCorr;
  
  if (confidence < 0.2) {
    return null;
  }
  
  const frequency = sampleRate / bestLag;
  
  if (frequency < MIN_FREQ || frequency > MAX_FREQ) {
    return null;
  }
  
  const midiNote = frequencyToMidi(frequency);
  
  return { frequency, midiNote, confidence };
}

async function convertToRawPCM(inputPath: string): Promise<{ data: Float64Array; sampleRate: number } | null> {
  const ext = path.extname(inputPath).toLowerCase();
  const sampleRate = 44100;
  const rawPath = path.join(TEMP_DIR, `${path.basename(inputPath, ext)}_${Date.now()}.raw`);
  
  // Ensure temp dir exists
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  
  // Convert to raw 32-bit float, mono, 44100Hz
  const command = `${FFMPEG_PATH} -i "${inputPath}" -ar ${sampleRate} -ac 1 -f f32le -y "${rawPath}"`;
  
  try {
    await execAsync(command);
    console.log(`Converted ${inputPath} to raw PCM: ${rawPath}`);
    
    // Read raw PCM data
    const rawData = await fs.promises.readFile(rawPath);
    const samples = new Float64Array(rawData.length / 4); // 4 bytes per float32
    
    // Read as float32
    const view = new DataView(rawData.buffer, rawData.byteOffset, rawData.byteLength);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = view.getFloat32(i * 4, true); // little-endian
    }
    
    // Clean up raw file
    try { fs.unlinkSync(rawPath); } catch (e) {}
    
    return { data: samples, sampleRate };
  } catch (error) {
    console.error('FFmpeg conversion error:', error);
    return null;
  }
}

async function convertToWav(inputPath: string): Promise<string | null> {
  const ext = path.extname(inputPath).toLowerCase();
  if (ext === '.wav') {
    return inputPath;
  }
  
  const wavPath = path.join(TEMP_DIR, `${path.basename(inputPath, ext)}_${Date.now()}.wav`);
  
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  
  const command = `${FFMPEG_PATH} -i "${inputPath}" -ar 44100 -ac 1 -y "${wavPath}"`;
  
  try {
    await execAsync(command);
    console.log(`Converted ${inputPath} to WAV: ${wavPath}`);
    return wavPath;
  } catch (error) {
    console.error('FFmpeg conversion error:', error);
    return null;
  }
}

async function analyzeAudioFile(audioPath: string): Promise<{ time: number; midiNote: number; confidence: number }[]> {
  const audioData = await convertToRawPCM(audioPath);
  
  if (!audioData) {
    console.error('Failed to convert audio to PCM');
    return [];
  }
  
  const { data: channelData, sampleRate } = audioData;
  console.log(`Analyzing audio: ${channelData.length} samples at ${sampleRate} Hz`);
  
  const pitchPoints: { time: number; midiNote: number; confidence: number }[] = [];
  const HOP_SIZE = 2048; // Same as client
  
  for (let i = 0; i < channelData.length - HOP_SIZE; i += HOP_SIZE) {
    const chunk = new Float64Array(HOP_SIZE);
    for (let j = 0; j < HOP_SIZE; j++) {
      chunk[j] = channelData[i + j];
    }
    
    const result = detectPitch(chunk, sampleRate);
    
    if (result) {
      const time = i / sampleRate;
      pitchPoints.push({
        time,
        midiNote: result.midiNote,
        confidence: result.confidence
      });
    }
  }
  
  console.log(`Found ${pitchPoints.length} pitch points over ${(channelData.length / sampleRate).toFixed(1)}s`);
  
  return pitchPoints;
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
