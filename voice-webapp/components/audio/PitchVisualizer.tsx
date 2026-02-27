'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { PitchPoint } from '@/types';
import { midiToName } from '@/lib/utils';

interface VisualizerProps {
  referenceData: PitchPoint[];
  liveData: PitchPoint[];
  currentTime: number;
  latencyOffset?: number;
  midiMin?: number;
  midiMax?: number;
  pastDuration?: number;
  futureDuration?: number;
  onSeek?: (time: number) => void;
}

const CANVAS_HEIGHT = 350;

export function PitchVisualizer({
  referenceData,
  liveData,
  currentTime,
  latencyOffset = 0,
  midiMin = 36,
  midiMax = 84,
  pastDuration = 5,
  futureDuration = 10,
  onSeek
}: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const midiToY = useCallback((midiNote: number) => {
    const range = midiMax - midiMin;
    return ((midiMax - midiNote) / range) * CANVAS_HEIGHT;
  }, [midiMin, midiMax]);

  const timeToX = useCallback((time: number, canvasWidth: number) => {
    const totalDuration = pastDuration + futureDuration;
    return ((time - currentTime + pastDuration) / totalDuration) * canvasWidth;
  }, [currentTime, pastDuration, futureDuration]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${CANVAS_HEIGHT}px`;
    ctx.scale(dpr, dpr);

    const width = rect.width;

    // Light background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, CANVAS_HEIGHT);

    // Draw grid lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.5;
    for (let note = midiMin; note <= midiMax; note++) {
      const y = midiToY(note);
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw staff lines for natural notes (C, D, E, F, G, A, B)
    const naturalNotes = [0, 2, 4, 5, 7, 9, 11];
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    for (let note = midiMin; note <= midiMax; note++) {
      if (naturalNotes.includes(note % 12)) {
        const y = midiToY(note);
        ctx.beginPath();
        ctx.moveTo(40, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    // Draw "now" line at position shifted by latency (where user's voice will appear)
    const nowTimeAdjusted = currentTime - latencyOffset;
    const nowX = timeToX(nowTimeAdjusted, width);
    
    // Black line for now
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(nowX, 0);
    ctx.lineTo(nowX, CANVAS_HEIGHT);
    ctx.stroke();

    // Draw "now" label
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NOW', nowX, 18);

    // Draw reference notes (blue) - no offset
    ctx.fillStyle = '#3b82f6';
    for (const point of referenceData) {
      const relTime = point.time - currentTime;
      if (relTime >= -pastDuration && relTime <= futureDuration) {
        const x = timeToX(point.time, width);
        const y = midiToY(point.midiNote);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw live notes (colored by accuracy) - shifted by latency to align with reference
    for (const point of liveData) {
      // Shift live note time by latency to align with reference timing
      const alignedTime = point.time + latencyOffset;
      const relTime = alignedTime - currentTime;
      if (relTime >= -pastDuration && relTime <= 0) {
        const x = timeToX(alignedTime, width);
        const y = midiToY(point.midiNote);

        // Find closest reference note for accuracy - compare at aligned time
        let error = 2;
        for (const ref of referenceData) {
          const dt = Math.abs(ref.time - alignedTime);
          if (dt < 0.3) {
            error = Math.abs(ref.midiNote - point.midiNote);
            break;
          }
        }

        // Color based on error
        if (error < 0.5) {
          ctx.fillStyle = '#22c55e';
        } else if (error < 1) {
          ctx.fillStyle = '#eab308';
        } else {
          ctx.fillStyle = '#ef4444';
        }
        
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw note labels on the left - cleaner look
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'right';
    const naturalNotesLabels = [0, 2, 4, 5, 7, 9, 11];
    for (let note = midiMin; note <= midiMax; note++) {
      if (naturalNotesLabels.includes(note % 12)) {
        const y = midiToY(note);
        ctx.fillText(midiToName(note), 34, y + 4);
      }
    }

  }, [referenceData, liveData, currentTime, latencyOffset, midiMin, midiMax, midiToY, timeToX]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  // Handle click to seek
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek || !canvasRef.current || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const totalDuration = pastDuration + futureDuration;
    const clickedTime = ((x / width) * totalDuration) - pastDuration + currentTime;
    onSeek(Math.max(0, clickedTime));
  };

  return (
    <div ref={containerRef} className="w-full relative">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="cursor-pointer w-full rounded-lg border border-gray-200"
        style={{ height: CANVAS_HEIGHT }}
      />
    </div>
  );
}
