'use client';
import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, MapPin, Navigation, Phone, Truck, WifiOff, Wifi } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Api, errorMessage, type AmbulanceAssignment } from '@/lib/api';
import { usePoll } from '@/lib/hooks';
import { AppNav, ErrorBanner, FullPageError, LoadingScreen, SeverityBadge, StatusBadge, TacticalMap, cardCls, inputCls, labelCls } from '@/components/ui';
import { formatEta, formatKm, statusInfo, ambulanceLabel } from '@/lib/mappers';
import type { MapLine } from '@/components/Map';

const TYPES = ['ALS', 'BLS'];

export default function AmbulancePage() {
  const { me, account, checking, error: authErr, reload, logout } = useAuth('ambulance');
  const [online, setOnline] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [assignment, setAssignment] = useState<AmbulanceAssignment | null>(null);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [lastSent, setLastSent] = useState(0);
  const [advErr, setAdvErr] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const watchRef = useRef<number | null>(null);
  const posRef = useRef<{ lat: number; lng: number } | null>(null);
  // setup form
  const [setup, setSetup] = useState({ callSign: '', plate: '', type: 'BLS' });
  const [setting, setSetting] = useState(false);
  const [setupErr, setSetupErr] = useState<string | null>(null);

  const hasVehicle = !!me?.ambulance;

  useEffect(() => {
    if (!hasVehicle) return;
    setOnline(me?.ambulance?.status === 'available' || me?.ambulance?.status === 'assigned' || me?.ambulance?.status === 'busy');
  }, [me, hasVehicle]);

  // GPS watch when online
  useEffect(() => {
    if (!online || !hasVehicle) { stopWatch(); return; }
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => { posRef.current = { lat: p.coords.latitude, lng: p.coords.longitude }; setMyPos({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000 }
    );
    return stopWatch;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, hasVehicle]);

  function stopWatch() { if (watchRef.current !== null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; } }

  // Send GPS every 5 s when online
  useEffect(() => {
    if (!online || !hasVehicle) return;
    const t = setInterval(async () => {
      const p = posRef.current;
      if (!p) return;
      const now = Date.now();
      if (now - lastSent < 4500) return;
      try { await Api.postLocation(p.lat, p.lng); setLastSent(now); } catch { /* location update failed silently */ }
    }, 5000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, hasVehicle]);

  // Poll assignment
  const { error: pollErr } = usePoll(async () => {
    if (!hasVehicle) return;
    const a = await Api.assignment();
    setAssignment(a);
    if ((a?.status === 'assigned' || a?.status === 'en_route') && !online) setOnline(true);
    // keep TS happy
  }, 3000, hasVehicle);

  async function toggleOnline() {
    setToggling(true);
    try { const s = await Api.setAmbulanceOnline(!online); setOnline(s.status === 'available' || s.status === 'assigned' || s.status === 'busy'); } catch (e) { setAdvErr(errorMessage(e)); } finally { setToggling(false); }
  }

  async function respond(accept: boolean) {
    if (!assignment) return;
    setAdvancing(true); setAdvErr(null);
    try { await Api.respondAssignment(assignment.incident_id, accept); } catch (e) { setAdvErr(errorMessage(e)); } finally { setAdvancing(false); }
  }

  async function advance(status: string) {
    if (!assignment) return;
    setAdvancing(true); setAdvErr(null);
    try { await Api.advanceStatus(assignment.incident_id, status as 'at_scene' | 'transporting' | 'arrived'); } catch (e) { setAdvErr(errorMessage(e)); } finally { setAdvancing(false); }
  }

  async function doSetup(e: React.FormEvent) {
    e.preventDefault();
    setSetting(true); setSetupErr(null);
    try { await Api.setupAmbulance({ call_sign: setup.callSign.trim(), plate: setup.plate.trim(), type: setup.type as 'ALS' | 'BLS' }); reload(); } catch (err) { setSetupErr(errorMessage(err)); } finally { setSetting(false); }
  }

  if (checking) return <LoadingScreen text="LOADING UNIT..." />;
  if (authErr || !me) return <FullPageError message={authErr ?? 'Auth failed'} onRetry={reload} onLogout={logout} />;

  const patPos = assignment ? { lat: assignment.patient_location.lat, lng: assignment.patient_location.lng } : null;
  const hospPos = assignment?.hospital_location ?? null;
  const status = assignment?.status ?? 'none';
  const lines: MapLine[] = [];
  if (myPos && patPos && (status === 'assigned' || status === 'en_route')) lines.push({ from: myPos, to: patPos, color: '#00F5D4' });
  if (myPos && hospPos && status === 'transporting') lines.push({ from: myPos, to: hospPos, color: '#10B981' });

  return (
    <div className="min-h-screen bg-[#030712] text-white p-3 flex flex-col gap-3">
      <AppNav title={<>ResQ <span className="text-[#00F5D4]">Net</span> <span className="text-xs text-slate-400">Ambulance</span></>} subtitle={<span className="text-[10px] font-mono text-slate-400">{account?.display_name}</span>} color="#00F5D4" icon={<Truck size={22} className="text-[#00F5D4]" />} links={[]} onLogout={logout} />

      {!hasVehicle ? (
        <div className="max-w-md mx-auto w-full">
          <div className={`${cardCls} border-[#00F5D4]/30`}>
            <h2 className="text-sm font-bold text-[#00F5D4] mb-4 flex items-center gap-2"><Truck size={16} /> Register Your Ambulance</h2>
            <form onSubmit={doSetup} className="space-y-3">
              <div><label className={labelCls}>CALL SIGN</label><input className={inputCls} required value={setup.callSign} onChange={e => setSetup(s => ({...s, callSign: e.target.value}))} placeholder="RSCQ-01" /></div>
              <div><label className={labelCls}>PLATE NUMBER</label><input className={inputCls} required value={setup.plate} onChange={e => setSetup(s => ({...s, plate: e.target.value}))} placeholder="ABC-1234" /></div>
              <div><label className={labelCls}>UNIT TYPE</label>
                <div className="grid grid-cols-2 gap-2">
                  {TYPES.map(t => <button key={t} type="button" onClick={() => setSetup(s => ({...s, type: t}))} className={`py-2 rounded-xl text-xs font-bold border ${setup.type === t ? 'border-[#00F5D4] text-[#00F5D4] bg-[#00F5D4]/10' : 'border-slate-700 text-slate-400'}`}>{t}</button>)}
                </div>
              </div>
              <ErrorBanner message={setupErr} onClose={() => setSetupErr(null)} />
              <button disabled={setting} className="w-full bg-[#00F5D4] text-black font-extrabold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60">
                {setting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} REGISTER UNIT
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 flex-1">
          {/* Map */}
          <div className="xl:col-span-2 min-h-[400px] rounded-3xl overflow-hidden border border-slate-800 relative">
            <TacticalMap
              patient={patPos ?? undefined}
              ambulances={myPos ? [{ id: 'me', label: me.ambulance!.call_sign, position: myPos, highlight: true, sub: online ? 'ONLINE' : 'OFFLINE' }] : []}
              hospitals={hospPos ? [{ id: 'h', name: assignment?.hospital_name ?? 'Hospital', location: hospPos, highlight: true, sub: '' }] : []}
              lines={lines}
              center={myPos ?? patPos ?? { lat: 33.6844, lng: 73.0479 }}
              onMapClick={(p) => { posRef.current = p; setMyPos(p); }}
              fitKey={`${status}-${myPos ? 1 : 0}`}
            />
            <div className="absolute top-4 left-4 bg-slate-950/90 border border-slate-700 rounded-2xl px-4 py-2 text-xs font-mono text-slate-300 backdrop-blur">
              <p className="text-[#00F5D4] font-bold">{me.ambulance!.call_sign} Â· {me.ambulance!.vehicle_type}</p>
              <p className="text-slate-500 text-[10px]">Tap map to set position (indoor demo)</p>
            </div>
          </div>

          {/* Side panel */}
          <div className="flex flex-col gap-3">
            {/* Online toggle */}
            <div className={`${cardCls} flex items-center justify-between`}>
              <div>
                <p className="text-xs font-bold text-white">{online ? 'ONLINE Â· ACCEPTING CALLS' : 'OFFLINE'}</p>
                <p className="text-[10px] font-mono text-slate-500">{me.ambulance!.call_sign} Â· {me.ambulance!.vehicle_type} Â· {me.ambulance!.plate}</p>
              </div>
              <button onClick={toggleOnline} disabled={toggling || !!assignment} className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs border disabled:opacity-60 ${online ? 'border-[#FF2A5F] text-[#FF2A5F] bg-[#FF2A5F]/10' : 'border-[#10B981] text-[#10B981] bg-[#10B981]/10'}`}>
                {toggling ? <Loader2 size={14} className="animate-spin" /> : online ? <WifiOff size={14} /> : <Wifi size={14} />}
                {online ? 'GO OFFLINE' : 'GO ONLINE'}
              </button>
            </div>

            <ErrorBanner message={advErr ?? pollErr} onClose={() => setAdvErr(null)} />

            {/* Assignment */}
            {!assignment ? (
              <div className={`${cardCls} border-slate-700 text-center py-8`}>
                <Truck size={40} className="mx-auto text-slate-600 mb-3" />
                <p className="text-sm text-slate-400">{online ? 'Waiting for dispatchâ€¦' : 'Go online to receive emergencies'}</p>
              </div>
            ) : (
              <div className={`${cardCls} border-[#FF2A5F]/40 space-y-3`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm font-bold text-[#FF2A5F]">ðŸš¨ ACTIVE CALL</p>
                  <div className="flex gap-2 flex-wrap"><StatusBadge status={assignment.status} /><SeverityBadge severity={assignment.triage_severity} /></div>
                </div>

                <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 font-mono text-xs space-y-2">
                  <div className="flex justify-between"><span className="text-slate-500">Patient</span><span className="font-bold text-white">{assignment.patient_name ?? 'Unknown'}</span></div>
                  {assignment.patient_blood_group && <div className="flex justify-between"><span className="text-slate-500">Blood group</span><span className="text-[#FF2A5F] font-bold">{assignment.patient_blood_group}</span></div>}
                  {assignment.patient_critical_alerts?.length > 0 && <div><span className="text-[#FFB703] block">âš  {assignment.patient_critical_alerts.join(' Â· ')}</span></div>}
                  <div className="flex justify-between"><span className="text-slate-500">ETA to patient</span><span className="text-[#00F5D4] font-bold">{formatEta(assignment.eta_min)}</span></div>
                  {assignment.distance_km != null && <div className="flex justify-between"><span className="text-slate-500">Distance</span><span>{formatKm(assignment.distance_km)}</span></div>}
                </div>

                {assignment.hospital_name && (
                  <div className="bg-slate-950/70 p-3 rounded-2xl border border-[#10B981]/30 font-mono text-xs">
                    <p className="text-[#10B981] font-bold mb-1">TARGET HOSPITAL</p>
                    <p className="text-white">{assignment.hospital_name}</p>
                    {assignment.hospital_phone && <a href={`tel:${assignment.hospital_phone}`} className="flex items-center gap-1 text-[#00F5D4] mt-1"><Phone size={11} /> {assignment.hospital_phone}</a>}
                  </div>
                )}

                {patPos && (
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${patPos.lat},${patPos.lng}`} target="_blank" rel="noreferrer"
                    className="flex items-center justify-center gap-2 w-full border border-[#00F5D4]/50 text-[#00F5D4] font-bold py-2.5 rounded-xl text-xs">
                    <Navigation size={14} /> OPEN IN GOOGLE MAPS
                  </a>
                )}

                {/* Status actions */}
                {assignment.status === 'assigned' && (
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => respond(true)} disabled={advancing} className="bg-[#10B981] text-black font-extrabold py-3 rounded-xl text-xs flex items-center justify-center gap-1 disabled:opacity-60">
                      {advancing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} ACCEPT
                    </button>
                    <button onClick={() => respond(false)} disabled={advancing} className="border border-[#FF2A5F] text-[#FF2A5F] font-bold py-3 rounded-xl text-xs disabled:opacity-60">DECLINE</button>
                  </div>
                )}
                {assignment.status === 'en_route' && (
                  <button onClick={() => advance('at_scene')} disabled={advancing} className="w-full bg-[#FFB703] text-black font-extrabold py-3 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                    {advancing ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />} ARRIVED AT SCENE
                  </button>
                )}
                {assignment.status === 'at_scene' && (
                  <button onClick={() => advance('transporting')} disabled={advancing} className="w-full bg-[#00F5D4] text-black font-extrabold py-3 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                    {advancing ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />} PATIENT PICKED UP Â· EN ROUTE TO ER
                  </button>
                )}
                {assignment.status === 'transporting' && (
                  <button onClick={() => advance('arrived')} disabled={advancing} className="w-full bg-[#10B981] text-black font-extrabold py-3 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                    {advancing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} ARRIVED AT HOSPITAL
                  </button>
                )}
                {(assignment.status === 'arrived' || assignment.status === 'closed') && (
                  <div className="text-center py-2 text-[#10B981] font-bold text-sm"><CheckCircle2 className="inline mr-2" size={18} />Call complete. Patient handed over.</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

