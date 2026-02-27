import { create } from 'zustand';
import type { AudioState, Song } from '@/types';

export const useAudioStore = create<AudioState>((set) => ({
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  isCapturing: false,
  livePitch: null,
  currentSong: null,

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  seek: (time: number) => set({ currentTime: time }),
  setVolume: (vol: number) => set({ volume: vol }),
  setCurrentTime: (time: number) => set({ currentTime: time }),
  setDuration: (duration: number) => set({ duration }),
  setIsCapturing: (capturing: boolean) => set({ isCapturing: capturing }),
  setLivePitch: (pitch: number | null) => set({ livePitch: pitch }),
  setCurrentSong: (song: Song | null) => set({ currentSong: song }),
}));
