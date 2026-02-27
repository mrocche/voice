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
  onForward
}: ControlsProps) {
  const [isMuted, setIsMuted] = useState(false);

  const handleVolumeToggle = () => {
    if (isMuted) {
      onVolumeChange(0.8);
      setIsMuted(false);
    } else {
      onVolumeChange(0);
      setIsMuted(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSeek(parseFloat(e.target.value));
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    onVolumeChange(parseFloat(e.target.value));
    setIsMuted(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      {/* Main controls row */}
      <div className="flex items-center gap-3 mb-3">
        {/* Rewind */}
        <button
          onClick={onRewind}
          className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          title="Rewind 2s (←)"
        >
          <SkipBack className="w-5 h-5" />
        </button>
        
        {/* Play/Pause */}
        <button
          onClick={isPlaying ? onPause : onPlay}
          className="p-4 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-all hover:scale-105"
        >
          {isPlaying ? (
            <Pause className="w-7 h-7" />
          ) : (
            <Play className="w-7 h-7 ml-0.5" />
          )}
        </button>
        
        {/* Forward */}
        <button
          onClick={onForward}
          className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          title="Forward 2s (→)"
        >
          <SkipForward className="w-5 h-5" />
        </button>

        {/* Progress */}
        <div className="flex-1">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
            <span className="tabular-nums">{formatTime(currentTime)}</span>
            <span>/</span>
            <span className="tabular-nums">{formatTime(duration)}</span>
          </div>
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-900"
          />
        </div>
      </div>

      {/* Bottom row: volume + keyboard hint */}
      <div className="flex items-center justify-between">
        {/* Volume */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleVolumeToggle}
            className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={handleVolume}
            className="w-20 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-500"
          />
        </div>

        {/* Keyboard hint */}
        <span className="text-xs text-gray-400">
          Press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500 text-xs">Space</kbd> to play/pause
        </span>
      </div>
    </div>
  );
}
