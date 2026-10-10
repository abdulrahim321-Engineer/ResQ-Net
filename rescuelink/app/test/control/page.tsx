"use client";

import Link from "next/link";
import { useState } from "react";
import { api, DEFAULT_POS, usePoll } from "@/lib/client";
import type { Ambulance, Hospital, IncidentStatus, LatLng } from "@/lib/types";
import MapLazy, { type MapMarker } from "@/components/MapLazy";
import { Card, COLORS, ErrorBox, SeverityBadge } from "@/components/ui";

type Overview = {
  counts: { active_incidents: number; ambulances_online: number; ambulances_available: number; live_hospitals: number };
  ambulances: Ambulance[];
  hospitals: Hospital[];
  incidents: {
    id: string;
    ref_code: string;
    status: IncidentStatus;
    severity: string;
    category: string;
    location: LatLng;
    ambulance_call_sign: string | null;
    hospital_name: string | null;
  }[];
};

const ambColor = (s: Ambulance["status"]) =>
  s === "available" ? COLORS.ambulance : s === "offline" ? COLORS.offline : COLORS.busy;

export default function ControlPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  usePoll(async () => {
    try {
      setData(await api<Overview>("/api/control/overview", { auth: false }));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, 3000);

  const markers: MapMarker[] = [];
  data?.hospitals.forEach((h) => markers.push({ ...h.location, color: COLORS.hospital, label: h.name }));
  data?.ambulances.forEach((a) => {
    if (a.position) markers.push({ ...a.position, color: ambColor(a.status), label: `${a.call_sign} (${a.status})` });
  });
  data?.incidents.forEach((i) =>
    markers.push({ lat: i.location.lat, lng: i.location.lng, color: COLORS.patient, label: `${i.ref_code} ${i.severity}` }),
  );

  const tiles: [string, number | undefined][] = [
    ["Active incidents", data?.counts.active_incidents],
    ["Ambulances online", data?.counts.ambulances_online],
    ["Available", data?.counts.ambulances_available],
    ["Live hospitals", data?.counts.live_hospitals],
  ];

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Control room</h1>
        <Link href="/test" className="text-sm text-blue-700 underline">
          /test
        </Link>
      </div>
      <ErrorBox error={error} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map(([label, n]) => (
          <div key={label} className="rounded border border-zinc-300 bg-white p-3 text-center">
            <div className="text-3xl font-black">{n ?? "–"}</div>
            <div className="text-xs text-zinc-600">{label}</div>
          </div>
        ))}
      </div>
      <MapLazy center={DEFAULT_POS} zoom={12} markers={markers} recenter={false} height={420} />
      <p className="text-xs text-zinc-600">
        Green = ambulance available · Orange = assigned/busy · Grey = offline · Blue = hospital · Red = incident
      </p>
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-300">
              <th className="py-1">Ref</th>
              <th>Status</th>
              <th>Severity</th>
              <th>Category</th>
              <th>Ambulance</th>
              <th>Hospital</th>
            </tr>
          </thead>
          <tbody>
            {data?.incidents.map((i) => (
              <tr key={i.id} className="border-b border-zinc-100">
                <td className="py-1">
                  <Link className="font-mono font-bold text-blue-700 underline" href={`/test/track/${i.id}`}>
                    {i.ref_code}
                  </Link>
                </td>
                <td>{i.status}</td>
                <td>
                  <SeverityBadge severity={i.severity} />
                </td>
                <td className="capitalize">{i.category}</td>
                <td>{i.ambulance_call_sign ?? "–"}</td>
                <td>{i.hospital_name ?? "–"}</td>
              </tr>
            ))}
            {data && data.incidents.length === 0 && (
              <tr>
                <td colSpan={6} className="py-2 text-zinc-500">
                  No incidents.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
