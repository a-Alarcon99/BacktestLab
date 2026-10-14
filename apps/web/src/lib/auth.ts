import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { sendVerificationEmail } from "@/lib/server/mail";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  plugins: [nextCookies()],
  // Passwords are hashed by Better Auth (scrypt, per-user salt); never stored or logged in clear.
  // An account can't sign in until its email is verified by following the emailed link.
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      // Not awaited: a slow mail provider must not reveal whether the account exists (timing).
      void sendVerificationEmail(user.email, user.name, url);
    },
  },
  // A week-long session refreshed daily while in use; the cookie is httpOnly + SameSite=Lax
  // (and Secure in production).
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  // Enabled explicitly (Better Auth only enables it in production by default). The counters live
  // in memory, so they are per server instance: on serverless/multi-instance deployments this is
  // best effort and the edge firewall must enforce the real limit (see SECURITY.md).
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 300, max: 5 },
      "/sign-up/email": { window: 3600, max: 3 },
      "/forget-password": { window: 3600, max: 3 },
      "/send-verification-email": { window: 3600, max: 3 },
    },
  },
});
