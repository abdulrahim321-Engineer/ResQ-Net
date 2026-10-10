"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, beep, gmapsLink, usePoll, useSession } from "@/lib/client";
import type { Ambulance, Incident, LatLng, Track } from "@/lib/types";
import MapLazy, { type MapMarker } from "@/components/MapLazy";
import {
  Atmist,
  Btn,
  Card,
  COLORS,
  ErrorBox,
  Field,
  inputCls,
  LimitedProfile,
  NeedLogin,
  Page,
  RiskFlags,
  SeverityBadge,
} from "@/components/ui";

type Me = { ambulance: Ambulance | null };

function Setup({ onDone }: { onDone: (a: Ambulance) => void }) {
  const [callSign, setCallSign] = useState("");
  const [service, setService] = useState("Rescue 1122");
  const [type, setType] = useState<"ALS" | "BLS">("ALS");
  const [plate, setPlate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const a = await api<Ambulance>("/api/ambulance/setup", {
        method: "POST",
        body: { call_sign: callSign, service_name: service, vehicle_type: type, ...(plate ? { plate } : {}) },
      });
      onDone(a);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-bold">Register your vehicle</h2>
      <form onSubmit={submit} className="space-y-2">
        <Field label="Call sign">
          <input className={inputCls} required placeholder="ISB-07" value={callSign} onChange={(e) => setCallSign(e.target.value)} />
        </Field>
        <Field label="Service name">
          <input className={inputCls} required value={service} onChange={(e) => setService(e.target.value)} />
        </Field>
        <Field label="Vehicle type">
          <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as "ALS" | "BLS")}>
            <option value="ALS">ALS (advanced)</option>
            <option value="BLS">BLS (basic)</option>
          </select>
        </Field>
        <Field label="Plate (optional)">
          <input className={inputCls} value={plate} onChange={(e) => setPlate(e.target.value)} />
        </Field>
        <ErrorBox error={error} />
        <Btn type="submit" disabled={busy}>
          {busy ? "Saving…" : "Register"}
        </Btn>
      </form>
    </Card>
  );
}

