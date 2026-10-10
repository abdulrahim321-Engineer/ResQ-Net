'use client';
import React, { useState } from 'react';
import { Activity, Hospital, LayoutDashboard, Truck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Api, type Overview } from '@/lib/api';
import { usePoll } from '@/lib/hooks';
import { AppNav, ErrorBanner, FullPageError, LoadingScreen, SeverityBadge, StatusBadge, cardCls } from '@/components/ui';
import { ago, formatEta, formatKm } from '@/lib/mappers';
import { LiveTicker, TacticalMap } from '@/components/ui';

export default function AdminPage() {
  const { me, account, checking, error: authErr, reload, logout } = useAuth(null);
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  usePoll(async () => {
    try { setData(await Api.overview()); setErr(null); } catch { setErr('Live feed paused. Retrying…'); }
  }, 5000, !!me || true); // public endpoint, always poll

  if (checking) return <LoadingScreen text="CONTROL ROOM..." />;

  return (
    <div className="min-h-screen bg-[#030712] text-white p-3 flex flex-col gap-3">
      <AppNav
        title={<>ResQ <span className="text-[#FFB703]">Net</span> <span className="text-xs text-slate-400">Control Room</span></>}
        subtitle={<span className="text-[10px] font-mono text-slate-400">{account?.display_name ?? 'Public view'}</span>}
        color="#FFB703" icon={<LayoutDashboard size={22} className="text-[#FFB703]" />}
        links={me ? [{ href: `/${me.account.role}`, label: 'My Dashboard', color: '#FFB703' }] : []}
        onLogout={me ? logout : undefined}
      />

      <ErrorBanner message={err} onClose={() => setErr(null)} />

      {/* Counts */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'ACTIVE INCIDENTS', value: data.counts.active_incidents, color: '#FF2A5F' },
            { label: 'AMBULANCES ONLINE', value: data.counts.ambulances_online, color: '#00F5D4' },
            { label: 'HOSPITALS ACCEPTING', value: data.counts.hospitals_accepting, color: '#10B981' },
            { label: 'TOTAL TODAY', value: data.counts.incidents_today, color: '#FFB703' },
          ].map(c => (
            <div key={c.label} className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 text-center">
              <p className="text-3xl font-black" style={{ color: c.color }}>{c.value}</p>
              <p className="text-[9px] font-mono text-slate-500 mt-1">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 flex-1">
        {/* Map */}
        <div className="xl:col-span-2 min-h-[400px] rounded-3xl overflow-hidden border border-slate-800">
          <TacticalMap
            ambulances={(data?.fleet ?? []).filter(f => f.position).map(f => ({ id: f.id, label: f.call_sign, position: f.position!, highlight: f.status === 'available', sub: f.status }))}
            hospitals={(data?.hospitals ?? []).map(h => ({ id: h.id, name: h.name, location: h.location, highlight: h.accepting, sub: h.accepting ? 'Accepting' : 'Closed' }))}
            fitKey={data ? 'overview' : 'init'}
            center={{ lat: 33.6844, lng: 73.0479 }}
          />
        </div>

        {/* Side */}
        <div className="flex flex-col gap-3 overflow-y-auto max-h-[80vh]">
          <div className={cardCls}>
            <p className="text-xs font-bold text-[#00F5D4] mb-3 flex items-center gap-2"><Truck size={14} /> FLEET ({data?.fleet?.length ?? 0})</p>
            <div className="space-y-2">
              {(data?.fleet ?? []).map(f => (
                <div key={f.id} className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 font-mono text-xs flex items-center justify-between">
                  <div>
                    <p className="font-bold text-white">{f.call_sign} <span className="text-slate-500">· {f.type}</span></p>
                    <p className="text-slate-500 text-[10px]">{f.status === 'online' ? `GPS ${ago(f.last_seen)}` : 'Offline'}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${f.status === 'online' ? 'border-[#00F5D4] text-[#00F5D4] bg-[#00F5D4]/10' : 'border-slate-700 text-slate-500'}`}>{f.status.toUpperCase()}</span>
                </div>
              ))}
              {!data?.fleet?.length && <p className="text-slate-500 text-xs py-2 text-center">No fleet data</p>}
            </div>
          </div>

          <div className={cardCls}>
            <p className="text-xs font-bold text-[#10B981] mb-3 flex items-center gap-2"><Hospital size={14} /> HOSPITALS ({data?.hospitals?.length ?? 0})</p>
            <div className="space-y-2">
              {(data?.hospitals ?? []).map(h => (
                <div key={h.id} className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 font-mono text-xs flex items-center justify-between">
                  <div>
                    <p className="font-bold text-white">{h.name}</p>
                    <p className="text-slate-500 text-[10px]">{h.er_beds_available} beds · {(h.capabilities ?? []).slice(0, 3).join(', ')}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${h.accepting ? 'border-[#10B981] text-[#10B981] bg-[#10B981]/10' : 'border-[#FF2A5F] text-[#FF2A5F] bg-[#FF2A5F]/10'}`}>{h.accepting ? 'OPEN' : 'CLOSED'}</span>
                </div>
              ))}
              {!data?.hospitals?.length && <p className="text-slate-500 text-xs py-2 text-center">No hospital data</p>}
            </div>
          </div>

          <div className={cardCls}>
            <p className="text-xs font-bold text-[#FF2A5F] mb-3 flex items-center gap-2"><Activity size={14} /> ACTIVE INCIDENTS</p>
            <div className="space-y-2">
              {(data?.incidents ?? []).map(i => (
                <div key={i.id} className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 font-mono text-xs">
                  <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                    <span className="font-bold text-white">{i.ref_code}</span>
                    <div className="flex gap-1"><StatusBadge status={i.status} /><SeverityBadge severity={i.triage?.severity} /></div>
                  </div>
                  <p className="text-slate-500 text-[10px]">{i.ambulance?.call_sign ?? 'No unit'} → {i.hospital?.name ?? 'No hospital'}</p>
                  {i.track?.eta_min != null && <p className="text-[#00F5D4] text-[10px]">ETA {formatEta(i.track.eta_min)} · {formatKm(i.track.distance_to_patient_km)}</p>}
                </div>
              ))}
              {!(data?.incidents?.length) && <p className="text-slate-500 text-xs py-2 text-center">No active incidents</p>}
            </div>
          </div>
        </div>
      </div>

      <LiveTicker incidents={data?.incidents ?? []} />
    </div>
  );
}
