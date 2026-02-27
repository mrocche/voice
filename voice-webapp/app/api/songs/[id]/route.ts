import { NextRequest, NextResponse } from 'next/server';
import { deleteSong, updateSong } from '@/lib/storage';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const success = deleteSong(id);
    
    if (!success) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting song:', error);
    return NextResponse.json({ error: 'Failed to delete song' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    
    const trimmedName = body.name.trim();
    if (trimmedName.length === 0) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    }
    
    if (trimmedName.length > 100) {
      return NextResponse.json({ error: 'Name too long (max 100 characters)' }, { status: 400 });
    }
    
    const updatedSong = updateSong(id, { name: trimmedName });
    
    if (!updatedSong) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }
    
    return NextResponse.json(updatedSong);
  } catch (error) {
    console.error('Error updating song:', error);
    return NextResponse.json({ error: 'Failed to update song' }, { status: 500 });
  }
}
