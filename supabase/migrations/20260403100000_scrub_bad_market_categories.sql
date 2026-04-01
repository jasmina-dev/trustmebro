-- Remove outcome/threshold strings that were stored as category (e.g. weather "20°C").
-- Next sync-polymarket-candles run will repopulate from fixed deriveMarketCategory().

update public.markets
set category = null
where category is not null
  and (
    category ~ '[°℃℉]'
    or category ~* 'celsius|fahrenheit'
    or category ~ '^\d+(\.\d+)?\s*[-–]\s*\d+(\.\d+)?$'
    or category ~ '^\d+(\.\d+)?%$'
    or category ~ '^\d+(\.\d+)?\s*°?\s*[cf]?\s*$'
  );
