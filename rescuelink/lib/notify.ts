import "server-only";
import nodemailer from "nodemailer";
import { getAdmin } from "./supabase";
import type { Notification } from "./types";

export type SendResult = { delivered: boolean; error?: string };

// Gmail SMTP with an app password. Never throws: a failed email must not fail the request.
export async function sendEmail(to: string, subject: string, text: string): Promise<SendResult> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return { delivered: false, error: "email not configured" };
  try {
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await transport.sendMail({ from: `RescueLink <${user}>`, to, subject, text });
    return { delivered: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("sendEmail failed:", error);
    return { delivered: false, error };
  }
}

// wa.me click-to-send link. Pakistani local numbers (leading 0) become 92...
export function whatsappLink(phone: string, text: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export type NotificationRow = {
  id: string; incident_id: string; channel: Notification["channel"]; recipient: string; message: string;
  whatsapp_link: string | null; delivered: boolean; error: string | null; created_at: string;
};

export function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    incident_id: row.incident_id,
    channel: row.channel,
    to: row.recipient,
    message: row.message,
    whatsapp_link: row.whatsapp_link,
    delivered: row.delivered,
    created_at: row.created_at,
  };
}

// Inserts a notification row. Never throws (logs instead).
export async function record(
  incidentId: string,
  channel: Notification["channel"],
  recipient: string,
  message: string,
  extras: { whatsapp_link?: string | null; delivered?: boolean; error?: string | null } = {},
): Promise<void> {
  const { error } = await getAdmin().from("notifications").insert({
    incident_id: incidentId,
    channel,
    recipient,
    message,
    whatsapp_link: extras.whatsapp_link ?? null,
    delivered: extras.delivered ?? true,
    error: extras.error ?? null,
  });
  if (error) console.error("notification insert failed:", error.message);
}

export async function listNotifications(incidentId: string): Promise<Notification[]> {
  const { data, error } = await getAdmin()
    .from("notifications")
    .select("*")
    .eq("incident_id", incidentId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`notifications lookup failed: ${error.message}`);
  return ((data ?? []) as NotificationRow[]).map(toNotification);
}
