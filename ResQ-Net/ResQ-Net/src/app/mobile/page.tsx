'use client';

// Mobile SOS for anyone (login optional). Hold the button 1.5 s -> real incident with GPS.
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera, PhoneCall, AlertTriangle, ScanLine, X, ChevronLeft, CheckCircle2, Loader2, FileText, MapPin, Radio } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { Api, errorMessage, type ScanResult } from '@/lib/api';
import { compressImage } from '@/lib/image';
import { getCurrentPosition, vibrate } from '@/lib/hooks';
import type { Incident, LatLng } from '@/lib/types';
import { ErrorBanner, InfoBanner } from '@/components/ui';
import ReportForm, { QUICK_CHIPS } from '@/components/ReportForm';

const LAST_KEY = 'resqnet_last_incident'; // incident id + ref only (no personal data)

export default function MobileResponderApp() {
  const router = useRouter();
  const [isCitizen, setIsCitizen] = useState(false);
  const [forSelf, setForSelf] = useState(true);
  const [pos, setPos] = useState<LatLng | null>(null);
  const [gps, setGps] = useState<'locating' | 'ok' | 'failed'>('locating');
  const [holdProgress, setHoldProgress] = useState(0);
  const [sending, setSending] = useState(false);
  const [chip, setChip] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [attachedCnic, setAttachedCnic] = useState<string | null>(null);
  const [showFull, setShowFull] = useState(false);
  const [last, setLast] = useState<{ id: string; ref: string } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setIsCitizen(getSession()?.account.role === 'citizen');
      try {
        const raw = localStorage.getItem(LAST_KEY);
        if (raw) setLast(JSON.parse(raw));
      } catch { /* ignore */ }
      const fix = await getCurrentPosition(12000);
      if (fix) { setPos({ lat: fix.lat, lng: fix.lng }); setGps('ok'); } else setGps('failed');
    }, 0);
    return () => { clearTimeout(t); if (holdTimer.current) clearInterval(holdTimer.current); };
  }, []);

  function goTrack(inc: Incident) {
    try { localStorage.setItem(LAST_KEY, JSON.stringify({ id: inc.id, ref: inc.ref_code })); } catch { /* ignore */ }
    router.push(`/track/${inc.id}`);
  }

  async function sendSos() {
    if (!pos) {
      setError('Your GPS location is not available. Use "Full report" to drop a pin on the map.');
      setShowFull(true);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const self = isCitizen && forSelf;
      const inc = await Api.createIncident({
        lat: Number(pos.lat.toFixed(6)),
        lng: Number(pos.lng.toFixed(6)),
        description: chip ? `${chip}. SOS sent from mobile.` : 'SOS sent from mobile. No details given yet.',
        for_self: self || undefined,
        cnic: !self ? attachedCnic : null,
      });
      vibrate([200, 100, 200]);
      setAttachedCnic(null);
      goTrack(inc);
    } catch (e) {
      setError(errorMessage(e));
      setSending(false);
      setHoldProgress(0);
    }
  }

  function startHold() {
    if (sending || holdTimer.current) return;
    fired.current = false;
    holdTimer.current = setInterval(() => {
      setHoldProgress((p) => {
        const n = Math.min(p + 100 / 30, 100); // 30 ticks x 50 ms = 1.5 s
        if (n >= 100 && !fired.current) {
          fired.current = true;
          if (holdTimer.current) { clearInterval(holdTimer.current); holdTimer.current = null; }
          setTimeout(() => { void sendSos(); }, 0);
        }
        return n;
      });
    }, 50);
  }
  function endHold() {
    if (holdTimer.current) { clearInterval(holdTimer.current); holdTimer.current = null; }
    if (!fired.current) setHoldProgress(0);
  }

  async function onCnicPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScanStatus('scanning');
    setScan(null);
    try {
      const img = await compressImage(file); // memory only, never stored
      const r = await Api.scanCnic(img.base64, img.mime_type, 'identify');
      setScan(r);
      setScanStatus('done');
      vibrate(100);
    } catch (err) {
      setError(errorMessage(err));
      setScanStatus('idle');
    }
  }

  function closeScanner() {
    setShowScanner(false);
    setScanStatus('idle');
    setScan(null);
  }

  const done = holdProgress >= 100;
  const matched = scan?.verification === 'matched';

  return (
    <div className="min-h-screen w-full flex flex-col p-4 pb-12 max-w-md mx-auto relative overflow-hidden bg-[#030712] text-white">
      <Link href={isCitizen ? '/dashboard' : '/'} className="absolute top-4 right-4 z-[100] bg-slate-800/80 backdrop-blur-md border border-slate-600 hover:border-[#00F5D4] text-white px-4 py-2 rounded-full font-bold text-xs flex items-center transition-all">
        <ChevronLeft className="mr-1 text-[#00F5D4]" size={16} />
        {isCitizen ? 'DASHBOARD' : 'SIGN IN'}
      </Link>

      <header className="flex justify-between items-center mb-4 glass-panel p-4 rounded-2xl border-b-2 border-b-[#00F5D4] mt-12">
        <h1 className="text-xl font-bold text-gradient-cyan">ResQ Net <span className="text-xs border border-white/20 px-2 py-0.5 rounded-full ml-1 text-white">SOS</span></h1>
        <span className={`text-[10px] font-mono flex items-center gap-1 ${gps === 'ok' ? 'text-[#10B981]' : gps === 'failed' ? 'text-[#FFB703]' : 'text-slate-400'}`}>
          {gps === 'locating' ? <Loader2 size={11} className="animate-spin" /> : <MapPin size={11} />}
          {gps === 'ok' ? 'GPS LOCKED' : gps === 'failed' ? 'NO GPS' : 'LOCATING'}
        </span>
      </header>

      {last && (
        <Link href={`/track/${last.id}`} className="mb-3 flex items-center justify-between bg-[#00F5D4]/10 border border-[#00F5D4]/40 rounded-2xl px-4 py-3 text-xs font-mono">
          <span className="flex items-center gap-2 text-[#00F5D4]"><Radio size={14} className="animate-pulse" /> Track your last SOS ({last.ref})</span>
          <span className="text-[#00F5D4]">→</span>
        </Link>
      )}

      {isCitizen && (
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button onClick={() => setForSelf(true)} className={`py-2 rounded-xl text-[11px] font-bold font-mono border ${forSelf ? 'border-[#00F5D4] text-[#00F5D4] bg-[#00F5D4]/10' : 'border-slate-700 text-slate-400'}`}>HELP FOR ME</button>
          <button onClick={() => setForSelf(false)} className={`py-2 rounded-xl text-[11px] font-bold font-mono border ${!forSelf ? 'border-[#00F5D4] text-[#00F5D4] bg-[#00F5D4]/10' : 'border-slate-700 text-slate-400'}`}>SOMEONE ELSE</button>
        </div>
      )}

      {/* SOS button */}
      <div className="flex-1 flex flex-col items-center justify-center py-8 relative">
        <div
          className="relative flex items-center justify-center select-none touch-none"
          onMouseDown={startHold}
          onMouseUp={endHold}
          onMouseLeave={endHold}
          onTouchStart={(e) => { e.preventDefault(); startHold(); }}
          onTouchEnd={endHold}
          onTouchCancel={endHold}
        >
          <div className={`absolute inset-0 rounded-full bg-[#FF2A5F] blur-2xl transition-opacity duration-300 ${holdProgress > 0 ? 'opacity-50' : 'opacity-10'}`}></div>
          <div className="absolute inset-[-20px] rounded-full border border-[#FF2A5F]/30 animate-ping"></div>
          <svg className="absolute inset-[-10px] w-[200px] h-[200px] transform -rotate-90">
            <circle cx="100" cy="100" r="90" fill="transparent" stroke="#1E293B" strokeWidth="8" />
            <circle cx="100" cy="100" r="90" fill="transparent" stroke="#FF2A5F" strokeWidth="8"
              strokeDasharray={2 * Math.PI * 90} strokeDashoffset={2 * Math.PI * 90 * (1 - holdProgress / 100)} strokeLinecap="round" />
          </svg>
          <button aria-label="Hold to send SOS" className={`w-44 h-44 rounded-full flex flex-col items-center justify-center bg-gradient-to-br from-[#1e050c] to-[#0a0003] border-4 transition-all duration-150 z-10 ${done ? 'border-[#FF2A5F] shadow-[0_0_40px_rgba(255,42,95,0.8)] scale-95' : 'border-slate-800 shadow-xl'}`}>
            {sending ? <Loader2 size={44} className="text-[#FF2A5F] animate-spin" /> : <AlertTriangle size={48} className={done ? 'text-[#FF2A5F] animate-pulse' : 'text-slate-400'} />}
            <span className="font-bold mt-2 tracking-widest text-sm text-slate-300">
              {sending ? 'DISPATCHING…' : done ? 'SOS SENT!' : 'HOLD 1.5s'}
            </span>
          </button>
        </div>
        <p className="mt-8 text-slate-400 text-sm font-mono text-center px-6">
          {sending ? 'AI triage, nearest ambulance and best hospital are being matched (5–15 s)…' : 'Hold to dispatch an ambulance to your GPS location.'}
        </p>
      </div>

      {/* Quick "what happened" */}
      <div className="flex flex-wrap gap-1.5 justify-center mb-3">
        {QUICK_CHIPS.slice(0, 6).map((c) => (
          <button key={c} onClick={() => setChip(chip === c ? null : c)} className={`text-[11px] px-2.5 py-1 rounded-full border font-mono ${chip === c ? 'bg-[#FF2A5F]/20 border-[#FF2A5F] text-[#FF8FA8]' : 'border-slate-700 text-slate-400'}`}>{c}</button>
        ))}
      </div>
      {attachedCnic && (
        <div className="mb-3"><InfoBanner tone="success">Victim CNIC attached. Their medical profile goes to the ER with this SOS. <button onClick={() => setAttachedCnic(null)} className="underline">Remove</button></InfoBanner></div>
      )}
      <div className="mb-3"><ErrorBanner message={error} onClose={() => setError(null)} /></div>

      <div className="grid grid-cols-3 gap-3 mt-auto">
        <button onClick={() => setShowScanner(true)} className="glass-panel p-3 rounded-2xl flex flex-col items-center justify-center border border-[#00F5D4]/30 hover:bg-[#00F5D4]/10">
          <Camera size={24} className="text-[#00F5D4] mb-1.5" />
          <span className="text-xs font-bold text-center">Scan CNIC<br /><span className="text-[9px] font-mono text-slate-400">Victim medical ID</span></span>
        </button>
        <button onClick={() => setShowFull(true)} className="glass-panel p-3 rounded-2xl flex flex-col items-center justify-center border border-[#FFB703]/30 hover:bg-[#FFB703]/10">
          <FileText size={24} className="text-[#FFB703] mb-1.5" />
          <span className="text-xs font-bold text-center">Full report<br /><span className="text-[9px] font-mono text-slate-400">Photo · map pin</span></span>
        </button>
        <a href="tel:1122" className="glass-panel p-3 rounded-2xl flex flex-col items-center justify-center border border-slate-700 hover:bg-slate-800">
          <PhoneCall size={24} className="text-slate-300 mb-1.5" />
          <span className="text-xs font-bold text-center">Call 1122<br /><span className="text-[9px] font-mono text-slate-400">Voice dispatch</span></span>
        </a>
      </div>

      {/* CNIC scanner overlay */}
      {showScanner && (
        <div className="fixed inset-0 z-[2000] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 overflow-y-auto">
          <button onClick={closeScanner} className="absolute top-6 right-6 p-2 bg-slate-800 rounded-full border border-slate-600" aria-label="Close"><X size={24} /></button>
          <h2 className="text-xl font-bold mb-6 text-[#00F5D4] flex items-center"><ScanLine className="mr-2" /> CNIC Scanner</h2>

          <div className="w-full max-w-sm aspect-[1.6/1] border-2 border-[#00F5D4] rounded-xl relative overflow-hidden bg-slate-900 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(0,245,212,0.2)]">
            <div className="absolute top-4 left-4 w-8 h-8 border-t-4 border-l-4 border-[#00F5D4]"></div>
            <div className="absolute top-4 right-4 w-8 h-8 border-t-4 border-r-4 border-[#00F5D4]"></div>
            <div className="absolute bottom-4 left-4 w-8 h-8 border-b-4 border-l-4 border-[#00F5D4]"></div>
            <div className="absolute bottom-4 right-4 w-8 h-8 border-b-4 border-r-4 border-[#00F5D4]"></div>
            {scanStatus === 'idle' && (
              <label className="bg-[#00F5D4] text-black px-6 py-2 rounded-full font-bold shadow-lg cursor-pointer">
                TAKE CNIC PHOTO
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onCnicPhoto} />
              </label>
            )}
            {scanStatus === 'scanning' && (
              <>
                <div className="w-full h-1 bg-[#00F5D4] shadow-[0_0_15px_#00F5D4] absolute top-1/2 -translate-y-1/2 animate-pulse"></div>
                <p className="font-mono text-sm z-10 bg-black/60 px-3 py-1 rounded">Gemini is reading the card…</p>
              </>
            )}
            {scanStatus === 'done' && scan && (
              <div className={`absolute inset-0 flex flex-col items-center justify-center p-4 ${matched ? 'bg-[#10B981]/20' : 'bg-[#FFB703]/10'}`}>
                {matched ? <CheckCircle2 size={44} className="text-[#10B981] mb-2" /> : <AlertTriangle size={40} className="text-[#FFB703] mb-2" />}
                <p className="font-bold text-lg text-white text-center">
                  {matched ? 'IDENTITY MATCHED' : scan.verification === 'not_registered' ? 'NOT REGISTERED' : scan.verification === 'name_mismatch' ? 'NAME MISMATCH' : 'COULD NOT READ CARD'}
                </p>
              </div>
            )}
          </div>

          {scanStatus === 'done' && scan && (
            <div className="w-full max-w-sm glass-panel p-5 rounded-2xl border-t-4 border-t-[#00F5D4]">
              {matched && scan.profile ? (
                <>
                  <h3 className="text-lg font-bold border-b border-slate-700 pb-2 mb-3">{scan.profile.first_name}</h3>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm font-mono">
                    <div><span className="text-slate-400 block text-xs">Blood Group</span><span className="text-red-400 font-bold border border-red-400/30 px-1 rounded bg-red-400/10">{scan.profile.blood_group ?? 'Unknown'}</span></div>
                    <div className="col-span-2"><span className="text-slate-400 block text-xs">Critical Alerts</span><span className="text-[#FFB703]">{scan.profile.critical_alerts.length ? scan.profile.critical_alerts.join(' · ') : 'None on record'}</span></div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-300">
                  {scan.verification === 'not_registered' && 'This CNIC has no ResQ Net medical profile. You can still attach it so the ER knows who is coming.'}
                  {scan.verification === 'name_mismatch' && 'The name did not match our records. Attach it and the ER will verify on arrival.'}
                  {(scan.verification === 'unreadable' || !scan.extracted.cnic) && 'The card was not readable. Try again with a sharper, well-lit photo.'}
                </p>
              )}
              <div className="flex gap-2 mt-5">
                {scan.extracted.cnic && (
                  <button onClick={() => { setAttachedCnic(scan.extracted.cnic); setForSelf(false); closeScanner(); }} className="flex-1 bg-[#FF2A5F] py-3 rounded-xl font-bold neon-glow-red">ATTACH TO SOS</button>
                )}
                <button onClick={() => { setScanStatus('idle'); setScan(null); }} className="flex-1 border border-slate-600 py-3 rounded-xl font-bold">RESCAN</button>
              </div>
            </div>
          )}
          <p className="text-[10px] font-mono text-slate-500 mt-4 text-center">The photo is processed in memory and never saved.</p>
        </div>
      )}

      {/* Full report sheet */}
      {showFull && (
        <div className="fixed inset-0 z-[2000] bg-[#030712]/95 backdrop-blur-md overflow-y-auto p-4">
          <div className="max-w-md mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#FF2A5F]">Full emergency report</h2>
              <button onClick={() => setShowFull(false)} className="p-2 bg-slate-800 rounded-full border border-slate-600" aria-label="Close"><X size={20} /></button>
            </div>
            <ReportForm
              citizen={isCitizen ? { hasProfile: true, name: getSession()?.account.display_name ?? '', phone: getSession()?.account.phone ?? null } : null}
              onCreated={goTrack}
            />
          </div>
        </div>
      )}
    </div>
  );
}
