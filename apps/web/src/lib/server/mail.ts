// Transactional email through Resend's HTTP API (no SDK). Without RESEND_API_KEY (local dev) the
// link is printed to the server console instead, so sign-up can be completed offline.

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendVerificationEmail(to: string, name: string, url: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") console.error("RESEND_API_KEY is not set: verification email not sent");
    else console.log(`[mail] verification link for ${to}: ${url}`);
    return;
  }
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
