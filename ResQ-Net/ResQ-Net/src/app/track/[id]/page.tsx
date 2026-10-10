import { Suspense } from 'react';
import TrackView from './TrackView';

export default function TrackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full bg-[#030712]" />}>
      <TrackView />
    </Suspense>
  );
}
