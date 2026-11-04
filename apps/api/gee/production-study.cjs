'use strict';

// Production is queried through a read-only PostgreSQL session. No app/EE writes.
// Run from apps/api: node gee/production-study.cjs
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const dotenv = require('dotenv');
const { Client } = require('pg');
const { GoogleAuth } = require('google-auth-library');
const ee = require('@google/earthengine');
dotenv.config({ quiet: true });
ee.data.setDeadline(0);
const outputDir = path.resolve('.temp/gee-prodes-2026-10-28');
const revision = 'ffcce5c984e932203e977d09665eeae013347392';
const evaluate = value => new Promise((resolve, reject) => value.evaluate((result, error) => error ? reject(new Error(error)) : resolve(result)));

async function exportCandidates() {
  const env = dotenv.parse(await fs.readFile('../Versionamento/.env.prod', 'utf8'));
  const url = new URL(env.DATABASE_URL);
  url.searchParams.delete('sslmode');
  const client = new Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, options: '-c default_transaction_read_only=on -c statement_timeout=30000', connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
    const check = (await client.query("select current_database() as database, current_setting('transaction_read_only') as read_only")).rows[0];
    if (check.database !== 'landwatch' || check.read_only !== 'on') throw new Error('Production/read-only verification failed');
    const { rows } = await client.query(`
      with latest as (
        select distinct on (a.car_key) a.id,a.car_key,coalesce(a.farm_name_snapshot,f.name,a.car_key) as name
        from app.analysis a left join app.farm f on f.id=a.farm_id
        where a.car_key is not null and a.status='completed'
          and exists(select 1 from app.analysis_result p where p.analysis_id=a.id and p.category_code='PRODES' and p.overlap_area_m2>0)
        order by a.car_key,a.analysis_date desc,a.created_at desc
      ), p as (
        select l.id,l.car_key,l.name,count(*)::int as prodes_records,
          max(r.overlap_area_m2)::float8 as largest_overlap_m2,
          max(r.overlap_pct_of_sicar)::float8 as largest_overlap_pct,
          array_agg(distinct r.dataset_code) as datasets
        from latest l join app.analysis_result r on r.analysis_id=l.id
        where r.category_code='PRODES' and r.overlap_area_m2>0 group by l.id,l.car_key,l.name
      )
      select p.*,s.geom_id::text as car_geom_id,s.sicar_area_m2::float8 as farm_area_m2
      from p join lateral(select r.geom_id,r.sicar_area_m2 from app.analysis_result r
        where r.analysis_id=p.id and r.is_sicar=true and r.geom_id is not null limit 1)s on true
      order by largest_overlap_pct desc limit 35`);
    for (const farm of rows) {
      const result = await client.query('select ST_AsGeoJSON(ST_Transform(geom,4326))::json as geometry from landwatch.lw_geom_store where geom_id=$1', [farm.car_geom_id]);
      if (!result.rows[0]) throw new Error(`Missing geometry for ${farm.car_key}`);
      farm.geometry = result.rows[0].geometry;
      await fs.writeFile(path.join(outputDir, `${farm.car_key}.geojson`), JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: farm.name, CAR: farm.car_key }, geometry: farm.geometry }] }));
    }
    await fs.writeFile(path.join(outputDir, 'candidates.json'), JSON.stringify({ ...check, farms: rows }, null, 2));
    return rows;
  } finally { await client.end(); }
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const shortIntervals = process.argv.includes('--short');
  const farms = process.argv.includes('--resume') || shortIntervals
    ? JSON.parse(await fs.readFile(path.join(outputDir, 'candidates.json'), 'utf8')).farms
    : await exportCandidates();
  console.log(JSON.stringify({ event: 'candidates', count: farms.length, outputDir }));
  const raw = process.env.GEE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS || 'sigfarm_google_secret_key.json';
  const key = JSON.parse(raw.trim().startsWith('{') ? raw : await fs.readFile(raw, 'utf8'));
  await new Promise((resolve, reject) => ee.data.authenticateViaPrivateKey(key, () => ee.initialize(null, null, resolve, reject, null, key.project_id), reject));
  const client = await new GoogleAuth({ credentials: key, scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient();
  const response = await client.request({ url: 'https://earthengine.googlesource.com/users/APP_VerdeBrasil/APP/+/HEAD/Backend?format=TEXT', responseType: 'text' });
  const blob = Buffer.from(response.data, 'base64');
  if (createHash('sha1').update(`blob ${blob.length}\0`).update(blob).digest('hex') !== revision) throw new Error('Original Backend changed; review required');
  const original = blob.toString();
  const reportPath = path.join(outputDir, shortIntervals ? 'results-short.json' : 'results.json');
  const report = process.argv.includes('--resume') ? JSON.parse(await fs.readFile(reportPath, 'utf8')) : { startedAt: new Date().toISOString(), database: 'landwatch', readOnly: true, sourceRevision: revision, cases: [] };
  const intervals = shortIntervals ? [['2011-06-01', '2014-01-01'], ['2012-01-01', '2020-01-01']] : [['1990-01-01', '2026-01-01'], ['2010-01-01', '2026-01-01']];
  const jobs = farms.flatMap(farm => intervals.map(([startDate, endDate]) => ({ farm, startDate, endDate })))
    .filter(job => !report.cases.some(row => row.carKey === job.farm.car_key && row.startDate === job.startDate));
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const { farm, startDate, endDate } = jobs[cursor++];
      const row = { name: farm.name, carKey: farm.car_key, startDate, endDate, prodesRecords: farm.prodes_records, farmAreaM2: farm.farm_area_m2 };
      const started = Date.now();
      console.log(JSON.stringify({ event: 'start', ...row }));
      try {
        let source = original;
        for (const [from, to] of [
          ['var AreaSentinel = ee.FeatureCollection("projects/ee-sigfarmoperacional/assets/IZVQ/SantoAntonioMatricula");', 'var AreaSentinel = inputArea;'],
          ["var datain1 = '2019-08-01';", `var datain1 = '${startDate}';`],
          ["var datafin1 = '2019-08-30';", "var datafin1 = '2012-05-06';"],
          ["var datain2 = '2025-08-01';", "var datain2 = '2013-03-18';"],
          ["var datafin2 = '2025-08-30';", `var datafin2 = '${endDate}';`],
        ]) {
          if (source.split(from).length !== 2) throw new Error('Unrecognized original parameter');
          source = source.replace(from, to);
        }
        const area = ee.Geometry(farm.geometry);
        const context = { ee, inputArea: ee.FeatureCollection([ee.Feature(area)]), Map: { centerObject() {}, addLayer() {} }, print() {} };
        vm.runInNewContext(source, context, { timeout: 5000 });
        [row.beforeCount, row.afterCount] = await Promise.all([evaluate(context.filtered1.size()), evaluate(context.filtered2.size())]);
        if (!row.beforeCount || !row.afterCount) throw new Error('One sensor has no images');
        const diff = context.changeSaviLandsat;
        const pixelArea = ee.Image.pixelArea();
        const metrics = diff.lt(0).multiply(pixelArea).rename('decreaseM2')
          .addBands(diff.eq(0).multiply(pixelArea).rename('unchangedM2'))
          .addBands(diff.gt(0).multiply(pixelArea).rename('increaseM2'));
        Object.assign(row, await evaluate(ee.Dictionary({
          originalArea: context.areaDiff,
          areas: metrics.reduceRegion({ reducer: ee.Reducer.sum(), geometry: area, scale: 30, maxPixels: 1e13, tileScale: 4 }),
          histogram: diff.reduceRegion({ reducer: ee.Reducer.frequencyHistogram(), geometry: area, scale: 30, maxPixels: 1e13, tileScale: 4 }),
        })));
        const total = row.areas.decreaseM2 + row.areas.unchangedM2 + row.areas.increaseM2;
        row.decreasePct = total ? 100 * row.areas.decreaseM2 / total : null;
        row.increasePct = total ? 100 * row.areas.increaseM2 / total : null;
        row.validCoveragePct = total ? 100 * total / farm.farm_area_m2 : 0;
        row.success = true;
      } catch (error) { row.success = false; row.error = error.message; }
      row.seconds = (Date.now() - started) / 1000;
      report.cases.push(row);
      // Separate checkpoints avoid concurrent workers overwriting each other.
      await fs.writeFile(path.join(outputDir, `${row.carKey}-${row.startDate}.json`), JSON.stringify(row, null, 2));
      console.log(JSON.stringify({ event: 'result', ...row }));
    }
  }
  await Promise.all(shortIntervals ? [worker(), worker()] : [worker(), worker(), worker()]);
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ event: 'finished', cases: report.cases.length, reportPath }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
