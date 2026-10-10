"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, clearSession, getSession } from "@/lib/client";
import type { Session } from "@/lib/types";
import { Btn, Card, Page } from "@/components/ui";

const LINKS = [
  ["/test/login", "Login / Signup"],
  ["/test/citizen", "Citizen (profile + request ambulance)"],
  ["/test/report", "Report an accident (no login)"],
  ["/test/hospital", "Hospital dashboard"],
  ["/test/ambulance", "Ambulance app"],
  ["/test/control", "Control room (no login)"],
] as const;

export default function TestHome() {
  const [health, setHealth] = useState<string>("loading…");
  const [account, setAccount] = useState<Session["account"] | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    api<Record<string, unknown>>("/api/health", { auth: false })
      .then((h) => setHealth(JSON.stringify(h)))
      .catch((e: Error) => setHealth("error: " + e.message));
    const me = getSession()
      ? api<{ account: Session["account"] }>("/api/me").then((m) => m.account)
      : Promise.resolve(null);
    me.then((a) => setAccount(a))
      .catch(() => setAccount(null))
      .finally(() => setChecked(true));
  }, []);

  return (
    <Page title="RescueLink test UI">
      <Card>
        <div className="text-sm">
          <b>/api/health:</b> <code className="break-all">{health}</code>
        </div>
      </Card>
      <Card>
        {!checked ? (
          <p>Checking session…</p>
        ) : account ? (
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm">
              Logged in as <b>{account.display_name}</b> ({account.email}) — <b>{account.role}</b>
            </div>
            <Btn
              color="gray"
              onClick={() => {
                clearSession();
                setAccount(null);
              }}
            >
              Logout
            </Btn>
          </div>
        ) : (
          <p className="text-sm">Not logged in.</p>
        )}
      </Card>
      <ul className="space-y-2">
        {LINKS.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="block rounded border border-zinc-300 bg-white p-3 text-lg text-blue-700 hover:bg-blue-50">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
