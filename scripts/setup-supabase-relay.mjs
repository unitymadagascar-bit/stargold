import pg from "pg";

const { Client } = pg;

const rawConnectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;

if (!rawConnectionString) {
  console.error("Missing POSTGRES_URL or POSTGRES_URL_NON_POOLING.");
  process.exit(1);
}

const connectionUrl = new URL(rawConnectionString);
connectionUrl.searchParams.set("sslmode", "no-verify");

const client = new Client({
  connectionString: connectionUrl.toString(),
});

await client.connect();

try {
  await client.query(`
    create table if not exists public.mt5_ticks (
      id text primary key,
      source text not null default 'MT5',
      symbol text not null default 'XAUUSD',
      tick jsonb not null,
      updated_at timestamptz not null default now()
    );
  `);

  await client.query(`
    create table if not exists public.mt5_candles (
      id text primary key,
      source text not null default 'MT5',
      symbol text not null default 'XAUUSD',
      timeframe text not null,
      candles jsonb not null,
      updated_at timestamptz not null default now()
    );
  `);

  await client.query("create index if not exists mt5_candles_timeframe_idx on public.mt5_candles (timeframe);");
  await client.query("create index if not exists mt5_ticks_updated_at_idx on public.mt5_ticks (updated_at desc);");
  await client.query("create index if not exists mt5_candles_updated_at_idx on public.mt5_candles (updated_at desc);");

  console.log("Supabase MT5 relay tables are ready.");
} finally {
  await client.end();
}
