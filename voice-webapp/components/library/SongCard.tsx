'use client';

import { useState, useRef, useEffect } from 'react';
import { Music, Mic, Trash2, Loader2, AlertCircle, Pencil, Check, X } from 'lucide-react';
import type { Song } from '@/types';
import { formatTime } from '@/lib/utils';

interface SongCardProps {
  song: Song;
  onPlay: () => void;
  onDelete: () => void;
  onRename?: (newName: string) => Promise<void>;
}

export function SongCard({ song, onPlay, onDelete, onRename }: SongCardProps) {
  const isReady = song.processingStatus === 'ready';
  const isProcessing = song.processingStatus === 'processing' || song.processingStatus === 'isolating';
  const isFailed = song.processingStatus === 'failed';
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(song.name);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);
  
  const handleStartEdit = () => {
    setEditName(song.name);
    setIsEditing(true);
  };
  
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditName(song.name);
  };
  
  const handleSaveEdit = async () => {
    if (!onRename || !editName.trim() || editName.trim() === song.name) {
      setIsEditing(false);
      return;
    }
    
    setIsSaving(true);
    try {
      await onRename(editName.trim());
      setIsEditing(false);
    } catch {
      // Error handled by parent, revert
      setEditName(song.name);
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all group overflow-hidden">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        {/* Icon + info */}
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 overflow-hidden">
          <div className={`p-2 sm:p-2.5 rounded-xl shrink-0 ${
            isProcessing
              ? 'bg-indigo-50 dark:bg-indigo-900/30'
              : isFailed
                ? 'bg-red-50 dark:bg-red-900/30'
                : 'bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-md shadow-indigo-500/20'
          }`}>
            {isProcessing
              ? <Loader2 className="w-4 h-4 text-indigo-500 dark:text-indigo-400 animate-spin" />
              : isFailed
                ? <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
                : <Music className="w-4 h-4 text-white" />
            }
          </div>

          <div className="flex-1 min-w-0 overflow-hidden">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isSaving}
                  className="flex-1 min-w-0 px-2 py-1 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                  placeholder="Song name..."
                />
                <button
                  onClick={handleSaveEdit}
                  disabled={isSaving || !editName.trim()}
                  className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate text-sm">{song.name}</h3>
                {onRename && (
                  <button
                    onClick={handleStartEdit}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded transition-all shrink-0"
                    title="Rename song"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
            <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
              <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0">{formatTime(song.duration)}</span>

              {isProcessing && (
                <span className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium shrink-0">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                  <span className="hidden sm:inline">{song.processingStatus === 'isolating' ? 'Isolating...' : 'Analysing...'}</span>
                  <span className="sm:hidden">...</span>
                </span>
              )}

              {isFailed && (
                <span className="text-xs text-red-500 dark:text-red-400 font-medium shrink-0">Failed</span>
              )}

              {isReady && song.isProcessed && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium shrink-0">
                  <Mic className="w-3 h-3" />
                  <span className="hidden sm:inline">Vocals</span>
                </span>
              )}

              {isReady && !song.isProcessed && (
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium shrink-0 hidden sm:inline">Original</span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            onClick={onPlay}
            disabled={!isReady || isEditing}
            className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              isReady && !isEditing
                ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-md hover:shadow-indigo-500/25 active:scale-95'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
            }`}
          >
            <span className="hidden sm:inline">{isProcessing ? 'Processing...' : 'Practice'}</span>
            <span className="sm:hidden">{isProcessing ? '...' : 'Go'}</span>
          </button>

          <button
            onClick={onDelete}
            disabled={isEditing}
            className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100 shrink-0 disabled:opacity-30"
            title="Delete song"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
