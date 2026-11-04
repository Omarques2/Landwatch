import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { assertGeeDates } from './gee-dates';

type GeeImageResult = {
  downloadUrl: string;
  previewUrl: string;
  previewDimensions: number;
  imageCount: number;
  format: string;
  script: string;
  sourceRevision: string;
};
type GeeBackendResult = {
  areaM2: number;
  beforeCount: number;
  afterCount: number;
  previewUrl: string;
  basePreviewUrl: string;
  beforePreviewUrl: string;
  previewDimensions: number;
  periods: {
    beforeStartDate: string;
    beforeEndDate: string;
    startDate: string;
    endDate: string;
  };
  script: string;
  sourceRevision: string;
};
export type GeeProgress = {
  stage: string;
  message: string;
  beforeCount?: number;
  afterCount?: number;
  imageCount?: number;
};

@Injectable()
export class GeeService {
  async run(
    geometry: Record<string, unknown>,
    input: {
      startDate: string;
      endDate: string;
      operation: 'image' | 'deforestation';
    },
    onProgress?: (progress: GeeProgress) => void,
    signal?: AbortSignal,
  ): Promise<GeeImageResult | GeeBackendResult> {
    const periods = assertGeeDates(input);

    const payload = JSON.stringify({
      geometry,
      ...periods,
    });

    return new Promise((resolve, reject) => {
      const script = join(__dirname, '..', '..', 'gee', 'run_image.cjs');
      const child = spawn(process.execPath, [script], {
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const abort = () => child.kill();
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) child.kill();
      let stdout = '';
      let stderr = '';
      let stderrBuffer = '';
      const consumeLine = (line: string) => {
        if (line.startsWith('#GEE_PROGRESS ')) {
          try {
            onProgress?.(JSON.parse(line.slice(14)) as GeeProgress);
          } catch {
            /* Ignore malformed progress without hiding runner errors. */
          }
        } else {
          stderr += line + '\n';
        }
      };
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString();
        const lines = stderrBuffer.split('\n');
        stderrBuffer = lines.pop() ?? '';
        lines.forEach(consumeLine);
      });
      child.stdin.on('error', () => undefined);
      child.on('error', (error) => {
        signal?.removeEventListener('abort', abort);
        reject(
          new InternalServerErrorException({
            code: 'GEE_CONNECTOR_UNAVAILABLE',
            message: error.message,
          }),
        );
      });
      child.on('close', (code) => {
        signal?.removeEventListener('abort', abort);
        if (stderrBuffer) consumeLine(stderrBuffer);
        if (code === 0) {
          try {
            resolve(JSON.parse(stdout) as GeeImageResult | GeeBackendResult);
          } catch {
            reject(
              new InternalServerErrorException({
                code: 'GEE_INVALID_RESPONSE',
                message:
                  'O conector Earth Engine retornou uma resposta inválida.',
              }),
            );
          }
          return;
        }
        reject(
          new InternalServerErrorException({
            code: 'GEE_ANALYSIS_FAILED',
            message:
              stderr.trim() || 'Falha ao executar a análise no Earth Engine.',
          }),
        );
      });
      child.stdin.end(payload);
    });
  }
}
