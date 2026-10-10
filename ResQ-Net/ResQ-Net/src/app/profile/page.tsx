'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Camera, CheckCircle2, Loader2, Save, ScanLine, UserCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Api, errorMessage } from '@/lib/api';
import { compressImage } from '@/lib/image';
import type { CitizenProfile } from '@/lib/types';
import { AppNav, ErrorBanner, FullPageError, InfoBanner, LoadingScreen, cardCls, inputCls, labelCls } from '@/components/ui';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const RELATIONS = ['Father', 'Mother', 'Spouse', 'Brother', 'Sister', 'Son', 'Daughter', 'Friend', 'Other'];

type Form = {
  cnic: string; full_name: string; date_of_birth: string; gender: '' | 'male' | 'female' | 'other';
  blood_group: string; conditions: string; allergies: string; medications: string;
  ec_name: string; ec_phone: string; ec_email: string; ec_relation: string;
};

const EMPTY: Form = {
  cnic: '', full_name: '', date_of_birth: '', gender: '', blood_group: '', conditions: '', allergies: '', medications: '',
  ec_name: '', ec_phone: '', ec_email: '', ec_relation: 'Father',
};

function fromProfile(p: CitizenProfile): Form {
  return {
    cnic: p.cnic, full_name: p.full_name, date_of_birth: p.date_of_birth ?? '', gender: p.gender ?? '',
    blood_group: p.blood_group ?? '', conditions: p.conditions.join(', '), allergies: p.allergies.join(', '),
    medications: p.medications.join(', '), ec_name: p.emergency_contact.name, ec_phone: p.emergency_contact.phone,
    ec_email: p.emergency_contact.email ?? '', ec_relation: p.emergency_contact.relation || 'Other',
  };
}

const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const digits = (s: string) => s.replace(/\D/g, '');
function formatCnic(s: string) {
  const d = digits(s);
  return d.length === 13 ? `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}` : s.trim();
}

