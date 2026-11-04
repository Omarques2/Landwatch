import { Injectable, Logger } from '@nestjs/common';
import { AnalysisKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AnalysisVectorLegendItem,
  AnalysisVectorMapService,
} from './analysis-vector-map.service';
import {
  buildIndigenaItemKey,
  buildUcsItemKey,
  isIndigenaDataset,
  isLdiDataset,
  isUcsDataset,
  LDI_ITEM_KEY,
} from './analysis-dataset-keys';

type OverlapValue = { overlapAreaM2: number; overlapPct: number };

export const ANALYSIS_OVERLAP_SUMMARY_VERSION = 2;

export type AnalysisOverlapSummary = {
  version: typeof ANALYSIS_OVERLAP_SUMMARY_VERSION;
  subjectAreaM2: number;
  // Keyed like datasetGroups items.
  items: Record<string, OverlapValue>;
  // Keyed like map legend entries (vector map legend codes and dataset codes).
  legend: Record<string, OverlapValue>;
};

const LEGEND_KEY_PREFIX = 'legend:';

type OverlapRow = {
  kind: 'subject' | 'feature' | 'item';
  key: string | null;
  area_m2: number | string | null;
};

type AttrRow = {
  dataset_code: string;
  feature_id: string;
  fase: string | null;
  categoria: string | null;
};

type TargetRow = {
  isSicar: boolean;
  categoryCode: string;
  datasetCode: string;
  featureId: bigint | null;
  geomId: bigint;
};

const INDIGENA_PHASE_KEYS = [
  'fase_ti',
  'FASE_TI',
  'faseTi',
  'FASETI',
  'fase_it',
  'FASE_IT',
  'faseIt',
  'FASEIT',
];

const UCS_CATEGORY_KEYS = [
  'categoria_uc',
  'CATEGORIA_UC',
  'categoria',
  'Categoria',
  'CATEGORIA',
  'SiglaCateg',
  'SIGLACATEG',
  'siglacateg',
  'sigla_categ',
];

