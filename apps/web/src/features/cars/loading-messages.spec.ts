import { describe, expect, it } from "vitest";
import { CAR_LOADING_MESSAGES, getLoadingMessage } from "./loading-messages";

describe("getLoadingMessage", () => {
  it("cycles through messages in order", () => {
    const first = getLoadingMessage(0);
    expect(first.message).toBe(CAR_LOADING_MESSAGES[0]);

    const second = getLoadingMessage(first.nextIndex);
    expect(second.message).toBe(CAR_LOADING_MESSAGES[1]);
  });

  it("wraps back to the first message", () => {
    const lastIndex = CAR_LOADING_MESSAGES.length - 1;
    const last = getLoadingMessage(lastIndex);
    expect(last.message).toBe(CAR_LOADING_MESSAGES[lastIndex]);
    expect(last.nextIndex).toBe(0);
  });
});
