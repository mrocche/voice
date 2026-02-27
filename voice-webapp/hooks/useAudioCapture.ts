'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import { detectPitch, type PitchResult } from '@/lib/audio';

export interface UseAudioCaptureReturn {
  isCapturing: boolean;
  startCapture: () => Promise<void>;
  stopCapture: () => void;
  getPitch: () => PitchResult | null;
  audioLevel: number;
}

export function useAudioCapture(): UseAudioCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastPitchRef = useRef<PitchResult | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const isRunningRef = useRef(false);

  const startCapture = useCallback(async () => {
    if (isRunningRef.current) return;
    
    try {
      isRunningRef.current = true;
      
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        } 
      });
      streamRef.current = stream;

      // Create a dedicated AudioContext for capture
      // Using options that work better for input
      const audioContext = new AudioContext({
        sampleRate: 44100,
        latencyHint: 'interactive'
      });
      
      // Ensure context is running
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.1; // Less smoothing for real-time

      source.connect(analyser);

      const bufferLength = analyser.fftSize;
      const dataArray = new Float32Array(bufferLength);

      const analyze = () => {
        if (!audioContextRef.current || !isRunningRef.current) return;
        
        try {
          analyser.getFloatTimeDomainData(dataArray);
          
          // Calculate audio level (RMS)
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i];
          }
          const rms = Math.sqrt(sum / dataArray.length);
          setAudioLevel(rms);
          
          // Detect pitch
          const result = detectPitch(dataArray, audioContext.sampleRate);
          lastPitchRef.current = result;
        } catch (e) {
          // Context might be closed
        }
        
        animationRef.current = requestAnimationFrame(analyze);
      };

      analyze();
      setIsCapturing(true);
    } catch (error) {
      console.error('Failed to start audio capture:', error);
      isRunningRef.current = false;
      throw error;
    }
  }, []);

  const stopCapture = useCallback(() => {
    isRunningRef.current = false;
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch (e) {}
      sourceRef.current = null;
    }

    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => track.stop());
      } catch (e) {}
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }

    lastPitchRef.current = null;
    setAudioLevel(0);
    setIsCapturing(false);
  }, []);

  const getPitch = useCallback(() => {
    return lastPitchRef.current;
  }, []);

  useEffect(() => {
    return () => {
      stopCapture();
    };
  }, [stopCapture]);

  return {
    isCapturing,
    startCapture,
    stopCapture,
    getPitch,
    audioLevel
  };
}
