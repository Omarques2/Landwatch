import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GtaExtraction } from './dto/gta.types';

@Injectable()
export class GtaExtractionService {
  private readonly logger = new Logger(GtaExtractionService.name);

  constructor(private readonly config: ConfigService) {}

  private extractorDir(): string {
    const configured =
      this.config.get<string>('GTA_EXTRACTOR_DIR') ?? 'gta-extractor';
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured);
  }

  /** Writes the buffer to a temp file, runs extract_gta.py, returns parsed JSON. */
  async extract(buffer: Buffer, originalName: string): Promise<GtaExtraction> {
    const dir = this.extractorDir();
    const script = path.join(dir, 'extract_gta.py');
    const python = this.config.get<string>('GTA_PYTHON_BIN') ?? 'python3';
    const timeoutMs =
      this.config.get<number>('GTA_EXTRACT_TIMEOUT_MS') ?? 30000;

    const tmp = path.join(
      os.tmpdir(),
      `gta-${Date.now()}-${Math.round(process.hrtime()[1])}.pdf`,
    );
    await fs.writeFile(tmp, buffer);
    try {
      const json = await this.run(
        python,
        [script, tmp],
        dir,
        timeoutMs,
        originalName,
      );
      return JSON.parse(json) as GtaExtraction;
    } catch (error) {
      if (error instanceof UnprocessableEntityException) throw error;
      this.logger.warn(
        `GTA extraction failed for ${originalName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new UnprocessableEntityException({
        code: 'GTA_EXTRACTION_FAILED',
        message: 'Não foi possível extrair os dados desta GTA.',
      });
    } finally {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
    }
  }

  private run(
    python: string,
    args: string[],
    cwd: string,
    timeoutMs: number,
    originalName: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(python, args, { cwd });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(
          new UnprocessableEntityException({
            code: 'GTA_EXTRACTION_TIMEOUT',
            message: 'A extração da GTA excedeu o tempo limite.',
          }),
        );
      }, timeoutMs);

      proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
      proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0 && stdout.trim()) {
          resolve(stdout.trim());
          return;
        }
        this.logger.warn(
          `extract_gta.py exit=${code} file=${originalName} stderr=${stderr.trim()}`,
        );
        reject(
          new UnprocessableEntityException({
            code: 'GTA_EXTRACTION_FAILED',
            message: 'Não foi possível extrair os dados desta GTA.',
          }),
        );
      });
    });
  }
}
