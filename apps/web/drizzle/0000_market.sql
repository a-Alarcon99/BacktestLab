CREATE TABLE "asset_quotes" (
	"asset_id" integer PRIMARY KEY NOT NULL,
	"price" double precision NOT NULL,
	"change_24h" double precision NOT NULL,
	"change_7d" double precision NOT NULL,
	"high_24h" double precision NOT NULL,
	"low_24h" double precision NOT NULL,
	"volume_24h" double precision NOT NULL,
	"market_cap" double precision,
	"market_cap_rank" integer,
	"price_updated_at" timestamp with time zone NOT NULL,
	"market_cap_updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "asset_quotes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"category_id" smallint NOT NULL,
	"quote_currency" text DEFAULT 'USDT' NOT NULL,
	"binance_symbol" text NOT NULL,
	"coingecko_id" text NOT NULL,
	"history_since" date NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_symbol_unique" UNIQUE("symbol"),
	CONSTRAINT "assets_binance_symbol_unique" UNIQUE("binance_symbol"),
	CONSTRAINT "assets_coingecko_id_unique" UNIQUE("coingecko_id")
);
--> statement-breakpoint
ALTER TABLE "assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "candles_1h" (
	"asset_id" integer NOT NULL,
	"open_time" timestamp with time zone NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	"volume" double precision NOT NULL,
	CONSTRAINT "candles_1h_asset_id_open_time_pk" PRIMARY KEY("asset_id","open_time")
);
--> statement-breakpoint
ALTER TABLE "candles_1h" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "categories" (
	"id" "smallserial" PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "asset_quotes" ADD CONSTRAINT "asset_quotes_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candles_1h" ADD CONSTRAINT "candles_1h_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;