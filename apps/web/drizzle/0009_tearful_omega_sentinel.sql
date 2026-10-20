CREATE TABLE "candles_recent_1m" (
	"asset_id" integer NOT NULL,
	"open_time" timestamp with time zone NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	"volume" double precision NOT NULL,
	CONSTRAINT "candles_recent_1m_asset_id_open_time_pk" PRIMARY KEY("asset_id","open_time")
);
--> statement-breakpoint
ALTER TABLE "candles_recent_1m" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "candles_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "candles_recent_1m" ADD CONSTRAINT "candles_recent_1m_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;