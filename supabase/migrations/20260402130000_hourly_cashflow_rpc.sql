-- Aggregated hourly cashflow for dashboard charts (anon can call; bypasses RLS via SECURITY DEFINER).

create or replace function public.aggregate_hourly_cashflow_global (p_since timestamptz)
returns table (
  bucket_start timestamptz,
  volume numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.bucket_start,
    sum(c.volume)::numeric as volume
  from public.market_price_candles c
  where c.bucket_size = '1h'
    and c.bucket_start >= p_since
  group by c.bucket_start
  order by c.bucket_start;
$$;

create or replace function public.aggregate_hourly_cashflow_for_polymarket_ids (
  p_since timestamptz,
  p_polymarket_ids text[]
)
returns table (
  bucket_start timestamptz,
  volume numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.bucket_start,
    sum(c.volume)::numeric as volume
  from public.market_price_candles c
  inner join public.markets m on m.id = c.market_id
  where c.bucket_size = '1h'
    and c.bucket_start >= p_since
    and m.polymarket_id = any (p_polymarket_ids)
  group by c.bucket_start
  order by c.bucket_start;
$$;

revoke all on function public.aggregate_hourly_cashflow_global (timestamptz) from public;
grant execute on function public.aggregate_hourly_cashflow_global (timestamptz) to anon, authenticated, service_role;

revoke all on function public.aggregate_hourly_cashflow_for_polymarket_ids (timestamptz, text[]) from public;
grant execute on function public.aggregate_hourly_cashflow_for_polymarket_ids (timestamptz, text[]) to anon, authenticated, service_role;
