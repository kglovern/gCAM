describe('SVG rectangle reference probe', () => {
    it('records native radius inheritance, units and percentages', () => {
        cy.freshProject({ tools: false });
        cy.window()
            .then((win) => {
                const results = [];
                for (const radii of [
                    'rx="2"',
                    'ry="3"',
                    'rx="0" ry="3"',
                    'rx="99" ry="99"',
                    'rx="10%"',
                    'rx="2mm"',
                    'rx="-2" ry="3"',
                ]) {
                    const svg = new win.DOMParser().parseFromString(
                        `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80" viewBox="0 0 100 80"><rect x="10" y="5" width="20" height="10" ${radii}/></svg>`,
                        'image/svg+xml',
                    ).documentElement;
                    win.document.body.appendChild(svg);
                    try {
                        const rect = svg.firstElementChild,
                            start = rect.getPointAtLength(0);
                        results.push({
                            radii,
                            start: { x: start.x, y: start.y },
                            rx: rect.rx.baseVal.value,
                            ry: rect.ry.baseVal.value,
                            length: rect.getTotalLength(),
                        });
                    } finally {
                        svg.remove();
                    }
                }
                return results;
            })
            .then((results) =>
                cy.writeFile(
                    '../outputs/svg-rect-native-reference.json',
                    results,
                ),
            );
    });
});
