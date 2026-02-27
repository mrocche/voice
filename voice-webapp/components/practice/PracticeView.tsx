'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Mic, MicOff, Volume2, Settings } from 'lucide-react';
import { PitchVisualizer } from '@/components/audio/PitchVisualizer';
import { Controls } from '@/components/practice/Controls';
import { useAudioCapture } from '@/hooks/useAudioCapture';
import { useAudioPlayback } from '@/hooks/useAudioPlayback';
import type { Song, PitchPoint } from '@/types';
import { midiToName } from '@/lib/utils';

interface PracticeViewProps {
  song: Song;
}

function getInitialSettings(): { latency: number; audioMode: 'original' | 'vocals'; pitchMode: 'original' | 'vocals' } {
  if (typeof window === 'undefined') {
    return { latency: 0, audioMode: 'vocals', pitchMode: 'vocals' };
  }
  const savedLatency = localStorage.getItem('voiceApp_latency');
  const savedAudioMode = localStorage.getItem('voiceApp_audioMode');
  const savedPitchMode = localStorage.getItem('voiceApp_pitchMode');
  return {
    latency: savedLatency ? parseFloat(savedLatency) : 0,
    audioMode: (savedAudioMode === 'original' || savedAudioMode === 'vocals') ? savedAudioMode : 'vocals',
    pitchMode: (savedPitchMode === 'original' || savedPitchMode === 'vocals') ? savedPitchMode : 'vocals',
  };
}

const initialSettings = getInitialSettings();

