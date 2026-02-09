import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import {
  isValidCnpj,
  isValidCpf,
  sanitizeDoc,
} from '../common/validators/cpf-cnpj';

type DocInfo =
  | {
      type: 'CNPJ';
      cnpj: string;
      nome: string | null;
      fantasia: string | null;
      situacao: string | null;
    }
  | {
      type: 'CPF';
      cpf: string;
      isValid: boolean;
    };

@Injectable()
export class DocInfoService {
  private readonly cnpjCache = new Map<
    string,
    { value: DocInfo; expiresAt: number }
  >();
  private readonly cnpjPersistTtlMs = 24 * 60 * 60 * 1000;
  private readonly cnpjInFlight = new Map<string, Promise<DocInfo>>();

  constructor(private readonly prisma: PrismaService) {}

  async buildDocInfo(cpfCnpj: string): Promise<DocInfo> {
    const digits = sanitizeDoc(cpfCnpj) ?? '';
    if (digits.length === 11) {
      return { type: 'CPF', cpf: digits, isValid: isValidCpf(digits) };
    }
    if (digits.length === 14) {
      if (!isValidCnpj(digits)) {
        return {
          type: 'CNPJ',
          cnpj: digits,
          nome: null,
          fantasia: null,
          situacao: null,
        };
      }
      const stored = await this.getCnpjInfo(digits);
      if (stored) {
        return {
          type: 'CNPJ',
          cnpj: stored.cnpj,
          nome: stored.nome,
          fantasia: stored.fantasia,
          situacao: stored.situacao,
        };
      }
      return this.fetchCnpjInfo(digits);
    }
    return { type: 'CPF', cpf: digits, isValid: false };
  }

  async updateCnpjInfoBestEffort(cnpj: string) {
    try {
      await this.fetchCnpjInfo(cnpj);
    } catch {
      // best effort only
    }
  }

  private async getCnpjInfo(cnpj: string) {
    return this.prisma.cnpjInfo.findUnique({
      where: { cnpj },
      select: { cnpj: true, nome: true, fantasia: true, situacao: true },
    });
  }

  private async fetchCnpjInfo(cnpj: string): Promise<DocInfo> {
    const cached = this.cnpjCache.get(cnpj);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const inFlight = this.cnpjInFlight.get(cnpj);
    if (inFlight) return inFlight;

    const request = this.fetchCnpjInfoFresh(cnpj);
    this.cnpjInFlight.set(cnpj, request);
    try {
      const result = await request;
      return result;
    } finally {
      this.cnpjInFlight.delete(cnpj);
    }
  }

  private async fetchCnpjInfoFresh(cnpj: string): Promise<DocInfo> {
    try {
      const res = await axios.get<{
        status?: string;
        message?: string;
        nome?: string;
        fantasia?: string;
        situacao?: string;
        cnpj?: string;
      }>(`https://www.receitaws.com.br/v1/cnpj/${cnpj}`, {
        timeout: 12_000,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'LandWatch/1.0',
        },
      });
      const data = res.data;
      if (data?.status === 'ERROR') {
        const fallback = this.cnpjCache.get(cnpj);
        if (fallback && fallback.expiresAt > Date.now()) {
          return fallback.value;
        }
        return {
          type: 'CNPJ',
          cnpj,
          nome: null,
          fantasia: null,
          situacao: null,
        };
      }
      const result: DocInfo = {
        type: 'CNPJ',
        cnpj: data?.cnpj ?? cnpj,
        nome: data?.nome ?? null,
        fantasia: data?.fantasia ?? null,
        situacao: data?.situacao ?? null,
      };
      await this.upsertCnpjInfo(result);
      this.cnpjCache.set(cnpj, {
        value: result,
        expiresAt: Date.now() + this.cnpjPersistTtlMs,
      });
      return result;
    } catch {
      const fallback = this.cnpjCache.get(cnpj);
      if (fallback && fallback.expiresAt > Date.now()) {
        return fallback.value;
      }
      return {
        type: 'CNPJ',
        cnpj,
        nome: null,
        fantasia: null,
        situacao: null,
      };
    }
  }

  private async upsertCnpjInfo(info: DocInfo) {
    if (info.type !== 'CNPJ') return;
    await this.prisma.cnpjInfo.upsert({
      where: { cnpj: info.cnpj },
      update: {
        nome: info.nome,
        fantasia: info.fantasia,
        situacao: info.situacao,
      },
      create: {
        cnpj: info.cnpj,
        nome: info.nome,
        fantasia: info.fantasia,
        situacao: info.situacao,
      },
    });
  }
}
