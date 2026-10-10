'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Bell, BedDouble, CheckCircle2, Hospital, Loader2, Settings, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Api, errorMessage, type HospitalIncoming } from '@/lib/api';
import { usePoll, beep } from '@/lib/hooks';
import { AppNav, ErrorBanner, FullPageError, LoadingScreen, PatientCard, SeverityBadge, StatusBadge, TacticalMap, cardCls, inputCls, labelCls } from '@/components/ui';
import { ago, formatEta, formatKm, patientView, readinessInfo } from '@/lib/mappers';

const CAPS = ['ICU', 'Burns', 'Paediatrics', 'Maternity', 'Cardiac Cath', 'Neurosurgery', 'Trauma', 'Orthopaedics', 'Toxicology', 'Psychiatry'];

export default function HospitalPage() {
  const { me, account, checking, error: authErr, reload, logout } = useAuth('hospital');
  const [incoming, setIncoming] = useState<HospitalIncoming[]>([]);
  const [selected, setSelected] = useState<HospitalIncoming | null>(null);
  const [accepting, setAccepting] = useState(true);
  const [beds, setBeds] = useState(0);
  const [caps, setCaps] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [actErr, setActErr] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const prevCount = useRef(0);
  // hospital setup
  const [setup, setSetup] = useState({ name: '', phone: '', address: '' });
  const [setting, setSetting] = useState(false);
  const [setupErr, setSetupErr] = useState<string | null>(null);

  const hasHospital = !!me?.hospital;

  useEffect(() => {
    if (!me?.hospital) return;
    setAccepting(me.hospital.accepting);
    setBeds(me.hospital.er_beds_available ?? 0);
    setCaps(me.hospital.capabilities ?? []);
  }, [me]);

  usePoll(async () => {
    if (!hasHospital) return;
    const list = await Api.hospitalIncoming();
    if (list.length > prevCount.current) { beep(); }
    prevCount.current = list.length;
    setIncoming(list);
    if (selected) {
      const fresh = list.find(i => i.incident_id === selected.incident_id);
      if (fresh) setSelected(fresh);
    }
  }, 3000, hasHospital);

  async function doSetup(e: React.FormEvent) {
    e.preventDefault();
    setSetting(true); setSetupErr(null);
    try { await Api.createHospital({ name: setup.name.trim(), phone: setup.phone.trim() || null, address: setup.address.trim() || null }); reload(); }
    catch (err) { setSetupErr(errorMessage(err)); } finally { setSetting(false); }
  }

  async function saveSettings() {
    setSaving(true); setSaveErr(null);
    try { await Api.updateHospital({ er_beds_available: beds, accepting, capabilities: caps as import('@/lib/types').Capability[] }); }
    catch (e) { setSaveErr(errorMessage(e)); } finally { setSaving(false); }
  }

  async function setReadiness(incId: string, readiness: 'preparing' | 'ready') {
    setActing(true); setActErr(null);
    try { await Api.setReadiness(incId, readiness); }
    catch (e) { setActErr(errorMessage(e)); } finally { setActing(false); }
  }

  async function closeCase(incId: string) {
    setActing(true); setActErr(null);
    try { await Api.closeCase(incId); setSelected(null); }
    catch (e) { setActErr(errorMessage(e)); } finally { setActing(false); }
  }

  if (checking) return <LoadingScreen text="LOADING ER DASHBOARD..." />;
  if (authErr || !me) return <FullPageError message={authErr ?? 'Auth failed'} onRetry={reload} onLogout={logout} />;

  const hosp = me.hospital;

  return (
    <div className="min-h-screen bg-[#030712] text-white p-3 flex flex-col gap-3">
      <AppNav title={<>ResQ <span className="text-[#10B981]">Net</span> <span className="text-xs text-slate-400">Hospital ER</span></>} subtitle={<span className="text-[10px] font-mono text-slate-400">{hosp?.name ?? account?.display_name}</span>} color="#10B981" icon={<Hospital size={22} className="text-[#10B981]" />}
        links={[{ href: '#settings', label: 'Settings', color: '#10B981', icon: <Settings size={14} /> }]}
        right={<button onClick={() => setShowSettings(s => !s)} className="text-[10px] font-mono font-bold border border-[#10B981]/40 text-[#10B981] px-3 py-2 rounded-xl flex items-center gap-1"><Settings size={12} /> {showSettings ? 'Hide' : 'Settings'}</button>}
        onLogout={logout} />

      {!hasHospital ? (
        <div className="max-w-md mx-auto w-full">
          <div className={`${cardCls} border-[#10B981]/30`}>
            <h2 className="text-sm font-bold text-[#10B981] mb-4 flex items-center gap-2"><Hospital size={16} /> Register Your Hospital</h2>
            <form onSubmit={doSetup} className="space-y-3">
              <div><label className={labelCls}>HOSPITAL NAME</label><input className={inputCls} required value={setup.name} onChange={e => setSetup(s => ({...s, name: e.target.value}))} placeholder="PIMS Hospital" /></div>
              <div><label className={labelCls}>ER PHONE (OPTIONAL)</label><input type="tel" className={inputCls} value={setup.phone} onChange={e => setSetup(s => ({...s, phone: e.target.value}))} placeholder="+9251..." /></div>
              <div><label className={labelCls}>ADDRESS (OPTIONAL)</label><input className={inputCls} value={setup.address} onChange={e => setSetup(s => ({...s, address: e.target.value}))} placeholder="G-8, Islamabad" /></div>
              <ErrorBanner message={setupErr} onClose={() => setSetupErr(null)} />
              <button disabled={setting} className="w-full bg-[#10B981] text-black font-extrabold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60">
                {setting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} REGISTER HOSPITAL
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 flex-1">
          {/* Incoming list */}
          <div className="flex flex-col gap-3">
            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3 text-center">
                <p className="text-2xl font-black text-[#10B981]">{incoming.filter(i => ['assigned','en_route','at_scene','transporting'].includes(i.status)).length}</p>
                <p className="text-[9px] font-mono text-slate-500">ACTIVE</p>
              </div>
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3 text-center">
                <p className="text-2xl font-black text-[#00F5D4]">{beds}</p>
                <p className="text-[9px] font-mono text-slate-500">BEDS AVAIL</p>
              </div>
              <div className={`rounded-2xl p-3 text-center border ${accepting ? 'bg-[#10B981]/10 border-[#10B981]/40' : 'bg-[#FF2A5F]/10 border-[#FF2A5F]/30'}`}>
                <p className="text-[10px] font-bold mt-1">{accepting ? <><Wifi size={16} className="text-[#10B981] mx-auto" /><span className="text-[#10B981]">OPEN</span></> : <><WifiOff size={16} className="text-[#FF2A5F] mx-auto" /><span className="text-[#FF2A5F]">CLOSED</span></>}</p>
              </div>
            </div>

            {showSettings && (
              <div className={`${cardCls} border-[#10B981]/30 space-y-3`}>
                <h3 className="text-xs font-bold text-[#10B981]">ER SETTINGS</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setAccepting(true)} className={`py-2 rounded-xl text-xs font-bold border ${accepting ? 'border-[#10B981] text-[#10B981] bg-[#10B981]/10' : 'border-slate-700 text-slate-400'}`}>ACCEPTING</button>
                  <button onClick={() => setAccepting(false)} className={`py-2 rounded-xl text-xs font-bold border ${!accepting ? 'border-[#FF2A5F] text-[#FF2A5F] bg-[#FF2A5F]/10' : 'border-slate-700 text-slate-400'}`}>CLOSED</button>
                </div>
                <div><label className={labelCls}>ER BEDS AVAILABLE</label>
                  <input type="number" min={0} max={200} className={inputCls} value={beds} onChange={e => setBeds(Number(e.target.value))} />
                </div>
                <div>
                  <label className={labelCls}>CAPABILITIES</label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {CAPS.map(c => <button key={c} type="button" onClick={() => setCaps(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c])} className={`text-[10px] px-2 py-1 rounded-full border ${caps.includes(c) ? 'border-[#10B981] text-[#10B981] bg-[#10B981]/10' : 'border-slate-700 text-slate-500'}`}>{c}</button>)}
                  </div>
                </div>
                <ErrorBanner message={saveErr} onClose={() => setSaveErr(null)} />
                <button onClick={saveSettings} disabled={saving} className="w-full bg-[#10B981] text-black font-extrabold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 disabled:opacity-60">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} SAVE SETTINGS
                </button>
              </div>
            )}

            <div className={cardCls}>
              <p className="text-xs font-bold text-white mb-3 flex items-center gap-2"><Bell size={14} className="text-[#10B981]" /> INCOMING PATIENTS ({incoming.length})</p>
              {incoming.length === 0 && <p className="text-xs font-mono text-slate-500 py-4 text-center">No incoming patients right now.</p>}
              <div className="space-y-2">
                {incoming.map(inc => (
                  <button key={inc.incident_id} onClick={() => setSelected(inc)} className={`w-full text-left p-3 rounded-2xl border transition-all ${selected?.incident_id === inc.incident_id ? 'border-[#10B981] bg-[#10B981]/10' : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white">{inc.ref_code}</span>
                      <div className="flex gap-1"><StatusBadge status={inc.status} /><SeverityBadge severity={inc.triage_severity} /></div>
                    </div>
                    <p className="text-[10px] font-mono text-slate-500 mt-1">{inc.patient_name ?? 'Unknown patient'}</p>
                    {inc.eta_min != null && <p className="text-[10px] font-mono text-[#00F5D4]">ETA {formatEta(inc.eta_min)} · {formatKm(inc.distance_km)}</p>}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Detail panel */}
          <div className="xl:col-span-2 flex flex-col gap-3">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center min-h-[400px] rounded-3xl border border-slate-800 bg-slate-900/50">
                <div className="text-center"><Hospital size={48} className="mx-auto text-slate-700 mb-3" /><p className="text-slate-400">Select a patient from the list</p></div>
              </div>
            ) : (
              <>
                {/* Map */}
                <div className="h-64 rounded-3xl overflow-hidden border border-slate-800">
                  <TacticalMap
                    patient={selected.patient_location ? { lat: selected.patient_location.lat, lng: selected.patient_location.lng } : undefined}
                    ambulances={selected.ambulance_position ? [{ id: 'amb', label: selected.ambulance_call_sign ?? 'Ambulance', position: selected.ambulance_position, highlight: true, sub: '' }] : []}
                    hospitals={hosp ? [{ id: hosp.id, name: hosp.name, location: { lat: hosp.location?.lat ?? 33.6844, lng: hosp.location?.lng ?? 73.0479 }, highlight: true, sub: 'YOU' }] : []}
                    lines={selected.ambulance_position && selected.patient_location ? [{ from: selected.ambulance_position, to: { lat: selected.patient_location.lat, lng: selected.patient_location.lng }, color: '#00F5D4' }] : []}
                    fitKey={selected.incident_id}
                    center={selected.patient_location ?? { lat: 33.6844, lng: 73.0479 }}
                  />
                </div>

                <ErrorBanner message={actErr} onClose={() => setActErr(null)} />

                <div className="bg-slate-900/70 p-4 rounded-3xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="font-bold text-white">{selected.ref_code} · {selected.patient_name ?? 'Unknown'}</p>
                    <div className="flex gap-2"><StatusBadge status={selected.status} /><SeverityBadge severity={selected.triage_severity} /></div>
                  </div>
                  <div className="font-mono text-xs grid grid-cols-2 gap-2">
                    <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800"><span className="text-slate-500 block">ETA</span><span className="text-[#00F5D4] font-bold">{formatEta(selected.eta_min)}</span></div>
                    <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800"><span className="text-slate-500 block">Distance</span><span className="text-white font-bold">{formatKm(selected.distance_km)}</span></div>
                    <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800"><span className="text-slate-500 block">Last seen</span><span className="text-white">{selected.ambulance_last_seen ? ago(selected.ambulance_last_seen) : '—'}</span></div>
                    <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800"><span className="text-slate-500 block">ER Readiness</span><span className="font-bold" style={{ color: readinessInfo(selected.my_readiness).color }}>{readinessInfo(selected.my_readiness).label}</span></div>
                  </div>

                  {/* Readiness buttons */}
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => setReadiness(selected.incident_id, 'preparing')} disabled={acting || selected.my_readiness === 'preparing' || selected.my_readiness === 'ready'} className="py-2.5 rounded-xl text-xs font-bold border border-[#FFB703] text-[#FFB703] bg-[#FFB703]/10 disabled:opacity-50">
                      {acting ? <Loader2 size={12} className="animate-spin mx-auto" /> : 'PREPARING BAY'}
                    </button>
                    <button onClick={() => setReadiness(selected.incident_id, 'ready')} disabled={acting || selected.my_readiness === 'ready'} className="py-2.5 rounded-xl text-xs font-bold border border-[#10B981] text-[#10B981] bg-[#10B981]/10 disabled:opacity-50">
                      {acting ? <Loader2 size={12} className="animate-spin mx-auto" /> : 'BAY READY'}
                    </button>
                    <button onClick={() => closeCase(selected.incident_id)} disabled={acting} className="py-2.5 rounded-xl text-xs font-bold border border-[#FF2A5F] text-[#FF2A5F] bg-[#FF2A5F]/10 disabled:opacity-50">
                      {acting ? <Loader2 size={12} className="animate-spin mx-auto" /> : 'CLOSE · FREE BED'}
                    </button>
                  </div>
                </div>

                {/* Full patient profile */}
                <PatientCard p={patientView(selected as any)} title="Patient Profile (Hospital view — full)" />

                {selected.ai_brief && (
                  <div className="bg-slate-900/70 p-4 rounded-3xl border border-[#00F5D4]/30">
                    <p className="text-xs font-bold text-[#00F5D4] mb-2">AI HANDOVER BRIEF</p>
                    <p className="text-sm text-slate-200 whitespace-pre-line">{selected.ai_brief}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
