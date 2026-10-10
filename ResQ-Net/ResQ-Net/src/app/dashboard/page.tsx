'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowLeft, ChevronRight, ShieldCheck, Siren, Smartphone, UserCheck, LayoutDashboard, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Api, type Overview } from '@/lib/api';
import { usePoll } from '@/lib/hooks';
import type { Incident } from '@/lib/types';
import { formatDateTime, isActiveStatus } from '@/lib/mappers';
import {
  AppNav, ErrorBanner, FullPageError, InfoBanner, LiveTicker, LoadingScreen, SectionTitle, SeverityBadge, StatusBadge, SyncState, cardCls,
} from '@/components/ui';
import IncidentTracker from '@/components/IncidentTracker';
import ReportForm from '@/components/ReportForm';

export default function Dashboard() {
  const { me, account, checking, error: authError, reload, logout } = useAuth('citizen');
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [feed, setFeed] = useState<Overview['incidents']>([]);

  const { error: listError, trigger } = usePoll(async () => {
    setIncidents(await Api.citizenIncidents());
  }, 4000, !!me);

  usePoll(async () => {
    const o = await Api.overview();
    setFeed(o.incidents);
  }, 10000, !!me);

  if (checking) return <LoadingScreen text="LOADING DASHBOARD..." />;
  if (authError || !me) return <FullPageError message={authError ?? 'Please try again.'} onRetry={reload} onLogout={logout} />;

  const active = incidents?.find((i) => isActiveStatus(i.status)) ?? null;
  const shownId = showForm ? null : viewId ?? active?.id ?? null;
  const shown = shownId ? incidents?.find((i) => i.id === shownId) ?? null : null;
  const profile = me.citizen_profile;
  const past = (incidents ?? []).filter((i) => i.id !== active?.id);

  function onCreated(inc: Incident) {
    setIncidents((list) => [inc, ...(list ?? []).filter((i) => i.id !== inc.id)]);
    setShowForm(false);
    setViewId(inc.id);
    trigger();
  }

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#030712] text-white overflow-x-hidden p-3 gap-3">
      <AppNav
        title={<>ResQ <span className="text-[#00F5D4]">Net</span></>}
        subtitle={
          <div className="flex items-center gap-3">
            <SyncState error={listError} />
            <span className="text-[9px] font-mono text-slate-500 truncate">{account?.display_name}</span>
          </div>
        }
        color="#FF2A5F"
        icon={<Activity className="animate-pulse" size={22} />}
        links={[
          { href: '/profile', label: 'Profile', color: '#00F5D4', icon: <UserCheck size={14} /> },
          { href: '/mobile', label: 'Mobile SOS', color: '#FF2A5F', icon: <Smartphone size={14} /> },
          { href: '/admin', label: 'Control Room', color: '#94A3B8', icon: <LayoutDashboard size={14} /> },
        ]}
        onLogout={logout}
      />

      {shownId ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {(viewId || active) && shownId !== active?.id && (
                <button onClick={() => setViewId(null)} className="flex items-center gap-1 text-xs font-mono text-slate-300 border border-slate-700 px-3 py-2 rounded-xl"><ArrowLeft size={14} /> Back</button>
              )}
              <h2 className="text-sm font-bold text-white">{shown && isActiveStatus(shown.status) ? '🚨 Your emergency is live' : 'Incident details'}</h2>
            </div>
            <button onClick={() => { setShowForm(true); setViewId(null); }} className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#FF2A5F] border border-[#FF2A5F]/40 bg-[#FF2A5F]/10 px-3 py-2 rounded-xl">
              <Siren size={14} /> Report another emergency
            </button>
          </div>
          <IncidentTracker key={shownId} id={shownId} initial={shown} />
        </>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 flex-1">
          <div className={`xl:col-span-2 ${cardCls} border-[#FF2A5F]/30`}>
            <SectionTitle icon={<Siren size={18} />} color="#FF2A5F" right={
              showForm && active ? <button onClick={() => setShowForm(false)} className="text-[10px] font-mono text-slate-300 underline">Back to live incident</button> : null
            }>Request an Ambulance</SectionTitle>
            {showForm && active && (
              <div className="mb-3"><InfoBanner tone="warn">You already have a live emergency ({active.ref_code}). Only send another SOS for a different patient or location.</InfoBanner></div>
            )}
            <ReportForm
              citizen={{ hasProfile: !!profile, name: profile?.full_name ?? account?.display_name ?? '', phone: account?.phone ?? null }}
              onCreated={onCreated}
            />
          </div>

          <div className="flex flex-col gap-3">
            {/* Profile summary */}
            <div className={`${cardCls} border-[#00F5D4]/30`}>
              <SectionTitle icon={<ShieldCheck size={18} />} right={
                <Link href="/profile" className="text-[10px] font-mono text-[#00F5D4] underline">{profile ? 'Edit' : 'Set up'}</Link>
              }>Emergency Profile</SectionTitle>
              {profile ? (
                <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 space-y-2 font-mono text-xs">
                  <div className="flex justify-between"><span className="text-slate-500">Name</span><span className="text-white font-bold">{profile.full_name}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">CNIC</span><span className="text-[#00F5D4]">{profile.cnic}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Blood group</span><span className="text-[#FF2A5F] font-bold">{profile.blood_group ?? 'Unknown'}</span></div>
                  <div><span className="text-slate-500 block mb-1">Allergies</span><p className="text-slate-300 text-[11px] bg-slate-900 p-2 rounded-xl border border-slate-800">{profile.allergies.length ? profile.allergies.join(', ') : 'None recorded'}</p></div>
                  <div className="flex justify-between"><span className="text-slate-500">Emergency contact</span><span className="text-slate-300 text-right">{profile.emergency_contact.name} ({profile.emergency_contact.relation})</span></div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">Scan your CNIC once and add your blood group, allergies and an emergency contact. The ER sees it the moment an ambulance is dispatched to you.</p>
                  <Link href="/profile" className="block text-center bg-gradient-to-r from-[#00F5D4] to-[#00c9ae] text-black font-extrabold py-3 rounded-xl text-sm">SCAN CNIC & CREATE PROFILE</Link>
                </div>
              )}
            </div>

            {/* History */}
            <div className={cardCls}>
              <SectionTitle icon={<AlertTriangle size={16} />} color="#FFB703">Your Incidents</SectionTitle>
              <ErrorBanner message={incidents === null ? listError : null} onRetry={trigger} />
              {incidents === null && !listError && <p className="text-xs font-mono text-slate-500">Loading…</p>}
              {incidents !== null && incidents.length === 0 && <p className="text-xs font-mono text-slate-500">No emergencies reported yet.</p>}
              <div className="space-y-2">
                {active && <IncidentRow inc={active} onOpen={() => { setShowForm(false); setViewId(active.id); }} live />}
                {past.slice(0, 8).map((i) => <IncidentRow key={i.id} inc={i} onOpen={() => { setShowForm(false); setViewId(i.id); }} />)}
              </div>
            </div>
          </div>
        </div>
      )}

      <LiveTicker incidents={feed} />
    </div>
  );
}

function IncidentRow({ inc, onOpen, live }: { inc: Incident; onOpen: () => void; live?: boolean }) {
  return (
    <button onClick={onOpen} className={`w-full text-left p-3 rounded-2xl border flex items-center justify-between gap-2 transition-all ${live ? 'border-[#FF2A5F]/60 bg-[#FF2A5F]/10' : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-white">{inc.ref_code}</span>
          <StatusBadge status={inc.status} />
          <SeverityBadge severity={inc.triage?.severity} />
        </div>
        <p className="text-[10px] font-mono text-slate-500 mt-1 truncate">{formatDateTime(inc.created_at)} · {inc.location.address ?? inc.description}</p>
      </div>
      <ChevronRight size={16} className="text-slate-500 shrink-0" />
    </button>
  );
}
