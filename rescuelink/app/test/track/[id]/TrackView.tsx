"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { api, ApiError, usePoll } from "@/lib/client";
import type { Incident, IncidentStatus, Track } from "@/lib/types";
import MapLazy, { type MapMarker } from "@/components/MapLazy";
import { Card, COLORS, ErrorBox, LimitedProfile, Page, SeverityBadge } from "@/components/ui";

const STEPS: { key: IncidentStatus; label: string }[] = [
  { key: "assigned", label: "Assigned" },
  { key: "en_route", label: "On the way" },
  { key: "at_scene", label: "At scene" },
  { key: "transporting", label: "To hospital" },
  { key: "arrived", label: "Arrived" },
];

async function loadIncident(id: string): Promise<Incident> {
  try {
    return await api<Incident>(`/api/incidents/${id}`);
  } catch (e) {
    // a logged-in account unrelated to this incident gets 403: fall back to the public view
    if (e instanceof ApiError && (e.status === 403 || e.status === 401)) {
      return api<Incident>(`/api/incidents/${id}`, { auth: false });
    }
    throw e;
  }
}

export default function TrackView() {
  const { id } = useParams<{ id: string }>();
  const [inc, setInc] = useState<Incident | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const [error, setError] = useState<string | null>(null);

  usePoll(
    async () => {
      try {
        const [i, t] = await Promise.all([
          loadIncident(id),
          api<Track>(`/api/incidents/${id}/track`, { auth: false }),
        ]);
        setInc(i);
        setTrack(t);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    3000,
    [id],
  );

  const status = track?.status ?? inc?.status;
  const stepIdx = STEPS.findIndex((s) => s.key === status);
  const dist = track?.distance_to_patient_km ?? track?.distance_to_hospital_km ?? null;

  const markers: MapMarker[] = [];
  const patient = track?.patient_location ?? inc?.location ?? null;
  if (patient) markers.push({ lat: patient.lat, lng: patient.lng, color: COLORS.patient, label: "Patient" });
  if (track?.ambulance_position)
    markers.push({ ...track.ambulance_position, color: COLORS.ambulance, label: inc?.ambulance?.call_sign ?? "Ambulance" });
  const hosp = track?.hospital_location ?? inc?.hospital?.location ?? null;
  if (hosp) markers.push({ ...hosp, color: COLORS.hospital, label: inc?.hospital?.name ?? "Hospital" });

  const line =
    track?.ambulance_position && patient && (status === "assigned" || status === "en_route")
      ? ([track.ambulance_position, patient] as [typeof patient, typeof patient])
      : track?.ambulance_position && hosp && status === "transporting"
        ? ([track.ambulance_position, hosp] as [typeof hosp, typeof hosp])
        : null;

  return (
    <Page title="Tracking">
      <ErrorBox error={error} />
      {!inc && !error && <p>Loading incident…</p>}
      {inc && (
        <>
          <div className="text-center">
            <div className="text-sm text-zinc-500">Reference</div>
            <div className="font-mono text-4xl font-black tracking-wider">{inc.ref_code}</div>
          </div>

          {status === "no_ambulance" && (
            <div className="rounded bg-red-600 p-4 text-center text-xl font-bold text-white">
              No ambulance available — call 1122
            </div>
          )}
          {status === "closed" && (
            <div className="rounded bg-zinc-700 p-3 text-center font-bold text-white">Incident closed</div>
          )}

          {status !== "no_ambulance" && status !== "closed" && (
            <div className="flex gap-1">
              {STEPS.map((s, i) => (
                <div
                  key={s.key}
                  className={`flex-1 rounded px-1 py-2 text-center text-xs font-semibold ${
                    i < stepIdx ? "bg-green-200 text-green-900" : i === stepIdx ? "bg-green-600 text-white" : "bg-zinc-200 text-zinc-500"
                  }`}
                >
                  {s.label}
                </div>
              ))}
            </div>
          )}

          <Card>
            {inc.ambulance ? (
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xl font-bold">{inc.ambulance.call_sign}</div>
                  <div className="text-sm text-zinc-600">
                    {inc.ambulance.vehicle_type} · {inc.ambulance.service_name}
                    {inc.ambulance.plate ? ` · ${inc.ambulance.plate}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  {dist != null && <div className="text-xl font-bold">{dist.toFixed(2)} km</div>}
                  {track?.eta_min != null && <div className="text-sm">{track.eta_min.toFixed(1)} min (estimate)</div>}
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-600">No ambulance assigned yet.</p>
            )}
            {inc.hospital && (
              <div className="text-sm">
                Hospital: <b>{inc.hospital.name}</b>
                {inc.hospital.phone ? ` · ${inc.hospital.phone}` : ""}
              </div>
            )}
          </Card>

          {patient && <MapLazy center={patient} zoom={14} markers={markers} line={line} recenter={false} height={300} />}

          <Card>
            <div className="flex items-center gap-2">
              <SeverityBadge severity={inc.triage?.severity} />
              <span className="font-semibold capitalize">{inc.triage?.category}</span>
              {inc.triage?.source === "fallback" && <span className="text-xs text-zinc-500">(rule-based)</span>}
            </div>
            {inc.triage?.first_aid_steps?.length > 0 && (
              <>
                <h2 className="pt-2 text-lg font-bold">What to do now</h2>
                <ol className="list-decimal space-y-2 pl-6 text-lg">
                  {inc.triage.first_aid_steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </>
            )}
          </Card>

          {inc.identity?.profile && (
            <Card>
              <h2 className="font-bold">Patient ({inc.identity.status})</h2>
              <LimitedProfile profile={inc.identity.profile} />
            </Card>
          )}
        </>
      )}
    </Page>
  );
}
