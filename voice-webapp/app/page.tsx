'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MicVocal } from 'lucide-react';
import { SongList } from '@/components/library/SongList';
import type { Song } from '@/types';

export default function Home() {
  const router = useRouter();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Initial load
  useEffect(() => {
    fetchSongs();
  }, [fetchSongs]);

  // Auto-refresh every 5 seconds to check processing status
  useEffect(() => {
    const interval = setInterval(() => {
      const hasProcessing = songs.some(s => 
        s.processingStatus === 'processing' || s.processingStatus === 'isolating'
      );
      if (hasProcessing) {
        fetchSongs();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [songs, fetchSongs]);

  const handleUpload = async (file: File, isolateVocals: boolean = true) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('isolateVocals', String(isolateVocals));

    try {
      const res = await fetch('/api/songs', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const newSong = await res.json();
        setSongs(prev => [...prev, newSong]);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload file');
    }
  };

  const handlePlay = (song: Song) => {
    if (song.processingStatus !== 'ready') {
      alert('Song is still processing. Please wait.');
      return;
    }
    router.push(`/practice/${song.id}`);
  };

  const handleDelete = async (song: Song) => {
    if (!confirm(`Delete "${song.name}"?`)) return;

    try {
      const res = await fetch(`/api/songs/${song.id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setSongs(prev => prev.filter(s => s.id !== song.id));
      }
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <MicVocal className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Voice Practice</h1>
              <p className="text-gray-500">Improve your pitch with real-time feedback</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <SongList
          songs={songs}
          onUpload={handleUpload}
          onPlay={handlePlay}
          onDelete={handleDelete}
        />
      </main>
    </div>
  );
}
