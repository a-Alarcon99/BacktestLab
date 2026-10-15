import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * One row per transactional email actually handed to the provider. It backs the per-recipient
 * cooldown and the global daily cap in `lib/server/mail.ts`, which bound both the provider bill
 * and the abuse of sign-up/sign-in as an email cannon aimed at third parties.
 */
export const emailSends = pgTable(
  "email_sends",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipient: text("recipient").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("email_sends_recipient_idx").on(t.recipient, t.sentAt),
    index("email_sends_sent_at_idx").on(t.sentAt),
  ],
).enableRLS();
