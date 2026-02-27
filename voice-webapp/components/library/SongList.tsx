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
}

export function SongList({ songs, onUpload, onPlay, onDelete }: SongListProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isolateVocals, setIsolateVocals] = useState(true);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('audio/')) {
      onUpload(file, isolateVocals);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file, isolateVocals);
    }
  };

  if (songs.length === 0) {
    return (
      <div
        className={`border-2 border-dashed rounded-2xl p-16 text-center transition-all ${
          isDragging 
            ? 'border-blue-500 bg-blue-50/50 scale-[1.01]' 
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-blue-100 to-blue-200 rounded-2xl flex items-center justify-center">
          <Upload className="w-10 h-10 text-blue-600" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          Upload your first song
        </h3>
        <p className="text-gray-500 mb-6 max-w-sm mx-auto">
          Add an audio file to start practicing. We&apos;ll analyze the pitch and isolate the vocals for you.
        </p>
        
        <div className="mb-6 flex items-center justify-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={isolateVocals}
              onChange={(e) => setIsolateVocals(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Isolate vocals
          </label>
        </div>
        
        <label className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all hover:shadow-lg hover:shadow-blue-500/25 cursor-pointer font-medium">
          <Upload className="w-5 h-5" />
          Choose Audio File
          <input
            type="file"
            accept="audio/*"
            onChange={handleFileInput}
            className="hidden"
          />
        </label>
      </div>
    );
  }

  return (
    <div>
      {/* Upload area */}
      <div
        className={`mb-8 p-6 border-2 border-dashed rounded-xl transition-all ${
          isDragging 
            ? 'border-blue-500 bg-blue-50/50' 
            : 'border-gray-200 hover:border-gray-300'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-3 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all hover:shadow-lg hover:shadow-blue-500/25 cursor-pointer font-medium">
            <Upload className="w-5 h-5" />
            Upload More
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileInput}
              className="hidden"
            />
          </label>
          
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={isolateVocals}
              onChange={(e) => setIsolateVocals(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Isolate vocals by default
          </label>
        </div>
      </div>

      {/* Songs list */}
      <div className="flex items-center gap-2 mb-4">
        <Music className="w-5 h-5 text-gray-400" />
        <span className="font-medium text-gray-600">
          {songs.length} song{songs.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="grid gap-3">
        {songs.map((song) => (
          <SongCard
            key={song.id}
            song={song}
            onPlay={() => onPlay(song)}
            onDelete={() => onDelete(song)}
          />
        ))}
      </div>
    </div>
  );
}
