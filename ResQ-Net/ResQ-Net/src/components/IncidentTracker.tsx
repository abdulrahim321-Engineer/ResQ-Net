'use client';

// Live view of one incident for the caller (citizen or anonymous reporter).
// Polls GET /api/incidents/:id (public view) + /track every 3 s.
import React, { useState } from 'react';
import { Copy, Hospital, PhoneCall, Share2, Truck, Clock, CheckCircle2 } from 'lucide-react';
import { Api, ApiError } from '@/lib/api';
import { usePoll } from '@/lib/hooks';
import type { Incident, Track } from '@/lib/types';
import {
  ago, ambulanceLabel, formatEta, formatKm, isActiveStatus, patientView, readinessInfo, statusInfo,
} from '@/lib/mappers';
import {
  ErrorBanner, PatientCard, ProgressSteps, SectionTitle, StatusBadge, SyncState, TacticalMap, Timeline, TriageCard,
} from '@/components/ui';
import type { MapLine } from '@/components/Map';

async function loadIncident(id: string): Promise<Incident> {
  try {
    return await Api.incident(id, 'optional');
  } catch (e) {
    // A logged-in hospital/crew account unrelated to this incident gets 403: use the public view.
    if (e instanceof ApiError && e.status === 403) return Api.incident(id, 'none');
    throw e;
  }
}

