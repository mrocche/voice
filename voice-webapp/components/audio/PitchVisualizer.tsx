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

const CANVAS_HEIGHT = 380;
const LABEL_WIDTH = 56;

// Standard voice range bands [name, midiLow, midiHigh, lightColor, darkColor]
const VOICE_RANGES: [string, number, number, string, string][] = [
  ['Bass',          36, 48, 'rgba(99,102,241,0.06)',  'rgba(99,102,241,0.10)'],
  ['Baritone',      43, 55, 'rgba(139,92,246,0.06)',  'rgba(139,92,246,0.10)'],
  ['Tenor',         48, 60, 'rgba(59,130,246,0.06)',  'rgba(59,130,246,0.10)'],
  ['Alto',          53, 65, 'rgba(16,185,129,0.06)',  'rgba(16,185,129,0.10)'],
  ['Mezzo',         57, 69, 'rgba(245,158,11,0.06)',  'rgba(245,158,11,0.10)'],
  ['Soprano',       60, 84, 'rgba(239,68,68,0.06)',   'rgba(239,68,68,0.10)'],
];

interface CanvasTheme {
  bg: string;
  blackKeyBg: string;
  gridLine: string;
  staffLine: string;
  labelText: string;
  labelDim: string;
  nowLine: string;
  nowGlow: string;
  nowLabel: string;
  refBar: string;
  refBarGlow: string;
  liveGood: string;
  liveGoodGlow: string;
  liveBad: string;
  liveBadGlow: string;
  rangeIdx: number; // 0=light, 1=dark
}

function getTheme(isDark: boolean): CanvasTheme {
  if (isDark) {
    return {
      bg:           '#0f172a',
      blackKeyBg:   '#1e293b',
      gridLine:     '#1e293b',
      staffLine:    '#334155',
      labelText:    '#94a3b8',
      labelDim:     '#475569',
      nowLine:      '#a5b4fc',
      nowGlow:      'rgba(165,180,252,0.35)',
      nowLabel:     '#c7d2fe',
      refBar:       '#818cf8',
      refBarGlow:   'rgba(129,140,248,0.4)',
      liveGood:     '#4ade80',
      liveGoodGlow: 'rgba(74,222,128,0.55)',
      liveBad:      '#f87171',
      liveBadGlow:  'rgba(248,113,113,0.45)',
      rangeIdx:     1,
    };
  }
  return {
    bg:           '#f8fafc',
    blackKeyBg:   '#f1f5f9',
    gridLine:     '#e2e8f0',
    staffLine:    '#cbd5e1',
    labelText:    '#64748b',
    labelDim:     '#94a3b8',
    nowLine:      '#4f46e5',
    nowGlow:      'rgba(79,70,229,0.18)',
    nowLabel:     '#4338ca',
    refBar:       '#6366f1',
    refBarGlow:   'rgba(99,102,241,0.25)',
    liveGood:     '#16a34a',
    liveGoodGlow: 'rgba(22,163,74,0.35)',
    liveBad:      '#dc2626',
    liveBadGlow:  'rgba(220,38,38,0.3)',
    rangeIdx:     0,
  };
}

// Merge consecutive PitchPoints into bar segments for rendering
interface BarSegment {
  startTime: number;
  endTime: number;
  midiNote: number; // average
}

function buildBarSegments(points: PitchPoint[], maxGap = 0.12, maxSemitoneSpread = 0.6): BarSegment[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.time - b.time);
  const segments: BarSegment[] = [];
  let segStart = sorted[0].time;
  let segEnd = sorted[0].time;
  let segMidi = sorted[0].midiNote;
  let segCount = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const gap = curr.time - prev.time;
    const semDiff = Math.abs(curr.midiNote - segMidi / segCount);

    if (gap <= maxGap && semDiff <= maxSemitoneSpread) {
      // Extend current segment
      segEnd = curr.time;
      segMidi += curr.midiNote;
      segCount++;
    } else {
      segments.push({ startTime: segStart, endTime: segEnd, midiNote: segMidi / segCount });
      segStart = curr.time;
      segEnd = curr.time;
      segMidi = curr.midiNote;
      segCount = 1;
    }
  }
  segments.push({ startTime: segStart, endTime: segEnd, midiNote: segMidi / segCount });
  return segments;
}

