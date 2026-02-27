'use client';

import { Music, Mic, Trash2, Loader2 } from 'lucide-react';
import type { Song } from '@/types';
import { formatTime } from '@/lib/utils';

interface SongCardProps {
  song: Song;
  onPlay: () => void;
  onDelete: () => void;
}

export function SongCard({ song, onPlay, onDelete }: SongCardProps) {
  const isReady = song.processingStatus === 'ready';
  const isProcessing = song.processingStatus === 'processing' || song.processingStatus === 'isolating';
  const isFailed = song.processingStatus === 'failed';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-lg hover:border-gray-300 transition-all group">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
            <Music className="w-5 h-5 text-white" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{song.name}</h3>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-gray-500 flex items-center gap-1">
                <span className="w-4 h-4" />
                {formatTime(song.duration)}
              </span>
              
              {isProcessing && (
                <span className="flex items-center gap-1.5 text-sm text-blue-600">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {song.processingStatus === 'isolating' ? 'Isolating...' : 'Analyzing...'}
                </span>
              )}
              
              {isFailed && (
                <span className="text-sm text-red-600">
                  Processing failed
                </span>
              )}
              
              {isReady && song.isProcessed && (
                <span className="flex items-center gap-1.5 text-sm text-green-600">
                  <Mic className="w-3.5 h-3.5" />
                  Vocals isolated
                </span>
              )}
              
              {isReady && !song.isProcessed && (
                <span className="text-sm text-amber-600">
                  Original audio
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={onPlay}
            disabled={isProcessing}
            className={`px-5 py-2.5 rounded-lg font-medium transition-all ${
              isProcessing
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/25 active:scale-95'
            }`}
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Practice'
            )}
          </button>
          <button
            onClick={onDelete}
            className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
            title="Delete song"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
