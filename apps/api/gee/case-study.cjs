'use strict';

// Read-only study of registered farms using the reviewed original Backend.
// Run from apps/api: node gee/case-study.cjs
require('dotenv').config({ quiet: true });
const ee = require('@google/earthengine');
const { GoogleAuth } = require('google-auth-library');
const { readFile, mkdir, writeFile } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const vm = require('node:vm');
const path = require('node:path');
ee.data.setDeadline(0);
const headers = { 'X-Dev-User-Sub': '00000000-0000-4000-8000-000000000001', 'X-Dev-User-Email': 'dev@localhost' };
const evaluate = value => new Promise((resolve, reject) => value.evaluate((result, error) => error ? reject(new Error(error)) : resolve(result)));
async function api(route) {
  const response = await fetch(`http://localhost:3001${route}`, { headers });
  if (!response.ok) throw new Error(`API HTTP ${response.status}`);
  return (await response.json()).data;
}

async function main() {
  const sharedInterval = process.argv.includes('--shared');
  const raw = process.env.GEE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS || 'sigfarm_google_secret_key.json';
  const key = JSON.parse(raw.trim().startsWith('{') ? raw : await readFile(raw, 'utf8'));
  await new Promise((resolve, reject) => ee.data.authenticateViaPrivateKey(key, () => ee.initialize(null, null, resolve, reject, null, key.project_id), reject));
  const client = await new GoogleAuth({ credentials: key, scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient();
  const response = await client.request({ url: 'https://earthengine.googlesource.com/users/APP_VerdeBrasil/APP/+/HEAD/Backend?format=TEXT', responseType: 'text' });
  const blob = Buffer.from(response.data, 'base64');
  const revision = createHash('sha1').update(`blob ${blob.length}\0`).update(blob).digest('hex');
  if (revision !== 'ffcce5c984e932203e977d09665eeae013347392') throw new Error('Original Backend changed; review required');
  const original = blob.toString();
  const farms = await api('/v1/farms?page=1&pageSize=100');
  const selected = farms.filter(f => (sharedInterval ? ['Teste Deter', 'FAZENDA MODELO MARCA DO', 'Fazenda Santa Ana'] : [
    'Teste Deter', 'Fazenda Santo Antônio', 'Fazenda São Pedro', 'Fazenda Santa Ana',
    'FAZENDA MODELO MARCA DO', 'Fazenda São Francisco', 'Fazenda Boa Visto Do Quilombo Sigfarm',
    'Fazenda de Teste Desmatamento', 'Santa Helena',
  ]).includes(f.name));
  const outputDir = path.resolve(sharedInterval ? '.temp/gee-case-study-shared' : '.temp/gee-case-study');
  await mkdir(outputDir, { recursive: true });
  const report = { startedAt: new Date().toISOString(), sourceRevision: revision, cases: [] };
  let cursor = 0;
  async function worker() {
    while (cursor < selected.length) {
      const farm = selected[cursor++];
      let geometry;
      try {
        geometry = sharedInterval
          ? JSON.parse(await readFile(path.resolve('.temp/gee-case-study', `${farm.id}-2010-input.json`), 'utf8')).geometry
          : (await api(`/v1/cars/by-key?carKey=${encodeURIComponent(farm.carKey)}&tolerance=0`)).geom;
      }
      catch (error) { report.cases.push({ name: farm.name, carKey: farm.carKey, error: error.message }); continue; }
      for (const year of sharedInterval ? [2010] : [2010, 1990]) {
        const started = Date.now();
        const row = { name: farm.name, carKey: farm.carKey, beforeStartDate: `${year}-06-01`, beforeEndDate: `${year}-09-01`, startDate: '2024-06-01', endDate: '2024-09-01' };
        if (sharedInterval) { row.beforeEndDate = '2012-05-06'; row.startDate = '2013-03-18'; }
        console.log(JSON.stringify({ event: 'start', ...row }));
        try {
          let source = original;
          for (const [from, to] of [
            ['var AreaSentinel = ee.FeatureCollection("projects/ee-sigfarmoperacional/assets/IZVQ/SantoAntonioMatricula");', 'var AreaSentinel = inputArea;'],
            ["var datain1 = '2019-08-01';", `var datain1 = '${row.beforeStartDate}';`],
            ["var datafin1 = '2019-08-30';", `var datafin1 = '${row.beforeEndDate}';`],
            ["var datain2 = '2025-08-01';", `var datain2 = '${row.startDate}';`],
            ["var datafin2 = '2025-08-30';", `var datafin2 = '${row.endDate}';`],
          ]) {
            if (source.split(from).length !== 2) throw new Error('Unrecognized script parameter');
            source = source.replace(from, to);
          }
          const context = { ee, inputArea: ee.FeatureCollection([ee.Feature(ee.Geometry(geometry))]), Map: { centerObject() {}, addLayer() {} }, print() {} };
          vm.runInNewContext(source, context, { timeout: 5000 });
          [row.beforeCount, row.afterCount] = await Promise.all([evaluate(context.filtered1.size()), evaluate(context.filtered2.size())]);
          if (!row.beforeCount || !row.afterCount) throw new Error('No images for one sensor');
          const diff = context.changeSaviLandsat;
          const pixelArea = ee.Image.pixelArea();
          const metrics = diff.lt(0).multiply(pixelArea).rename('decreaseM2')
            .addBands(diff.eq(0).multiply(pixelArea).rename('unchangedM2'))
            .addBands(diff.gte(1).multiply(pixelArea).rename('increaseM2'));
          const result = await evaluate(ee.Dictionary({
            originalArea: context.areaDiff,
            areas: metrics.reduceRegion({ reducer: ee.Reducer.sum(), geometry: ee.Geometry(geometry), scale: 30, maxPixels: 1e13 }),
            histogram: diff.reduceRegion({ reducer: ee.Reducer.frequencyHistogram(), geometry: ee.Geometry(geometry), scale: 30, maxPixels: 1e13 }),
          }));
          Object.assign(row, result);
          row.success = true;
          // Keep exact inputs for reproducing the most useful visual cases.
          await writeFile(path.join(outputDir, `${farm.id}-${year}-input.json`), JSON.stringify({ geometry, operation: 'deforestation', ...row }));
        } catch (error) { row.error = error.message; row.success = false; }
        row.seconds = (Date.now() - started) / 1000;
        report.cases.push(row);
        console.log(JSON.stringify({ event: 'result', ...row }));
      }
    }
  }
  await Promise.all([worker(), worker()]);
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(outputDir, 'results.json'), JSON.stringify(report, null, 2));
  console.log(`Report: ${outputDir}/results.json`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
