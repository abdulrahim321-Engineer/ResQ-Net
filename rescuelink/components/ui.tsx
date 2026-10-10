"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Brief, CitizenProfile, Incident, ProfileLimited, Triage } from "@/lib/types";

export const COLORS = {
  patient: "#dc2626",
  ambulance: "#16a34a",
  hospital: "#2563eb",
  busy: "#f97316",
  offline: "#9ca3af",
};

export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{title}</h1>
        <Link href="/test" className="text-sm text-blue-700 underline">
          /test
        </Link>
      </div>
      {children}
    </main>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`space-y-2 rounded border border-zinc-300 bg-white p-3 shadow-sm ${className}`}>{children}</div>;
}

export function Btn({
  children,
  onClick,
  disabled,
  color = "blue",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  color?: "blue" | "red" | "green" | "gray" | "orange";
  type?: "button" | "submit";
}) {
  const c = {
    blue: "bg-blue-600 hover:bg-blue-700",
    red: "bg-red-600 hover:bg-red-700",
    green: "bg-green-600 hover:bg-green-700",
    gray: "bg-zinc-500 hover:bg-zinc-600",
    orange: "bg-orange-500 hover:bg-orange-600",
  }[color];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-4 py-2 font-semibold text-white disabled:opacity-50 ${c}`}
    >
      {children}
    </button>
  );
}

export const inputCls = "w-full rounded border border-zinc-400 bg-white px-2 py-1.5 text-zinc-900";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-0.5 block font-medium text-zinc-700">{label}</span>
      {children}
    </label>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="rounded border border-red-400 bg-red-50 p-2 text-sm text-red-800">{error}</div>;
}

export function NeedLogin({ role }: { role: string }) {
  return (
    <Card>
      <p>
        You need a <b>{role}</b> account.
      </p>
      <Link className="text-blue-700 underline" href="/test/login">
        Go to login / signup
      </Link>
    </Card>
  );
}

const SEV: Record<Triage["severity"], string> = {
  critical: "bg-red-600 text-white",
  serious: "bg-orange-500 text-white",
  moderate: "bg-yellow-300 text-zinc-900",
  minor: "bg-green-500 text-white",
};

export function SeverityBadge({ severity }: { severity: Triage["severity"] | string | null | undefined }) {
  if (!severity) return null;
  const cls = SEV[severity as Triage["severity"]] ?? "bg-zinc-400 text-white";
  return <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${cls}`}>{severity}</span>;
}

export function isFullProfile(p: Incident["identity"]["profile"]): p is CitizenProfile {
  return !!p && "full_name" in p;
}

export function LimitedProfile({ profile }: { profile: ProfileLimited | CitizenProfile | null | undefined }) {
  if (!profile) return <p className="text-sm text-zinc-500">Identity unknown</p>;
  const first = "first_name" in profile ? profile.first_name : profile.full_name.split(" ")[0];
  const alerts = "critical_alerts" in profile ? profile.critical_alerts : [];
  return (
    <div className="space-y-1 text-sm">
      <div>
        <b>Name:</b> {first} &nbsp; <b>Blood group:</b> {profile.blood_group ?? "unknown"}
      </div>
      {alerts.length > 0 && (
        <ul className="list-disc pl-5 font-semibold text-red-700">
          {alerts.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FullProfile({ p }: { p: CitizenProfile }) {
  const row = (k: string, v: ReactNode) => (
    <tr>
      <td className="pr-2 align-top font-medium text-zinc-600">{k}</td>
      <td>{v}</td>
    </tr>
  );
  const list = (a: string[]) => (a.length ? a.join(", ") : "none");
  return (
    <table className="w-full text-sm">
      <tbody>
        {row("Name", <b>{p.full_name}</b>)}
        {row("CNIC", p.cnic)}
        {row("DOB", p.date_of_birth ?? "-")}
        {row("Gender", p.gender ?? "-")}
        {row("Blood group", <b className="text-red-700">{p.blood_group ?? "unknown"}</b>)}
        {row("Allergies", <span className="text-red-700">{list(p.allergies)}</span>)}
        {row("Medications", list(p.medications))}
        {row("Conditions", list(p.conditions))}
        {row(
          "Emergency contact",
          `${p.emergency_contact.name} (${p.emergency_contact.relation}) ${p.emergency_contact.phone}${
            p.emergency_contact.email ? " " + p.emergency_contact.email : ""
          }`,
        )}
      </tbody>
    </table>
  );
}

export function Atmist({ brief }: { brief: Brief | null }) {
  if (!brief) return null;
  const a = brief.atmist;
  const rows: [string, string][] = [
    ["Age", a.age],
    ["Time", a.time],
    ["Mechanism", a.mechanism],
    ["Injuries", a.injuries],
    ["Signs", a.signs],
    ["Treatment", a.treatment],
  ];
  return (
    <table className="w-full border-collapse text-sm">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-zinc-200">
            <td className="w-24 py-0.5 pr-2 font-semibold">{k}</td>
            <td className="py-0.5">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RiskFlags({ flags }: { flags: string[] | undefined }) {
  if (!flags || flags.length === 0) return null;
  return (
    <ul className="list-disc pl-5 text-sm font-semibold text-red-700">
      {flags.map((f) => (
        <li key={f}>{f}</li>
      ))}
    </ul>
  );
}