export default function ProfilePage() {
  const { me, checking, error: authError, reload, setMe, logout } = useAuth('citizen');
  const [form, setForm] = useState<Form>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [scannedCnic, setScannedCnic] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<{ tone: 'success' | 'warn'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!me || loaded) return;
    const t = setTimeout(() => {
      if (me.citizen_profile) {
        setForm(fromProfile(me.citizen_profile));
        if (me.citizen_profile.cnic_source === 'scanned') setScannedCnic(me.citizen_profile.cnic);
      } else {
        setForm((f) => ({ ...f, full_name: me.account.display_name }));
      }
      setLoaded(true);
    }, 0);
    return () => clearTimeout(t);
  }, [me, loaded]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };

  async function onScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScanning(true);
    setScanMsg(null);
    setError(null);
    try {
      const img = await compressImage(file); // memory only, never stored
      const r = await Api.scanCnic(img.base64, img.mime_type, 'register');
      const x = r.extracted;
      if (!x.cnic && !x.full_name) {
        setScanMsg({ tone: 'warn', text: "We couldn't read this card clearly. Try a sharper, well-lit photo, or type the details below." });
        return;
      }
      setForm((f) => ({
        ...f,
        cnic: x.cnic ?? f.cnic,
        full_name: x.full_name ?? f.full_name,
        date_of_birth: x.date_of_birth ?? f.date_of_birth,
        gender: x.gender ?? f.gender,
      }));
      if (x.cnic) setScannedCnic(x.cnic);
      setSaved(false);
      setScanMsg({
        tone: r.confidence === 'low' ? 'warn' : 'success',
        text: r.confidence === 'low'
          ? 'Card read with low confidence. Please double-check the highlighted fields.'
          : 'CNIC read by AI. Check the details, then add your medical info.',
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setScanning(false);
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cnic = formatCnic(form.cnic);
    if (!/^\d{5}-\d{7}-\d$/.test(cnic)) { setError('Please enter a valid 13-digit CNIC (e.g. 35202-1234567-1).'); return; }
    if (!form.full_name.trim()) { setError('Please enter your full name as on the CNIC.'); return; }
    if (!form.ec_name.trim() || !form.ec_phone.trim()) { setError('Please add an emergency contact name and phone number.'); return; }
    if (form.ec_email.trim() && !/^\S+@\S+\.\S+$/.test(form.ec_email.trim())) { setError('The emergency contact email looks invalid.'); return; }
    setSaving(true);
    try {
      const p = await Api.saveProfile({
        cnic,
        cnic_source: scannedCnic && digits(scannedCnic) === digits(cnic) ? 'scanned' : 'typed',
        full_name: form.full_name.trim(),
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        blood_group: form.blood_group || null,
        conditions: list(form.conditions),
        allergies: list(form.allergies),
        medications: list(form.medications),
        emergency_contact: {
          name: form.ec_name.trim(), phone: form.ec_phone.trim(),
          email: form.ec_email.trim() || null, relation: form.ec_relation || 'Other',
        },
      });
      if (me) setMe({ ...me, citizen_profile: p });
      setForm(fromProfile(p));
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (checking) return <LoadingScreen />;
  if (authError || !me) return <FullPageError message={authError ?? 'Please try again.'} onRetry={reload} onLogout={logout} />;

  return (
    <div className="min-h-screen w-full bg-[#030712] text-white p-3 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <AppNav
          title={<>Emergency <span className="text-[#00F5D4]">Profile</span></>}
          subtitle={<span className="text-[10px] font-mono text-slate-400">Shared with the ER only when you need help</span>}
          color="#00F5D4"
          icon={<UserCheck size={22} />}
          links={[{ href: '/dashboard', label: 'Dashboard', color: '#00F5D4', icon: <ArrowLeft size={14} /> }]}
          onLogout={logout}
        />

        {/* CNIC scan */}
        <div className={`${cardCls} border-[#00F5D4]/30`}>
          <h2 className="text-sm font-bold flex items-center text-[#00F5D4] mb-3"><ScanLine className="mr-2" size={18} /> Scan your CNIC (front side)</h2>
          <label className={`border-2 border-dashed rounded-2xl p-5 flex flex-col items-center justify-center transition-all ${scanning ? 'border-[#00F5D4] cursor-wait' : 'border-slate-700 hover:border-[#00F5D4] cursor-pointer'} bg-slate-950/60`}>
            {scanning ? (
              <>
                <Loader2 size={26} className="text-[#00F5D4] animate-spin mb-2" />
                <p className="text-xs font-mono text-[#00F5D4]">GEMINI IS READING YOUR CARD...</p>
              </>
            ) : (
              <>
                <Camera size={26} className="text-slate-400 mb-2" />
                <p className="text-sm font-bold text-slate-200">Take or upload a CNIC photo</p>
                <p className="text-[10px] font-mono text-slate-500 mt-1">AI fills CNIC number, name, date of birth and gender. The photo is never stored.</p>
              </>
            )}
            <input type="file" accept="image/*" capture="environment" onChange={onScan} disabled={scanning} className="hidden" />
          </label>
          {scanMsg && <div className="mt-3"><InfoBanner tone={scanMsg.tone}>{scanMsg.text}</InfoBanner></div>}
        </div>

        <form onSubmit={onSave} className={`${cardCls} space-y-5`}>
          <div>
            <p className="text-xs font-bold text-white mb-3">Identity</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>CNIC NUMBER</label>
                <input className={inputCls} placeholder="35202-1234567-1" value={form.cnic} onChange={(e) => set('cnic', e.target.value)} required inputMode="numeric" />
              </div>
              <div>
                <label className={labelCls}>FULL NAME (AS ON CNIC)</label>
                <input className={inputCls} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>DATE OF BIRTH</label>
                <input type="date" className={inputCls} value={form.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>GENDER</label>
                <select className={inputCls} value={form.gender} onChange={(e) => set('gender', e.target.value as Form['gender'])}>
                  <option value="">Not specified</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-white mb-3">Medical</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>BLOOD GROUP</label>
                <select className={inputCls} value={form.blood_group} onChange={(e) => set('blood_group', e.target.value)}>
                  <option value="">Unknown</option>
                  {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>ALLERGIES (COMMA SEPARATED)</label>
                <input className={inputCls} placeholder="Penicillin, Aspirin" value={form.allergies} onChange={(e) => set('allergies', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>CONDITIONS</label>
                <input className={inputCls} placeholder="Diabetes, Asthma" value={form.conditions} onChange={(e) => set('conditions', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>MEDICATIONS</label>
                <input className={inputCls} placeholder="Warfarin, Insulin" value={form.medications} onChange={(e) => set('medications', e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-white mb-3">Emergency contact <span className="text-slate-500 font-normal">(gets an email + WhatsApp link when you need help)</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>NAME</label>
                <input className={inputCls} value={form.ec_name} onChange={(e) => set('ec_name', e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>RELATION</label>
                <select className={inputCls} value={form.ec_relation} onChange={(e) => set('ec_relation', e.target.value)}>
                  {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>PHONE (WHATSAPP)</label>
                <input type="tel" className={inputCls} placeholder="+923001234567" value={form.ec_phone} onChange={(e) => set('ec_phone', e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>EMAIL (OPTIONAL)</label>
                <input type="email" className={inputCls} placeholder="relative@example.com" value={form.ec_email} onChange={(e) => set('ec_email', e.target.value)} />
              </div>
            </div>
          </div>

          <ErrorBanner message={error} onClose={() => setError(null)} />
          {saved && (
            <InfoBanner tone="success">
              Profile saved. Your blood group and critical alerts will reach the ER instantly in an emergency.{' '}
              <Link href="/dashboard" className="underline font-bold">Back to dashboard →</Link>
            </InfoBanner>
          )}

          <button type="submit" disabled={saving || scanning} className="w-full bg-gradient-to-r from-[#00F5D4] to-[#00c9ae] text-black font-extrabold tracking-wider py-3.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60">
            {saving ? <Loader2 size={18} className="animate-spin" /> : saved ? <CheckCircle2 size={18} /> : <Save size={18} />}
            <span>{saving ? 'SAVING...' : saved ? 'SAVED' : 'SAVE EMERGENCY PROFILE'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
