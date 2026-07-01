import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FarmDocType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Claims } from '../auth/claims.type';
import type { ActorContext } from '../auth/actor-context.service';
import { isValidCpfCnpj, sanitizeDoc } from '../common/validators/cpf-cnpj';

type ListParams = {
  q?: string;
  page: number;
  pageSize: number;
  includeDocs?: boolean;
  // Operator-only org filter. Ignored for non-operator tenants so they can't
  // peek into other orgs by passing an arbitrary orgId.
  orgId?: string;
};

@Injectable()
export class FarmsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeCpfCnpj(input?: string | null): string | null {
    const digits = sanitizeDoc(input);
    if (!digits) return null;
    if (!isValidCpfCnpj(digits)) {
      throw new BadRequestException({
        code: 'INVALID_CPF_CNPJ',
        message: 'CPF/CNPJ inválido',
      });
    }
    return digits;
  }

  private normalizeDocuments(
    input?: Array<string | null | undefined>,
  ): Array<{ docNormalized: string; docType: FarmDocType }> {
    if (!input) return [];
    const unique = new Map<string, FarmDocType>();
    for (const value of input) {
      const digits = this.normalizeCpfCnpj(value);
      if (!digits) continue;
      const docType = digits.length === 11 ? FarmDocType.CPF : FarmDocType.CNPJ;
      unique.set(digits, docType);
    }
    return Array.from(unique.entries()).map(([docNormalized, docType]) => ({
      docNormalized,
      docType,
    }));
  }

  private normalizeCarKey(input: string): string {
    return input.trim();
  }

  private shapeFarm(farm: {
    id: string;
    name: string;
    carKey: string;
    orgId?: string | null;
    org?: { id: string; name: string } | null;
    documents?: Array<{ id: string; docType: string; docNormalized: string }>;
    _count?: { documents: number };
  }) {
    return {
      id: farm.id,
      name: farm.name,
      carKey: farm.carKey,
      orgId: farm.orgId ?? null,
      orgName: farm.org?.name ?? null,
      isPublic: (farm.orgId ?? null) === null,
      documentsCount: farm._count?.documents ?? farm.documents?.length ?? 0,
      documents: farm.documents?.map((doc) => ({
        id: doc.id,
        docType: doc.docType,
        docNormalized: doc.docNormalized,
      })),
    };
  }

  private async resolveUserId(claims: Claims): Promise<string> {
    const identityUserId = String(claims.sub);
    const user = await this.prisma.user.findUnique({
      where: { identityUserId },
      select: { id: true },
    });
    if (!user) {
      throw new ForbiddenException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }
    return user.id;
  }

  async create(
    claims: Claims,
    data: {
      name: string;
      carKey: string;
      cpfCnpj?: string;
      documents?: string[];
    },
  ) {
    const ownerUserId = await this.resolveUserId(claims);
    return this.createForOwner(ownerUserId, null, data);
  }

  async createForActor(
    actor: ActorContext,
    data: {
      name: string;
      carKey: string;
      cpfCnpj?: string;
      documents?: string[];
    },
  ) {
    // Farms are organization-scoped. Platform admins resolve to a null org on
    // tenant endpoints unless they pass X-Org-Id, so require a resolved org here
    // to stop org-less farms (which would later yield org-less analyses).
    if (!actor.orgId) {
      throw new BadRequestException({
        code: 'ORG_REQUIRED',
        message: 'X-Org-Id is required to create a farm.',
      });
    }
    return this.createForOwner(actor.userId, actor.orgId, data);
  }

  private async createForOwner(
    ownerUserId: string,
    orgId: string | null,
    data: {
      name: string;
      carKey: string;
      cpfCnpj?: string;
      documents?: string[];
    },
  ) {
    const carKey = this.normalizeCarKey(data.carKey);
    const documents = this.normalizeDocuments([
      ...(data.documents ?? []),
      data.cpfCnpj ?? null,
    ]);

    return this.prisma.$transaction(async (tx) => {
      const farm = await tx.farm.create({
        data: {
          name: data.name.trim(),
          carKey,
          ownerUserId,
          orgId: orgId ?? undefined,
        },
      });
      if (documents.length > 0) {
        await tx.farmDocument.createMany({
          data: documents.map((doc) => ({
            farmId: farm.id,
            docNormalized: doc.docNormalized,
            docType: doc.docType,
          })),
          skipDuplicates: true,
        });
      }
      const created = await tx.farm.findUnique({
        where: { id: farm.id },
        include: { documents: true },
      });
      return created ? this.shapeFarm(created) : created;
    });
  }

  async list(actor: ActorContext, params: ListParams) {
    const { q, page, pageSize, includeDocs } = params;
    const skip = (page - 1) * pageSize;
    const digits = q ? q.replace(/\D/g, '') : '';

    // Org scoping is mandatory: global operators (platform admin/user) see
    // everything (optionally narrowed to a single org via params.orgId), tenants
    // see their own org plus public farms, and an org-less non-operator sees only
    // public farms. There is no unscoped path. The orgId filter is operator-only
    // so a tenant can't peek into other orgs by passing an arbitrary orgId.
    const isOperator = actor.isPlatformAdmin || actor.isPlatformUser;
    const scopedWhere = isOperator
      ? params.orgId
        ? { orgId: params.orgId }
        : {}
      : actor.orgId
        ? { OR: [{ orgId: actor.orgId }, { orgId: null }] }
        : { orgId: null };

    const searchWhere = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { carKey: { contains: q, mode: 'insensitive' as const } },
            ...(digits
              ? [
                  {
                    documents: {
                      some: { docNormalized: { contains: digits } },
                    },
                  },
                ]
              : []),
          ],
        }
      : {};

    const clauses = [scopedWhere, searchWhere].filter(
      (clause) => Object.keys(clause).length > 0,
    );
    const where = clauses.length > 1 ? { AND: clauses } : (clauses[0] ?? {});

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.farm.count({ where }),
      this.prisma.farm.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          documents: includeDocs ? true : false,
          org: { select: { id: true, name: true } },
          _count: { select: { documents: true } },
        },
      }),
    ]);

    const shaped = rows.map((row) => {
      const base = this.shapeFarm(row);
      if (!includeDocs) {
        return {
          id: base.id,
          name: base.name,
          carKey: base.carKey,
          orgId: base.orgId,
          orgName: base.orgName,
          isPublic: base.isPublic,
          documentsCount: base.documentsCount,
        };
      }
      return base;
    });

    return { page, pageSize, total, rows: shaped };
  }

  async getById(id: string) {
    const farm = await this.prisma.farm.findUnique({
      where: { id },
      include: { documents: true, _count: { select: { documents: true } } },
    });
    if (!farm) {
      throw new NotFoundException({
        code: 'FARM_NOT_FOUND',
        message: 'Farm not found',
      });
    }
    return this.shapeFarm(farm);
  }

  async getByIdForActor(actor: ActorContext, id: string) {
    // Explicit branches instead of a fake-UUID sentinel: platform admins see
    // any farm; an org actor sees its own org plus public farms; an org-less
    // actor sees only public farms.
    const where = actor.isPlatformAdmin || actor.isPlatformUser
      ? { id }
      : actor.orgId
        ? { id, OR: [{ orgId: actor.orgId }, { orgId: null }] }
        : { id, orgId: null };
    const farm = await this.prisma.farm.findFirst({
      where,
      include: { documents: true, _count: { select: { documents: true } } },
    });
    if (!farm) {
      throw new NotFoundException({
        code: 'FARM_NOT_FOUND',
        message: 'Farm not found',
      });
    }
    return this.shapeFarm(farm);
  }

  async getByCarKey(carKeyInput: string) {
    const carKey = this.normalizeCarKey(carKeyInput);
    const farm = await this.prisma.farm.findFirst({
      where: { carKey },
      include: { documents: true, _count: { select: { documents: true } } },
    });
    if (!farm) {
      throw new NotFoundException({
        code: 'FARM_NOT_FOUND',
        message: 'Farm not found',
      });
    }
    return this.shapeFarm(farm);
  }

  /**
   * Scoped CAR lookup that returns `null` when the CAR is not found within the
   * actor's scope (instead of throwing 404). Used by the analysis-creation
   * autofill, where "no farm in scope" is a normal, non-error outcome.
   *
   * The lookup is ALWAYS anchored to the acting org — even for platform
   * operators. An analysis can only be created against a farm in the acting org
   * (see the cross-org guard in analyses.service), so resolving a foreign org's
   * farm here would only surface a farm the actor cannot use and then fail the
   * create. Anchoring to the acting org lets the platform org (Sigfarm) register
   * and reuse its own farm for a CAR that other orgs also have. Falls back to
   * public (null-org) farms when the acting org has none.
   */
  async findByCarKeyForActor(actor: ActorContext, carKeyInput: string) {
    const carKey = this.normalizeCarKey(carKeyInput);
    const farm =
      (actor.orgId
        ? await this.prisma.farm.findFirst({
            where: { carKey, orgId: actor.orgId },
            include: {
              documents: true,
              _count: { select: { documents: true } },
            },
          })
        : null) ??
      (await this.prisma.farm.findFirst({
        where: { carKey, orgId: null },
        include: { documents: true, _count: { select: { documents: true } } },
      }));
    return farm ? this.shapeFarm(farm) : null;
  }

  async getByCarKeyForActor(actor: ActorContext, carKeyInput: string) {
    const farm = await this.findByCarKeyForActor(actor, carKeyInput);
    if (!farm) {
      throw new NotFoundException({
        code: 'FARM_NOT_FOUND',
        message: 'Farm not found',
      });
    }
    return farm;
  }

  async update(
    claims: Claims,
    id: string,
    data: {
      name?: string;
      carKey?: string;
      cpfCnpj?: string | null;
      documents?: string[];
    },
  ) {
    await this.resolveUserId(claims);
    await this.getById(id);
    return this.updateById(id, data);
  }

  async updateForActor(
    actor: ActorContext,
    id: string,
    data: {
      name?: string;
      carKey?: string;
      cpfCnpj?: string | null;
      documents?: string[];
    },
  ) {
    const current = await this.prisma.farm.findUnique({
      where: { id },
      select: { id: true, orgId: true },
    });
    if (!current) {
      throw new NotFoundException({
        code: 'FARM_NOT_FOUND',
        message: 'Farm not found',
      });
    }
    if (!actor.isPlatformAdmin && current.orgId !== actor.orgId) {
      throw new ForbiddenException({
        code: 'FARM_EDIT_FORBIDDEN',
        message: 'Farm cannot be edited by this actor',
      });
    }
    return this.updateById(id, data);
  }

  private async updateById(
    id: string,
    data: {
      name?: string;
      carKey?: string;
      cpfCnpj?: string | null;
      documents?: string[];
    },
  ) {
    if (data.name !== undefined && data.name.trim().length === 0) {
      throw new BadRequestException({
        code: 'INVALID_NAME',
        message: 'Name must not be empty',
      });
    }

    if (data.carKey !== undefined && data.carKey.trim().length === 0) {
      throw new BadRequestException({
        code: 'INVALID_CAR_KEY',
        message: 'CAR key must not be empty',
      });
    }

    const documentsInput =
      data.documents !== undefined
        ? data.documents
        : data.cpfCnpj !== undefined
          ? data.cpfCnpj
            ? [data.cpfCnpj]
            : []
          : undefined;
    const documents =
      documentsInput !== undefined
        ? this.normalizeDocuments(documentsInput)
        : undefined;

    return this.prisma.$transaction(async (tx) => {
      await tx.farm.update({
        where: { id },
        data: {
          name: data.name?.trim(),
          carKey: data.carKey ? this.normalizeCarKey(data.carKey) : undefined,
        },
      });
      if (documents !== undefined) {
        await tx.farmDocument.deleteMany({ where: { farmId: id } });
        if (documents.length > 0) {
          await tx.farmDocument.createMany({
            data: documents.map((doc) => ({
              farmId: id,
              docNormalized: doc.docNormalized,
              docType: doc.docType,
            })),
            skipDuplicates: true,
          });
        }
      }
      const updated = await tx.farm.findUnique({
        where: { id },
        include: { documents: true, _count: { select: { documents: true } } },
      });
      return updated ? this.shapeFarm(updated) : updated;
    });
  }
}
