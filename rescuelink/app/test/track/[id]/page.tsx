import { Suspense } from "react";
import TrackView from "./TrackView";

export default function TrackPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-xl p-4">Loading…</main>}>
      <TrackView />
    </Suspense>
  );
}
