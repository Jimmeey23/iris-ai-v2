import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { statSync } from 'node:fs';
import sharp from 'sharp';
import { FLOORPLANS } from '../../src/lib/radar-floorplans';
import { ASSOCIATE_IMAGES } from '../../src/lib/constants';

// Keep the shipped floorplan pixels unchanged: hotspots use percentage coordinates.
const floorplanDimensions: Record<string, [number, number]> = {
  kwality: [1969, 799], supreme: [1969, 799], kenkere: [1672, 941],
  courtside: [1672, 941], copper: [1672, 941],
};
for (const [studio, plan] of Object.entries(FLOORPLANS)) {
  test(`${studio} floorplan decodes as WebP with its original dimensions`, async () => {
    assert.ok(plan.src.endsWith('.webp'));
    const file = new URL('../../public' + plan.src, import.meta.url);
    const metadata = await sharp(file.pathname).metadata();
    assert.equal(metadata.format, 'webp');
    assert.deepEqual([metadata.width, metadata.height], floorplanDimensions[studio]);
    assert.ok(statSync(file).size < 300_000, 'floorplan exceeds the optimized asset budget');
  });
}
for (const [person, src] of Object.entries(ASSOCIATE_IMAGES)) {
  test(`${person} headshot points to a readable optimized asset`, async () => {
    const file = new URL('../../public' + src, import.meta.url);
    const metadata = await sharp(file.pathname).metadata();
    assert.equal(metadata.format, 'webp');
    assert.ok(metadata.width && metadata.height);
    assert.ok(statSync(file).size < 120_000, 'headshot exceeds the optimized asset budget');
  });
}