function assertIdentifier(value: string, name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

// Computes how much of the analysis subject (CAR, uploaded geometry or radius)
// each intersecting feature, datasetGroups item and map legend entry covers.
// Runs as a postprocess job so the analysis itself keeps the fast
// intersection path.
@Injectable()
export class AnalysisOverlapService {
  private readonly logger = new Logger(AnalysisOverlapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vectorMap: AnalysisVectorMapService,
  ) {}

  async computeAndStore(analysisId: string): Promise<boolean> {
    const startedAt = Date.now();
    const analysis = await this.prisma.analysis.findUnique({
      where: { id: analysisId },
      select: {
        id: true,
        status: true,
        analysisKind: true,
        subjectType: true,
        analysisDate: true,
        radiusCenterLat: true,
        radiusCenterLng: true,
        radiusM: true,
      },
    });
    if (!analysis || analysis.status !== 'completed') return false;
    if (analysis.analysisKind === AnalysisKind.DETER) return false;

    const results = await this.prisma.analysisResult.findMany({
      where: { analysisId },
      select: {
        isSicar: true,
        categoryCode: true,
        datasetCode: true,
        featureId: true,
        geomId: true,
      },
    });

    const schema = this.getSchema();
    const subjectSql = this.buildSubjectSql(schema, analysis, results);
    if (!subjectSql) return this.storeEmptySummary(analysisId);

    const targets = results.filter((row): row is TargetRow =>
      this.isOverlapTarget(row),
    );
    const analysisDate = analysis.analysisDate.toISOString().slice(0, 10);
    const [attrs, legendItems] = await Promise.all([
      this.fetchItemAttributes(schema, analysisDate, targets),
      this.vectorMap.fetchLegendItems(
        analysisId,
        analysisDate,
        AnalysisKind.STANDARD,
      ),
    ]);
    const itemPairs = [
      ...this.buildItemPairs(targets, attrs),
      ...this.buildLegendPairs(targets, legendItems),
    ];
    const geomIds = Array.from(
      new Set(targets.map((row) => row.geomId.toString())),
    );

    const rows = await this.prisma.$queryRaw<OverlapRow[]>(Prisma.sql`
      WITH subject AS MATERIALIZED (
        SELECT s.geom, ST_Area(s.geom::geography) AS area_m2
        FROM (${subjectSql}) s
      ),
      features AS MATERIALIZED (
        SELECT
          g.geom_id,
          CASE
            WHEN ST_Covers(g.geom, s.geom) THEN s.geom
            ELSE ST_Intersection(s.geom, g.geom)
          END AS overlap_geom
        FROM ${Prisma.raw(`"${schema}"."lw_geom_store"`)} g
        CROSS JOIN subject s
        WHERE g.geom_id = ANY(${geomIds}::bigint[])
      ),
      items AS (
        SELECT u.item_key, u.geom_id
        FROM unnest(
          ${itemPairs.map((pair) => pair.key)}::text[],
          ${itemPairs.map((pair) => pair.geomId)}::bigint[]
        ) AS u(item_key, geom_id)
      )
      SELECT 'subject' AS kind, NULL::text AS key, s.area_m2 AS area_m2
      FROM subject s
      UNION ALL
      SELECT 'feature', f.geom_id::text, ST_Area(f.overlap_geom::geography)
      FROM features f
      UNION ALL
      SELECT
        'item',
        i.item_key,
        ST_Area(ST_UnaryUnion(ST_Collect(f.overlap_geom))::geography)
      FROM items i
      JOIN features f ON f.geom_id = i.geom_id
      GROUP BY i.item_key
    `);

    const subjectRow = rows.find((row) => row.kind === 'subject');
    if (!subjectRow) return this.storeEmptySummary(analysisId);
    const subjectAreaM2 = Number(subjectRow.area_m2 ?? 0);
    const toPct = (areaM2: number) =>
      subjectAreaM2 > 0 ? (areaM2 / subjectAreaM2) * 100 : 0;

    const featureRows = rows.filter((row) => row.kind === 'feature' && row.key);
    const items: AnalysisOverlapSummary['items'] = {};
    const legend: AnalysisOverlapSummary['legend'] = {};
    for (const row of rows) {
      if (row.kind !== 'item' || !row.key) continue;
      const overlapAreaM2 = Number(row.area_m2 ?? 0);
      const value = { overlapAreaM2, overlapPct: toPct(overlapAreaM2) };
      if (row.key.startsWith(LEGEND_KEY_PREFIX)) {
        legend[row.key.slice(LEGEND_KEY_PREFIX.length)] = value;
      } else {
        items[row.key] = value;
      }
    }
    // Dataset legend entries share the dataset code with their item.
    for (const row of targets) {
      const value = items[row.datasetCode];
      if (value) legend[row.datasetCode] = value;
    }
    const summary: AnalysisOverlapSummary = {
      version: ANALYSIS_OVERLAP_SUMMARY_VERSION,
      subjectAreaM2,
      items,
      legend,
    };

    await this.prisma.$transaction(async (tx) => {
      if (featureRows.length) {
        const areas = featureRows.map((row) => Number(row.area_m2 ?? 0));
        await tx.$executeRaw(Prisma.sql`
          UPDATE "app"."analysis_result" r
          SET
            overlap_area_m2 = v.area_m2,
            overlap_pct_of_sicar = v.pct
          FROM unnest(
            ${featureRows.map((row) => row.key as string)}::bigint[],
            ${areas}::numeric[],
            ${areas.map(toPct)}::numeric[]
          ) AS v(geom_id, area_m2, pct)
          WHERE r.analysis_id = ${analysisId}::uuid
            AND r.geom_id = v.geom_id
            AND r.is_sicar = false
            AND r.overlap_area_m2 IS NULL
        `);
      }
      await tx.analysis.update({
        where: { id: analysisId },
        data: { overlapSummary: summary },
      });
    });

    this.logger.log(
      JSON.stringify({
        event: 'analysis.overlap.computed',
        analysisId,
        features: geomIds.length,
        items: Object.keys(items).length,
        durationMs: Date.now() - startedAt,
      }),
    );
    return true;
  }

  // Nothing to measure against; an empty summary stops the detail from
  // reporting the overlap as pending.
  private async storeEmptySummary(analysisId: string) {
    const summary: AnalysisOverlapSummary = {
      version: ANALYSIS_OVERLAP_SUMMARY_VERSION,
      subjectAreaM2: 0,
      items: {},
      legend: {},
    };
    await this.prisma.analysis.update({
      where: { id: analysisId },
      data: { overlapSummary: summary },
    });
    return true;
  }

  private getSchema(): string {
    const schema = process.env.LANDWATCH_SCHEMA ?? 'landwatch';
    return assertIdentifier(schema, 'LANDWATCH_SCHEMA');
  }

  private buildSubjectSql(
    schema: string,
    analysis: {
      id: string;
      subjectType: string;
      radiusCenterLat: Prisma.Decimal | null;
      radiusCenterLng: Prisma.Decimal | null;
      radiusM: number | null;
    },
    results: Array<{ isSicar: boolean; geomId: bigint | null }>,
  ): Prisma.Sql | null {
    if (analysis.subjectType === 'GEOMETRY') {
      return Prisma.sql`
        SELECT ST_Transform(geom, 4674) AS geom
        FROM "app"."analysis_subject_geometry"
        WHERE analysis_id = ${analysis.id}::uuid
      `;
    }
    if (analysis.subjectType === 'RADIUS') {
      if (
        analysis.radiusCenterLat === null ||
        analysis.radiusCenterLng === null ||
        !analysis.radiusM
      ) {
        return null;
      }
      const lat = Number(analysis.radiusCenterLat);
      const lng = Number(analysis.radiusCenterLng);
      return Prisma.sql`
        SELECT ST_Transform(
          ST_Buffer(
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${analysis.radiusM}
          )::geometry,
          4674
        ) AS geom
      `;
    }
    const sicarGeomId = results.find(
      (row) => row.isSicar && row.geomId !== null,
    )?.geomId;
    if (sicarGeomId === undefined || sicarGeomId === null) return null;
    return Prisma.sql`
      SELECT geom
      FROM ${Prisma.raw(`"${schema}"."lw_geom_store"`)}
      WHERE geom_id = ${sicarGeomId.toString()}::bigint
    `;
  }

  private isOverlapTarget(row: {
    isSicar: boolean;
    categoryCode: string;
    datasetCode: string;
    geomId: bigint | null;
  }) {
    if (row.isSicar || row.geomId === null) return false;
    const category = (row.categoryCode ?? '').toUpperCase();
    if (['BIOMAS', 'DETER', 'SICAR'].includes(category)) return false;
    const dataset = (row.datasetCode ?? '').toUpperCase();
    return !dataset.startsWith('CAR_') && !dataset.startsWith('DETER');
  }

  private async fetchItemAttributes(
    schema: string,
    analysisDate: string,
    targets: TargetRow[],
  ): Promise<Map<string, AttrRow>> {
    const attrTargets = targets.filter(
      (row) =>
        row.featureId !== null &&
        (isIndigenaDataset(row.categoryCode, row.datasetCode) ||
          isUcsDataset(row.categoryCode, row.datasetCode)),
    );
    if (!attrTargets.length) return new Map();
    const coalesce = (keys: string[]) =>
      Prisma.join(
        keys.map((key) => Prisma.sql`NULLIF(p.pack_json->>${key}, '')`),
        ',',
      );
    const rows = await this.prisma.$queryRaw<AttrRow[]>(Prisma.sql`
      SELECT
        d.code AS dataset_code,
        h.feature_id::text AS feature_id,
        COALESCE(${coalesce(INDIGENA_PHASE_KEYS)}) AS fase,
        COALESCE(${coalesce(UCS_CATEGORY_KEYS)}) AS categoria
      FROM ${Prisma.raw(`"${schema}"."lw_feature_attr_pack_hist"`)} h
      JOIN ${Prisma.raw(`"${schema}"."lw_attr_pack"`)} p ON p.pack_id = h.pack_id
      JOIN ${Prisma.raw(`"${schema}"."lw_dataset"`)} d ON d.dataset_id = h.dataset_id
      WHERE d.code = ANY(${Array.from(new Set(attrTargets.map((row) => row.datasetCode)))}::text[])
        AND h.feature_id = ANY(${Array.from(new Set(attrTargets.map((row) => String(row.featureId))))}::bigint[])
        AND h.valid_from <= ${analysisDate}::date
        AND (h.valid_to IS NULL OR h.valid_to > ${analysisDate}::date)
    `);
    return new Map(
      rows.map((row) => [`${row.dataset_code}:${row.feature_id}`, row]),
    );
  }

  // UCS legend entries group features by name and indigenous entries by phase,
  // possibly across datasets, so they get their own union.
  private buildLegendPairs(
    targets: TargetRow[],
    legendItems: AnalysisVectorLegendItem[],
  ) {
    const pairs: Array<{ key: string; geomId: string }> = [];
    for (const item of legendItems) {
      if (item.kind === 'dataset' || !item.featureIds.length) continue;
      const isFamily = item.kind === 'ucs' ? isUcsDataset : isIndigenaDataset;
      const featureIds = new Set(item.featureIds);
      const geomIds = new Set(
        targets
          .filter(
            (row) =>
              featureIds.has(String(row.featureId)) &&
              isFamily(row.categoryCode, row.datasetCode),
          )
          .map((row) => row.geomId.toString()),
      );
      for (const geomId of geomIds) {
        pairs.push({ key: `${LEGEND_KEY_PREFIX}${item.code}`, geomId });
      }
    }
    return pairs;
  }

  private buildItemPairs(targets: TargetRow[], attrs: Map<string, AttrRow>) {
    const pairs = new Map<string, { key: string; geomId: string }>();
    const add = (key: string, geomId: string) =>
      pairs.set(`${key}:${geomId}`, { key, geomId });
    for (const row of targets) {
      const geomId = row.geomId.toString();
      add(row.datasetCode, geomId);
      if (isLdiDataset(row.categoryCode, row.datasetCode)) {
        add(LDI_ITEM_KEY, geomId);
      }
      const attr = attrs.get(`${row.datasetCode}:${String(row.featureId)}`);
      const fase = attr?.fase?.trim();
      if (fase && isIndigenaDataset(row.categoryCode, row.datasetCode)) {
        add(buildIndigenaItemKey(fase), geomId);
      }
      const categoria = attr?.categoria?.trim();
      if (categoria && isUcsDataset(row.categoryCode, row.datasetCode)) {
        add(buildUcsItemKey(categoria), geomId);
      }
    }
    return Array.from(pairs.values());
  }
}