export function PitchVisualizer({
  referenceData,
  liveData,
  currentTime,
  latencyOffset = 0,
  midiMin = 36,
  midiMax = 84,
  pastDuration = 5,
  futureDuration = 10,
  onSeek,
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

  // Pixel height of one MIDI semitone
  const semitoneH = useCallback(() => {
    return CANVAS_HEIGHT / (midiMax - midiMin);
  }, [midiMin, midiMax]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Read dark mode from the html element class (managed by ThemeProvider)
    const isDark = document.documentElement.classList.contains('dark');
    const t = getTheme(isDark);

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${CANVAS_HEIGHT}px`;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const sh = semitoneH();

    // ── Background ────────────────────────────────────────────────────────────
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, width, CANVAS_HEIGHT);

    // ── Voice range bands ─────────────────────────────────────────────────────
    for (const [, low, high, lightColor, darkColor] of VOICE_RANGES) {
      const clampedLow = Math.max(low, midiMin);
      const clampedHigh = Math.min(high, midiMax);
      if (clampedLow >= clampedHigh) continue;
      const yTop = midiToY(clampedHigh);
      const yBot = midiToY(clampedLow);
      ctx.fillStyle = isDark ? darkColor : lightColor;
      ctx.fillRect(LABEL_WIDTH, yTop, width - LABEL_WIDTH, yBot - yTop);
    }

    // ── Semitone grid (half-step rows) ────────────────────────────────────────
    // Shade the "black key" rows (sharps/flats) slightly
    const blackKeys = [1, 3, 6, 8, 10]; // C#, D#, F#, G#, A#
    for (let note = midiMin; note <= midiMax; note++) {
      if (blackKeys.includes(note % 12)) {
        const y = midiToY(note);
        ctx.fillStyle = t.blackKeyBg;
        ctx.fillRect(LABEL_WIDTH, y, width - LABEL_WIDTH, sh);
      }
    }

    // ── Grid lines (every semitone) ───────────────────────────────────────────
    ctx.strokeStyle = t.gridLine;
    ctx.lineWidth = 0.5;
    for (let note = midiMin; note <= midiMax; note++) {
      const y = midiToY(note);
      ctx.beginPath();
      ctx.moveTo(LABEL_WIDTH, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // ── Natural-note staff lines ──────────────────────────────────────────────
    const naturalNotes = [0, 2, 4, 5, 7, 9, 11];
    ctx.strokeStyle = t.staffLine;
    ctx.lineWidth = 0.8;
    for (let note = midiMin; note <= midiMax; note++) {
      if (naturalNotes.includes(note % 12)) {
        const y = midiToY(note);
        ctx.beginPath();
        ctx.moveTo(LABEL_WIDTH, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    // ── Reference bars ────────────────────────────────────────────────────────
    const visibleRef = referenceData.filter(p => {
      const relTime = p.time - currentTime;
      return relTime >= -pastDuration - 0.2 && relTime <= futureDuration + 0.2;
    });
    const refSegments = buildBarSegments(visibleRef);
    const barH = Math.max(4, sh * 0.55);
    const barRadius = barH / 2;

    ctx.shadowBlur = 6;
    ctx.shadowColor = t.refBarGlow;
    ctx.fillStyle = t.refBar;

    for (const seg of refSegments) {
      const x1 = timeToX(seg.startTime, width);
      const x2 = timeToX(seg.endTime, width);
      const y = midiToY(seg.midiNote) - barH / 2;
      const segWidth = Math.max(4, x2 - x1);

      // Rounded rect bar
      ctx.beginPath();
      ctx.moveTo(x1 + barRadius, y);
      ctx.lineTo(x1 + segWidth - barRadius, y);
      ctx.quadraticCurveTo(x1 + segWidth, y, x1 + segWidth, y + barH / 2);
      ctx.quadraticCurveTo(x1 + segWidth, y + barH, x1 + segWidth - barRadius, y + barH);
      ctx.lineTo(x1 + barRadius, y + barH);
      ctx.quadraticCurveTo(x1, y + barH, x1, y + barH / 2);
      ctx.quadraticCurveTo(x1, y, x1 + barRadius, y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // ── NOW line ──────────────────────────────────────────────────────────────
    const nowTimeAdjusted = currentTime - latencyOffset;
    const nowX = timeToX(nowTimeAdjusted, width);

    // Glow halo
    const glowGrad = ctx.createLinearGradient(nowX - 12, 0, nowX + 12, 0);
    glowGrad.addColorStop(0, 'transparent');
    glowGrad.addColorStop(0.5, t.nowGlow);
    glowGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(nowX - 12, 0, 24, CANVAS_HEIGHT);

    // Main line
    ctx.strokeStyle = t.nowLine;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(nowX, 0);
    ctx.lineTo(nowX, CANVAS_HEIGHT);
    ctx.stroke();

    // Arrowhead at top
    ctx.fillStyle = t.nowLine;
    ctx.beginPath();
    ctx.moveTo(nowX, 8);
    ctx.lineTo(nowX - 6, 0);
    ctx.lineTo(nowX + 6, 0);
    ctx.closePath();
    ctx.fill();

    // Label
    ctx.fillStyle = t.nowLabel;
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NOW', nowX, 22);

    // ── Live dots (with trailing fade) ───────────────────────────────────────
    const visibleLive = liveData
      .map(p => ({ ...p, alignedTime: p.time - latencyOffset }))
      .filter(p => {
        const rel = p.alignedTime - currentTime;
        return rel >= -pastDuration && rel <= 0;
      });

    // Sort by time so we can compute trail opacity
    const sortedLive = [...visibleLive].sort((a, b) => a.alignedTime - b.alignedTime);
    const trailCount = 25; // last N dots get fade

    for (let i = 0; i < sortedLive.length; i++) {
      const p = sortedLive[i];
      const x = timeToX(p.alignedTime, width);
      const y = midiToY(p.midiNote);

      // Find closest reference for accuracy color
      let closestRef: PitchPoint | null = null;
      let closestDt = Infinity;
      for (const ref of referenceData) {
        const refRel = ref.time - currentTime;
        if (refRel >= -pastDuration && refRel <= futureDuration) {
          const dt = Math.abs(ref.time - p.alignedTime);
          if (dt < closestDt) {
            closestDt = dt;
            closestRef = ref;
          }
        }
      }

      const isGood = closestRef !== null
        && closestDt < 0.15
        && Math.abs(p.midiNote - closestRef.midiNote) <= 1;

      // Trail opacity: last trailCount dots fade from 0.3 → 1.0
      const trailPos = sortedLive.length - 1 - i;
      const opacity = trailPos < trailCount
        ? 0.3 + (0.7 * (trailCount - trailPos) / trailCount)
        : 0.3;

      ctx.globalAlpha = opacity;
      ctx.shadowBlur = trailPos < trailCount ? 8 : 0;
      ctx.shadowColor = isGood ? t.liveGoodGlow : t.liveBadGlow;
      ctx.fillStyle = isGood ? t.liveGood : t.liveBad;

      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // ── Left label panel ──────────────────────────────────────────────────────
    // Separator line between labels and grid
    ctx.strokeStyle = t.staffLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LABEL_WIDTH, 0);
    ctx.lineTo(LABEL_WIDTH, CANVAS_HEIGHT);
    ctx.stroke();

    // Background for label column
    ctx.fillStyle = isDark ? 'rgba(15,23,42,0.85)' : 'rgba(248,250,252,0.92)';
    ctx.fillRect(0, 0, LABEL_WIDTH - 1, CANVAS_HEIGHT);

    // Octave C labels only (C2, C3, C4, ...)
    ctx.fillStyle = t.labelText;
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (let note = midiMin; note <= midiMax; note++) {
      if (note % 12 === 0) { // C notes
        const y = midiToY(note);
        ctx.fillText(midiToName(note), LABEL_WIDTH - 6, y + 4);

        // Tick mark
        ctx.strokeStyle = t.labelText;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(LABEL_WIDTH - 4, y);
        ctx.lineTo(LABEL_WIDTH, y);
        ctx.stroke();
      }
    }

    // Voice range labels (centered vertically in their band)
    ctx.font = '8px system-ui, sans-serif';
    ctx.textAlign = 'left';
    for (const [name, low, high] of VOICE_RANGES) {
      const clampedLow = Math.max(low, midiMin);
      const clampedHigh = Math.min(high, midiMax);
      if (clampedLow >= clampedHigh) continue;
      const yCtr = (midiToY(clampedHigh) + midiToY(clampedLow)) / 2;
      ctx.fillStyle = t.labelDim;
      // Rotate text 90deg
      ctx.save();
      ctx.translate(8, yCtr);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(name, -ctx.measureText(name).width / 2, 0);
      ctx.restore();
    }

  }, [referenceData, liveData, currentTime, latencyOffset, midiMin, midiMax,
      midiToY, timeToX, semitoneH, pastDuration, futureDuration]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);

    // Re-draw when the html element's class list changes (theme toggled)
    const observer = new MutationObserver(draw);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, [draw]);

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
        className="cursor-pointer w-full"
        style={{ height: CANVAS_HEIGHT }}
      />
    </div>
  );
}
