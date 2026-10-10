'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Activity, AlertCircle, CheckCircle2, Clock, Info, LogOut, Navigation, Radio, RefreshCw, Stethoscope, HeartPulse } from 'lucide-react';
import type { Brief, Incident, Triage } from '@/lib/types';
import {
  PROGRESS_STEPS, buildTimeline, formatTime, severityInfo, statusInfo, type PatientView,
} from '@/lib/mappers';
import type { Overview } from '@/lib/api';

export const TacticalMap = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#030712] rounded-2xl">
      <Navigation className="text-[#00F5D4] w-12 h-12 mb-3 animate-bounce drop-shadow-[0_0_12px_rgba(0,245,212,0.8)]" />
      <p className="font-mono text-[#00F5D4] tracking-widest text-sm">INITIALIZING TACTICAL MAP...</p>
    </div>
  ),
});

export const inputCls =
  'w-full bg-slate-950/70 border border-slate-700 focus:border-[#00F5D4] outline-none text-white px-4 py-3 rounded-xl font-mono text-sm transition-all placeholder-slate-600 disabled:opacity-50';
export const labelCls = 'text-[10px] text-slate-500 font-mono tracking-widest block mb-1.5';
export const cardCls = 'bg-slate-900/60 backdrop-blur-xl rounded-3xl p-5 border border-slate-800 shadow-2xl';

export function LoadingScreen({ color = '#00F5D4', text = 'AUTHENTICATING...' }: { color?: string; text?: string }) {
  return (
    <div className="min-h-screen w-full bg-[#030712] flex flex-col items-center justify-center">
      <Activity className="animate-pulse mb-4" size={40} style={{ color }} />
      <p className="font-mono tracking-widest text-sm" style={{ color }}>{text}</p>
    </div>
  );
}

export function FullPageError({ message, onRetry, onLogout }: { message: string; onRetry: () => void; onLogout?: () => void }) {
  return (
    <div className="min-h-screen w-full bg-[#030712] flex flex-col items-center justify-center p-6 text-center">
      <AlertCircle className="text-[#FF2A5F] mb-4" size={40} />
      <p className="text-white font-bold mb-1">We couldn&apos;t load your dashboard</p>
      <p className="text-slate-400 font-mono text-sm mb-6 max-w-md">{message}</p>
      <div className="flex gap-3">
        <button onClick={onRetry} className="flex items-center gap-2 bg-[#00F5D4] text-black font-bold px-5 py-2.5 rounded-xl"><RefreshCw size={16} /> Try again</button>
        {onLogout && <button onClick={onLogout} className="text-slate-300 border border-slate-700 px-5 py-2.5 rounded-xl">Sign out</button>}
      </div>
    </div>
  );
}

export function ErrorBanner({ message, onRetry, onClose }: { message: string | null | undefined; onRetry?: () => void; onClose?: () => void }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 text-[#FF8FA8] text-xs font-mono bg-[#FF2A5F]/10 border border-[#FF2A5F]/30 px-4 py-3 rounded-2xl" role="alert">
      <AlertCircle size={16} className="shrink-0 mt-0.5 text-[#FF2A5F]" />
      <span className="flex-1">{message}</span>
      {onRetry && <button onClick={onRetry} className="underline text-white shrink-0">Retry</button>}
      {onClose && <button onClick={onClose} className="text-slate-400 shrink-0" aria-label="Dismiss">✕</button>}
    </div>
  );
}

export function InfoBanner({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'success' | 'warn' }) {
  const c = tone === 'success' ? '#10B981' : tone === 'warn' ? '#FFB703' : '#00F5D4';
  const Icon = tone === 'success' ? CheckCircle2 : Info;
  return (
    <div className="flex items-start gap-2 text-xs font-mono px-4 py-3 rounded-2xl border" style={{ color: c, borderColor: `${c}55`, background: `${c}14` }}>
      <Icon size={16} className="shrink-0 mt-0.5" />
      <div className="flex-1">{children}</div>
    </div>
  );
}

