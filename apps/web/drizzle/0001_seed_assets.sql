-- Initial catalog: categories and the 12 launch assets.
INSERT INTO "categories" ("slug", "name", "sort_order") VALUES
	('layer-1', 'Layer 1', 1),
	('layer-2', 'Layer 2', 2),
	('defi', 'DeFi', 3),
	('pagos', 'Pagos', 4),
	('oraculos', 'Oráculos', 5),
	('meme', 'Meme', 6);
--> statement-breakpoint
INSERT INTO "assets" ("symbol", "name", "category_id", "binance_symbol", "coingecko_id", "history_since")
SELECT v.symbol, v.name, c.id, v.binance_symbol, v.coingecko_id, v.history_since::date
FROM (VALUES
	('BTC', 'Bitcoin', 'layer-1', 'BTCUSDT', 'bitcoin', '2017-08-17', 1),
	('ETH', 'Ethereum', 'layer-1', 'ETHUSDT', 'ethereum', '2017-08-17', 2),
	('BNB', 'BNB', 'layer-1', 'BNBUSDT', 'binancecoin', '2017-11-06', 3),
	('SOL', 'Solana', 'layer-1', 'SOLUSDT', 'solana', '2020-08-11', 4),
	('XRP', 'XRP', 'pagos', 'XRPUSDT', 'ripple', '2018-05-04', 5),
	('DOGE', 'Dogecoin', 'meme', 'DOGEUSDT', 'dogecoin', '2019-07-05', 6),
	('ADA', 'Cardano', 'layer-1', 'ADAUSDT', 'cardano', '2018-04-17', 7),
	('AVAX', 'Avalanche', 'layer-1', 'AVAXUSDT', 'avalanche-2', '2020-09-22', 8),
	('LINK', 'Chainlink', 'oraculos', 'LINKUSDT', 'chainlink', '2019-01-16', 9),
	('DOT', 'Polkadot', 'layer-1', 'DOTUSDT', 'polkadot', '2020-08-18', 10),
	('UNI', 'Uniswap', 'defi', 'UNIUSDT', 'uniswap', '2020-09-17', 11),
	('ARB', 'Arbitrum', 'layer-2', 'ARBUSDT', 'arbitrum', '2023-03-23', 12)
) AS v(symbol, name, category_slug, binance_symbol, coingecko_id, history_since, ord)
JOIN "categories" c ON c.slug = v.category_slug
ORDER BY v.ord;
