'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Eye, EyeOff, User, Hospital, Truck, ArrowRight, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { saveSession, getSession, getDashboardRoute, takeNotice, ROLE_META, type Role } from '@/lib/auth';
import { Api, errorMessage } from '@/lib/api';

type Mode = 'login' | 'signup';

const ROLES: Role[] = ['citizen', 'hospital', 'ambulance'];

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [role, setRole] = useState<Role>('citizen');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Redirect if already logged in; show one-shot notices (e.g. session expired)
  useEffect(() => {
    const session = getSession();
    if (session) { router.replace(getDashboardRoute(session.account.role)); return; }
    const notice = takeNotice();
    if (notice) setTimeout(() => setError(notice), 0);
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      let session;
      if (mode === 'login') {
        session = await Api.login(email.trim(), password);
        setSuccess('Signed in! Redirecting...');
      } else {
        if (!displayName.trim()) throw new Error('Please enter a display name.');
        session = await Api.signup(email.trim(), password, role, displayName.trim(), phone.trim() || undefined);
        setSuccess('Account created! Redirecting...');
      }
      saveSession(session);
      router.replace(getDashboardRoute(session.account.role));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const roleIcons: Record<Role, React.ReactNode> = {
    citizen: <User size={20} />,
    hospital: <Hospital size={20} />,
    ambulance: <Truck size={20} />,
  };

  const inputCls = `w-full bg-slate-950/70 border border-slate-700 focus:border-[#00F5D4] focus:shadow-[0_0_0_2px_rgba(0,245,212,0.1)] outline-none text-white px-4 py-3.5 rounded-2xl font-mono text-sm transition-all placeholder-slate-600`;

  return (
    <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background ambient glows */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#FF2A5F]/8 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-[#00F5D4]/8 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-slate-900/20 rounded-full blur-[120px] pointer-events-none" />

      {/* Logo */}
      <div className="flex flex-col items-center mb-10 z-10">
        <div className="relative mb-5">
          <div className="w-20 h-20 bg-[#FF2A5F]/10 rounded-3xl flex items-center justify-center border border-[#FF2A5F]/25 shadow-[0_0_50px_rgba(255,42,95,0.15)]">
            <div className="absolute inset-0 rounded-3xl bg-[#FF2A5F]/10 animate-ping opacity-30" />
            <Activity className="text-[#FF2A5F]" size={38} />
          </div>
        </div>
        <h1 className="text-5xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400">
          ResQ <span className="text-[#00F5D4]">Net</span>
        </h1>
        <p className="text-slate-500 font-mono text-xs mt-2 tracking-[0.25em]">NATIONAL EMERGENCY COMMAND SYSTEM</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md z-10">
        <div className="bg-slate-900/50 backdrop-blur-2xl rounded-3xl border border-slate-800/80 shadow-[0_0_80px_rgba(0,0,0,0.6)] overflow-hidden">

          {/* Mode Toggle */}
          <div className="grid grid-cols-2 bg-slate-950/60 border-b border-slate-800">
            {(['login', 'signup'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); setSuccess(''); }}
                className={`py-4 text-sm font-bold tracking-wider transition-all ${mode === m
                    ? 'text-white bg-slate-800/50 border-b-2 border-b-[#00F5D4]'
                    : 'text-slate-500 hover:text-slate-300'
                  }`}
              >
                {m === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
              </button>
            ))}
          </div>

          <div className="p-7">
            {/* Role Selector (Signup) */}
            {mode === 'signup' && (
              <div className="mb-6">
                <p className="text-[10px] text-slate-500 font-mono tracking-widest mb-3">SELECT YOUR ROLE</p>
                <div className="grid grid-cols-3 gap-2">
                  {ROLES.map(r => {
                    const meta = ROLE_META[r];
                    const active = role === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        className={`flex flex-col items-center p-3 rounded-2xl border transition-all text-center ${active
                            ? `border-[${meta.color}] bg-[${meta.color}]/10 shadow-[0_0_15px_${meta.color}25]`
                            : 'border-slate-800 hover:border-slate-600 bg-slate-950/30'
                          }`}
                        style={active ? { borderColor: meta.color, backgroundColor: `${meta.color}15` } : {}}
                      >
                        <span className="text-2xl mb-1">{meta.icon}</span>
                        <span className="text-[10px] font-bold" style={{ color: active ? meta.color : '#64748b' }}>
                          {meta.label.toUpperCase()}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs font-mono text-slate-500 mt-3 text-center">{ROLE_META[role].description}</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="text-[10px] text-slate-500 font-mono tracking-widest block mb-1.5">DISPLAY NAME</label>
                  <input
                    className={inputCls}
                    placeholder={role === 'hospital' ? 'City Hospital ER' : role === 'ambulance' ? 'Rescue 1122 - Unit 4' : 'Your full name'}
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    required
                  />
                </div>
              )}

              <div>
                <label className="text-[10px] text-slate-500 font-mono tracking-widest block mb-1.5">EMAIL ADDRESS</label>
                <input
                  type="email"
                  className={inputCls}
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-500 font-mono tracking-widest block mb-1.5">PASSWORD</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className={`${inputCls} pr-12`}
                    placeholder={mode === 'signup' ? 'Min. 8 characters' : '••••••••'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={mode === 'signup' ? 8 : undefined}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {mode === 'signup' && (
                <div>
                  <label className="text-[10px] text-slate-500 font-mono tracking-widest block mb-1.5">PHONE <span className="text-slate-700">(OPTIONAL)</span></label>
                  <input
                    type="tel"
                    className={inputCls}
                    placeholder="+923001234567"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                  />
                </div>
              )}

              {/* Error / Success */}
              {error && (
                <div className="flex items-center space-x-2 text-[#FF2A5F] text-sm font-mono bg-[#FF2A5F]/8 border border-[#FF2A5F]/20 px-4 py-3 rounded-2xl">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {success && (
                <div className="flex items-center space-x-2 text-[#10B981] text-sm font-mono bg-[#10B981]/8 border border-[#10B981]/20 px-4 py-3 rounded-2xl">
                  <CheckCircle2 size={16} className="shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className={`w-full py-4 rounded-2xl font-bold tracking-widest text-white transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center space-x-2 mt-2 ${loading
                    ? 'bg-slate-700'
                    : 'bg-gradient-to-r from-[#FF2A5F] to-[#d61745] hover:to-[#FF2A5F] shadow-[0_0_25px_rgba(255,42,95,0.35)] hover:shadow-[0_0_35px_rgba(255,42,95,0.55)]'
                  }`}
              >
                {loading ? (
                  <><Loader2 size={18} className="animate-spin" /><span>AUTHENTICATING...</span></>
                ) : (
                  <><span>{mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}</span><ArrowRight size={18} /></>
                )}
              </button>
            </form>

            {/* Switch Mode */}
            <p className="text-center text-slate-600 text-xs font-mono mt-6">
              {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
              <button
                onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess(''); }}
                className="text-[#00F5D4] hover:text-white ml-2 transition-colors font-bold"
              >
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>

        {/* Emergency help never requires an account */}
        <Link
          href="/mobile"
          className="mt-6 flex items-center justify-between bg-[#FF2A5F]/10 hover:bg-[#FF2A5F]/20 backdrop-blur-xl rounded-2xl border border-[#FF2A5F]/40 p-4 transition-all group"
        >
          <div>
            <p className="text-sm font-extrabold text-[#FF2A5F] tracking-wide">🚨 EMERGENCY? REPORT WITHOUT AN ACCOUNT</p>
            <p className="text-[10px] font-mono text-slate-400 mt-0.5">Send your GPS location and track the ambulance live. No login needed.</p>
          </div>
          <ArrowRight size={18} className="text-[#FF2A5F] group-hover:translate-x-1 transition-transform" />
        </Link>
        <Link href="/admin" className="mt-3 block text-center text-[10px] font-mono text-slate-500 hover:text-[#00F5D4] tracking-widest">
          PUBLIC CONTROL ROOM →
        </Link>
      </div>
    </div>
  );
}