export default function IncidentTracker({ id, initial }: { id: string; initial?: Incident | null }) {
  const [inc, setInc] = useState<Incident | null>(initial ?? null);
  const [track, setTrack] = useState<Track | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  const { error } = usePoll(async () => {
    try {
      const [i, t] = await Promise.all([loadIncident(id), Api.track(id)]);
      setInc(i);
      setTrack(t);
      setNotFound(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) { setNotFound(true); return; }
      throw e;
    }
  }, 3000, !notFound, id);

  if (notFound) {
    return <ErrorBanner message="We couldn't find this emergency. The link may be wrong or the incident was removed." />;
  }
  if (!inc) {
    return (
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <div className="h-64 rounded-3xl bg-slate-900/60 border border-slate-800 animate-pulse flex items-center justify-center">
          <p className="font-mono text-[#00F5D4] text-xs tracking-widest">CONNECTING TO LIVE INCIDENT...</p>
        </div>
      </div>
    );
  }

  const status = track?.status ?? inc.status;
  const s = statusInfo(status);
  const patient = { lat: inc.location.lat, lng: inc.location.lng };
  const ambPos = track?.ambulance_position ?? null;
  const hospPos = track?.hospital_location ?? inc.hospital?.location ?? null;
  const lines: MapLine[] = [];
  if (ambPos && (status === 'assigned' || status === 'en_route')) lines.push({ from: ambPos, to: patient, color: '#00F5D4' });
  if (ambPos && hospPos && status === 'transporting') lines.push({ from: ambPos, to: hospPos, color: '#10B981' });
  if (!ambPos && hospPos && isActiveStatus(status)) lines.push({ from: patient, to: hospPos, color: '#10B98155' });
  const legKm = status === 'transporting' ? track?.distance_to_hospital_km : track?.distance_to_patient_km;
  const readiness = readinessInfo(inc.hospital_status?.readiness);
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/track/${inc.id}` : `/track/${inc.id}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: link is visible to copy manually */ }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
      {/* Map */}
      <div className="xl:col-span-2 bg-slate-900/50 rounded-3xl relative min-h-[420px] xl:min-h-[600px] border border-slate-800/80 shadow-2xl p-2">
        <div className="absolute inset-2">
          <TacticalMap
            patient={patient}
            patientLabel={inc.location.address ?? undefined}
            ambulances={ambPos && inc.ambulance ? [{ id: inc.ambulance.id, label: ambulanceLabel(inc.ambulance), position: ambPos, highlight: true, sub: s.short }] : []}
            hospitals={inc.hospital && hospPos ? [{ id: inc.hospital.id, name: inc.hospital.name, location: hospPos, highlight: true, sub: readiness.label }] : []}
            lines={lines}
            fitKey={`${inc.id}-${status}-${ambPos ? 1 : 0}`}
          />
        </div>

        {/* Telemetry overlay */}
        <div className="absolute top-5 left-5 right-5 sm:right-auto z-[1000] bg-slate-950/95 p-4 rounded-2xl border-l-4 shadow-2xl backdrop-blur-xl border-t border-r border-b border-slate-800 max-w-sm" style={{ borderLeftColor: s.color }}>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Truck className="text-[#00F5D4]" size={18} />
            <span className="font-bold text-white text-sm">{ambulanceLabel(inc.ambulance)}</span>
            <StatusBadge status={status} />
          </div>
          <div className="flex items-end gap-4">
            <div>
              <p className="text-[9px] text-slate-500 font-mono tracking-widest">
                {status === 'transporting' ? 'ETA TO HOSPITAL' : 'AMBULANCE ETA'}
              </p>
              <p className="text-3xl font-black tabular-nums text-[#00F5D4]">{formatEta(track?.eta_min)}</p>
              <p className="text-[9px] font-mono text-slate-500">{track?.eta_min != null ? `${formatKm(legKm)} · straight-line estimate` : s.label}</p>
            </div>
            <div className="pb-1 min-w-0">
              <p className="text-[9px] text-slate-500 font-mono">TARGET HOSPITAL</p>
              <p className="text-xs text-slate-300 font-mono truncate">{inc.hospital?.name ?? 'Selecting…'}</p>
              {ambPos && <p className="text-[9px] text-slate-500 font-mono mt-1">GPS {ago(track?.ambulance_last_seen_at)}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Side panel */}
      <div className="flex flex-col gap-3">
        <div className="bg-slate-900/70 rounded-3xl p-5 border border-slate-800 space-y-3">
          <SectionTitle icon={<Clock size={16} />} right={<SyncState error={error} />}>
            {inc.ref_code}
          </SectionTitle>
          <p className="text-sm font-bold" style={{ color: s.color }}>{s.label}</p>
          <ProgressSteps status={status} />
          {status === 'no_ambulance' && (
            <a href="tel:1122" className="flex items-center justify-center gap-2 w-full bg-[#FF2A5F] text-white font-extrabold py-3 rounded-xl">
              <PhoneCall size={16} /> CALL 1122 NOW
            </a>
          )}
          {status === 'arrived' || status === 'closed' ? (
            <p className="text-[11px] font-mono text-[#10B981] flex items-center gap-1.5"><CheckCircle2 size={14} /> Patient handed over to {inc.hospital?.name ?? 'the hospital'}.</p>
          ) : null}
          <ErrorBanner message={error} />
        </div>

        <TriageCard triage={inc.triage} />
        <PatientCard p={patientView(inc)} title="Patient (shared with crew & ER)" />

        {inc.hospital && (
          <div className="bg-slate-900/60 rounded-3xl p-5 border border-slate-800">
            <SectionTitle icon={<Hospital size={16} />} color="#10B981" right={
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full font-bold border" style={{ color: readiness.color, borderColor: `${readiness.color}55`, background: `${readiness.color}18` }}>{readiness.short}</span>
            }>Hospital ER Readiness</SectionTitle>
            <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800 font-mono text-xs space-y-2">
              <div className="flex justify-between gap-2"><span className="text-slate-500">Destination</span><span className="text-white font-bold text-right">{inc.hospital.name}</span></div>
              <div className="flex justify-between gap-2"><span className="text-slate-500">ER status</span><span className="font-bold" style={{ color: readiness.color }}>{readiness.label}</span></div>
              {inc.hospital.phone && (
                <div className="flex justify-between gap-2"><span className="text-slate-500">ER phone</span><a href={`tel:${inc.hospital.phone}`} className="text-[#00F5D4] font-bold">{inc.hospital.phone}</a></div>
              )}
            </div>
          </div>
        )}

        <div className="bg-slate-900/60 rounded-3xl p-5 border border-slate-800">
          <SectionTitle icon={<Clock size={16} />}>Live Incident Timeline</SectionTitle>
          <Timeline incident={inc} />
        </div>

        <div className="bg-slate-900/60 rounded-3xl p-4 border border-slate-800 space-y-2">
          <p className="text-[10px] font-mono text-slate-400 tracking-widest flex items-center gap-1.5"><Share2 size={12} /> SHARE LIVE TRACKING (NO LOGIN NEEDED)</p>
          <div className="flex gap-2">
            <input readOnly value={shareUrl} className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-[10px] font-mono text-slate-300" onFocus={(e) => e.target.select()} />
            <button onClick={copyLink} className="flex items-center gap-1 text-[10px] font-mono font-bold text-black bg-[#00F5D4] px-3 rounded-lg"><Copy size={12} />{copied ? 'COPIED' : 'COPY'}</button>
          </div>
          <a href={`https://wa.me/?text=${encodeURIComponent(`Track the ambulance live (ResQ Net ${inc.ref_code}): ${shareUrl}`)}`} target="_blank" rel="noreferrer" className="block text-center text-[10px] font-mono font-bold text-[#10B981] border border-[#10B981]/40 rounded-lg py-1.5">SHARE ON WHATSAPP</a>
        </div>
      </div>
    </div>
  );
}
