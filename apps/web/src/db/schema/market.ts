import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  integer,
  pgTable,
  primaryKey,
  serial,
  smallint,
  smallserial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// RLS is enabled with no policies: Supabase's Data API (anon key) cannot read these tables.
// Both apps connect as `postgres`, which bypasses RLS.

export const categories = pgTable("categories", {
  id: smallserial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: smallint("sort_order").notNull().default(0),
}).enableRLS();

/** Asset catalog. Adding an asset = inserting a row here (via a custom migration). */
export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull().unique(),
  name: text("name").notNull(),
  categoryId: smallint("category_id")
    .notNull()
    .references(() => categories.id),
  quoteCurrency: text("quote_currency").notNull().default("USDT"),
  binanceSymbol: text("binance_symbol").notNull().unique(),
  coingeckoId: text("coingecko_id").notNull().unique(),
  /** Date of the first Binance candle for the pair. */
  historySince: date("history_since").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  /**
   * Exclusive end of the candle history stored in R2 (Parquet): everything before it is there.
   * Moved forward by `python -m app.ingest` after uploading; NULL until the first backfill.
   */
  candlesUntil: timestamp("candles_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** Latest market snapshot, one row per asset, upserted by the API. */
export const assetQuotes = pgTable("asset_quotes", {
  assetId: integer("asset_id")
    .primaryKey()
    .references(() => assets.id, { onDelete: "cascade" }),
  price: doublePrecision("price").notNull(),
  change24h: doublePrecision("change_24h").notNull(),
  change7d: doublePrecision("change_7d").notNull(),
  high24h: doublePrecision("high_24h").notNull(),
  low24h: doublePrecision("low_24h").notNull(),
  /** Quote-currency (USDT) volume. */
  volume24h: doublePrecision("volume_24h").notNull(),
  marketCap: doublePrecision("market_cap"),
  marketCapRank: integer("market_cap_rank"),
  priceUpdatedAt: timestamp("price_updated_at", { withTimezone: true }).notNull(),
  marketCapUpdatedAt: timestamp("market_cap_updated_at", { withTimezone: true }),
}).enableRLS();

/**
 * Hot tail: the last ~72 h of closed 1m candles, from `candles_until` up to now (older history is
 * in R2). Filled by `python -m app.sync`, trimmed as it goes.
 */
export const candlesRecent1m = pgTable(
  "candles_recent_1m",
  {
    assetId: integer("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    openTime: timestamp("open_time", { withTimezone: true }).notNull(),
    open: doublePrecision("open").notNull(),
    high: doublePrecision("high").notNull(),
    low: doublePrecision("low").notNull(),
    close: doublePrecision("close").notNull(),
    volume: doublePrecision("volume").notNull(),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.openTime] })],
).enableRLS();

/**
 * @deprecated Closed 1h candles, replaced by Parquet files in R2. Kept only to verify the backfill
 * (`python -m app.ingest verify`); drop the table once the API reads from R2.
 */
export const candles1h = pgTable(
  "candles_1h",
  {
    assetId: integer("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    openTime: timestamp("open_time", { withTimezone: true }).notNull(),
    open: doublePrecision("open").notNull(),
    high: doublePrecision("high").notNull(),
    low: doublePrecision("low").notNull(),
    close: doublePrecision("close").notNull(),
    volume: doublePrecision("volume").notNull(),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.openTime] })],
).enableRLS();

export const categoriesRelations = relations(categories, ({ many }) => ({
  assets: many(assets),
}));

export const assetsRelations = relations(assets, ({ one, many }) => ({
  category: one(categories, { fields: [assets.categoryId], references: [categories.id] }),
  quote: one(assetQuotes),
  candles: many(candles1h),
}));

export const assetQuotesRelations = relations(assetQuotes, ({ one }) => ({
  asset: one(assets, { fields: [assetQuotes.assetId], references: [assets.id] }),
}));

export const candles1hRelations = relations(candles1h, ({ one }) => ({
  asset: one(assets, { fields: [candles1h.assetId], references: [assets.id] }),
}));
