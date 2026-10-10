"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, beep, DEFAULT_POS, usePoll, useSession } from "@/lib/client";
import type { Capability, Hospital, Incident, LatLng, Track } from "@/lib/types";
import MapLazy from "@/components/MapLazy";
import {
  Atmist,
  Btn,
  Card,
  COLORS,
  ErrorBox,
  Field,
  FullProfile,
  inputCls,
  isFullProfile,
  LimitedProfile,
  NeedLogin,
  Page,
  RiskFlags,
  SeverityBadge,
} from "@/components/ui";

const CAPS: Capability[] = ["trauma", "cardiac", "neuro", "burns", "pediatric", "obstetric", "general"];
type HospitalWithDist = Hospital & { distance_km?: number };

function ClaimOrCreate({ onDone }: { onDone: (h: Hospital) => void }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<HospitalWithDist[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [pos, setPos] = useState<LatLng>(DEFAULT_POS);

  const search = useCallback(async (query: string) => {
    setSearching(true);
    setError(null);
    try {
      const qs = `near=${DEFAULT_POS.lat},${DEFAULT_POS.lng}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
      setList(await api<HospitalWithDist[]>(`/api/hospitals?${qs}`, { auth: false }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => search(""));
  }, [search]);

  async function claim(id: string) {
    setError(null);
    try {
      onDone(await api<Hospital>("/api/hospital/claim", { method: "POST", body: { hospital_id: id } }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      onDone(
        await api<Hospital>("/api/hospital/create", {
          method: "POST",
          body: { name, lat: pos.lat, lng: pos.lng, ...(address ? { address } : {}), ...(phone ? { phone } : {}) },
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <ErrorBox error={error} />
      <Card>
        <h2 className="text-lg font-bold">Claim your hospital</h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search(q);
          }}
        >
          <input className={inputCls} placeholder="Search e.g. PIMS, Shifa" value={q} onChange={(e) => setQ(e.target.value)} />
          <Btn type="submit" disabled={searching}>
            {searching ? "…" : "Search"}
          </Btn>
        </form>
        <ul className="max-h-96 divide-y divide-zinc-200 overflow-y-auto">
          {list.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div>
                <div className="font-semibold">{h.name}</div>
                <div className="text-xs text-zinc-500">
                  {h.address ?? "no address"}
                  {h.distance_km != null ? ` · ${h.distance_km.toFixed(2)} km` : ""}
                </div>
              </div>
              {h.is_live ? (
                <span className="text-xs font-semibold text-zinc-500">claimed</span>
              ) : (
                <Btn onClick={() => claim(h.id)}>Claim</Btn>
              )}
            </li>
          ))}
          {list.length === 0 && !searching && <li className="py-2 text-sm text-zinc-500">No hospitals found.</li>}
        </ul>
      </Card>
      <Card>
        <h2 className="text-lg font-bold">…or create a new one</h2>
        <form onSubmit={create} className="space-y-2">
          <Field label="Name">
            <input className={inputCls} required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Address">
            <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <p className="text-sm text-zinc-600">
            Tap the map to set location: {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}
          </p>
          <MapLazy center={pos} markers={[{ ...pos, color: COLORS.hospital }]} onClick={setPos} recenter={false} height={220} />
          <Btn type="submit">Create hospital</Btn>
        </form>
      </Card>
    </>
  );
}

function Editor({ h, onChange }: { h: Hospital; onChange: (h: Hospital) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function update(patch: Partial<Pick<Hospital, "capabilities" | "er_beds_available" | "accepting">>) {
    setSaving(true);
    setError(null);
    onChange({ ...h, ...patch });
    try {
      onChange(await api<Hospital>("/api/hospital/me", { method: "PUT", body: patch }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const beds = h.er_beds_available ?? 0;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-bold">{h.name}</div>
          <div className="text-xs text-zinc-500">{h.address}</div>
        </div>
        <span className="text-xs text-zinc-500">{saving ? "saving…" : "saved"}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {CAPS.map((c) => (
          <label key={c} className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={h.capabilities.includes(c)}
              onChange={(e) =>
                update({ capabilities: e.target.checked ? [...h.capabilities, c] : h.capabilities.filter((x) => x !== c) })
              }
            />
            {c}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span className="font-semibold">ER beds:</span>
        <Btn color="gray" onClick={() => update({ er_beds_available: Math.max(0, beds - 1) })}>
          −
        </Btn>
        <span className="w-8 text-center text-2xl font-bold">{beds}</span>
        <Btn color="gray" onClick={() => update({ er_beds_available: beds + 1 })}>
          +
        </Btn>
        <Btn color={h.accepting ? "green" : "red"} onClick={() => update({ accepting: !h.accepting })}>
          {h.accepting ? "Accepting" : "Not accepting"}
        </Btn>
      </div>
      <ErrorBox error={error} />
    </Card>
  );
}

function IncomingCard({ inc, track, onUpdate }: { inc: Incident; track?: Track; onUpdate: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: "POST", body: body ?? {} });
      onUpdate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const p = inc.identity.profile;
  const dist = track?.distance_to_patient_km ?? track?.distance_to_hospital_km ?? null;
  const readiness = inc.hospital_status.readiness;
  return (
    <Card className="border-2 border-red-400">
      <div className="flex items-center justify-between">
        <div className="font-mono text-xl font-black">{inc.ref_code}</div>
        <div className="flex items-center gap-2">
          <SeverityBadge severity={inc.triage.severity} />
          <span className="text-sm capitalize">{inc.triage.category}</span>
        </div>
      </div>
      <div className="flex justify-between text-sm">
        <span>
          Status: <b>{inc.status}</b> · {inc.ambulance?.call_sign ?? "no ambulance"}
        </span>
        <span>
          {dist != null && <b>{dist.toFixed(2)} km</b>}
          {track?.eta_min != null && ` · ${track.eta_min.toFixed(1)} min (est.)`}
        </span>
      </div>
      {inc.brief && <p className="text-sm font-medium">{inc.brief.summary}</p>}
      <RiskFlags flags={inc.triage.risk_flags} />
      <div className="rounded bg-zinc-50 p-2">
        <div className="text-sm font-semibold">Patient — identity {inc.identity.status}</div>
        {isFullProfile(p) ? <FullProfile p={p} /> : <LimitedProfile profile={p} />}
      </div>
      {inc.brief && (
        <>
          <div className="text-sm font-semibold">ATMIST</div>
          <Atmist brief={inc.brief} />
          {inc.brief.prep_checklist.length > 0 && (
            <>
              <div className="text-sm font-semibold">Prep checklist</div>
              <ul className="list-disc pl-5 text-sm">
                {inc.brief.prep_checklist.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {inc.hospital_decision && <p className="text-xs text-zinc-600">Why us: {inc.hospital_decision.chosen_reason}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">
          Readiness: <b className="uppercase">{readiness}</b>
        </span>
        <Btn
          color="orange"
          disabled={busy || readiness === "preparing"}
          onClick={() => post(`/api/hospital/incidents/${inc.id}/readiness`, { readiness: "preparing" })}
        >
          Preparing
        </Btn>
        <Btn
          color="green"
          disabled={busy || readiness === "ready"}
          onClick={() => post(`/api/hospital/incidents/${inc.id}/readiness`, { readiness: "ready" })}
        >
          Ready
        </Btn>
        <Btn color="gray" disabled={busy} onClick={() => post(`/api/hospital/incidents/${inc.id}/close`)}>
          Close
        </Btn>
      </div>
      <ErrorBox error={error} />
    </Card>
  );
}

export default function HospitalPage() {
  const session = useSession();
  const isHosp = session?.account.role === "hospital";
  const [hospital, setHospital] = useState<Hospital | null | undefined>(undefined);
  const [incoming, setIncoming] = useState<Incident[]>([]);
  const [tracks, setTracks] = useState<Record<string, Track>>({});
  const [error, setError] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!isHosp) return;
    api<{ hospital: Hospital | null }>("/api/me")
      .then((m) => setHospital(m.hospital))
      .catch((e: Error) => setError(e.message));
  }, [isHosp]);

  const poll = useCallback(async () => {
    if (!hospital) return;
    try {
      const list = await api<Incident[]>("/api/hospital/incoming");
      setIncoming(list);
      const ids = new Set(list.map((i) => i.id));
      if (seen.current && list.some((i) => !seen.current!.has(i.id))) beep();
      seen.current = ids;
      const ts = await Promise.all(
        list.map((i) => api<Track>(`/api/incidents/${i.id}/track`, { auth: false }).catch(() => null)),
      );
      const map: Record<string, Track> = {};
      ts.forEach((t) => {
        if (t) map[t.incident_id] = t;
      });
      setTracks(map);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [hospital]);

  usePoll(poll, 3000, [hospital?.id]);

  if (session === undefined) return <Page title="Hospital">Loading…</Page>;
  if (!isHosp)
    return (
      <Page title="Hospital">
        <NeedLogin role="hospital" />
      </Page>
    );

  return (
    <Page title="Hospital dashboard">
      <ErrorBox error={error} />
      {hospital === undefined && <p>Loading…</p>}
      {hospital === null && <ClaimOrCreate onDone={setHospital} />}
      {hospital && (
        <>
          <Editor h={hospital} onChange={setHospital} />
          <h2 className="text-xl font-bold">Incoming patients ({incoming.length})</h2>
          {incoming.length === 0 && <Card>No incoming patients.</Card>}
          {incoming.map((inc) => (
            <IncomingCard key={inc.id} inc={inc} track={tracks[inc.id]} onUpdate={() => void poll()} />
          ))}
        </>
      )}
    </Page>
  );
}
