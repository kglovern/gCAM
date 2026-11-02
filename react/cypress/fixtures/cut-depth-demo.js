export async function cutDepthDemo(win) {
    const { buildToolpathGcodeAsync } = await win.eval(
            "import('/src/lib/engine.ts')",
        ),
        { previewFor } = await win.eval(
            "import('/src/toolpaths/useToolpathStack.ts')",
        ),
        { textLoops } = await win.eval("import('/src/draw/textGeometry.ts')");
    const rect = (id, x, y, w, h) => ({
            id,
            points: [
                { x, y },
                { x: x + w, y },
                { x: x + w, y: y + h },
                { x, y: y + h },
                { x, y },
            ],
        }),
        loops = [],
        stack = [];
    const cases = [
        {
            name: 'Pocket',
            operation: 'pocket',
            parts: [
                rect('pocket', 15, 105, 55, 40),
                rect('island', 34, 117, 14, 14),
            ],
            cutDepth: 3,
            toolDiameter: 4,
            type: 'flat',
            x: 15,
            y: 151,
        },
        {
            name: 'Outside + tabs',
            operation: 'profile-outside',
            parts: [rect('outside', 95, 105, 55, 40)],
            cutDepth: 12,
            toolDiameter: 4,
            type: 'flat',
            tabHeight: 3,
            x: 95,
            y: 151,
        },
        {
            name: 'Inside cut',
            operation: 'profile-inside',
            parts: [rect('inside', 175, 105, 55, 40)],
            cutDepth: 12,
            toolDiameter: 4,
            type: 'flat',
            x: 175,
            y: 151,
        },
        {
            name: 'Engrave',
            operation: 'engrave',
            parts: [
                {
                    id: 'engrave',
                    points: [
                        { x: 15, y: 30 },
                        { x: 25, y: 60 },
                        { x: 35, y: 30 },
                        { x: 45, y: 60 },
                        { x: 55, y: 30 },
                        { x: 65, y: 60 },
                    ],
                },
            ],
            cutDepth: 2,
            toolDiameter: 6,
            type: 'v-bit',
            x: 15,
            y: 76,
        },
        {
            name: 'Chamfer',
            operation: 'chamfer',
            parts: [rect('chamfer', 95, 25, 55, 40)],
            cutDepth: 2.5,
            chamferWidthMm: 2,
            chamferTipOffsetMm: 0.5,
            toolDiameter: 6,
            type: 'v-bit',
            x: 95,
            y: 76,
        },
        {
            name: 'V-carve',
            operation: 'vcarve',
            parts: [
                {
                    id: 'vcarve',
                    points: [
                        { x: 175, y: 25 },
                        { x: 230, y: 25 },
                        { x: 203, y: 65 },
                        { x: 175, y: 25 },
                    ],
                },
            ],
            cutDepth: 10,
            toolDiameter: 32,
            angle: 120,
            type: 'v-bit',
            x: 175,
            y: 76,
        },
    ];
    for (const [index, c] of cases.entries()) {
        loops.push(
            ...c.parts,
            ...textLoops(c.name, { x: c.x, y: c.y }, 4).map((p, i) => ({
                ...p,
                id: `label-${index}-${i}`,
                groupId: `label-${index}`,
            })),
        );
        const args = {
            operation: c.operation,
            loops: c.parts,
            cutDepth: c.cutDepth,
            toolDiameter: c.toolDiameter,
            cutterType: c.type,
            cutterAngle: c.angle ?? 90,
            passDepth: 4,
            feedRate: 1000,
            plungeRate: 300,
            spindle: 18000,
            safeZ: 5,
            toolNumber: 1,
            stockThicknessMm: 12,
            tabHeight: c.tabHeight ?? 0,
            tabWidth: 8,
            ...(c.operation === 'chamfer'
                ? {
                      chamferWidthMm: c.chamferWidthMm,
                      chamferTipOffsetMm: c.chamferTipOffsetMm,
                  }
                : {}),
            ...(c.tabHeight
                ? {
                      tabs: [
                          { contourIndex: 0, along: 30 },
                          { contourIndex: 0, along: 115 },
                      ],
                  }
                : {}),
        };
        const r = await buildToolpathGcodeAsync({
            ...args,
            geometryOnly: true,
        });
        stack.push({
            id: `sample-${index}`,
            label: c.name,
            args,
            toolpath: r.toolpath,
            preview: previewFor(r),
        });
    }
    return {
        loops,
        stack,
        bitmaps: [],
        selected: [],
        hidden: [],
        guides: [],
        fileName: 'Cut depth samples',
        stock: {
            widthMm: 245,
            heightMm: 170,
            thicknessMm: 12,
            material: 'plywood-mdf',
            origin: 'front-left',
        },
    };
}
