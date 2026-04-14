-- Publishable / secret API keys (sb_publishable_..., sb_secret_...) must NOT be sent as Authorization: Bearer;
-- the gateway rejects them on both apikey and authorization (invalid). With verify_jwt=false, send apikey only.
-- Legacy anon / service_role JWTs still use Bearer + apikey. See https://supabase.com/docs/guides/api/api-keys

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
  v_legacy_jwt boolean;
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

  if v_url is not null then
    v_url := btrim(v_url);
  end if;
  if v_jwt is not null then
    v_jwt := btrim(v_jwt);
    if v_jwt ~* '^Bearer\s+' then
      v_jwt := regexp_replace(v_jwt, '^Bearer\s+', '', 'i');
      v_jwt := btrim(v_jwt);
    end if;
  end if;
  if v_sync_secret is not null then
    v_sync_secret := btrim(v_sync_secret);
  end if;

  if v_url is null or length(v_url) = 0 or v_jwt is null or length(v_jwt) = 0 then
    raise warning
      'invoke_polymarket_sync_cron: vault secrets invoke_sync_polymarket_candles_url and invoke_sync_polymarket_candles_authorization are required; see migration 20260413120000_polymarket_sync_pg_cron.sql';
    return null;
  end if;

  v_legacy_jwt := v_jwt like 'eyJ%';

  if v_legacy_jwt then
    if v_sync_secret is not null and length(v_sync_secret) > 0 then
      v_headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_jwt,
        'apikey', v_jwt,
        'x-sync-secret', v_sync_secret
      );
    else
      v_headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_jwt,
        'apikey', v_jwt
      );
    end if;
  else
    if v_sync_secret is not null and length(v_sync_secret) > 0 then
      v_headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_jwt,
        'x-sync-secret', v_sync_secret
      );
    else
      v_headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_jwt
      );
    end if;
  end if;

  select net.http_post(
    url := v_url,
    headers := v_headers,
    body := '{}'::jsonb
  ) into v_req_id;

  return v_req_id;
end;
$$;

revoke all on function public.invoke_polymarket_sync_cron () from public;
