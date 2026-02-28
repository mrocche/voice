'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MicVocal, Sun, Moon, Monitor, Settings } from 'lucide-react';
import { SongList } from '@/components/library/SongList';
import { useTheme, type AppTheme } from '@/components/ThemeProvider';
import type { Song } from '@/types';

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
          className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
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

function getInitialSettings(): {
  audioMode: 'original' | 'vocals';
  pitchMode: 'original' | 'vocals';
} {
  if (typeof window === 'undefined') {
    return { audioMode: 'vocals', pitchMode: 'vocals' };
  }
  const savedAudioMode = localStorage.getItem('voiceApp_audioMode');
  const savedPitchMode = localStorage.getItem('voiceApp_pitchMode');
  return {
    audioMode: (savedAudioMode === 'original' || savedAudioMode === 'vocals') ? savedAudioMode : 'vocals',
    pitchMode: (savedPitchMode === 'original' || savedPitchMode === 'vocals') ? savedPitchMode : 'vocals',
  };
}

export default function Home() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  
  // Read settings from localStorage after mount (not at module load time)
  const [audioMode, setAudioMode] = useState<'original' | 'vocals'>('vocals');
  const [pitchMode, setPitchMode] = useState<'original' | 'vocals'>('vocals');
  
  // Load saved settings on mount
  useEffect(() => {
    const settings = getInitialSettings();
    setAudioMode(settings.audioMode);
    setPitchMode(settings.pitchMode);
  }, []);

  useEffect(() => { localStorage.setItem('voiceApp_audioMode', audioMode); }, [audioMode]);
  useEffect(() => { localStorage.setItem('voiceApp_pitchMode', pitchMode); }, [pitchMode]);

  const fetchSongs = useCallback(async () => {
    try {
      const res = await fetch('/api/songs');
      if (res.ok) {
        const data = await res.json();
        setSongs(data);
      }
    } catch (error) {
      console.error('Failed to fetch songs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSongs(); }, [fetchSongs]);

  useEffect(() => {
    const interval = setInterval(() => {
      const hasProcessing = songs.some(
        s => s.processingStatus === 'processing' || s.processingStatus === 'isolating'
      );
      if (hasProcessing) fetchSongs();
    }, 5000);
    return () => clearInterval(interval);
  }, [songs, fetchSongs]);

  const handleUpload = async (file: File, isolateVocals: boolean = true) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('isolateVocals', String(isolateVocals));
    try {
      const res = await fetch('/api/songs', { method: 'POST', body: formData });
      if (res.ok) {
        const newSong = await res.json();
        setSongs(prev => [...prev, newSong]);
      }
    } catch {
      alert('Failed to upload file. Please try again.');
    }
  };

  const handlePlay = (song: Song) => {
    if (song.processingStatus !== 'ready') return;
    router.push(`/practice/${song.id}`);
  };

  const handleDelete = async (song: Song) => {
    if (!confirm(`Delete "${song.name}"?`)) return;
    try {
      const res = await fetch(`/api/songs/${song.id}`, { method: 'DELETE' });
      if (res.ok) setSongs(prev => prev.filter(s => s.id !== song.id));
    } catch {
      console.error('Delete failed');
    }
  };

  const handleRename = async (song: Song, newName: string) => {
    try {
      const res = await fetch(`/api/songs/${song.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to rename');
      }
      
      const updatedSong = await res.json();
      setSongs(prev => prev.map(s => s.id === song.id ? updatedSong : s));
    } catch (error) {
      console.error('Rename failed:', error);
      alert('Failed to rename song. Please try again.');
      throw error;
    }
  };

  const themeOptions: { value: AppTheme; icon: React.ReactNode; label: string }[] = [
    { value: 'system', icon: <Monitor className="w-3.5 h-3.5" />, label: 'System' },
    { value: 'light',  icon: <Sun className="w-3.5 h-3.5" />,     label: 'Light' },
    { value: 'dark',   icon: <Moon className="w-3.5 h-3.5" />,   label: 'Dark' },
  ];

  // Check if any songs have vocal processing available
  const hasVocals = songs.some(s => s.vocalFilename || s.pitchDataVocals);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center transition-colors duration-200">
        <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading library...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-200 overflow-x-hidden">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 transition-colors duration-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex items-center justify-between gap-3 sm:gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-indigo-600 rounded-xl shadow-md shadow-indigo-500/30">
                <MicVocal className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
                  Voice <span className="text-indigo-600 dark:text-indigo-400">Practice</span>
                </h1>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 hidden sm:block">Real-time pitch training</p>
              </div>
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

      {/* ── Settings panel (animated slide-down) ─────────────────────────── */}
      <div
        className="bg-gray-50 dark:bg-gray-950 transition-all duration-300 ease-in-out"
        style={{ maxHeight: showSettings ? 600 : 0, opacity: showSettings ? 1 : 0, overflow: 'hidden' }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-4 sm:pb-6">
          <div className="p-4 sm:p-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg transition-colors duration-200">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 sm:mb-4">
              Settings
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 sm:gap-x-8 gap-y-4 sm:gap-y-6">
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
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <SongList
          songs={songs}
          onUpload={handleUpload}
          onPlay={handlePlay}
          onDelete={handleDelete}
          onRename={handleRename}
        />
      </main>
    </div>
  );
}
