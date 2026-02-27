'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Mic, MicOff, Settings, Sun, Moon, Monitor } from 'lucide-react';
import { PitchVisualizer } from '@/components/audio/PitchVisualizer';
import { Controls } from '@/components/practice/Controls';
import { useAudioCapture } from '@/hooks/useAudioCapture';
import { useAudioPlayback } from '@/hooks/useAudioPlayback';
import { useTheme, type AppTheme } from '@/components/ThemeProvider';
import type { Song, PitchPoint } from '@/types';
import { midiToName } from '@/lib/utils';

interface PracticeViewProps {
  song: Song;
}

function getInitialSettings(): {
  latency: number;
  audioMode: 'original' | 'vocals';
  pitchMode: 'original' | 'vocals';
} {
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

// Circular score ring SVG component - responsive sizing
function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';
  const circumference = 2 * Math.PI * 20;
  const filled = (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 shrink-0">
      <svg className="w-full h-full" viewBox="0 0 44 44" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="22" cy="22" r="20" fill="none" stroke="currentColor" strokeWidth="3"
          className="text-gray-200 dark:text-gray-700" />
        <circle
          cx="22" cy="22" r="20" fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.4s ease, stroke 0.4s ease' }}
        />
      </svg>
      <span className="absolute text-[10px] sm:text-xs font-bold tabular-nums" style={{ color }}>
        {score}%
      </span>
    </div>
  );
}

// Mic level bars - responsive sizing
function MicLevelBars({ level, active }: { level: number; active: boolean }) {
  const bars = 5;
  const normalised = Math.min(1, level / 0.12);
  return (
    <div className="hidden sm:flex items-end gap-0.5 h-4 sm:h-5 w-5 sm:w-6">
      {Array.from({ length: bars }).map((_, i) => {
        const threshold = (i + 1) / bars;
        const lit = active && normalised >= threshold * 0.85;
        return (
          <div
            key={i}
            className="w-0.5 sm:w-1 rounded-sm transition-colors duration-75"
            style={{
              height: `${30 + i * 15}%`,
              backgroundColor: lit ? `hsl(${142 - i * 14}, 68%, 42%)` : '#e2e8f0',
            }}
          />
        );
      })}
    </div>
  );
}

