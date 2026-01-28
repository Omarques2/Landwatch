import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PowerBiService } from '../powerbi/powerbi.service';

type RefreshState = {
  running: boolean;
  pending: boolean;
  lastRequestedAt: number;
  scheduledAt?: number;
  timer?: NodeJS.Timeout;
};

type RefreshResult = {
  status: 'queued' | 'scheduled' | 'running';
  pending?: boolean;
  scheduledAt?: string;
  scheduledInMs?: number;
  refresh?: unknown;
};

@Injectable()
export class RlsRefreshService {
  private readonly logger = new Logger(RlsRefreshService.name);
  private readonly windowMs: number;
  private readonly states = new Map<string, RefreshState>();

  constructor(
    private readonly pbi: PowerBiService,
    private readonly config: ConfigService,
  ) {
    const raw = Number(
      this.config.get<string>('RLS_REFRESH_WINDOW_MS') ?? '90000',
    );
    this.windowMs = Number.isFinite(raw) && raw > 0 ? raw : 90_000;
  }

  async requestRefresh(
    workspaceId: string,
    datasetId: string,
  ): Promise<RefreshResult> {
    const key = this.key(workspaceId, datasetId);
    const state = this.getState(key);
    const now = Date.now();

    if (state.running) {
      state.pending = true;
      return { status: 'running', pending: true };
    }

    if (state.timer && state.scheduledAt) {
      return {
        status: 'scheduled',
        scheduledAt: new Date(state.scheduledAt).toISOString(),
        scheduledInMs: Math.max(state.scheduledAt - now, 0),
      };
    }

    const elapsed = now - state.lastRequestedAt;
    if (state.lastRequestedAt > 0 && elapsed < this.windowMs) {
      const delay = this.windowMs - elapsed;
      this.schedule(key, workspaceId, datasetId, delay);
      return {
        status: 'scheduled',
        scheduledAt: state.scheduledAt
          ? new Date(state.scheduledAt).toISOString()
          : undefined,
        scheduledInMs: delay,
      };
    }

    return this.runRefresh(key, workspaceId, datasetId);
  }

  async listRefreshes(workspaceId: string, datasetId: string) {
    return this.pbi.listDatasetRefreshesInGroup(workspaceId, datasetId);
  }

  private getState(key: string): RefreshState {
    const existing = this.states.get(key);
    if (existing) return existing;
    const state: RefreshState = {
      running: false,
      pending: false,
      lastRequestedAt: 0,
    };
    this.states.set(key, state);
    return state;
  }

  private schedule(
    key: string,
    workspaceId: string,
    datasetId: string,
    delay: number,
  ) {
    const state = this.getState(key);
    if (state.timer) return;

    state.scheduledAt = Date.now() + delay;
    state.timer = setTimeout(() => {
      state.timer = undefined;
      state.scheduledAt = undefined;
      this.runRefresh(key, workspaceId, datasetId).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Refresh failed for ${key}: ${message}`);
      });
    }, delay);

    state.timer.unref?.();
  }

  private async runRefresh(
    key: string,
    workspaceId: string,
    datasetId: string,
  ): Promise<RefreshResult> {
    const state = this.getState(key);
    state.running = true;
    state.lastRequestedAt = Date.now();

    try {
      const refresh = await this.pbi.refreshDatasetInGroup(
        workspaceId,
        datasetId,
      );
      return { status: 'queued', refresh };
    } finally {
      state.running = false;
      if (state.pending) {
        state.pending = false;
        void this.requestRefresh(workspaceId, datasetId);
      }
    }
  }

  private key(workspaceId: string, datasetId: string) {
    return `${workspaceId}:${datasetId}`;
  }
}