export default function AmbulancePage() {
  const session = useSession();
  const isAmb = session?.account.role === "ambulance";
  const [amb, setAmb] = useState<Ambulance | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [myPos, setMyPos] = useState<LatLng | null>(null);
  const [gpsOn, setGpsOn] = useState(false);
  const [gpsInfo, setGpsInfo] = useState<string>("");
  const [mapMode, setMapMode] = useState(false);
  const [inc, setInc] = useState<Incident | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const [busy, setBusy] = useState(false);
  const lastIncId = useRef<string | null>(null);
  const latestFix = useRef<{ lat: number; lng: number; accuracy_m: number } | null>(null);

  const loadMe = useCallback(async () => {
    try {
      const m = await api<Me>("/api/me");
      setAmb(m.ambulance);
      if (m.ambulance?.position) setMyPos((p) => p ?? m.ambulance!.position);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (isAmb) Promise.resolve().then(loadMe);
  }, [isAmb, loadMe]);

  // Real GPS: watchPosition + POST every 5 s
  useEffect(() => {
    if (!gpsOn) return;
    if (!navigator.geolocation) {
      Promise.resolve().then(() => {
        setGpsInfo("Geolocation not supported (needs HTTPS)");
        setGpsOn(false);
      });
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        latestFix.current = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: Math.round(p.coords.accuracy) };
        setMyPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setGpsInfo(`±${Math.round(p.coords.accuracy)} m`);
      },
      (err) => setGpsInfo("GPS error: " + err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
    const send = () => {
      const f = latestFix.current;
      if (f) api("/api/ambulance/location", { method: "POST", body: f }).catch((e: Error) => setGpsInfo("Send failed: " + e.message));
    };
    const t = setInterval(send, 5000);
    return () => {
      navigator.geolocation.clearWatch(watch);
      clearInterval(t);
    };
  }, [gpsOn]);

  usePoll(
    async () => {
      if (!isAmb || !amb) return;
      try {
        const a = await api<Incident | null>("/api/ambulance/assignment");
        setInc(a);
        if (a && a.id !== lastIncId.current) beep();
        lastIncId.current = a?.id ?? null;
        if (a) setTrack(await api<Track>(`/api/incidents/${a.id}/track`, { auth: false }));
        else setTrack(null);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    3000,
    [isAmb, amb?.id],
  );

  if (session === undefined) return <Page title="Ambulance">Loading…</Page>;
  if (!isAmb)
    return (
      <Page title="Ambulance">
        <NeedLogin role="ambulance" />
      </Page>
    );
  if (amb === undefined)
    return (
      <Page title="Ambulance">
        <ErrorBox error={error} />
        Loading…
      </Page>
    );
  if (amb === null)
    return (
      <Page title="Ambulance">
        <Setup onDone={(a) => setAmb(a)} />
      </Page>
    );

  async function act(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: "POST", body: body ?? {} });
      const a = await api<Incident | null>("/api/ambulance/assignment");
      setInc(a);
      lastIncId.current = a?.id ?? null;
      await loadMe();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setOnline(online: boolean) {
    setError(null);
    try {
      setAmb(await api<Ambulance>("/api/ambulance/status", { method: "PUT", body: { status: online ? "available" : "offline" } }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function mapClick(p: LatLng) {
    if (!mapMode) return;
    setMyPos(p);
    try {
      await api("/api/ambulance/location", { method: "POST", body: { lat: p.lat, lng: p.lng, accuracy_m: 5 } });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const status = inc?.status;
  const target: LatLng | null = inc
    ? status === "transporting" && inc.hospital
      ? inc.hospital.location
      : inc.location
    : null;

  const markers: MapMarker[] = [];
  if (inc) markers.push({ lat: inc.location.lat, lng: inc.location.lng, color: COLORS.patient, label: "Patient" });
  if (inc?.hospital) markers.push({ ...inc.hospital.location, color: COLORS.hospital, label: inc.hospital.name });
  if (myPos) markers.push({ ...myPos, color: COLORS.ambulance, label: "Me" });
  const center = myPos ?? (inc ? inc.location : { lat: 33.6426, lng: 72.9905 });
  const dist = track?.distance_to_patient_km ?? track?.distance_to_hospital_km ?? null;
  const online = amb.status !== "offline";

  return (
    <Page title={`Ambulance ${amb.call_sign}`}>
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-zinc-600">
              {amb.vehicle_type} · {amb.service_name}
              {amb.plate ? ` · ${amb.plate}` : ""}
            </div>
            <div>
              Status: <b className="uppercase">{amb.status}</b>
            </div>
          </div>
          <Btn color={online ? "gray" : "green"} onClick={() => setOnline(!online)}>
            {online ? "Go offline" : "Go online"}
          </Btn>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Btn color={gpsOn ? "red" : "blue"} onClick={() => setGpsOn((v) => !v)}>
            {gpsOn ? "Stop GPS" : "Use my GPS"}
          </Btn>
          {gpsOn && (
            <span className="flex items-center gap-1 text-sm font-semibold text-green-700">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-green-600" />
              </span>
              GPS live {gpsInfo}
            </span>
          )}
          {!gpsOn && gpsInfo && <span className="text-sm text-zinc-600">{gpsInfo}</span>}
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={mapMode} onChange={(e) => setMapMode(e.target.checked)} />
            Set position on map (indoor demo)
          </label>
        </div>
      </Card>

      <ErrorBox error={error} />

      {!inc && <Card>{online ? "Waiting for assignment…" : "You are offline. Go online to receive jobs."}</Card>}

      {inc && (
        <Card className="border-2 border-red-500">
          <div className="flex items-center justify-between">
            <div className="font-mono text-2xl font-black">{inc.ref_code}</div>
            <div className="flex items-center gap-2">
              <SeverityBadge severity={inc.triage.severity} />
              <span className="font-semibold capitalize">{inc.triage.category}</span>
            </div>
          </div>
          <div className="text-sm">
            Status: <b>{inc.status}</b>
          </div>
          <p className="text-sm">{inc.description}</p>
          <p className="text-sm text-zinc-700">
            <b>AI:</b> {inc.triage.reasoning}
          </p>
          <RiskFlags flags={inc.triage.risk_flags} />
          <div className="rounded bg-zinc-50 p-2">
            <div className="text-sm font-semibold">Patient ({inc.identity.status})</div>
            <LimitedProfile profile={inc.identity.profile} />
          </div>
          {inc.brief && (
            <div>
              <div className="text-sm font-semibold">ATMIST</div>
              <Atmist brief={inc.brief} />
            </div>
          )}
          <div className="text-sm">
            Hospital: <b>{inc.hospital?.name ?? "none found"}</b>
            {inc.hospital?.phone ? ` · ${inc.hospital.phone}` : ""}
          </div>
          <div className="flex items-center justify-between">
            <div>
              {dist != null && <span className="text-xl font-bold">{dist.toFixed(2)} km</span>}
              {track?.eta_min != null && <span className="ml-2 text-sm">{track.eta_min.toFixed(1)} min (estimate)</span>}
            </div>
            {target && (
              <a
                href={gmapsLink(target.lat, target.lng)}
                target="_blank"
                rel="noreferrer"
                className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Open in Google Maps
              </a>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {status === "assigned" && (
              <>
                <Btn color="green" disabled={busy} onClick={() => act("/api/ambulance/assignment/accept")}>
                  Accept
                </Btn>
                <Btn color="red" disabled={busy} onClick={() => act("/api/ambulance/assignment/decline")}>
                  Decline
                </Btn>
              </>
            )}
            {status === "en_route" && (
              <Btn color="orange" disabled={busy} onClick={() => act("/api/ambulance/assignment/status", { status: "at_scene" })}>
                Arrived at scene
              </Btn>
            )}
            {status === "at_scene" && (
              <Btn color="orange" disabled={busy} onClick={() => act("/api/ambulance/assignment/status", { status: "transporting" })}>
                Patient picked up
              </Btn>
            )}
            {status === "transporting" && (
              <Btn color="green" disabled={busy} onClick={() => act("/api/ambulance/assignment/status", { status: "arrived" })}>
                Arrived at hospital
              </Btn>
            )}
          </div>
        </Card>
      )}

      <MapLazy
        center={center}
        zoom={14}
        markers={markers}
        onClick={mapMode ? mapClick : undefined}
        line={myPos && target ? [myPos, target] : null}
        recenterKey={`${inc?.id ?? "none"}-${myPos ? "me" : "nofix"}`}
        height={320}
      />
      {mapMode && <p className="text-sm text-zinc-600">Tap the map to move the ambulance.</p>}
    </Page>
  );
}