// Pill-style segmented toggle
function PillToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg gap-1">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs font-medium transition-all duration-200 ${
            value === opt.value
              ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function PracticeView({ song }: PracticeViewProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [livePitch, setLivePitch] = useState<number | null>(null);
  const [lastDetectedPitch, setLastDetectedPitch] = useState<number | null>(null);
  const [referenceData, setReferenceData] = useState<PitchPoint[]>([]);
  const [liveData, setLiveData] = useState<PitchPoint[]>([]);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [audioMode, setAudioMode] = useState<'original' | 'vocals'>(initialSettings.audioMode);
  const [pitchMode, setPitchMode] = useState<'original' | 'vocals'>(initialSettings.pitchMode);
  const [latencyOffset, setLatencyOffset] = useState(initialSettings.latency);
  const [showSettings, setShowSettings] = useState(false);
  const [volume, setVolumeState] = useState(0.8);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [score, setScore] = useState(0);

  const currentTimeRef = useRef(0);
  const lastPitchTimeRef = useRef(0);
  const savedTimeRef = useRef(0);
  const wasPlayingRef = useRef(false);
  const isPlayingRef = useRef(false);
  const isFirstLoadRef = useRef(true);
  const prevAudioModeRef = useRef(audioMode);
  const prevPitchModeRef = useRef(pitchMode);

  const { isCapturing, startCapture, stopCapture, getPitch, audioLevel } = useAudioCapture();
  const { isPlaying, currentTime, duration, loadAudio, play, pause, seek, setVolume } = useAudioPlayback();

  useEffect(() => { setSettingsLoaded(true); }, []);

  useEffect(() => { localStorage.setItem('voiceApp_latency', latencyOffset.toString()); }, [latencyOffset]);
  useEffect(() => { localStorage.setItem('voiceApp_audioMode', audioMode); }, [audioMode]);
  useEffect(() => { localStorage.setItem('voiceApp_pitchMode', pitchMode); }, [pitchMode]);
  useEffect(() => { 
    currentTimeRef.current = currentTime; 
    isPlayingRef.current = isPlaying;
  }, [currentTime, isPlaying]);

  useEffect(() => {
    if (!settingsLoaded) return;
    
    // Check if audio mode changed (not initial load)
    const audioModeChanged = prevAudioModeRef.current !== audioMode;
    const pitchModeChanged = prevPitchModeRef.current !== pitchMode;
    
    // Save current time and playing state before switching if mode changed
    if (!isFirstLoadRef.current && (audioModeChanged || pitchModeChanged)) {
      savedTimeRef.current = currentTimeRef.current;
      wasPlayingRef.current = isPlayingRef.current;
    }
    
    isFirstLoadRef.current = false;
    
    // Update refs to track changes for next render
    prevAudioModeRef.current = audioMode;
    prevPitchModeRef.current = pitchMode;
    
    const audioSrc = (audioMode === 'vocals' && song.vocalFilename)
      ? `/audio/${song.vocalFilename}`
      : `/audio/${song.filename}`;
    loadAudio(audioSrc);

    const pitchData = (pitchMode === 'vocals' && song.pitchDataVocals)
      ? song.pitchDataVocals
      : song.pitchDataOriginal;
    setReferenceData(pitchData || []);
    
    // Restore position and resume playback after a short delay to allow audio to load
    if (savedTimeRef.current > 0 || wasPlayingRef.current) {
      const timeout = setTimeout(() => {
        if (savedTimeRef.current > 0) {
          seek(savedTimeRef.current);
        }
        // Resume playback if it was playing before the switch
        if (wasPlayingRef.current) {
          play();
          wasPlayingRef.current = false;
        }
        savedTimeRef.current = 0;
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [song, audioMode, pitchMode, loadAudio, settingsLoaded]);

  useEffect(() => { setVolume(volume); }, [volume, setVolume]);

  // Score calculation
  useEffect(() => {
    if (liveData.length === 0 || referenceData.length === 0) { setScore(0); return; }
    let matched = 0;
    for (const ref of referenceData) {
      if (ref.time > currentTime) continue;
      let closestUser = null;
      let closestDt = Infinity;
      for (const user of liveData) {
        const alignedTime = user.time - latencyOffset;
        const dt = Math.abs(ref.time - alignedTime);
        if (dt < closestDt) { closestDt = dt; closestUser = user; }
      }
      if (closestUser && closestDt < 0.15 && closestUser.midiNote >= ref.midiNote - 0.5) matched++;
    }
    const totalPassedRefs = referenceData.filter(r => r.time <= currentTime).length;
    setScore(totalPassedRefs > 0 ? Math.round((matched / totalPassedRefs) * 100) : 0);
  }, [liveData, referenceData, latencyOffset, currentTime]);

  // Auto-start microphone
  useEffect(() => {
    const startMic = async () => {
      try { await startCapture(); setIsMicEnabled(true); }
      catch { /* user can enable manually */ }
    };
    startMic();
    return () => { stopCapture(); };
  }, []);

  // Pitch polling at 50ms
  useEffect(() => {
    if (!isCapturing) return;
    const interval = setInterval(() => {
      const pitch = getPitch();
      const time = currentTimeRef.current;
      if (pitch) {
        setLivePitch(pitch.midiNote);
        setLastDetectedPitch(pitch.midiNote);
        lastPitchTimeRef.current = Date.now();
        setLiveData(prev => {
          const newPoint = { time, midiNote: pitch.midiNote, confidence: pitch.confidence };
          const cutoff = time - 30;
          const trimmed = prev.length > 600 ? prev.filter(p => p.time >= cutoff) : prev;
          return [...trimmed, newPoint];
        });
      } else {
        setLivePitch(null);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [isCapturing, getPitch]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case ' ': e.preventDefault(); isPlaying ? pause() : play(); break;
        case 'ArrowLeft': e.preventDefault(); seek(Math.max(0, currentTime - 2)); break;
        case 'ArrowRight': e.preventDefault(); seek(Math.min(duration, currentTime + 2)); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, currentTime, duration, play, pause, seek]);

  const handleToggleMic = useCallback(async () => {
    if (isCapturing) {
      stopCapture(); setIsMicEnabled(false);
    } else {
      try { await startCapture(); setIsMicEnabled(true); }
      catch { alert('Could not access microphone. Please check permissions.'); }
    }
  }, [isCapturing, startCapture, stopCapture]);

  const handleRewind = () => seek(Math.max(0, currentTime - 2));
  const handleForward = () => seek(Math.min(duration, currentTime + 2));
  const hasVocals = song.vocalFilename || song.pitchDataVocals;
  const shouldShowPitch = lastDetectedPitch && (Date.now() - lastPitchTimeRef.current < 500);

  const themeOptions: { value: AppTheme; icon: React.ReactNode; label: string }[] = [
    { value: 'system', icon: <Monitor className="w-3.5 h-3.5" />, label: 'System' },
    { value: 'light',  icon: <Sun className="w-3.5 h-3.5" />,     label: 'Light'  },
    { value: 'dark',   icon: <Moon className="w-3.5 h-3.5" />,    label: 'Dark'   },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-200">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-3 sm:px-6 py-2 sm:py-3 transition-colors duration-200">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          {/* Back */}
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 sm:gap-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline text-sm">Library</span>
          </button>

          {/* Song title */}
          <h1 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{song.name}</h1>

          {/* Right controls */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Current pitch - hidden on mobile */}
            <div className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg min-w-[60px] sm:min-w-[80px] text-center hidden sm:block">
              <span className={`text-lg sm:text-xl font-bold tabular-nums transition-colors duration-200 ${
                shouldShowPitch ? 'text-green-600 dark:text-green-400' : 'text-gray-300 dark:text-gray-600'
              }`}>
                {shouldShowPitch ? midiToName(lastDetectedPitch!) : '--'}
              </span>
            </div>

            {/* Score ring */}
            <ScoreRing score={score} />

            {/* Mic level + button */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              <MicLevelBars level={audioLevel ?? 0} active={isMicEnabled && isCapturing} />
              <button
                onClick={handleToggleMic}
                className={`p-2 sm:p-2.5 rounded-full transition-all ${
                  isMicEnabled
                    ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/60'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
                title={isMicEnabled ? 'Stop microphone' : 'Start microphone'}
              >
                {isMicEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
            </div>

            {/* Settings toggle */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 sm:p-2.5 rounded-full transition-all ${
                showSettings
                  ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {/* ── Settings panel (animated slide-down) ─────────────────────── */}
        <div
          className="bg-gray-50 dark:bg-gray-950 transition-all duration-300 ease-in-out"
          style={{ maxHeight: showSettings ? 600 : 0, opacity: showSettings ? 1 : 0, overflow: 'hidden' }}
        >
          <div className="mb-4 sm:mb-5 p-4 sm:p-5 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg transition-colors duration-200">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 sm:mb-4">
              Settings
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 sm:gap-x-8 gap-y-4 sm:gap-y-5">
              {/* Audio source */}
              {hasVocals && (
                <div className="min-w-0">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 sm:mb-3">
                    Audio Playback
                  </label>
                  <PillToggle
                    options={[{ label: 'Original', value: 'original' }, { label: 'Vocals Only', value: 'vocals' }]}
                    value={audioMode}
                    onChange={setAudioMode}
                  />
                </div>
              )}

              {/* Pitch reference */}
              {hasVocals && (
                <div className="min-w-0">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 sm:mb-3">
                    Pitch Reference
                  </label>
                  <PillToggle
                    options={[{ label: 'Original', value: 'original' }, { label: 'Vocals Only', value: 'vocals' }]}
                    value={pitchMode}
                    onChange={setPitchMode}
                  />
                </div>
              )}

              {/* Theme toggle */}
              <div className="min-w-0">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 sm:mb-3">
                  Theme
                </label>
                <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg gap-1">
                  {themeOptions.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setTheme(opt.value)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-1 sm:px-2 py-1.5 sm:py-2 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                        theme === opt.value
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                      }`}
                    >
                      {opt.icon}
                      <span className="hidden sm:inline">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Latency slider */}
              <div className="min-w-0">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Latency Correction
                  </label>
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                    {latencyOffset >= 0 ? '+' : ''}{(latencyOffset * 1000).toFixed(0)}ms
                  </span>
                </div>
                <input
                  type="range"
                  min="-0.5"
                  max="0.5"
                  step="0.01"
                  value={latencyOffset}
                  onChange={e => setLatencyOffset(parseFloat(e.target.value))}
                  className="w-full cursor-pointer block"
                />
                <div className="flex justify-between text-xs text-gray-400 dark:text-gray-600 mt-1 sm:mt-2">
                  <span>-500ms</span>
                  <span>+500ms</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Canvas ───────────────────────────────────────────────────── */}
        <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm">
          <PitchVisualizer
            referenceData={referenceData}
            liveData={liveData}
            currentTime={currentTime}
            latencyOffset={latencyOffset}
            onSeek={seek}
          />
        </div>

        {/* ── Transport controls ────────────────────────────────────────── */}
        <div className="mt-3 sm:mt-4">
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
