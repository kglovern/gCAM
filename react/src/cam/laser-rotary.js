/** @typedef {{type:'chuck'|'roller',axis:'Y'|'Z'|'A',objectDiameter:number,rollerDiameter:number,unitsPerTurn:number,reverse:boolean,confirmed:boolean}} LaserRotarySetup */

/** Artwork Y is surface distance around a cylinder whose length runs along X. */
export const DEFAULT_LASER_ROTARY = {
    type: 'chuck',
    axis: 'Y',
    objectDiameter: 40,
    rollerDiameter: 10,
    unitsPerTurn: 100,
    reverse: false,
    confirmed: false,
};

export function validateLaserRotary(value) {
    if (value == null) return null;
    if (
        !['chuck', 'roller'].includes(value.type) ||
        !['Y', 'Z', 'A'].includes(value.axis) ||
        typeof value.reverse !== 'boolean' ||
        typeof value.confirmed !== 'boolean'
    )
        throw new Error('Invalid laser rotary setup.');
    for (const key of ['objectDiameter', 'rollerDiameter', 'unitsPerTurn'])
        if (
            !Number.isFinite(value[key]) ||
            value[key] < 0.001 ||
            value[key] > 1000000
        )
            throw new Error(
                `Laser rotary ${key} must be between 0.001 and 1000000.`,
            );
    /** @type {LaserRotarySetup} */
    const setup = {
        type: value.type,
        axis: value.axis,
        objectDiameter: value.objectDiameter,
        rollerDiameter: value.rollerDiameter,
        unitsPerTurn: value.unitsPerTurn,
        reverse: value.reverse,
        confirmed: value.confirmed,
    };
    return setup;
}

/** Chuck calibration turns the object; roller calibration turns the driven roller. */
export function laserRotaryScale(setup) {
    return (
        ((setup.reverse ? -1 : 1) * setup.unitsPerTurn) /
        (Math.PI *
            (setup.type === 'roller'
                ? setup.rollerDiameter
                : setup.objectDiameter))
    );
}

export function laserRotaryPosition(point, setup) {
    const rotation = point.y * laserRotaryScale(setup);
    if (!Number.isFinite(point.x) || !Number.isFinite(rotation))
        throw new Error('Invalid laser rotary position.');
    return { x: point.x, rotation };
}

/** In G94 the linear-axis feed is adjusted to retain the requested surface travel time. */
export function laserRotaryMove(a, b, surfaceFeed, setup) {
    for (const p of [a, b])
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
            throw new Error('Invalid laser rotary position.');
    if (!Number.isFinite(surfaceFeed) || surfaceFeed <= 0)
        throw new Error('Invalid laser rotary feed.');
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1e-9) return null;
    const scale = laserRotaryScale(setup);
    const move = {
        ...laserRotaryPosition(b, setup),
        feed:
            setup.axis === 'A'
                ? surfaceFeed / length
                : (surfaceFeed * Math.hypot(b.x - a.x, (b.y - a.y) * scale)) /
                  length,
        minutes: length / surfaceFeed,
    };
    if (![move.feed, move.minutes].every((v) => Number.isFinite(v) && v > 0))
        throw new Error('Invalid laser rotary timing.');
    if (setup.axis !== 'A' && (move.feed < 0.0001 || move.feed > 1e12))
        throw new Error(
            'Laser rotary segment timing exceeds the supported feed range.',
        );
    return move;
}

export function laserInverseFeed(feed) {
    if (!Number.isFinite(feed) || feed < 1e-9 || feed > 1e12)
        throw new Error(
            'Laser rotary segment timing exceeds the supported feed range.',
        );
    return feed.toFixed(9).replace(/0+$/, '').replace(/\.$/, '');
}

/** Intended cylindrical surface, independent of motor/roller calibration and direction. */
export function laserRotarySurfacePoint(point, setup) {
    const radius = setup.objectDiameter / 2,
        angle = point.y / radius;
    const surface = {
        x: point.x,
        y: radius * Math.sin(angle),
        z: radius * Math.cos(angle),
    };
    if (!Object.values(surface).every(Number.isFinite))
        throw new Error('Invalid laser rotary surface point.');
    return surface;
}
