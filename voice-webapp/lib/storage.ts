import fs from 'fs';
import path from 'path';
import type { Song, PitchPoint } from '@/types';

const DATA_FILE = path.join(process.cwd(), 'public', 'audio', 'songs.json');

export function getSongs(): Song[] {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return [];
    }
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading songs:', error);
    return [];
  }
}

export function saveSongs(songs: Song[]): void {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(songs, null, 2));
  } catch (error) {
    console.error('Error saving songs:', error);
    throw error;
  }
}

export function addSong(song: Song): Song {
  const songs = getSongs();
  songs.push(song);
  saveSongs(songs);
  return song;
}

export function updateSong(id: string, updates: Partial<Song>): Song | null {
  const songs = getSongs();
  const index = songs.findIndex(s => s.id === id);
  if (index === -1) return null;
  
  songs[index] = { ...songs[index], ...updates };
  saveSongs(songs);
  return songs[index];
}

export function deleteSong(id: string): boolean {
  const songs = getSongs();
  const index = songs.findIndex(s => s.id === id);
  if (index === -1) return false;
  
  const song = songs[index];
  
  // Delete audio files
  const audioDir = path.join(process.cwd(), 'public', 'audio');
  const filesToDelete = [song.filename, song.vocalFilename].filter(Boolean);
  
  for (const file of filesToDelete) {
    if (file) {
      const filePath = path.join(audioDir, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }
  
  songs.splice(index, 1);
  saveSongs(songs);
  return true;
}

export function getSongById(id: string): Song | undefined {
  const songs = getSongs();
  return songs.find(s => s.id === id);
}
