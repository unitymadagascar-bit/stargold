# Star Gold By TSR

Gold trading assistant for MT5 and XAUUSD.

## Permanent MT5 bridge architecture

The production app must not read `localhost` from Vercel. The live flow is:

```text
MT5 TradeTSRBridge on your PC
  -> local Windows relay on 127.0.0.1:3000, or direct Vercel WebRequest if allowed
  -> https://stargold-chi.vercel.app/api/market/mt5/ingest
  -> Supabase cloud relay tables
  -> Vercel XAUUSD APIs and live stream
  -> browser dashboard
```

The browser never reads localhost in production. The local Windows relay exists only because MT5 WebRequest settings can keep old local EA inputs or block cloud URLs; it forwards MT5 traffic to the cloud relay.

## Supabase relay setup

Create a Supabase project, open the SQL editor, and run:

```sql
create table if not exists public.mt5_ticks (
  id text primary key,
  source text not null default 'MT5',
  symbol text not null default 'XAUUSD',
  tick jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.mt5_candles (
  id text primary key,
  source text not null default 'MT5',
  symbol text not null default 'XAUUSD',
  timeframe text not null,
  candles jsonb not null,
  updated_at timestamptz not null default now()
);
```

Then add these variables in Vercel Production:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
POSTGRES_URL
SUPABASE_MT5_TICK_TABLE=mt5_ticks
SUPABASE_MT5_HISTORY_TABLE=mt5_candles
SUPABASE_MT5_TICK_ID=xauusd
```

Use the Supabase service role key only on the server/Vercel side. Do not expose it as a `NEXT_PUBLIC_` variable.

If the project was provisioned from Vercel Marketplace, pull the generated environment variables locally and create the relay tables:

```bash
vercel env pull .env.local
npm exec --yes --package pg -- node scripts/setup-supabase-relay.mjs
```

## MT5 setup

1. Copy `mt5/TradeTSRBridge.mq5` into `MQL5/Experts/`.
2. Open it in MetaEditor and compile it, or restart MT5 so the new `.ex5` is rebuilt.
3. Refresh `Navigator > Expert Advisors`.
4. Open `Tools > Options > Expert Advisors`.
5. Enable `Allow WebRequest for listed URL`.
6. Add:

```text
https://stargold-chi.vercel.app
```

7. Attach `TradeTSRBridge` to the XAUUSD chart.
8. Keep `InpEndpoint` as:

```text
https://stargold-chi.vercel.app/api/market/mt5/ingest
```

9. Enable `Algo Trading`.
10. Save your MT5 profile with this chart and EA attached.

After a PC restart, open MT5 with Algo Trading active. The EA posts ticks every second and the app marks MT5 disconnected if no tick arrives for more than 10 seconds.

TradeTSRBridge v1.12 also performs a startup ping and has a GET tick fallback if MT5 has trouble sending JSON POST requests. Check the MT5 `Experts` tab for `Star Gold By TSR bridge ping OK` or detailed HTTP/WebRequest errors.

## Status and fallback rules

The dashboard header shows:

- MT5 connected or disconnected
- last tick time
- latency
- last price
- spread
- active source

If the source is not MT5, the app labels it `Fallback, not live MT5`. Fallback data is only there to avoid an empty screen while MT5 is closed or reconnecting. Trading decisions should be made from live MT5 data.

## MT5 connection diagnostics

Open:

```text
https://stargold-chi.vercel.app/settings/mt5-connection
```

Use this page when moving to a new PC or broker terminal. It shows:

- MT5 connected / disconnected
- last received price and timestamp
- requested app symbol
- detected broker symbol and suffix, for example `XAUUSD`, `XAUUSDm`, `BTCUSDm`
- active data source: MT5, external API or fallback
- one-click connection test
- diagnostics for MT5 not launched, EA inactive, wrong symbol, no tick received, API inaccessible and price not synchronized with the chart

For a new PC, install MT5, log in to Exness, attach `TradeTSRBridge` to the broker symbol, enable Algo Trading, allow `https://stargold-chi.vercel.app` in MT5 WebRequest settings, and keep the EA endpoint as:

```text
https://stargold-chi.vercel.app/api/market/mt5/ingest
```

## Windows startup

Edit `scripts/start-star-gold-mt5.bat` if your MT5 path is different, then run:

```bat
scripts\install-star-gold-mt5-startup.bat
```

This adds a Startup shortcut script so Windows opens MT5 after login. MT5 will reload the saved profile, and the attached EA will reconnect to the cloud relay automatically when Algo Trading is active.

The installer also starts `scripts/start-star-gold-relay.bat` at login. This local relay listens on `http://127.0.0.1:3000/api/market/mt5/ingest` and forwards every MT5 payload to the Vercel/Supabase cloud relay.

## Local development

```bash
npm install
npm run dev
```

Local dev can still use `NEXT_PUBLIC_MT5_LOCAL_BRIDGE_ORIGIN=http://127.0.0.1:3000`, but production must keep relative URLs so the Vercel app reads the cloud relay.
