import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import CallbackView from "@/views/CallbackView.vue";
import { getActiveAccount, hardResetAuthState, initAuthSafe } from "@/auth/auth";
import { getMeCached } from "@/auth/me";

const replaceMock = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock("@/auth/auth", () => ({
  getActiveAccount: vi.fn(),
  hardResetAuthState: vi.fn(),
  initAuthSafe: vi.fn(),
}));

vi.mock("@/auth/me", () => ({
  getMeCached: vi.fn(),
}));

async function flushTick() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("CallbackView", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    (initAuthSafe as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (hardResetAuthState as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (getActiveAccount as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it("redirects to /login when there is no active account", async () => {
    mount(CallbackView);
    await flushTick();

    expect(replaceMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to /pending when account exists but /users/me is unavailable", async () => {
    (getActiveAccount as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      homeAccountId: "acc-1",
    });
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    mount(CallbackView);
    await flushTick();

    expect(getMeCached).toHaveBeenCalledWith(true);
    expect(replaceMock).toHaveBeenCalledWith("/pending");
  });

  it("redirects to root when account is active", async () => {
    (getActiveAccount as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      homeAccountId: "acc-1",
    });
    (getMeCached as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "active",
    });

    mount(CallbackView);
    await flushTick();

    expect(replaceMock).toHaveBeenCalledWith("/");
  });
});
