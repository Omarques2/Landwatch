'use strict';

// Display-only optimization. Never change the original SAVI composites.
function rgbPreview(collection, bands, area) {
  return collection.select(bands).median().clip(area).multiply(0.275).subtract(0.2);
}

async function renderPreviews(layers, region, progress, request = fetch) {
  // Retry all layers on the same grid, so the overlay always stays aligned.
  for (const dimensions of [1000, 500, 250]) {
    const images = [];
    try {
      for (const { image, style, label } of layers) {
        progress(`Gerando ${label} (${dimensions} px)`);
        const url = await new Promise((resolve, reject) => image.getThumbURL({
          region, crs: 'EPSG:3857', dimensions, format: 'png', ...style,
        }, (value, error) => error ? reject(new Error(error)) : resolve(value)));
        const response = await request(url);
        if (!response.ok) {
          let message = `HTTP ${response.status}`;
          try { message = (await response.json()).error?.message || message; } catch { /* Keep HTTP status. */ }
          throw new Error(`${label}: ${message}`);
        }
        const png = Buffer.from(await response.arrayBuffer());
        if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
          throw new Error(`${label}: resposta inválida ao gerar a imagem PNG.`);
        }
        // Deliver already-rendered pixels: no expiring URL or hidden browser-side EE errors.
        images.push(`data:image/png;base64,${png.toString('base64')}`);
      }
      return { images, dimensions };
    } catch (error) {
      if (dimensions === 250 || !/memory limit|computation timed out/i.test(error.message)) throw error;
      progress('A prévia excedeu os recursos do Earth Engine. Reduzindo somente a resolução de exibição.');
    }
  }
}

module.exports = { rgbPreview, renderPreviews };