/** Small "connection problem" pill for polling errors. */
export function SyncState({ error }: { error: string | null }) {
  if (!error) {
    return (
      <span className="flex items-center gap-1.5 text-[9px] font-mono text-[#10B981] tracking-widest">
        <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" /> LIVE
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[9px] font-mono text-[#FFB703] tracking-widest" title={error}>
      <span className="w-1.5 h-1.5 rounded-full bg-[#FFB703]" /> RECONNECTING…
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = statusInfo(status);
  return (
    <span className="text-[10px] font-mono border px-2 py-0.5 rounded font-bold whitespace-nowrap" style={{ color: s.color, borderColor: `${s.color}66`, background: `${s.color}1A` }}>
      {s.short}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string | null | undefined }) {
  const s = severityInfo(severity);
  return (
    <span className="text-[10px] font-mono border px-2 py-0.5 rounded font-extrabold whitespace-nowrap" style={{ color: s.color, borderColor: `${s.color}66`, background: `${s.color}1A` }}>
      {s.label}
    </span>
  );
}

export function ProgressSteps({ status }: { status: string }) {
  const cur = statusInfo(status).step;
  return (
    <div className="flex items-center gap-1">
      {PROGRESS_STEPS.map((s, i) => {
        const done = cur >= i + 1;
        return (
          <div key={s.key} className="flex-1 min-w-0">
            <div className={`h-1.5 rounded-full ${done ? 'bg-[#00F5D4]' : 'bg-slate-800'}`} />
            <p className={`text-[9px] font-mono mt-1 truncate ${done ? 'text-[#00F5D4]' : 'text-slate-600'}`}>{s.label}</p>
          </div>
        );
      })}
    </div>
  );
}

export function Timeline({ incident }: { incident: Incident }) {
  const entries = buildTimeline(incident);
  return (
    <div className="relative">
      <div className="absolute left-3.5 top-0 bottom-0 w-px bg-slate-800" />
      <div className="space-y-4">
        {entries.map((step, idx) => (
          <div key={idx} className="flex items-start space-x-4 relative">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 z-10" style={{ background: step.color, borderColor: step.color, boxShadow: `0 0 10px ${step.color}88` }}>
              <CheckCircle2 size={14} className="text-black" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-white">{step.title}</p>
                <p className="text-[9px] font-mono text-slate-500 shrink-0">{step.at ? formatTime(step.at) : ''}</p>
              </div>
              {step.subtitle && <p className="text-[10px] font-mono mt-0.5 text-slate-400">{step.subtitle}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TriageCard({ triage, showFirstAid = true }: { triage: Triage; showFirstAid?: boolean }) {
  return (
    <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-[#FFB703] flex items-center"><Stethoscope size={15} className="mr-1.5" /> AI Triage</span>
        <div className="flex items-center gap-2">
          <SeverityBadge severity={triage.severity} />
          <span className="text-[10px] font-mono text-slate-400 uppercase">{triage.category}</span>
        </div>
      </div>
      {triage.source === 'fallback' && <p className="text-[10px] font-mono text-slate-500">Rule-based triage (AI unavailable)</p>}
      {triage.suspected_injuries?.length > 0 && (
        <p className="text-[11px] text-slate-300"><span className="text-slate-500 font-mono">Suspected: </span>{triage.suspected_injuries.join(', ')}</p>
      )}
      {triage.risk_flags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {triage.risk_flags.map((f, i) => (
            <span key={i} className="text-[10px] font-mono text-[#FF8FA8] bg-[#FF2A5F]/10 border border-[#FF2A5F]/30 px-2 py-0.5 rounded">⚠ {f}</span>
          ))}
        </div>
      )}
      {showFirstAid && triage.first_aid_steps?.length > 0 && (
        <div>
          <p className="text-[10px] font-mono text-[#10B981] tracking-widest mb-1.5">FIRST AID UNTIL HELP ARRIVES</p>
          <ol className="space-y-1">
            {triage.first_aid_steps.map((s, i) => (
              <li key={i} className="text-[12px] text-slate-200 flex gap-2"><span className="text-[#10B981] font-mono font-bold">{i + 1}.</span><span>{s}</span></li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export function BriefCard({ brief }: { brief: Brief | null }) {
  if (!brief) return null;
  const a = brief.atmist;
  const rows: [string, string][] = [['Age', a.age], ['Time', a.time], ['Mechanism', a.mechanism], ['Injuries', a.injuries], ['Signs', a.signs], ['Treatment', a.treatment]];
  return (
    <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-3">
      <span className="text-xs font-bold text-[#00F5D4] flex items-center"><HeartPulse size={15} className="mr-1.5" /> AI Handover Brief (ATMIST)</span>
      <p className="text-[12px] text-slate-200">{brief.summary}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
        {rows.map(([k, v]) => (
          <div key={k} className="bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800"><span className="text-slate-500 font-mono">{k}: </span><span className="text-slate-200">{v || '—'}</span></div>
        ))}
      </div>
      {brief.prep_checklist?.length > 0 && (
        <div>
          <p className="text-[10px] font-mono text-[#10B981] tracking-widest mb-1">ER PREP CHECKLIST</p>
          <ul className="space-y-0.5">
            {brief.prep_checklist.map((c, i) => <li key={i} className="text-[11px] text-slate-300">☐ {c}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

export function PatientCard({ p, title = 'Patient Profile' }: { p: PatientView; title?: string }) {
  const verified = p.identityStatus === 'matched';
  return (
    <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-[#00F5D4]">{title}</span>
        <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${verified ? 'text-[#10B981] border-[#10B981]/40 bg-[#10B981]/10' : 'text-slate-400 border-slate-700'}`}>{p.identity}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
          <span className="text-slate-500 text-[10px] block">PATIENT NAME</span>
          <span className="font-bold text-white">{p.name}</span>
        </div>
        <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
          <span className="text-slate-500 text-[10px] block">BLOOD GROUP</span>
          <span className="font-bold text-[#FF2A5F]">{p.bloodGroup}</span>
        </div>
        <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 col-span-2">
          <span className="text-slate-500 text-[10px] block">CRITICAL MEDICAL ALERTS</span>
          {p.alerts.length ? (
            <ul className="text-[11px] text-[#FFB703] font-sans space-y-0.5 mt-0.5">{p.alerts.map((a, i) => <li key={i}>⚠ {a}</li>)}</ul>
          ) : (
            <span className="text-slate-400 text-[11px]">None on record</span>
          )}
        </div>
      </div>
    </div>
  );
}

type NavLink = { href: string; label: string; color: string; icon?: React.ReactNode };
export function AppNav({ title, subtitle, color, icon, links = [], onLogout, right }: {
  title: React.ReactNode; subtitle?: React.ReactNode; color: string; icon: React.ReactNode; links?: NavLink[]; onLogout?: () => void; right?: React.ReactNode;
}) {
  return (
    <nav className="bg-slate-900/60 backdrop-blur-xl rounded-2xl p-4 flex flex-wrap gap-3 items-center justify-between border border-slate-800 border-l-4" style={{ borderLeftColor: color }}>
      <div className="flex items-center space-x-3 min-w-0">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center border shrink-0" style={{ background: `${color}1A`, borderColor: `${color}4D`, color }}>{icon}</div>
        <div className="min-w-0">
          <div className="font-extrabold text-white text-base tracking-wide truncate">{title}</div>
          {subtitle && <div className="mt-0.5">{subtitle}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {right}
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="flex items-center gap-1.5 text-xs font-mono font-bold px-3 py-2 rounded-xl border transition-all hover:brightness-125" style={{ color: l.color, borderColor: `${l.color}4D`, background: `${l.color}14` }}>
            {l.icon}<span>{l.label}</span>
          </Link>
        ))}
        {onLogout && (
          <button onClick={onLogout} className="flex items-center gap-1.5 text-xs font-mono text-slate-400 border border-slate-700 px-3 py-2 rounded-xl hover:border-[#FF2A5F] hover:text-[#FF2A5F] transition-all">
            <LogOut size={14} /><span className="hidden sm:inline">LOGOUT</span>
          </button>
        )}
      </div>
    </nav>
  );
}

/** Real control-room feed (public, no personal data). */
export function LiveTicker({ incidents }: { incidents: Overview['incidents'] }) {
  const items = incidents.length
    ? incidents.map((i) => {
        const sev = severityInfo(i.severity);
        return { key: i.id, color: sev.color, text: `${i.ref_code} · ${sev.label}${i.category ? ` ${i.category}` : ''} · ${statusInfo(i.status).short}${i.ambulance_call_sign ? ` · ${i.ambulance_call_sign}` : ''}${i.hospital_name ? ` → ${i.hospital_name}` : ''}` };
      })
    : [{ key: 'none', color: '#64748B', text: 'No active incidents in the network right now' }];
  return (
    <div className="bg-slate-900/70 backdrop-blur-xl rounded-2xl border border-slate-800 py-2 px-4 flex items-center space-x-4 overflow-hidden">
      <div className="flex items-center space-x-2 shrink-0">
        <Radio size={14} className="text-[#FF2A5F] animate-pulse" />
        <span className="text-[10px] font-mono font-bold text-[#FF2A5F] tracking-widest whitespace-nowrap">LIVE FEED</span>
      </div>
      <div className="overflow-hidden flex-1 relative">
        <div className="flex animate-[ticker_40s_linear_infinite] whitespace-nowrap space-x-12 w-max">
          {[...items, ...items].map((item, i) => (
            <span key={`${item.key}-${i}`} className="text-[10px] font-mono" style={{ color: item.color }}>● {item.text}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SectionTitle({ icon, children, color = '#00F5D4', right }: { icon?: React.ReactNode; children: React.ReactNode; color?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-3 gap-2">
      <h2 className="text-sm font-bold flex items-center gap-2" style={{ color }}>{icon}{children}</h2>
      {right}
    </div>
  );
}

export function EtaBlock({ etaText, label = 'ESTIMATED ETA', sub }: { etaText: string; label?: string; sub?: string }) {
  return (
    <div>
      <p className="text-[9px] text-slate-500 font-mono tracking-widest flex items-center gap-1"><Clock size={10} /> {label}</p>
      <p className="text-3xl font-black tabular-nums text-[#00F5D4]">{etaText}</p>
      {sub && <p className="text-[9px] font-mono text-slate-500">{sub}</p>}
    </div>
  );
}
