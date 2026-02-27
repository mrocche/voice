'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { Howl } from 'howler';

export interface UseAudioPlaybackReturn {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  loadAudio: (src: string) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
}

export function useAudioPlayback(): UseAudioPlaybackReturn {
  const howlRef = useRef<Howl | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadAudio = useCallback((src: string) => {
    if (howlRef.current) {
      howlRef.current.unload();
    }

    const howl = new Howl({
      src: [src],
      html5: true,
      volume: 0.8,
      onload: () => {
        setDuration(howl.duration());
      },
      onplay: () => {
        setIsPlaying(true);
        intervalRef.current = setInterval(() => {
          setCurrentTime(howl.seek());
        }, 50);
      },
      onpause: () => {
        setIsPlaying(false);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      },
      onstop: () => {
        setIsPlaying(false);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      },
      onend: () => {
        setIsPlaying(false);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      },
      onseek: () => {
        setCurrentTime(howl.seek());
      }
    });

    howlRef.current = howl;
  }, []);

  const play = useCallback(() => {
    if (howlRef.current) {
      howlRef.current.play();
    }
  }, []);

  const pause = useCallback(() => {
    if (howlRef.current) {
      howlRef.current.pause();
    }
  }, []);

  const stop = useCallback(() => {
    if (howlRef.current) {
      howlRef.current.stop();
      setCurrentTime(0);
    }
  }, []);

  const seek = useCallback((time: number) => {
    if (howlRef.current) {
      howlRef.current.seek(time);
      setCurrentTime(time);
    }
  }, []);

  const setVolume = useCallback((vol: number) => {
    if (howlRef.current) {
      howlRef.current.volume(vol);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (howlRef.current) {
        howlRef.current.unload();
      }
    };
  }, []);

  return {
    isPlaying,
    currentTime,
    duration,
    loadAudio,
    play,
    pause,
    stop,
    seek,
    setVolume
  };
}
