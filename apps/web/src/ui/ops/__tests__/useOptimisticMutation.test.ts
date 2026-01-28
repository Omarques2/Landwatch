import { beforeEach, describe, expect, it } from "vitest";
import { useOptimisticMutation } from "@/ui/ops/useOptimisticMutation";
import { useToast } from "@/ui/toast/useToast";

describe("useOptimisticMutation", () => {
  beforeEach(() => {
    const { state } = useToast();
    state.items.splice(0, state.items.length);
  });

  it("pushes success toast on success", async () => {
    const { mutate } = useOptimisticMutation();

    const result = await mutate({
      key: "ok",
      request: async () => ({ ok: true }),
      toast: { success: { title: "Salvo" } },
    });

    const { state } = useToast();
    expect(result).toEqual({ ok: true });
    expect(state.items.length).toBe(1);
    expect(state.items[0]?.kind).toBe("success");
    expect(state.items[0]?.title).toBe("Salvo");
  });

  it("rolls back and pushes error toast on failure", async () => {
    const { mutate } = useOptimisticMutation();

    let rolledBack = false;
    const result = await mutate({
      key: "fail",
      optimistic: () => ({ prev: 1 }),
      rollback: () => {
        rolledBack = true;
      },
      request: async () => {
        throw new Error("boom");
      },
      toast: { error: { title: "Falha" } },
    });

    const { state } = useToast();
    expect(result).toBeUndefined();
    expect(rolledBack).toBe(true);
    expect(state.items.length).toBe(1);
    expect(state.items[0]?.kind).toBe("error");
    expect(state.items[0]?.title).toBe("Falha");
  });
});
