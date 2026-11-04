'use strict';

// Run from apps/api: node gee/benchmark.cjs
// Local request deadlines are disabled; Earth Engine's own limits still apply.
require('dotenv').config({ quiet: true });
const http = require('node:http');
const https = require('node:https');
const { spawn } = require('node:child_process');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const cases = [
  ['original', '2010-01-01', '2024-12-31', '2010-01-01', '2024-12-31'],
  ['3_months', '2010-06-01', '2010-09-01', '2024-06-01', '2024-09-01'],
  ['1_year', '2010-01-01', '2011-01-01', '2024-01-01', '2025-01-01'],
  ['2_years', '2010-01-01', '2012-01-01', '2023-01-01', '2025-01-01'],
  ['5_years_after', '2010-01-01', '2012-01-01', '2019-01-01', '2024-01-01'],
  ['3_months_repeat', '2010-06-01', '2010-09-01', '2024-06-01', '2024-09-01'],
  ['original_repeat', '2010-01-01', '2024-12-31', '2010-01-01', '2024-12-31'],
];

function request(url, headers = {}, redirects = 0) {
  if (url.startsWith('data:image/png;base64,')) {
    return Promise.resolve({ status: 200, type: 'image/png', body: Buffer.from(url.slice('data:image/png;base64,'.length), 'base64') });
  }
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, { headers, timeout: 0 }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        if (redirects >= 5) return reject(new Error('Too many redirects'));
        return resolve(request(new URL(response.headers.location, url).href, headers, redirects + 1));
      }
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, type: response.headers['content-type'], body: Buffer.concat(chunks) }));
      response.on('error', reject);
    });
    req.setTimeout(0);
    req.on('error', reject);
  });
}

function execute(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', "require('@google/earthengine').data.setDeadline(0);require('./gee/run_image.cjs')"], { cwd: process.cwd(), env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(stderr.trim()));
      try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

async function main() {
  const outputDir = path.resolve('.temp/gee-benchmark');
  await mkdir(outputDir, { recursive: true });
  const headers = { 'X-Dev-User-Sub': '00000000-0000-4000-8000-000000000001', 'X-Dev-User-Email': 'dev@localhost' };
  const carKey = 'TO-1701002-A0FCE32AB8284F5FB5B8C7905E9658BF';
  const areaResponse = await request(`http://localhost:3001/v1/cars/by-key?carKey=${carKey}&tolerance=0`, headers);
  if (areaResponse.status !== 200) throw new Error(`Geometry HTTP ${areaResponse.status}: ${areaResponse.body.toString().slice(0, 300)}`);
  const geometry = JSON.parse(areaResponse.body).data.geom;
  const report = { startedAt: new Date().toISOString(), farm: 'Santa Helena', carKey, dimensions: 1000, localDeadlineMs: 0, cases: [] };
  for (const [name, beforeStartDate, beforeEndDate, startDate, endDate] of cases) {
    const row = { name, beforeStartDate, beforeEndDate, startDate, endDate, startedAt: new Date().toISOString() };
    const started = performance.now();
    console.log(JSON.stringify({ event: 'start', ...row }));
    try {
      const result = await execute({ geometry, operation: 'deforestation', beforeStartDate, beforeEndDate, startDate, endDate });
      row.analysisSeconds = (performance.now() - started) / 1000;
      row.beforeCount = result.beforeCount;
      row.afterCount = result.afterCount;
      row.areaM2 = result.areaM2;
      console.log(JSON.stringify({ event: 'summary', ...row }));
      const imageStarted = performance.now();
      const response = await request(result.previewUrl);
      row.imageSeconds = (performance.now() - imageStarted) / 1000;
      row.imageStatus = response.status;
      row.imageBytes = response.body.length;
      if (response.status === 200 && response.type?.startsWith('image/')) {
        row.success = true;
        await writeFile(path.join(outputDir, `${name}.png`), response.body);
      } else {
        row.success = false;
        row.error = response.body.toString().slice(0, 1500);
      }
    } catch (error) {
      row.success = false;
      row.error = error.message;
    }
    row.totalSeconds = (performance.now() - started) / 1000;
    report.cases.push(row);
    await writeFile(path.join(outputDir, 'results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ event: 'finished', ...row }));
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(outputDir, 'results.json'), JSON.stringify(report, null, 2));
  console.log('Report: ' + path.join(outputDir, 'results.json'));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
