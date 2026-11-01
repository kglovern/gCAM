import { fireEvent, render, screen } from '@testing-library/react';
import { LaserJobBoundsPanel } from './LaserJobBounds';
import { DEFAULT_JOB_STOCK } from '../job/stock';
const toggle = (open: boolean) => {
    const panel = screen.getByLabelText(
        'Laser path bounds',
    ) as HTMLDetailsElement;
    panel.open = open;
    fireEvent(panel, new Event('toggle'));
};
const toolpaths = [
    {
        operation: 'laser-raster',
        laserPaths: [
            {
                points: [
                    { x: -10, y: 0, power: 0 },
                    { x: 0, y: 0, power: 0 },
                    { x: 100, y: 0, power: 400 },
                    { x: 110, y: 0, power: 0 },
                ],
            },
        ],
    },
];
test('overscan outside stock does not report powered marks outside stock', () => {
    render(
        <LaserJobBoundsPanel
            toolpaths={toolpaths}
            stock={{ ...DEFAULT_JOB_STOCK, widthMm: 100, heightMm: 100 }}
        />,
    );
    toggle(true);
    expect(
        screen.queryByText('Laser-on paths extend outside the stock.'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('-10 … 110')).toBeInTheDocument();
});
test('compares necessary travel span while retaining centered stock and imperial coordinates', () => {
    render(
        <LaserJobBoundsPanel
            toolpaths={toolpaths}
            units="imperial"
            stock={{
                ...DEFAULT_JOB_STOCK,
                widthMm: 100,
                heightMm: 100,
                origin: 'center',
            }}
            machineTravelLimits={{
                maxXTravelMm: 110,
                maxYTravelMm: 100,
                minZTravelMm: null,
                maxZTravelMm: null,
            }}
        />,
    );
    toggle(true);
    expect(
        screen.getByText('Laser-on paths extend outside the stock.'),
    ).toBeInTheDocument();
    expect(
        screen.getByText('Head travel exceeds the configured X travel span.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Centreline positions (in)')).toBeInTheDocument();
    expect(screen.getByText('-0.394 … 4.331')).toBeInTheDocument();
    toggle(false);
    expect(
        screen.getByText('Laser path bounds · check clearance'),
    ).toBeInTheDocument();
});

test('does not scan coordinates while collapsed, reuses reopened bounds and invalidates changed jobs', () => {
    let reads = 0;
    const jobs = (maxX: number) => [
        {
            operation: 'laser-raster',
            laserPaths: [
                {
                    points: [
                        {
                            get x() {
                                reads++;
                                return 0;
                            },
                            y: 0,
                            power: 0,
                        },
                        {
                            get x() {
                                reads++;
                                return maxX;
                            },
                            y: 1,
                            power: 400,
                        },
                    ],
                },
            ],
        },
    ];
    const original = jobs(10);
    const { rerender } = render(
        <LaserJobBoundsPanel toolpaths={original} stock={DEFAULT_JOB_STOCK} />,
    );
    expect(reads).toBe(0);
    toggle(true);
    const first = reads;
    expect(first).toBeGreaterThan(0);
    toggle(false);
    toggle(true);
    expect(reads).toBe(first);
    toggle(false);
    rerender(
        <LaserJobBoundsPanel toolpaths={jobs(20)} stock={DEFAULT_JOB_STOCK} />,
    );
    expect(reads).toBe(first);
    toggle(true);
    expect(reads).toBeGreaterThan(first);
    expect(screen.getAllByText('0 … 20')).toHaveLength(2);
});
