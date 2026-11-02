const deviation = (p, points) => {
    let best = Infinity;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
            b = points[i],
            dx = b.x - a.x,
            dy = b.y - a.y;
        const t = Math.max(
            0,
            Math.min(
                1,
                ((p.x - a.x) * dx + (p.y - a.y) * dy) /
                    (dx * dx + dy * dy || 1),
            ),
        );
        best = Math.min(
            best,
            Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy),
        );
    }
    return best;
};
describe('SVG physical curve tolerance', () => {
    beforeEach(() => {
        cy.viewport(1280, 720);
        cy.freshProject({ tools: false });
    });
    it('bounds full chords against analytical curves after scale, shear and rotation', () => {
        cy.window()
            .then(async (win) => {
                const { parseSvg } = await win.eval(
                    "import('/src/engine/svg.js')",
                );
                const cases = [
                    {
                        tag: 'path',
                        attrs: 'd="M0 0H1000A0.5 0.5 0 0 1 1001 0L0 0Z"',
                        transform: '',
                        truth: (t) => ({
                            x: 1000.5 + 0.5 * Math.cos(Math.PI + Math.PI * t),
                            y: 0.5 * Math.sin(Math.PI + Math.PI * t),
                        }),
                    },
                    {
                        tag: 'path',
                        attrs: 'd="M0 0C0 5 5 5 5 0Z"',
                        transform: 'scale(200 0.25) rotate(15)',
                        truth: (t) => ({
                            x: 15 * t * t - 10 * t * t * t,
                            y: 15 * t * (1 - t),
                        }),
                    },
                    {
                        tag: 'path',
                        attrs: 'd="M5.196152422706632 3A6 2 30 1 0 -1 1.7320508075688772Z"',
                        transform: 'scale(50 100) skewX(20)',
                        truth: (t) => {
                            const a = -1.5 * Math.PI * t,
                                c = Math.cos(Math.PI / 6),
                                s = Math.sin(Math.PI / 6);
                            return {
                                x: 6 * Math.cos(a) * c - 2 * Math.sin(a) * s,
                                y: 6 * Math.cos(a) * s + 2 * Math.sin(a) * c,
                            };
                        },
                    },
                    {
                        tag: 'circle',
                        attrs: 'cx="0" cy="0" r="1000"',
                        transform: '',
                        truth: (t) => ({
                            x: 1000 * Math.cos(2 * Math.PI * t),
                            y: 1000 * Math.sin(2 * Math.PI * t),
                        }),
                    },
                    {
                        tag: 'ellipse',
                        attrs: 'cx="0" cy="0" rx="20" ry="2"',
                        transform: 'rotate(23) scale(12 0.3)',
                        truth: (t) => ({
                            x: 20 * Math.cos(2 * Math.PI * t),
                            y: 2 * Math.sin(2 * Math.PI * t),
                        }),
                    },
                ];
                const results = [];
                for (const { tag, attrs, transform, truth } of cases) {
                    const text = `<svg xmlns="http://www.w3.org/2000/svg"><${tag} ${attrs} transform="${transform}"/></svg>`;
                    const svg = new win.DOMParser().parseFromString(
                        text,
                        'image/svg+xml',
                    ).documentElement;
                    const reference = svg.firstElementChild;
                    svg.style.cssText =
                        'position:absolute;left:-10000px;top:0;pointer-events:none';
                    win.document.body.appendChild(svg);
                    try {
                        const matrix = reference.getCTM(),
                            total = reference.getTotalLength();
                        const points = parseSvg(text, {
                            curveTolerance: 0.05,
                        })[0].vertices;
                        let maximum = 0,
                            nativeMaximum = 0;
                        for (let i = 0; i <= 4000; i++) {
                            const p = truth(i / 4000);
                            const exact = new win.DOMPoint(
                                p.x,
                                p.y,
                            ).matrixTransform(matrix);
                            maximum = Math.max(
                                maximum,
                                deviation(exact, points),
                            );
                            const native = reference
                                .getPointAtLength((total * i) / 4000)
                                .matrixTransform(matrix);
                            nativeMaximum = Math.max(
                                nativeMaximum,
                                deviation(native, points),
                            );
                        }
                        expect(maximum, `${tag} ${transform}`).to.be.lessThan(
                            0.05,
                        );
                        results.push({
                            tag,
                            attrs,
                            transform,
                            vertices: points.length,
                            maximumError: maximum,
                            nativeMaximumError: nativeMaximum,
                        });
                    } finally {
                        svg.remove();
                    }
                }
                return results;
            })
            .then((results) =>
                cy.writeFile(
                    '../outputs/laser-curve-tolerance-errors.json',
                    results,
                ),
            );
    });
    it('refines an SVG again after the user chooses inch units', () => {
        cy.get('[aria-label="Laser"]').click();
        cy.get('input[aria-label="Import drawing file"]').selectFile(
            {
                contents: Cypress.Buffer.from(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"><path d="M1 1H3A0.5 0.5 0 0 1 4 1V3H1Z"/></svg>',
                ),
                fileName: 'inch-curve.svg',
                mimeType: 'image/svg+xml',
            },
            { force: true },
        );
        cy.get('[aria-label="Drawing units"]').select('Inches (in)');
        cy.contains('button', 'Import drawing').click();
        cy.contains('inch-curve.svg:').should(
            'contain.text',
            '25.4 mm per drawing unit',
        );
        cy.snapshot().then((p) => {
            const points = p.loops[0].points;
            let maximum = 0;
            for (let i = 0; i <= 1000; i++) {
                const a = Math.PI + (Math.PI * i) / 1000;
                maximum = Math.max(
                    maximum,
                    deviation(
                        {
                            x: (3.5 + 0.5 * Math.cos(a)) * 25.4,
                            y: (4 - 0.5 * Math.sin(a)) * 25.4,
                        },
                        points,
                    ),
                );
            }
            expect(maximum).to.be.lessThan(0.05);
        });
    });
});
