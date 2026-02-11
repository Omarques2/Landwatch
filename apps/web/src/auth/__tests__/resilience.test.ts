import { describe, expect, it } from "vitest";
import { createSingleFlight, runWithRetryBackoff } from "@/auth/resilience";

describe("runWithRetryBackoff", () => {
  it("retries transient failures and resolves on a later attempt", async () => {
    let attempts = 0;
    const result = await runWithRetryBackoff(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("transient");
        }
        return "ok";
      },
      {
        attempts: 3,
        baseDelayMs: 1,
        maxDelayMs: 2,
        jitterMs: 0,
        shouldRetry: () => true,
      },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("stops retrying when shouldRetry returns false", async () => {
    let attempts = 0;

    await expect(
      runWithRetryBackoff(
        async () => {
          attempts += 1;
          throw new Error("fatal");
        },
        {
          attempts: 5,
          baseDelayMs: 1,
          maxDelayMs: 2,
          jitterMs: 0,
          shouldRetry: () => false,
        },
      ),
    ).rejects.toThrow("fatal");

    expect(attempts).toBe(1);
  });
});

describe("createSingleFlight", () => {
  it("deduplicates concurrent executions while one call is in-flight", async () => {
    let calls = 0;
    const wrapped = createSingleFlight(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return calls;
    });

    const [a, b] = await Promise.all([wrapped(), wrapped()]);
    expect(calls).toBe(1);
    expect(a).toBe(1);
    expect(b).toBe(1);

    const c = await wrapped();
    expect(calls).toBe(2);
    expect(c).toBe(2);
  });
});
