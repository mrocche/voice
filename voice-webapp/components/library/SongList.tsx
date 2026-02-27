'use client';

import { useState } from 'react';
import { Upload, Music } from 'lucide-react';
import { SongCard } from './SongCard';
import type { Song } from '@/types';

interface SongListProps {
  songs: Song[];
  onUpload: (file: File, isolateVocals: boolean) => void;
  onPlay: (song: Song) => void;
  onDelete: (song: Song) => void;
  onRename?: (song: Song, newName: string) => Promise<void>;
}

export function SongList({ songs, onUpload, onPlay, onDelete, onRename }: SongListProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isolateVocals, setIsolateVocals] = useState(true);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('audio/')) onUpload(file, isolateVocals);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file, isolateVocals);
  };

  if (songs.length === 0) {
    return (
      <div
        className={`border-2 border-dashed rounded-2xl p-8 sm:p-14 text-center transition-all ${
          isDragging
            ? 'border-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/30 scale-[1.01]'
            : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-gray-50/50 dark:hover:bg-gray-900/30'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="w-16 h-16 mx-auto mb-5 bg-indigo-100 dark:bg-indigo-900/40 rounded-2xl flex items-center justify-center">
          <Upload className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1.5">
          Upload your first song
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-xs mx-auto">
          Drop an audio file here or click below to get started.
        </p>

        <div className="mb-6 inline-flex items-start gap-3 text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 max-w-xs">
          <input
            type="checkbox"
            id="isolate-empty"
            checked={isolateVocals}
            onChange={e => setIsolateVocals(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
          />
          <label htmlFor="isolate-empty" className="cursor-pointer">
            <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">Isolate vocals</span>
            <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Separate singer from music using AI.
            </span>
          </label>
        </div>

        <div>
          <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all hover:shadow-lg hover:shadow-indigo-500/25 cursor-pointer text-sm font-medium">
            <Upload className="w-4 h-4" />
            Choose Audio File
            <input type="file" accept="audio/*" onChange={handleFileInput} className="hidden" />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Upload bar */}
      <div
        className={`mb-6 p-4 border-2 border-dashed rounded-xl transition-all ${
          isDragging
            ? 'border-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/30'
            : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all hover:shadow-md hover:shadow-indigo-500/20 cursor-pointer text-sm font-medium">
            <Upload className="w-4 h-4" />
            Upload Song
            <input type="file" accept="audio/*" onChange={handleFileInput} className="hidden" />
          </label>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isolateVocals}
              onChange={e => setIsolateVocals(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>
              <span className="block text-sm text-gray-700 dark:text-gray-300 font-medium">Isolate vocals</span>
              {/* <span className="block text-xs text-gray-400 dark:text-gray-500">Separates singer from music</span> */}
            </span>
          </label>
        </div>
      </div>

      {/* Library heading */}
      <div className="flex items-center gap-2 mb-3">
        <Music className="w-4 h-4 text-gray-400 dark:text-gray-600" />
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {songs.length} song{songs.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Song grid */}
      <div className="grid gap-3">
        {songs.map(song => (
          <SongCard
            key={song.id}
            song={song}
            onPlay={() => onPlay(song)}
            onDelete={() => onDelete(song)}
            onRename={onRename ? (newName) => onRename(song, newName) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
