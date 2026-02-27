import { notFound } from 'next/navigation';
import { getSongById } from '@/lib/storage';
import { PracticeView } from '@/components/practice/PracticeView';

interface PracticePageProps {
  params: Promise<{ songId: string }>;
}

export default async function PracticePage({ params }: PracticePageProps) {
  const { songId } = await params;
  const song = getSongById(songId);

  if (!song) {
    notFound();
  }

  return <PracticeView song={song} />;
}
