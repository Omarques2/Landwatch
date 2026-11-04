'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rgbPreview, renderPreviews } = require('./previews.cjs');
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

test('selects only RGB before the median, without altering the source collection', () => {
  const calls = [];
  const selected = { median() { calls.push('median'); return this; }, clip(area) { calls.push(area); return this; }, multiply(value) { calls.push(value); return this; }, subtract(value) { calls.push(value); return this; } };
  const source = { select(bands) { calls.push(bands); return selected; } };
  assert.equal(rgbPreview(source, ['R', 'G', 'B'], 'area'), selected);
  assert.deepEqual(calls, [['R', 'G', 'B'], 'median', 'area', 0.275, 0.2]);
});

function layers(calls) {
  return ['before', 'after', 'SAVI'].map(label => ({ label, style: {}, image: { getThumbURL(options, callback) {
    calls.push({ label, ...options }); callback(`${label}/${options.dimensions}`);
  } } }));
}
const success = { ok: true, arrayBuffer: async () => png };
const memory = { ok: false, status: 400, json: async () => ({ error: { message: 'User memory limit exceeded.' } }) };

test('renders aligned PNGs and returns pixels rather than unchecked URLs', async () => {
  const calls = [];
  const result = await renderPreviews(layers(calls), 'region', () => {}, async () => success);
  assert.equal(result.dimensions, 1000);
  assert.equal(result.images.length, 3);
  assert.ok(result.images.every(image => image === `data:image/png;base64,${png.toString('base64')}`));
  assert.ok(calls.every(call => call.region === 'region' && call.crs === 'EPSG:3857' && call.dimensions === 1000));
});

test('on memory errors retries every layer on the same lower-resolution grid', async () => {
  const calls = [], stages = [];
  const result = await renderPreviews(layers(calls), 'region', message => stages.push(message), async url => url === 'after/1000' ? memory : success);
  assert.equal(result.dimensions, 500);
  assert.deepEqual(calls.map(call => `${call.label}/${call.dimensions}`), ['before/1000', 'after/1000', 'before/500', 'after/500', 'SAVI/500']);
  assert.ok(stages.some(stage => stage.includes('Reduzindo')));
});

test('bounds retries and exposes the actual Earth Engine error', async () => {
  const calls = [];
  await assert.rejects(renderPreviews(layers(calls), 'region', () => {}, async () => memory), /before: User memory limit exceeded/);
  assert.deepEqual(calls.map(call => call.dimensions), [1000, 500, 250]);
});

test('does not retry authentication failures or invalid PNG responses', async () => {
  const calls = [];
  await assert.rejects(renderPreviews(layers(calls), 'region', () => {}, async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'Permission denied' } }) })), /Permission denied/);
  assert.equal(calls.length, 1);
  await assert.rejects(renderPreviews(layers([]), 'region', () => {}, async () => ({ ok: true, arrayBuffer: async () => Buffer.from('not a PNG') })), /PNG/);
});
