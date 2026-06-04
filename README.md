# Star Gold By TSR

Gold trading assistant for MT5 and XAUUSD.

## Permanent MT5 bridge architecture

The production app must not read `localhost` from Vercel. The live flow is:

```text
MT5 TradeTSRBridge on your PC
  -> https://tradetsr.vercel.app/api/market/mt5/ingest
  -> Supabase cloud relay tables
  -> Vercel XAUUSD APIs and live stream
  -> browser dashboard
```

The old local/browser fallback is only for local development. In production, the browser uses relative Vercel API URLs and the Vercel server reads the cloud relay.

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
SUPABASE_MT5_TICK_TABLE=mt5_ticks
SUPABASE_MT5_HISTORY_TABLE=mt5_candles
SUPABASE_MT5_TICK_ID=xauusd
```

Use the Supabase service role key only on the server/Vercel side. Do not expose it as a `NEXT_PUBLIC_` variable.

## MT5 setup

1. Copy `mt5/TradeTSRBridge.mq5` into `MQL5/Experts/`.
2. Restart MT5 or refresh `Navigator > Expert Advisors`.
3. Open `Tools > Options > Expert Advisors`.
4. Enable `Allow WebRequest for listed URL`.
5. Add:

```text
https://tradetsr.vercel.app
```

6. Attach `TradeTSRBridge` to the XAUUSD chart.
7. Keep `InpEndpoint` as:

```text
https://tradetsr.vercel.app/api/market/mt5/ingest
```

8. Enable `Algo Trading`.
9. Save your MT5 profile with this chart and EA attached.

After a PC restart, open MT5 with Algo Trading active. The EA posts ticks every second and the app marks MT5 disconnected if no tick arrives for more than 10 seconds.

## Status and fallback rules

The dashboard header shows:

- MT5 connected or disconnected
- last tick time
- latency
- last price
- spread
- active source

If the source is not MT5, the app labels it `Fallback, not live MT5`. Fallback data is only there to avoid an empty screen while MT5 is closed or reconnecting. Trading decisions should be made from live MT5 data.

## Windows startup

Edit `scripts/start-star-gold-mt5.bat` if your MT5 path is different, then run:

```bat
scripts\install-star-gold-mt5-startup.bat
```

This adds a Startup shortcut script so Windows opens MT5 after login. MT5 will reload the saved profile, and the attached EA will reconnect to the cloud relay automatically when Algo Trading is active.

## Local development

```bash
npm install
npm run dev
```

Local dev can still use `NEXT_PUBLIC_MT5_LOCAL_BRIDGE_ORIGIN=http://127.0.0.1:3000`, but production must keep relative URLs so the Vercel app reads the cloud relay.
