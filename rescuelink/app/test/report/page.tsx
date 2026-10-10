"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, DEFAULT_POS, getGps, resizeImageToBase64 } from "@/lib/client";
import type { Incident, ProfileLimited } from "@/lib/types";
import MapLazy from "@/components/MapLazy";
import { Card, COLORS, ErrorBox, Field, inputCls, LimitedProfile, Page } from "@/components/ui";

type Identify = {
  extracted: { cnic: string | null; full_name: string | null };
  confidence: string;
  source: string;
  verification?: "matched" | "name_mismatch" | "not_registered" | "unreadable";
  profile?: ProfileLimited | null;
};

const VERIF_CLS: Record<string, string> = {
  matched: "bg-green-100 text-green-800",
  name_mismatch: "bg-orange-100 text-orange-800",
  not_registered: "bg-zinc-100 text-zinc-800",
  unreadable: "bg-red-100 text-red-800",
};

export default function ReportPage() {
  const router = useRouter();
  const [pos, setPos] = useState(DEFAULT_POS);
  const [gpsNote, setGpsNote] = useState("Getting GPS…");
  const [desc, setDesc] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cnic, setCnic] = useState("");
  const [scan, setScan] = useState<Identify | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scene, setScene] = useState<{ base64: string; mime_type: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getGps().then((g) => {
      setPos({ lat: g.lat, lng: g.lng });
      setGpsNote(g.fallback ? "GPS denied/unavailable — demo location used. Tap the map to set the spot." : "GPS location found. Tap the map to adjust.");
    });
  }, []);

  async function scanCnic(file: File | undefined) {
    if (!file) return;
    setScanning(true);
    setError(null);
    try {
      const img = await resizeImageToBase64(file);
      const r = await api<Identify>("/api/ai/scan-cnic", {
        method: "POST",
        auth: false,
        body: { image_base64: img.base64, mime_type: img.mime_type, purpose: "identify" },
      });
      setScan(r);
      if (r.extracted?.cnic) setCnic(r.extracted.cnic);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }

  async function sceneImage(file: File | undefined) {
    if (!file) return;
    try {
      setScene(await resizeImageToBase64(file));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submit() {
    if (!desc.trim()) {
      setError("Please describe what happened.");
      return;
    }
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { lat: pos.lat, lng: pos.lng, description: desc.trim() };
    if (name.trim()) body.reporter_name = name.trim();
    if (phone.trim()) body.reporter_phone = phone.trim();
    if (cnic.trim()) body.cnic = cnic.trim();
    if (scene) {
      body.scene_image_base64 = scene.base64;
      body.mime_type = scene.mime_type;
    }
    try {
      const inc = await api<Incident>("/api/incidents", { method: "POST", body, auth: false });
      router.push(`/test/track/${inc.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Page title="Report an accident">
      <p className="text-sm text-zinc-600">No login needed. Emergency? Also call 1122.</p>
      <Card>
        <p className="text-sm">{gpsNote}</p>
        <MapLazy
          center={pos}
          zoom={15}
          markers={[{ ...pos, color: COLORS.patient, label: "Patient" }]}
          onClick={(p) => setPos(p)}
          height={260}
        />
        <p className="text-xs text-zinc-500">
          {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}
        </p>
      </Card>

      <Card>
        <Field label="What happened?">
          <textarea
            className={inputCls}
            rows={3}
            placeholder="e.g. Motorbike hit by car, rider bleeding from head, conscious"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Your name (optional)">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Your phone (optional)">
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
        <label className="block rounded bg-zinc-100 p-2 text-center text-sm font-semibold">
          {scene ? "✓ Scene photo attached (tap to replace)" : "📷 Add scene photo (optional)"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              void sceneImage(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </Card>

      <Card>
        <h2 className="font-bold">Victim identity (optional)</h2>
        <label className="block rounded bg-blue-50 p-3 text-center font-semibold text-blue-800">
          {scanning ? "Reading CNIC with AI…" : "📷 Scan victim's CNIC"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={scanning}
            onChange={(e) => {
              void scanCnic(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {scan && (
          <div className="space-y-1">
            <div className={`rounded px-2 py-1 text-sm font-bold ${VERIF_CLS[scan.verification ?? ""] ?? "bg-zinc-100"}`}>
              {scan.verification ?? "scanned"} — CNIC {scan.extracted?.cnic ?? "not read"} ({scan.confidence})
            </div>
            {scan.profile && <LimitedProfile profile={scan.profile} />}
          </div>
        )}
        <Field label="CNIC number (edit if the scan is wrong)">
          <input className={inputCls} placeholder="35202-1234567-1" value={cnic} onChange={(e) => setCnic(e.target.value)} />
        </Field>
      </Card>

      <ErrorBox error={error} />
      <button
        onClick={submit}
        disabled={busy}
        className="w-full rounded bg-red-600 py-4 text-xl font-bold text-white disabled:opacity-60"
      >
        {busy ? "AI triage + dispatch… (up to 30 s)" : "SEND AMBULANCE"}
      </button>
    </Page>
  );
}
