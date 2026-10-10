'use client';

// SOS / accident report. Works with or without login (POST /api/incidents, token optional).
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, Crosshair, Loader2, MapPin, ScanLine, Siren, X, ShieldCheck, ImageIcon } from 'lucide-react';
import { Api, errorMessage, type ScanResult } from '@/lib/api';
import { compressImage } from '@/lib/image';
import { DEFAULT_POS, getCurrentPosition, vibrate } from '@/lib/hooks';
import type { Incident, LatLng } from '@/lib/types';
import { ErrorBanner, InfoBanner, TacticalMap, inputCls, labelCls } from '@/components/ui';

export const QUICK_CHIPS = [
  'Road accident', 'Chest pain', 'Breathing difficulty', 'Unconscious person', 'Severe bleeding',
  'Burns', 'Fall injury', 'Stroke symptoms', 'Pregnancy emergency', 'Child emergency',
];

const DISPATCH_STEPS = ['Running AI triage…', 'Finding the nearest ambulance…', 'Alerting the best-matched hospital…', 'Notifying emergency contacts…'];

type Props = {
  /** Logged-in citizen (enables "for myself"). */
  citizen?: { hasProfile: boolean; name: string; phone: string | null } | null;
  onCreated: (inc: Incident) => void;
};

export default function ReportForm({ citizen, onCreated }: Props) {
  const [pos, setPos] = useState<LatLng | null>(null);
  const [gpsState, setGpsState] = useState<'locating' | 'gps' | 'manual' | 'failed'>('locating');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [address, setAddress] = useState('');
  const [forSelf, setForSelf] = useState<boolean>(!!citizen?.hasProfile);
  const [chips, setChips] = useState<string[]>([]);
  const [details, setDetails] = useState('');
  const [reporterName, setReporterName] = useState(citizen?.name ?? '');
  const [reporterPhone, setReporterPhone] = useState(citizen?.phone ?? '');
  const [scene, setScene] = useState<{ base64: string; mime_type: string; preview: string } | null>(null);
  const [victim, setVictim] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [sending, setSending] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);

  async function locate() {
    setGpsState('locating');
    const fix = await getCurrentPosition(12000);
    if (fix) {
      setPos({ lat: fix.lat, lng: fix.lng });
      setAccuracy(fix.accuracy_m);
      setGpsState('gps');
    } else {
      setGpsState('failed');
      setPos((p) => p ?? null);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => { void locate(); }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  useEffect(() => {
    if (!sending) return;
    const t = setInterval(() => setStepIdx((i) => Math.min(i + 1, DISPATCH_STEPS.length - 1)), 3000);
    return () => clearInterval(t);
  }, [sending]);

  function pickOnMap(p: LatLng) {
    setPos(p);
    setAccuracy(null);
    setGpsState('manual');
  }

  async function onScenePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const img = await compressImage(file);
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      const preview = URL.createObjectURL(file);
      previewRef.current = preview;
      setScene({ base64: img.base64, mime_type: img.mime_type, preview });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function onVictimCnic(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScanning(true);
    setError(null);
    try {
      const img = await compressImage(file); // memory only; the CNIC image is never stored
      const r = await Api.scanCnic(img.base64, img.mime_type, 'identify');
      setVictim(r);
      vibrate(100);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setScanning(false);
    }
  }

  async function submit() {
    setError(null);
    if (!pos) { setError('We need the emergency location. Allow location access or tap the map to drop a pin.'); return; }
    const text = [chips.join(', '), details.trim()].filter(Boolean).join('. ');
    const description = text || 'Emergency reported, no details given yet.';
    setSending(true);
    setStepIdx(0);
    try {
      const self = !!citizen && forSelf;
      const inc = await Api.createIncident({
        lat: Number(pos.lat.toFixed(6)),
        lng: Number(pos.lng.toFixed(6)),
        address: address.trim() || null,
        description,
        reporter_name: reporterName.trim() || null,
        reporter_phone: reporterPhone.trim() || null,
        for_self: self || undefined,
        cnic: !self && victim?.extracted.cnic ? victim.extracted.cnic : null,
        scene_image_base64: scene?.base64 ?? null,
        mime_type: scene?.mime_type ?? null,
      });
      vibrate([200, 100, 200]);
      setVictim(null); // drop identity data from memory once sent
      onCreated(inc);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  const canSelf = !!citizen;
  const gpsText =
    gpsState === 'locating' ? 'Getting your GPS location…'
    : gpsState === 'gps' ? `GPS locked${accuracy ? ` (±${accuracy} m)` : ''}. Tap the map to adjust.`
    : gpsState === 'manual' ? 'Pin set on the map. Tap again to move it.'
    : 'GPS unavailable. Tap the map to drop the emergency pin.';

  return (
    <div className="space-y-4">
      {/* Location */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className={labelCls + ' mb-0'}>EMERGENCY LOCATION</span>
          <button type="button" onClick={locate} className="text-[10px] font-mono text-[#00F5D4] flex items-center gap-1"><Crosshair size={12} /> USE MY GPS</button>
        </div>
        <div className="relative h-56 rounded-2xl overflow-hidden border border-slate-800">
          <TacticalMap patient={pos} onMapClick={pickOnMap} center={pos ?? DEFAULT_POS} fitKey={gpsState === 'gps' && pos ? `gps-${pos.lat.toFixed(4)}` : 'init'} />
        </div>
        <p className={`text-[10px] font-mono mt-1.5 flex items-center gap-1 ${gpsState === 'failed' ? 'text-[#FFB703]' : 'text-slate-400'}`}>
          {gpsState === 'locating' ? <Loader2 size={11} className="animate-spin" /> : <MapPin size={11} />} {gpsText}
        </p>
        <input className={`${inputCls} mt-2`} placeholder="Address or landmark (optional), e.g. F-8 Markaz, near Kohsar Market" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>

      {/* Who */}
      {canSelf && (
        <div>
          <span className={labelCls}>WHO NEEDS HELP?</span>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setForSelf(true)} className={`py-2.5 rounded-xl text-xs font-bold font-mono border ${forSelf ? 'border-[#00F5D4] text-[#00F5D4] bg-[#00F5D4]/10' : 'border-slate-700 text-slate-400'}`}>ME</button>
            <button type="button" onClick={() => setForSelf(false)} className={`py-2.5 rounded-xl text-xs font-bold font-mono border ${!forSelf ? 'border-[#00F5D4] text-[#00F5D4] bg-[#00F5D4]/10' : 'border-slate-700 text-slate-400'}`}>SOMEONE ELSE</button>
          </div>
          {forSelf && !citizen?.hasProfile && (
            <div className="mt-2"><InfoBanner tone="warn">Your emergency profile is empty, so the ER won&apos;t see your blood group or allergies. <Link href="/profile" className="underline font-bold">Complete it</Link> (takes 1 minute).</InfoBanner></div>
          )}
        </div>
      )}

      {/* What */}
      <div>
        <span className={labelCls}>WHAT HAPPENED?</span>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {QUICK_CHIPS.map((c) => {
            const on = chips.includes(c);
            return (
              <button key={c} type="button" onClick={() => setChips((cs) => (on ? cs.filter((x) => x !== c) : [...cs, c]))}
                className={`text-[11px] px-2.5 py-1 rounded-full border font-mono ${on ? 'bg-[#FF2A5F]/20 border-[#FF2A5F] text-[#FF8FA8]' : 'border-slate-700 text-slate-400 hover:text-white'}`}>
                {c}
              </button>
            );
          })}
        </div>
        <textarea className={`${inputCls} min-h-[70px]`} maxLength={1500} placeholder="Describe briefly: injuries, how many people, conscious / breathing…" value={details} onChange={(e) => setDetails(e.target.value)} />
      </div>

      {/* Photos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="border border-dashed border-slate-700 hover:border-[#00F5D4] rounded-2xl p-3 flex items-center gap-3 cursor-pointer bg-slate-950/50">
          {scene ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={scene.preview} alt="Scene" className="w-12 h-12 object-cover rounded-lg" />
          ) : <ImageIcon size={22} className="text-slate-400" />}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-200">{scene ? 'Scene photo attached' : 'Scene photo (optional)'}</p>
            <p className="text-[10px] font-mono text-slate-500">Helps AI triage severity</p>
          </div>
          {scene && <button type="button" onClick={(e) => { e.preventDefault(); setScene(null); }} className="text-slate-400"><X size={16} /></button>}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onScenePhoto} />
        </label>

        {(!canSelf || !forSelf) && (
          <label className={`border border-dashed rounded-2xl p-3 flex items-center gap-3 bg-slate-950/50 ${scanning ? 'border-[#00F5D4] cursor-wait' : 'border-slate-700 hover:border-[#00F5D4] cursor-pointer'}`}>
            {scanning ? <Loader2 size={22} className="text-[#00F5D4] animate-spin" /> : victim ? <ShieldCheck size={22} className="text-[#10B981]" /> : <ScanLine size={22} className="text-slate-400" />}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-200">{scanning ? 'Reading CNIC…' : victim ? 'Victim CNIC scanned' : "Victim's CNIC (optional)"}</p>
              <p className="text-[10px] font-mono text-slate-500">Finds their medical profile · photo never stored</p>
            </div>
            {victim && !scanning && <button type="button" onClick={(e) => { e.preventDefault(); setVictim(null); }} className="text-slate-400"><X size={16} /></button>}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onVictimCnic} disabled={scanning} />
          </label>
        )}
      </div>

      {victim && (!canSelf || !forSelf) && <VictimResult r={victim} />}

      {/* Reporter (anonymous only) */}
      {!citizen && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className={labelCls}>YOUR NAME (OPTIONAL)</span>
            <input className={inputCls} value={reporterName} onChange={(e) => setReporterName(e.target.value)} />
          </div>
          <div>
            <span className={labelCls}>YOUR PHONE (OPTIONAL)</span>
            <input type="tel" className={inputCls} placeholder="03xx…" value={reporterPhone} onChange={(e) => setReporterPhone(e.target.value)} />
          </div>
        </div>
      )}

      <ErrorBanner message={error} onClose={() => setError(null)} />

      <button
        type="button"
        onClick={submit}
        disabled={sending || scanning || gpsState === 'locating' && !pos}
        className="w-full bg-gradient-to-r from-[#FF2A5F] to-[#d61745] text-white font-extrabold tracking-wider py-4 rounded-2xl shadow-[0_0_25px_rgba(255,42,95,0.4)] flex items-center justify-center gap-2 text-sm disabled:opacity-60"
      >
        {sending ? <Loader2 size={18} className="animate-spin" /> : <Siren size={18} />}
        <span>{sending ? DISPATCH_STEPS[stepIdx].toUpperCase() : 'SEND SOS · DISPATCH AMBULANCE'}</span>
      </button>
      {sending && <p className="text-center text-[10px] font-mono text-slate-500">This takes 5–15 seconds. Keep this screen open.</p>}
      {!sending && <p className="text-center text-[10px] font-mono text-slate-500 flex items-center justify-center gap-1"><Camera size={10} /> Photos are compressed on your phone. CNIC images are never saved.</p>}
    </div>
  );
}

function VictimResult({ r }: { r: ScanResult }) {
  const v = r.verification;
  if (!r.extracted.cnic || v === 'unreadable') {
    return <InfoBanner tone="warn">The CNIC couldn&apos;t be read. You can still send the SOS; the crew will identify the patient on scene.</InfoBanner>;
  }
  if (v === 'not_registered') {
    return <InfoBanner tone="info">CNIC read, but this person has no ResQ Net medical profile. The SOS will still be sent.</InfoBanner>;
  }
  if (v === 'name_mismatch') {
    return <InfoBanner tone="warn">The name on the card didn&apos;t match our records. The ER will verify identity on arrival.</InfoBanner>;
  }
  const p = r.profile;
  return (
    <div className="bg-[#10B981]/10 border border-[#10B981]/40 rounded-2xl p-3 font-mono text-xs space-y-1.5">
      <p className="text-[#10B981] font-bold flex items-center gap-1.5"><ShieldCheck size={14} /> IDENTITY MATCHED · medical profile will go to the ER</p>
      {p && (
        <>
          <p className="text-white">{p.first_name} · Blood group <span className="text-[#FF2A5F] font-bold">{p.blood_group ?? 'unknown'}</span></p>
          {p.critical_alerts.length > 0 && <ul className="text-[#FFB703] text-[11px]">{p.critical_alerts.map((a, i) => <li key={i}>⚠ {a}</li>)}</ul>}
        </>
      )}
    </div>
  );
}
