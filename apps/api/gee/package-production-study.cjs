'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const JSZip = require('jszip');
const sharp = require('sharp');
const dir = path.resolve('.temp/gee-prodes-2026-10-28');
const csv = rows => '\ufeff' + rows.map(row => row.map(value => '"' + String(value ?? '').replaceAll('"', '""') + '"').join(';')).join('\r\n');

async function main() {
  const names = await fs.readdir(dir);
  const cases = await Promise.all(names.filter(name => /^[A-Z]{2}-.*-\d{4}-\d\d-\d\d\.json$/.test(name)).map(async name => JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'))));
  const verified = await Promise.all(names.filter(name => name.endsWith('-verified.json')).map(async name => ({ ...JSON.parse(await fs.readFile(path.join(dir, name), 'utf8')), stem: name.slice(0, -'-verified.json'.length) })));
  const farms = JSON.parse(await fs.readFile(path.join(dir, 'candidates.json'), 'utf8')).farms;
  const zip = new JSZip();
  const packageDir = path.join(dir, 'pacote');
  await fs.mkdir(path.join(packageDir, 'geojson'), { recursive: true });
  await fs.mkdir(path.join(packageDir, 'imagens'), { recursive: true });
  async function add(relative, buffer) {
    await fs.writeFile(path.join(packageDir, relative), buffer);
    zip.file(relative, buffer);
  }
  await add('README.md', await fs.readFile(path.join(dir, 'README.md')));
  for (const name of names.filter(name => name.endsWith('.geojson'))) await add('geojson/' + name, await fs.readFile(path.join(dir, name)));
  const allRows = [['Fazenda', 'CAR', 'Data inicial', 'Fim exclusivo', 'Resultado', 'Redução SAVI m2', 'Aumento SAVI m2', 'Redução % área válida', 'Aumento % área válida', 'Datasets PRODES']];
  for (const row of cases) allRows.push([row.name, row.carKey, row.startDate, row.endDate, row.success ? 'OK' : row.error, row.areas?.decreaseM2, row.areas?.increaseM2, row.decreasePct, row.increasePct, farms.find(farm => farm.car_key === row.carKey)?.datasets.join(', ')]);
  await add('resultados-consultas.csv', csv(allRows));
  const changedRows = [allRows[0], ...allRows.slice(1).filter(row => row[4] === 'OK' && (Number(row[5]) > 0 || Number(row[6]) > 0))];
  await add('consultas-com-diferenca.csv', csv(changedRows));
  const verifiedRows = [['Fazenda', 'CAR', 'Data inicial', 'Fim exclusivo', 'Pixels laranja', 'Pixels esverdeados', '% pixels laranja', '% pixels esverdeados', 'Resolução máxima px', 'PNG SAVI', 'GeoJSON']];
  const md = ['# Casos com PNG verificado', '', 'Todos têm interseção PRODES registrada em produção. As manchas são sutis e não são uma classificação automática de desmatamento. Use opacidade 100%.', '', '| Fazenda | Inicial | Fim exclusivo | Pixels laranja / esverdeados | Arquivos |', '|---|---|---|---:|---|'];
  for (const row of verified.filter(row => row.success).sort((a,b) => a.startDate.localeCompare(b.startDate) || a.carKey.localeCompare(b.carKey))) {
    const imageName = row.stem + '-savi.png';
    for (const suffix of ['savi', 'antes', 'depois']) {
      const file = row.stem + '-' + suffix + '.png';
      if (names.includes(file)) await add('imagens/' + file, await fs.readFile(path.join(dir, file)));
    }
    verifiedRows.push([row.name, row.carKey, row.startDate, row.endDate, row.negativePixels, row.positivePixels, row.visibleNegativePct, row.visiblePositivePct, row.previewDimensions || Math.max(row.width, row.height), 'imagens/' + imageName, 'geojson/' + row.carKey + '.geojson']);
    md.push(`| ${row.name} | ${row.startDate} | ${row.endDate} | ${row.negativePixels} / ${row.positivePixels} | [GeoJSON](geojson/${row.carKey}.geojson) · [PNG](imagens/${imageName}) |`);
    // Enlarge an actual changed pixel neighborhood, preserving the original palette.
    const image = await fs.readFile(path.join(dir, imageName));
    const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let changed = -1;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] >= 128 && data[i] !== data[i + 1]) { changed = i / 4; break; }
    if (changed >= 0) {
      const width = Math.min(80, info.width), height = Math.min(80, info.height);
      const left = Math.max(0, Math.min(info.width - width, changed % info.width - Math.floor(width / 2)));
      const top = Math.max(0, Math.min(info.height - height, Math.floor(changed / info.width) - Math.floor(height / 2)));
      const zoom = await sharp(image).extract({ left, top, width, height }).resize(width * 5, height * 5, { kernel: 'nearest' }).png().toBuffer();
      await add('imagens/' + row.stem + '-detalhe.png', zoom);
    }
  }
  await add('casos-verificados.csv', csv(verifiedRows));
  await add('verificacao-previas.json', JSON.stringify(verified, null, 2));
  md.push('', 'Os detalhes ampliados na pasta imagens preservam as cores originais; não houve realce artificial. As coordenadas CAR completas estão no CSV e dentro de cada GeoJSON.', '', `Consultas: ${cases.length}. Concluídas: ${cases.filter(row => row.success).length}. Sem imagens/erros: ${cases.filter(row => !row.success).length}. PNGs verificados: ${verified.filter(row => row.success).length}.`);
  await add('CASOS.md', md.join('\n') + '\n');
  const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await fs.writeFile(path.join(dir, 'casos-prodes-gee.zip'), archive);
  const loaded = await JSZip.loadAsync(archive, { checkCRC32: true });
  console.log(JSON.stringify({ archive: path.join(dir, 'casos-prodes-gee.zip'), bytes: archive.length, files: Object.keys(loaded.files).length, geojsons: names.filter(name => name.endsWith('.geojson')).length, verified: verified.filter(row => row.success).length, cases: cases.length }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
