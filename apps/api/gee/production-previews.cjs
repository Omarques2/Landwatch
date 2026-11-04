'use strict';

// Reproduce selected cases through the exact application adapter, not a new index.
require('dotenv').config({ quiet: true });
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const sharp = require('sharp');
const dir = path.resolve('.temp/gee-prodes-2026-10-28');

async function main() {
  const candidates = JSON.parse(await fs.readFile(path.join(dir, 'candidates.json'), 'utf8')).farms;
  const rows = await Promise.all((await fs.readdir(dir)).filter(name => /^[A-Z]{2}-.*-\d{4}-\d\d-\d\d\.json$/.test(name)).map(async name => JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'))));
  const wantedStart = process.argv.find(arg => arg.startsWith('--start='))?.slice(8);
  const best = new Map();
  for (const row of rows.filter(row => row.success && (!wantedStart || row.startDate === wantedStart) && (row.decreasePct > 0 || row.increasePct > 0))) {
    if (!best.has(row.carKey) || row.decreasePct + row.increasePct > best.get(row.carKey).decreasePct + best.get(row.carKey).increasePct) best.set(row.carKey, row);
  }
  const onlyCar = process.argv.find(arg => arg.startsWith('--car='))?.slice(6);
  const selected = [...best.values()].filter(row => !onlyCar || onlyCar.split(',').includes(row.carKey)).sort((a, b) => b.decreasePct - a.decreasePct).slice(0, 8);
  let cursor = 0;
  const verified = [];
  async function worker() {
    while (cursor < selected.length) {
      const row = selected[cursor++];
      const stem = row.carKey + (wantedStart ? '-curto' : '');
      const saved = path.join(dir, `${stem}-verified.json`);
      try {
        const existing = JSON.parse(await fs.readFile(saved, 'utf8'));
        if (existing.success && existing.startDate === row.startDate && existing.endDate === row.endDate) { verified.push(existing); continue; }
      } catch { /* No verified preview yet. */ }
      console.log(JSON.stringify({ event: 'render', name: row.name, car: row.carKey, start: row.startDate, end: row.endDate }));
      const started = Date.now();
      const record = { ...row };
      try {
        const farm = candidates.find(farm => farm.car_key === row.carKey);
        const result = await new Promise((resolve, reject) => {
          const child = spawn(process.execPath, ['gee/run_image.cjs'], { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
          let stdout = '', stderr = '';
          child.stdout.on('data', chunk => { stdout += chunk; });
          child.stderr.on('data', chunk => { stderr += chunk; });
          child.on('error', reject);
          child.on('close', code => code ? reject(new Error(stderr.trim())) : resolve(JSON.parse(stdout)));
          child.stdin.end(JSON.stringify({ geometry: farm.geometry, operation: 'deforestation', beforeStartDate: row.startDate, beforeEndDate: '2012-05-06', startDate: '2013-03-18', endDate: row.endDate }));
        });
        record.actualOriginalAreaM2 = result.areaM2;
        record.previewDimensions = result.previewDimensions;
        record.sourceRevision = result.sourceRevision;
        for (const [key, suffix] of [['beforePreviewUrl', 'antes'], ['basePreviewUrl', 'depois'], ['previewUrl', 'savi']]) {
          const png = Buffer.from(result[key].split(',')[1], 'base64');
          await fs.writeFile(path.join(dir, `${stem}-${suffix}.png`), png);
          if (suffix === 'savi') {
            const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            const colors = new Map();
            let valid = 0, negative = 0, positive = 0;
            for (let i = 0; i < data.length; i += info.channels) {
              if (data[i + 3] < 128) continue;
              valid++;
              const rgb = [data[i], data[i + 1], data[i + 2]];
              const hex = '#' + rgb.map(value => value.toString(16).padStart(2, '0')).join('');
              colors.set(hex, (colors.get(hex) || 0) + 1);
              if (rgb[0] > rgb[1]) negative++;
              if (rgb[1] > rgb[0]) positive++;
            }
            Object.assign(record, { width: info.width, height: info.height, validPixels: valid, negativePixels: negative, positivePixels: positive, visibleNegativePct: 100 * negative / valid, visiblePositivePct: 100 * positive / valid, colors: [...colors].sort((a,b) => b[1] - a[1]).slice(0, 10) });
          }
        }
        record.success = true;
      } catch (error) { record.success = false; record.error = error.message; }
      record.renderSeconds = (Date.now() - started) / 1000;
      verified.push(record);
      await fs.writeFile(saved, JSON.stringify(record, null, 2));
      console.log(JSON.stringify({ event: 'verified', ...record }));
    }
  }
  await Promise.all([worker(), worker()]);
  await fs.writeFile(path.join(dir, 'verified.json'), JSON.stringify(verified, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
