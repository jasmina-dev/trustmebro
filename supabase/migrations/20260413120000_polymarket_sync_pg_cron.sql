-- Hourly pg_cron → pg_net HTTP POST to Edge Function `sync-polymarket-candles`.
-- Nothing in earlier migrations scheduled invokes, so the function never ran until this exists.
--
-- ONE-TIME (Dashboard → SQL, replace placeholders): store URL + JWT in Vault so cron can authenticate.
-- Put the full project API key here (no spaces, no "Bearer " prefix):
--   Legacy: anon or service_role JWT (starts with eyJ...) — cron sends Bearer + apikey.
--   New: publishable sb_publishable_... or secret sb_secret_... — cron sends apikey only (Supabase gateway rule).
--   select vault.create_secret(
--     'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-polymarket-candles',
--     'invoke_sync_polymarket_candles_url'
--   );
--   select vault.create_secret(
--     'YOUR_SUPABASE_ANON_OR_SERVICE_ROLE_JWT',
--     'invoke_sync_polymarket_candles_authorization'
--   );
-- If the function secret SYNC_CRON_SECRET is set (Dashboard → Edge Functions → Secrets), add:
--   select vault.create_secret('YOUR_SYNC_CRON_SECRET', 'invoke_sync_polymarket_candles_x_sync_secret');
--
-- Deploy: `supabase db push` (or run this file on the remote DB). Ensure the edge function is deployed
-- (`supabase functions deploy sync-polymarket-candles`) and `verify_jwt = false` in its config.toml.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
-- Vault holds the invoke URL and JWT; required for net.http_post from cron.
create extension if not exists supabase_vault cascade;

create or replace function public.invoke_polymarket_sync_cron ()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net, extensions, pg_temp
as $$
declare
  v_url text;
  v_jwt text;
  v_sync_secret text;
  v_headers jsonb;
  v_req_id bigint;
begin
  select ds.decrypted_secret
    into v_url
  from vault.decrypted_secrets ds
  where ds.name = 'invoke_sync_polymarket_candles_url'
  limit 1;

  select ds.decrypted_secret
    into v_jwt
  from vault.decrypted_secrets ds
  where ds.name = 'invoke_sync_polymarket_candles_authorization'
  limit 1;

  select ds.decrypted_secret
    into v_sync_secret
  from vault.decrypted_secrets ds
  where ds.name = 'invoke_sync_polymarket_candles_x_sync_secret'
  limit 1;

  if v_url is null or v_jwt is null then
    raise warning
      'invoke_polymarket_sync_cron: vault secrets invoke_sync_polymarket_candles_url and invoke_sync_polymarket_candles_authorization are required; see migration 20260413120000_polymarket_sync_pg_cron.sql';
    return null;
  end if;

  v_headers := jsonb_strip_nulls(
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_jwt,
      'apikey', v_jwt,
      'x-sync-secret', v_sync_secret
    )
  );

  select net.http_post(
    url := v_url,
    headers := v_headers,
    body := '{}'::jsonb
  ) into v_req_id;

  return v_req_id;
end;
$$;

revoke all on function public.invoke_polymarket_sync_cron () from public;

do $cron$
declare
  jid bigint;
begin
  select j.jobid into jid
  from cron.job j
  where j.jobname = 'sync-polymarket-candles-hourly'
  limit 1;

  if jid is not null then
    perform cron.unschedule(jid);
  end if;
end;
$cron$;

select cron.schedule(
  'sync-polymarket-candles-hourly',
  '0 * * * *',
  $$select public.invoke_polymarket_sync_cron();$$
);
