// Transactional email through Resend's HTTP API (no SDK). Without RESEND_API_KEY (local dev) the
// link is printed to the server console instead, so sign-up can be completed offline.

import { and, count, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { emailSends } from "@/db/schema";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const HOUR = 60 * 60 * 1000;
const PER_RECIPIENT_PER_HOUR = 3;
/** Hard ceiling of emails per rolling 24 h across all recipients (override with MAIL_DAILY_LIMIT). */
const dailyLimit = () => Number(process.env.MAIL_DAILY_LIMIT ?? 300);

/**
 * Reserves one send. Fails closed: on any doubt (cap reached, DB error) nothing is sent, because
 * an unsent verification mail costs a retry while an unbounded sender costs real money and lets
 * anyone use us to flood a victim's inbox.
 */
export async function reserveEmailSend(to: string): Promise<boolean> {
  const recipient = to.trim().toLowerCase();
  try {
    const now = Date.now();
    const [{ n: recent }] = await db
      .select({ n: count() })
      .from(emailSends)
      .where(and(eq(emailSends.recipient, recipient), gte(emailSends.sentAt, new Date(now - HOUR))));
    if (recent >= PER_RECIPIENT_PER_HOUR) return false;

    const [{ n: today }] = await db
      .select({ n: count() })
      .from(emailSends)
      .where(gte(emailSends.sentAt, new Date(now - 24 * HOUR)));
    if (today >= dailyLimit()) {
      console.error(`Daily email cap (${dailyLimit()}) reached: verification emails are paused`);
      return false;
    }

    await db.insert(emailSends).values({ recipient });
    if (Math.random() < 0.02) await db.delete(emailSends).where(lt(emailSends.sentAt, sql`now() - interval '7 days'`));
    return true;
  } catch (error) {
    console.error("Email throttle unavailable (did you run `npm run db:migrate`?); not sending", error);
    return false;
  }
}

export async function sendVerificationEmail(to: string, name: string, url: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") console.error("RESEND_API_KEY is not set: verification email not sent");
    else console.log(`[mail] verification link for ${to}: ${url}`);
    return;
  }
  if (!(await reserveEmailSend(to))) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAIL_FROM ?? "BacktestLab <onboarding@resend.dev>",
        to,
        subject: "Verifica tu correo en BacktestLab",
        html: `<p>Hola ${escapeHtml(name)},</p><p>Confirma tu correo para activar tu cuenta (el enlace caduca en 1 hora):</p><p><a href="${escapeHtml(url)}">Verificar mi correo</a></p><p>Si no has creado una cuenta, ignora este mensaje.</p>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`Verification email failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  } catch (error) {
    console.error("Verification email failed", error);
  }
}
