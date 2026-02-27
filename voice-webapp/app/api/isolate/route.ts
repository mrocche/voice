import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { getSongs, getSongById } from '@/lib/storage';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { songId } = await request.json();

    if (!songId) {
      return NextResponse.json({ error: 'Song ID required' }, { status: 400 });
    }

    const song = getSongById(songId);
    if (!song) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    if (song.isProcessed) {
      return NextResponse.json({ error: 'Song already processed' }, { status: 400 });
    }

    const inputPath = path.join(process.cwd(), 'public', 'audio', song.filename);
    
    if (!fs.existsSync(inputPath)) {
      return NextResponse.json({ error: 'Audio file not found' }, { status: 404 });
    }

    // Run demucs
    const outputDir = path.join(process.cwd(), 'temp_separated');
    const command = `demucs --two-stems=vocals -o "${outputDir}" "${inputPath}"`;

    try {
      await execAsync(command);
    } catch (execError) {
      console.error('Demucs error:', execError);
      return NextResponse.json({ error: 'Failed to isolate vocals' }, { status: 500 });
    }

    // Find the generated vocal file
    const stemName = song.filename.replace(/\.[^/.]+$/, '');
    const generatedVocalPath = path.join(outputDir, 'htdemucs', stemName, 'vocals.wav');
    const targetVocalPath = path.join(process.cwd(), 'public', 'audio', 'vocals', `${stemName}_vocals.wav`);

    if (!fs.existsSync(generatedVocalPath)) {
      // Try alternative path
      const altPath = path.join(outputDir, stemName, 'vocals.wav');
      if (fs.existsSync(altPath)) {
        // Move to target
        const vocalsDir = path.dirname(targetVocalPath);
        if (!fs.existsSync(vocalsDir)) {
          fs.mkdirSync(vocalsDir, { recursive: true });
        }
        fs.renameSync(altPath, targetVocalPath);
      } else {
        return NextResponse.json({ error: 'Vocal file not found after processing' }, { status: 500 });
      }
    } else {
      // Move to target
      const vocalsDir = path.dirname(targetVocalPath);
      if (!fs.existsSync(vocalsDir)) {
        fs.mkdirSync(vocalsDir, { recursive: true });
      }
      fs.renameSync(generatedVocalPath, targetVocalPath);
    }

    // Clean up temp directory
    try {
      fs.rmSync(outputDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }

    // Update song in storage
    const songs = getSongs();
    const songIndex = songs.findIndex(s => s.id === songId);
    if (songIndex !== -1) {
      songs[songIndex].vocalFilename = `${stemName}_vocals.wav`;
      songs[songIndex].isProcessed = true;
      const { saveSongs } = await import('@/lib/storage');
      saveSongs(songs);
    }

    return NextResponse.json({ success: true, vocalFilename: `${stemName}_vocals.wav` });
  } catch (error) {
    console.error('Error in vocal isolation:', error);
    return NextResponse.json({ error: 'Failed to isolate vocals' }, { status: 500 });
  }
}
