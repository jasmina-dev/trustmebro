import { requireCronAuthorized } from "./internalApiAuth";

describe("requireCronAuthorized", () => {
  const withEnv = async (
    patch: Record<string, string | undefined>,
    fn: () => void | Promise<void>,
  ) => {
    const prev: Record<string, string | undefined> = {};
    for (const k of Object.keys(patch)) prev[k] = process.env[k];
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      await fn();
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };

  const req = (auth?: string) =>
    ({
      headers: {
        get: (k: string) => {
          if (k.toLowerCase() !== "authorization") return null;
          return auth ?? null;
        },
      },
    }) as any as Request;

  test("allows requests when CRON_SECRET is unset in non-prod", () => {
    return withEnv(
      { CRON_SECRET: undefined, NODE_ENV: "test", VERCEL_ENV: undefined },
      () => {
        expect(requireCronAuthorized(req())).toBeNull();
      },
    );
  });

  test("rejects requests when CRON_SECRET is unset in production", async () => {
    await withEnv(
      {
        CRON_SECRET: undefined,
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      },
      async () => {
        const res = requireCronAuthorized(req());
        expect(res?.status).toBe(401);
        const body = await res!.json();
        expect(body.error).toBe("Unauthorized");
        expect(body.detail).toMatch(/CRON_SECRET/);
      },
    );
  });

  test("rejects when bearer token is missing or mismatched", async () => {
    await withEnv(
      { CRON_SECRET: "shh", NODE_ENV: "test", VERCEL_ENV: undefined },
      async () => {
        const res1 = requireCronAuthorized(req());
        expect(res1?.status).toBe(401);
        const res2 = requireCronAuthorized(req("Bearer wrong"));
        expect(res2?.status).toBe(401);
      },
    );
  });

  test("allows when bearer token matches CRON_SECRET", () => {
    return withEnv(
      { CRON_SECRET: "shh", NODE_ENV: "test", VERCEL_ENV: undefined },
      () => {
        expect(requireCronAuthorized(req("Bearer shh"))).toBeNull();
        // also allow extra whitespace
        expect(requireCronAuthorized(req("Bearer   shh  "))).toBeNull();
      },
    );
  });
});
