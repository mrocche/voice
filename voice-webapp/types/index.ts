export interface PitchPoint {
  time: number;
  midiNote: number;
  confidence: number;
}

export interface Song {
  id: string;
  name: string;
  filename: string;
  vocalFilename: string | null;
  duration: number;
  isProcessed: boolean;
  pitchDataOriginal: PitchPoint[];
  pitchDataVocals: PitchPoint[] | null;
  processingStatus: 'ready' | 'processing' | 'isolating' | 'failed';
  createdAt: string;
}

export interface PracticeSession {
  songId: string;
  startTime: string;
  endTime?: string;
  pitchData: PitchPoint[];
  accuracy: number;
}

export interface AudioState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isCapturing: boolean;
  livePitch: number | null;
  currentSong: Song | null;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsCapturing: (capturing: boolean) => void;
  setLivePitch: (pitch: number | null) => void;
  setCurrentSong: (song: Song | null) => void;
}
