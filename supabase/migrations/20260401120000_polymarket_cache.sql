-- Polymarket historical cache (markets + hourly candles + sync cursor).
-- Safe to run once on a fresh Supabase project.

create table if not exists public.markets (
  id uuid primary key default gen_random_uuid (),
  polymarket_id text not null unique,
  question text not null,
  category text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  extra jsonb not null default '{}'::jsonb
);

create index if not exists markets_category_idx on public.markets (category)
  where category is not null;

create index if not exists markets_created_at_idx on public.markets (created_at desc);

create table if not exists public.market_price_candles (
  id bigserial primary key,
  market_id uuid not null references public.markets (id) on delete cascade,
  bucket_start timestamptz not null,
  bucket_size text not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric not null default 0,
  liquidity numeric,
  updated_at timestamptz not null default now (),
  unique (market_id, bucket_start, bucket_size)
);

create index if not exists market_price_candles_market_bucket_time_idx
  on public.market_price_candles (market_id, bucket_size, bucket_start desc);

create table if not exists public.sync_state (
  source text primary key,
  last_sync_time timestamptz,
  last_trade_timestamp timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

insert into public.sync_state (source)
values ('polymarket')
on conflict (source) do nothing;

create or replace function public.set_market_candle_updated_at ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists market_price_candles_updated_at on public.market_price_candles;

create trigger market_price_candles_updated_at
  before update on public.market_price_candles
  for each row
  execute function public.set_market_candle_updated_at ();

alter table public.markets enable row level security;
alter table public.market_price_candles enable row level security;
alter table public.sync_state enable row level security;
