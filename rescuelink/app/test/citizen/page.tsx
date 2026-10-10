"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, getGps, resizeImageToBase64, useSession } from "@/lib/client";
import type { CitizenProfile, Incident } from "@/lib/types";
import { Btn, Card, ErrorBox, Field, inputCls, NeedLogin, Page, SeverityBadge } from "@/components/ui";

const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

type Form = {
  cnic: string;
  cnic_source: "typed" | "scanned";
  full_name: string;
  date_of_birth: string;
  gender: string;
  blood_group: string;
  conditions: string;
  allergies: string;
  medications: string;
  ec_name: string;
  ec_phone: string;
  ec_email: string;
  ec_relation: string;
};

const EMPTY: Form = {
  cnic: "",
  cnic_source: "typed",
  full_name: "",
  date_of_birth: "",
  gender: "",
  blood_group: "",
  conditions: "",
  allergies: "",
  medications: "",
  ec_name: "",
  ec_phone: "",
  ec_email: "",
  ec_relation: "",
};

function fromProfile(p: CitizenProfile): Form {
  return {
    cnic: p.cnic,
    cnic_source: p.cnic_source,
    full_name: p.full_name,
    date_of_birth: p.date_of_birth ?? "",
    gender: p.gender ?? "",
    blood_group: p.blood_group ?? "",
    conditions: p.conditions.join(", "),
    allergies: p.allergies.join(", "),
    medications: p.medications.join(", "),
    ec_name: p.emergency_contact?.name ?? "",
    ec_phone: p.emergency_contact?.phone ?? "",
    ec_email: p.emergency_contact?.email ?? "",
    ec_relation: p.emergency_contact?.relation ?? "",
  };
}

const split = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

type ScanResult = {
  extracted: { cnic: string | null; full_name: string | null; date_of_birth: string | null; gender: string | null };
  confidence: string;
  source: string;
};

