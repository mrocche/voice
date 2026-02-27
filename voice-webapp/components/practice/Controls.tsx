'use client';

import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { formatTime } from '@/lib/utils';
import { useState } from 'react';

interface ControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (vol: number) => void;
  onRewind: () => void;
  onForward: () => void;
}

export function Controls({
  isPlaying,
  currentTime,
  duration,
  volume,
  onPlay,
  onPause,
  onSeek,
  onVolumeChange,
  onRewind,
  onForward,
}: ControlsProps) {
  const [isMuted, setIsMuted] = useState(false);

  const handleVolumeToggle = () => {
    if (isMuted) { onVolumeChange(0.8); setIsMuted(false); }
    else { onVolumeChange(0); setIsMuted(true); }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => onSeek(parseFloat(e.target.value));
  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    onVolumeChange(parseFloat(e.target.value));
    setIsMuted(false);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const effectiveVolume = isMuted ? 0 : volume;
  const volumePct = effectiveVolume * 100;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 px-4 sm:px-5 py-3 sm:py-4 shadow-sm transition-colors duration-200">
      {/* ── Transport row ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Rewind */}
        <button
          onClick={onRewind}
          className="p-2.5 sm:p-2 text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          title="Rewind 2s (←)"
        >
          <SkipBack className="w-5 h-5 sm:w-4 sm:h-4" />
        </button>

        {/* Play/Pause */}
        <button
          onClick={isPlaying ? onPause : onPlay}
          className="p-4 sm:p-3.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-all hover:scale-105 active:scale-95 shadow-md shadow-indigo-500/30"
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying
            ? <Pause className="w-6 h-6 sm:w-5 sm:h-5" />
            : <Play className="w-6 h-6 sm:w-5 sm:h-5 translate-x-px" />
          }
        </button>

        {/* Forward */}
        <button
          onClick={onForward}
          className="p-2.5 sm:p-2 text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          title="Forward 2s (→)"
        >
          <SkipForward className="w-5 h-5 sm:w-4 sm:h-4" />
        </button>

        {/* Progress section */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 mb-1.5 tabular-nums">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Filled progress track - larger touch target on mobile */}
          <div className="relative h-3 sm:h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden cursor-pointer">
            <div
              className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full pointer-events-none"
              style={{ width: `${progress}%`, transition: 'width 0.1s linear' }}
            />
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              style={{ margin: 0 }}
            />
          </div>
        </div>
      </div>

      {/* ── Bottom row: volume + keyboard hints ───────────────────────── */}
      <div className="flex items-center justify-between mt-3">
        {/* Volume */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleVolumeToggle}
            className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0
              ? <VolumeX className="w-5 h-5" />
              : <Volume2 className="w-5 h-5" />
            }
          </button>

          {/* Filled volume track - wider on mobile */}
          <div className="relative h-2 sm:h-1.5 w-28 sm:w-20 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden cursor-pointer">
            <div
              className="absolute inset-y-0 left-0 bg-gray-400 dark:bg-gray-500 rounded-full pointer-events-none"
              style={{ width: `${volumePct}%`, transition: 'width 0.05s linear' }}
            />
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={effectiveVolume}
              onChange={handleVolume}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              style={{ margin: 0 }}
            />
          </div>
        </div>

        {/* Keyboard hints */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400 dark:text-gray-600">
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-500 dark:text-gray-400 text-xs font-mono">Space</kbd>
            {' '}play/pause
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-500 dark:text-gray-400 text-xs font-mono">←</kbd>
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-500 dark:text-gray-400 text-xs font-mono">→</kbd>
            {' '}seek
          </span>
        </div>
      </div>
    </div>
  );
}
