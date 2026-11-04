'use strict';

// Execute the reviewed Git blob, substituting only its area and date inputs.
const ee = require('@google/earthengine');
const { GoogleAuth } = require('google-auth-library');
const { createHash } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const vm = require('node:vm');
const { rgbPreview, renderPreviews } = require('./previews.cjs');
ee.data.setDeadline(0);

function progress(stage, message, details = {}) {
  process.stderr.write('#GEE_PROGRESS ' + JSON.stringify({ stage, message, ...details }) + '\n');
}

const blobs = { BaicarImagem: 'cac80745171aa50a8d721cbd829a2a3d242a027c', Backend: 'ffcce5c984e932203e977d09665eeae013347392' };

async function credentials() {
  const raw = process.env.GEE_SERVICE_ACCOUNT_JSON;
  const data = raw ? (raw.trim().startsWith('{') ? raw : await readFile(raw, 'utf8'))
    : await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS || 'sigfarm_google_secret_key.json', 'utf8');
  return JSON.parse(data);
}

function init(key) {
  return new Promise((resolve, reject) => ee.data.authenticateViaPrivateKey(key,
    () => ee.initialize(null, null, resolve, reject, null, key.project_id), reject));
}

async function readScript(key, name) {
  const auth = new GoogleAuth({ credentials: key, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const url = `https://earthengine.googlesource.com/users/APP_VerdeBrasil/APP/+/HEAD/${name}?format=TEXT`;
  const response = await client.request({ url, responseType: 'text', timeout: 30000 });
  const source = Buffer.from(response.data, 'base64');
  const hash = createHash('sha1').update(`blob ${source.length}\0`).update(source).digest('hex');
  if (hash !== blobs[name]) throw new Error(`O script ${name} mudou no Earth Engine e precisa ser revisado antes de executar.`);
  return source.toString('utf8');
}

function replaceOnce(source, original, replacement) {
  if (source.split(original).length !== 2) throw new Error('Não foi possível identificar um parâmetro do script BaicarImagem.');
  return source.replace(original, replacement);
}

async function run(input) {
  progress('connecting', 'Conectando ao Earth Engine');
  const key = await credentials();
  await init(key);
  if (input.operation === 'deforestation') return runBackend(input, key);
  progress('script', 'Carregando BaicarImagem original');
  let source = await readScript(key, 'BaicarImagem');
  source = replaceOnce(source, 'var shp = ee.FeatureCollection("projects/ee-sigfarmoperacional/assets/LaufPlanet");', 'var shp = inputArea;');
  source = replaceOnce(source, "var datain24 = '2024-06-01';", 'var datain24 = inputStart;');
  source = replaceOnce(source, "var datafin24 = '2024-06-30';", 'var datafin24 = inputEnd;');
  const area = ee.FeatureCollection([ee.Feature(ee.Geometry(input.geometry))]);
  let exportConfig;
  const context = {
    ee, inputArea: area, inputStart: input.startDate, inputEnd: input.endDate,
    Map: { centerObject() {}, addLayer() {} },
    Export: { image: { toDrive(config) { exportConfig = config; } } },
  };
  vm.runInNewContext(source, context, { timeout: 5000, filename: 'BaicarImagem' });
  if (!exportConfig || !context.cloudmasked24) throw new Error('O script não gerou a imagem esperada.');
  progress('searching', 'Buscando imagens Sentinel-2');
  const count = await new Promise((resolve, reject) => context.cloudmasked24.size().evaluate((value, error) => error ? reject(new Error(error)) : resolve(value)));
  if (!count) throw new Error('Nenhuma imagem encontrada para a área e o período com o filtro de nuvens do script.');
  progress('preparing', 'Preparando o download GeoTIFF', { imageCount: count });
  const url = await new Promise((resolve, reject) => exportConfig.image.getDownloadURL({
    name: 'BaicarImagem', region: input.geometry, crs: exportConfig.crs,
    scale: exportConfig.scale, format: 'GEO_TIFF',
  }, (value, error) => error ? reject(new Error(error)) : resolve(value)));
  // Display-only: the exported image is already visualized RGB, so render it as-is.
  const { images: [previewUrl], dimensions: previewDimensions } = await renderPreviews([
    { image: exportConfig.image, style: {}, label: 'imagem Sentinel-2' },
  ], input.geometry, message => progress('rendering', message, { imageCount: count }));
  return { downloadUrl: url, previewUrl, previewDimensions, imageCount: count, format: 'GeoTIFF', script: 'BaicarImagem', sourceRevision: blobs.BaicarImagem };
}

function evaluate(value) {
  return new Promise((resolve, reject) => value.evaluate((result, error) => error ? reject(new Error(error)) : resolve(result)));
}

async function runBackend(input, key) {
  progress('script', 'Carregando Backend original');
  let source = await readScript(key, 'Backend');
  source = replaceOnce(source, 'var AreaSentinel = ee.FeatureCollection("projects/ee-sigfarmoperacional/assets/IZVQ/SantoAntonioMatricula");', 'var AreaSentinel = inputArea;');
  source = replaceOnce(source, "var datain1 = '2019-08-01';", 'var datain1 = inputBeforeStart;');
  source = replaceOnce(source, "var datafin1 = '2019-08-30';", 'var datafin1 = inputBeforeEnd;');
  source = replaceOnce(source, "var datain2 = '2025-08-01';", 'var datain2 = inputStart;');
  source = replaceOnce(source, "var datafin2 = '2025-08-30';", 'var datafin2 = inputEnd;');
  const context = {
    ee, inputArea: ee.FeatureCollection([ee.Feature(ee.Geometry(input.geometry))]),
    inputBeforeStart: input.beforeStartDate, inputBeforeEnd: input.beforeEndDate,
    inputStart: input.startDate, inputEnd: input.endDate,
    Map: { centerObject() {}, addLayer() {} }, print() {},
  };
  vm.runInNewContext(source, context, { timeout: 5000, filename: 'Backend' });
  progress('searching', 'Buscando imagens Landsat 5 e Landsat 8');
  const [beforeCount, afterCount] = await Promise.all([evaluate(context.filtered1.size()), evaluate(context.filtered2.size())]);
  if (!beforeCount || !afterCount) {
    throw new Error(`Sem imagens para os períodos informados: Landsat 5 (primeiro período): ${beforeCount}; Landsat 8 (segundo período): ${afterCount}.`);
  }
  progress('calculating', 'Calculando a mudança de SAVI', { beforeCount, afterCount });
  const areaM2 = await evaluate(context.areaDiff.get('SaviLandsat'));
  if (typeof areaM2 !== 'number' || !Number.isFinite(areaM2)) throw new Error('O Backend não retornou uma área válida para esses períodos.');
  progress('preparing', 'Preparando a visualização de SAVI', { beforeCount, afterCount });
  // The original script divides DN by 10000. Convert only the displayed RGB
  // back to Collection 2 reflectance; never change the original SAVI graph.
  // Select RGB before the median to avoid retaining unused bands while rendering.
  // These are separate display graphs; the original composites/SAVI stay intact.
  const rgb = rgbPreview(context.filtered2, ['SR_B4', 'SR_B3', 'SR_B2'], context.inputArea);
  const beforeRgb = rgbPreview(context.filtered1, ['SR_B3', 'SR_B2', 'SR_B1'], context.inputArea);
  const { images: [beforePreviewUrl, basePreviewUrl, previewUrl], dimensions: previewDimensions } = await renderPreviews([
    { image: beforeRgb, style: { min: 0, max: 0.3, gamma: 1.4 }, label: 'imagem histórica Landsat 5' },
    { image: rgb, style: { min: 0, max: 0.3, gamma: 1.4 }, label: 'imagem recente Landsat 8' },
    { image: context.changeSaviLandsat, style: { min: -10, max: 10, palette: ['red', 'yellow', 'green'] }, label: 'sobreposição SAVI' },
  ], input.geometry, message => progress('rendering', message, { beforeCount, afterCount }));
  return { areaM2, beforeCount, afterCount, previewUrl, basePreviewUrl, beforePreviewUrl, previewDimensions,
    periods: { beforeStartDate: input.beforeStartDate, beforeEndDate: input.beforeEndDate, startDate: input.startDate, endDate: input.endDate },
    script: 'Backend', sourceRevision: blobs.Backend };
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => run(JSON.parse(input)).then(result => {
  process.stdout.write(JSON.stringify(result));
}).catch(error => {
  process.stderr.write(String(error.message || error));
  process.exitCode = 1;
}));
