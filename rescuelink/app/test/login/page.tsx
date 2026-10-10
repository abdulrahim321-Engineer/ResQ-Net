"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, saveSession } from "@/lib/client";
import type { Role, Session } from "@/lib/types";
import { Btn, Card, ErrorBox, Field, inputCls, Page } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("citizen");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s =
        tab === "login"
          ? await api<Session>("/api/auth/login", { method: "POST", body: { email, password }, auth: false })
          : await api<Session>("/api/auth/signup", {
              method: "POST",
              body: { email, password, role, display_name: displayName, ...(phone ? { phone } : {}) },
              auth: false,
            });
      saveSession(s);
      router.push(`/test/${s.account.role}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Login / Signup">
      <div className="flex gap-2">
        {(["login", "signup"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded px-3 py-2 font-semibold ${tab === t ? "bg-blue-600 text-white" : "bg-zinc-200"}`}
          >
            {t === "login" ? "Login" : "Sign up"}
          </button>
        ))}
      </div>
      <Card>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Email">
            <input className={inputCls} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <input
              className={inputCls}
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {tab === "signup" && (
            <>
              <Field label="Role">
                <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  <option value="citizen">citizen</option>
                  <option value="hospital">hospital</option>
                  <option value="ambulance">ambulance</option>
                </select>
              </Field>
              <Field label="Display name">
                <input className={inputCls} required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </Field>
              <Field label="Phone (optional)">
                <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
            </>
          )}
          <ErrorBox error={error} />
          <Btn type="submit" disabled={busy}>
            {busy ? "Please wait…" : tab === "login" ? "Login" : "Create account"}
          </Btn>
        </form>
      </Card>
    </Page>
  );
}