export default function CitizenPage() {
  const session = useSession();
  const router = useRouter();
  const [f, setF] = useState<Form>(EMPTY);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [desc, setDesc] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  const isCitizen = session?.account.role === "citizen";

  useEffect(() => {
    if (!isCitizen) return;
    api<CitizenProfile>("/api/citizen/profile")
      .then((p) => {
        setF(fromProfile(p));
        setHasProfile(true);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setHasProfile(false);
        else setError((e as Error).message);
      });
    api<Incident[]>("/api/citizen/incidents")
      .then(setIncidents)
      .catch(() => {});
  }, [isCitizen]);

  if (session === undefined) return <Page title="Citizen">Loading…</Page>;
  if (!isCitizen)
    return (
      <Page title="Citizen">
        <NeedLogin role="citizen" />
      </Page>
    );

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function scan(file: File | undefined) {
    if (!file) return;
    setScanning(true);
    setError(null);
    setMsg(null);
    try {
      const img = await resizeImageToBase64(file);
      const r = await api<ScanResult>("/api/ai/scan-cnic", {
        method: "POST",
        body: { image_base64: img.base64, mime_type: img.mime_type, purpose: "register" },
      });
      const x = r.extracted;
      setF((p) => ({
        ...p,
        cnic: x.cnic ?? p.cnic,
        full_name: x.full_name ?? p.full_name,
        date_of_birth: x.date_of_birth ?? p.date_of_birth,
        gender: x.gender ?? p.gender,
        cnic_source: "scanned",
      }));
      setMsg(`Scanned (confidence ${r.confidence}, source ${r.source}). Check the fields, then save.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const p = await api<CitizenProfile>("/api/citizen/profile", {
        method: "PUT",
        body: {
          cnic: f.cnic,
          cnic_source: f.cnic_source,
          full_name: f.full_name,
          date_of_birth: f.date_of_birth || null,
          gender: f.gender || null,
          blood_group: f.blood_group || null,
          conditions: split(f.conditions),
          allergies: split(f.allergies),
          medications: split(f.medications),
          emergency_contact: {
            name: f.ec_name,
            phone: f.ec_phone,
            email: f.ec_email || null,
            relation: f.ec_relation,
          },
        },
      });
      setF(fromProfile(p));
      setHasProfile(true);
      setMsg("Profile saved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function requestAmbulance() {
    setRequesting(true);
    setError(null);
    try {
      const gps = await getGps();
      if (gps.fallback) setMsg("GPS unavailable — using demo location (Islamabad).");
      const inc = await api<Incident>("/api/incidents", {
        method: "POST",
        body: { lat: gps.lat, lng: gps.lng, description: desc || "I need an ambulance", for_self: true },
      });
      router.push(`/test/track/${inc.id}`);
    } catch (e) {
      setError((e as Error).message);
      setRequesting(false);
    }
  }

  return (
    <Page title="Citizen">
      <p className="text-sm text-zinc-600">
        Logged in as <b>{session.account.display_name}</b>
        {hasProfile === false && " — no emergency profile yet"}
      </p>
      <ErrorBox error={error} />
      {msg && <div className="rounded border border-green-400 bg-green-50 p-2 text-sm text-green-800">{msg}</div>}

      <Card className="border-red-300">
        <h2 className="text-lg font-bold text-red-700">Request ambulance for me</h2>
        <textarea
          className={inputCls}
          rows={2}
          placeholder="What's wrong? e.g. chest pain, short of breath"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <Btn color="red" onClick={requestAmbulance} disabled={requesting}>
          {requesting ? "AI triage + dispatch…" : "Request ambulance"}
        </Btn>
      </Card>

      <Card>
        <h2 className="text-lg font-bold">Emergency profile</h2>
        <label className="block rounded bg-blue-50 p-3 text-center font-semibold text-blue-800">
          {scanning ? "Reading CNIC with AI…" : "📷 Scan my CNIC"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={scanning}
            onChange={(e) => {
              void scan(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <form onSubmit={save} className="space-y-2">
          <Field label={`CNIC (${f.cnic_source})`}>
            <input
              className={inputCls}
              required
              placeholder="35202-1234567-1"
              value={f.cnic}
              onChange={(e) => setF((p) => ({ ...p, cnic: e.target.value, cnic_source: "typed" }))}
            />
          </Field>
          <Field label="Full name">
            <input className={inputCls} required value={f.full_name} onChange={set("full_name")} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date of birth">
              <input className={inputCls} type="date" value={f.date_of_birth} onChange={set("date_of_birth")} />
            </Field>
            <Field label="Gender">
              <select className={inputCls} value={f.gender} onChange={set("gender")}>
                <option value="">-</option>
                <option value="male">male</option>
                <option value="female">female</option>
                <option value="other">other</option>
              </select>
            </Field>
          </div>
          <Field label="Blood group">
            <select className={inputCls} value={f.blood_group} onChange={set("blood_group")}>
              <option value="">unknown</option>
              {BLOOD.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Conditions (comma separated)">
            <input className={inputCls} value={f.conditions} onChange={set("conditions")} />
          </Field>
          <Field label="Allergies (comma separated)">
            <input className={inputCls} value={f.allergies} onChange={set("allergies")} />
          </Field>
          <Field label="Medications (comma separated)">
            <input className={inputCls} value={f.medications} onChange={set("medications")} />
          </Field>
          <h3 className="pt-2 font-semibold">Emergency contact</h3>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name">
              <input className={inputCls} required value={f.ec_name} onChange={set("ec_name")} />
            </Field>
            <Field label="Relation">
              <input className={inputCls} required value={f.ec_relation} onChange={set("ec_relation")} />
            </Field>
            <Field label="Phone">
              <input className={inputCls} required value={f.ec_phone} onChange={set("ec_phone")} />
            </Field>
            <Field label="Email (optional)">
              <input className={inputCls} type="email" value={f.ec_email} onChange={set("ec_email")} />
            </Field>
          </div>
          <Btn type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </Btn>
        </form>
      </Card>

      <Card>
        <h2 className="text-lg font-bold">My incidents</h2>
        {incidents.length === 0 && <p className="text-sm text-zinc-500">None.</p>}
        <ul className="space-y-1">
          {incidents.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                <b>{i.ref_code}</b> — {i.status} <SeverityBadge severity={i.triage?.severity} />
              </span>
              <Link className="text-blue-700 underline" href={`/test/track/${i.id}`}>
                Track
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}
