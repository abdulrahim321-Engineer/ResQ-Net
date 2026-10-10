"use client";

import dynamic from "next/dynamic";

const MapLazy = dynamic(() => import("./Map"), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded bg-zinc-200" />,
});

export default MapLazy;
export type { MapMarker, MapProps } from "./Map";