export function PracticeView({ song }: PracticeViewProps) {
  const router = useRouter();
  const [livePitch, setLivePitch] = useState<number | null>(null);
  const [lastDetectedPitch, setLastDetectedPitch] = useState<number | null>(null);
  const [referenceData, setReferenceData] = useState<PitchPoint[]>([]);
  const [liveData, setLiveData] = useState<PitchPoint[]>([]);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [useVocals, setUseVocals] = useState(true);
  const [audioMode, setAudioMode] = useState<'original' | 'vocals'>(initialSettings.audioMode);
  const [pitchMode, setPitchMode] = useState<'original' | 'vocals'>(initialSettings.pitchMode);
  const [latencyOffset, setLatencyOffset] = useState(initialSettings.latency);
  const [showSettings, setShowSettings] = useState(false);
  const [volume, setVolumeState] = useState(0.8);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [score, setScore] = useState(0);
  
  const currentTimeRef = useRef(0);
  const lastPitchTimeRef = useRef(0);

  const { isCapturing, startCapture, stopCapture, getPitch, audioLevel } = useAudioCapture();
  const { isPlaying, currentTime, duration, loadAudio, play, pause, stop, seek, setVolume } = useAudioPlayback();

  // Mark settings as loaded after mount
  useEffect(() => {
    setSettingsLoaded(true);
  }, []);

  // Save latency to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('voiceApp_latency', latencyOffset.toString());
  }, [latencyOffset]);

  // Save audioMode to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('voiceApp_audioMode', audioMode);
  }, [audioMode]);

  // Save pitchMode to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('voiceApp_pitchMode', pitchMode);
  }, [pitchMode]);
  
  // Keep ref in sync with state
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // Determine which audio and pitch data to use based on settings
  useEffect(() => {
    if (!settingsLoaded) return;
    // Audio file to play
    const audioSrc = (audioMode === 'vocals' && song.vocalFilename)
      ? `/audio/${song.vocalFilename}`
      : `/audio/${song.filename}`;
    loadAudio(audioSrc);

    // Pitch data to show
    const pitchData = (pitchMode === 'vocals' && song.pitchDataVocals)
      ? song.pitchDataVocals
      : song.pitchDataOriginal;
    
    setReferenceData(pitchData || []);
  }, [song, audioMode, loadAudio, settingsLoaded]);

  // Apply volume
  useEffect(() => {
    setVolume(volume);
  }, [volume, setVolume]);

  // Calculate score based on how many reference notes have a green user note above
  useEffect(() => {
    if (liveData.length === 0 || referenceData.length === 0) {
      setScore(0);
      return;
    }
    let matched = 0;
    for (const ref of referenceData) {
      // Only consider reference notes that have passed
      if (ref.time > currentTime) continue;
      
      // Find closest user point to this reference
      let closestUser = null;
      let closestDt = Infinity;
      for (const user of liveData) {
        const alignedTime = user.time - latencyOffset;
        const dt = Math.abs(ref.time - alignedTime);
        if (dt < closestDt) {
          closestDt = dt;
          closestUser = user;
        }
      }
      // If within tight time window (0.15s) and user note is above reference
      if (closestUser && closestDt < 0.15) {
        if (closestUser.midiNote >= ref.midiNote - 0.5) {
          matched++;
        }
      }
    }
    const totalPassedRefs = referenceData.filter(r => r.time <= currentTime).length;
    setScore(totalPassedRefs > 0 ? Math.round((matched / totalPassedRefs) * 100) : 0);
  }, [liveData, referenceData, latencyOffset, currentTime]);

  // Auto-start microphone on mount
  useEffect(() => {
    const startMic = async () => {
      try {
        await startCapture();
        setIsMicEnabled(true);
      } catch (error) {
        console.log('Mic auto-start failed, user can enable manually');
      }
    };
    startMic();
    
    return () => {
      stopCapture();
    };
  }, []);

  // Polling for pitch detection
  useEffect(() => {
    if (!isCapturing) return;

    const interval = setInterval(() => {
      const pitch = getPitch();
      const time = currentTimeRef.current;
      if (pitch) {
        setLivePitch(pitch.midiNote);
        setLastDetectedPitch(pitch.midiNote);
        lastPitchTimeRef.current = Date.now();
        // Store actual time - visualizer will apply latency offset
        setLiveData(prev => [...prev, {
          time: time,
          midiNote: pitch.midiNote,
          confidence: pitch.confidence
        }]);
      } else {
        setLivePitch(null);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isCapturing, getPitch, latencyOffset]);

  // Handle keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (isPlaying) {
            pause();
          } else {
            play();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seek(Math.max(0, currentTime - 2));
          break;
        case 'ArrowRight':
          e.preventDefault();
          seek(Math.min(duration, currentTime + 2));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, currentTime, duration, play, pause, seek]);

  const handleToggleMic = useCallback(async () => {
    if (isCapturing) {
      stopCapture();
      setIsMicEnabled(false);
    } else {
      try {
        await startCapture();
        setIsMicEnabled(true);
      } catch (error) {
        console.error('Failed to start microphone:', error);
        alert('Could not access microphone. Please check permissions.');
      }
    }
  }, [isCapturing, startCapture, stopCapture]);

  const handleRewind = () => seek(Math.max(0, currentTime - 2));
  const handleForward = () => seek(Math.min(duration, currentTime + 2));

  const hasVocals = (song.vocalFilename && song.pitchDataVocals) || song.vocalFilename || song.pitchDataVocals;

  // Check if pitch display should fade (no new pitch for 500ms)
  const shouldShowPitch = lastDetectedPitch && (Date.now() - lastPitchTimeRef.current < 500);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden sm:inline">Library</span>
          </button>
          
          <h1 className="text-xl font-semibold text-gray-900 truncate max-w-md">{song.name}</h1>
          
          <div className="flex items-center gap-3">
            {/* Current pitch display */}
            <div className="px-4 py-2 bg-gray-100 rounded-lg min-w-[100px] text-center">
              <span className={`text-2xl font-bold tabular-nums transition-opacity duration-300 ${
                shouldShowPitch ? 'text-green-600' : 'text-gray-300'
              }`}>
                {shouldShowPitch ? midiToName(lastDetectedPitch!) : '--'}
              </span>
            </div>
            
            {/* Score display */}
            <div className="px-4 py-2 bg-gray-100 rounded-lg min-w-[80px] text-center">
              <span className={`text-2xl font-bold tabular-nums ${
                score >= 70 ? 'text-green-600' : score >= 40 ? 'text-yellow-600' : 'text-red-500'
              }`}>
                {score}%
              </span>
            </div>
            
            {/* Mic toggle */}
            <button
              onClick={handleToggleMic}
              className={`p-3 rounded-full transition-all ${
                isMicEnabled 
                  ? 'bg-red-100 text-red-600 hover:bg-red-200' 
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title={isMicEnabled ? 'Stop microphone' : 'Start microphone'}
            >
              {isMicEnabled ? (
                <Mic className="w-5 h-5" />
              ) : (
                <MicOff className="w-5 h-5" />
              )}
            </button>
            
            {/* Settings */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-3 rounded-full transition-all ${
                showSettings 
                  ? 'bg-gray-200 text-gray-800' 
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Settings Panel */}
        {showSettings && hasVocals && (
          <div className="mb-6 p-4 bg-gray-100 rounded-xl border border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Settings</h3>
            
            {/* Audio source toggle */}
            <div className="mb-4">
              <label className="text-xs text-gray-500 mb-2 block">Audio Playback</label>
              <div className="flex bg-white p-1 rounded-lg border border-gray-300">
                <button
                  onClick={() => setAudioMode('original')}
                  className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    audioMode === 'original' 
                      ? 'bg-gray-800 text-white' 
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Original
                </button>
                <button
                  onClick={() => setAudioMode('vocals')}
                  className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    audioMode === 'vocals' 
                      ? 'bg-gray-800 text-white' 
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Vocals Only
                </button>
              </div>
            </div>

            {/* Pitch data toggle */}
            <div className="mb-4">
              <label className="text-xs text-gray-500 mb-2 block">Pitch Reference</label>
              <div className="flex bg-white p-1 rounded-lg border border-gray-300">
                <button
                  onClick={() => setPitchMode('original')}
                  className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    pitchMode === 'original' 
                      ? 'bg-gray-800 text-white' 
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Original
                </button>
                <button
                  onClick={() => setPitchMode('vocals')}
                  className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    pitchMode === 'vocals' 
                      ? 'bg-gray-800 text-white' 
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Vocals Only
                </button>
              </div>
            </div>
            
            {/* Latency slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-gray-500">Latency Correction</label>
                <span className="text-sm font-medium text-gray-700">
                  {(latencyOffset * 1000).toFixed(0)}ms
                </span>
              </div>
              <input
                type="range"
                min="-0.25"
                max="0.25"
                step="0.01"
                value={latencyOffset}
                onChange={(e) => setLatencyOffset(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-gray-800"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>-250ms</span>
                <span>{latencyOffset >= 0 ? '+' : ''}{(latencyOffset * 1000).toFixed(0)}ms</span>
                <span>+250ms</span>
              </div>
            </div>
          </div>
        )}

        {/* Pitch Visualizer */}
        <div className="rounded-xl overflow-hidden border border-gray-200 bg-white">
          <PitchVisualizer
            referenceData={referenceData}
            liveData={liveData}
            currentTime={currentTime}
            latencyOffset={latencyOffset}
            onSeek={seek}
          />
        </div>

        {/* Controls */}
        <div className="mt-6">
          <Controls
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            volume={volume}
            onPlay={play}
            onPause={pause}
            onSeek={seek}
            onVolumeChange={setVolumeState}
            onRewind={handleRewind}
            onForward={handleForward}
          />
        </div>
      </main>
    </div>
  );
}
