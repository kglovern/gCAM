// Frozen pre-corner-preservation sampler, injected into the otherwise current importer for benchmarks only.
export const SVG_UNIFORM_REFERENCE = String.raw`function sampleSvgPathPoints(pathData, matrix, closed) {
    const TOOLPATH_SAMPLE_STEP = 1.25;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    svg.appendChild(path);
    svg.style.position = 'absolute';
    svg.style.width = '0';
    svg.style.height = '0';
    svg.style.overflow = 'hidden';
    svg.style.opacity = '0';
    svg.style.pointerEvents = 'none';
    document.body.appendChild(svg);
    try {
        const totalLength = path.getTotalLength();
        const steps = Math.max(24, Math.ceil(totalLength / TOOLPATH_SAMPLE_STEP));
        const points = [];
        for (let i = 0; i <= steps; i += 1) {
            const point = path.getPointAtLength(totalLength * i / steps);
            points.push(applyMatrixToPoint({x:point.x,y:point.y},matrix));
        }
        return closed ? closePoints(points) : points;
    } finally { svg.remove(); }
}`;
