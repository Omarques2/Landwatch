import { ref } from "vue";
import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";

export type MvStatusView = {
  name: string;
  locked: boolean;
  refreshing: boolean;
  lockModes: string[];
};

export type LandwatchMvStatus = {
  busy: boolean;
  checkedAt: string;
  views: MvStatusView[];
};

export const mvStatus = ref<LandwatchMvStatus | null>(null);
export const mvBusy = ref(false);
let pollTimer: number | null = null;

export async function fetchLandwatchStatus() {
  try {
    const res = await http.get<ApiEnvelope<LandwatchMvStatus>>(
      "/v1/landwatch/mv-status",
    );
    const data = unwrapData(res.data);
    mvStatus.value = data;
    mvBusy.value = Boolean(data?.busy);
    return data;
  } catch {
    mvStatus.value = null;
    mvBusy.value = false;
    return null;
  }
}

export function startLandwatchStatusPolling(intervalMs = 300_000) {
  if (pollTimer) return;
  pollTimer = window.setInterval(() => {
    void fetchLandwatchStatus();
  }, intervalMs);
}

export function stopLandwatchStatusPolling() {
  if (!pollTimer) return;
  window.clearInterval(pollTimer);
  pollTimer = null;
}
