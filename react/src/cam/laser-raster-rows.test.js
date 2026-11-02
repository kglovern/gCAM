import { createHash } from 'node:crypto';
import { createLaserToolpath } from './laser.js';
import {
    rasterCases,
    rasterRequest,
    rasterSignature,
} from './fixtures/laser-raster-cases.js';
import reference from './fixtures/laser-raster-reference.json' with {
    type: 'json',
};

test.each(rasterCases)('bounded raster rows preserve $name', (fixture) => {
    const { config, options } = rasterRequest(fixture);
    const result = createLaserToolpath([], config, options);
    const expected = reference.cases.find((item) => item.name === fixture.name);
    expect(expected).toBeDefined();
    expect(result.laserPaths).toHaveLength(expected.paths);
    expect(
        createHash('sha256').update(rasterSignature(result)).digest('hex'),
    ).toBe(expected.sha256);
});
