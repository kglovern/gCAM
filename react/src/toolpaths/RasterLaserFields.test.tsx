import { render, screen } from '@testing-library/react';
import { RasterLaserFields } from './RasterLaserFields';

const noop = () => {};
test.each([
    [0, 127],
    [90, 254],
])(
    'pass-through scan %s displays source-derived DPI and keeps motion settings editable',
    (scanAngle, dpi) => {
        render(
            <RasterLaserFields
                operation="laser-raster"
                units="metric"
                passThrough
                scanAngle={scanAngle}
                nativePixelSize={{ x: 0.1, y: 0.2 }}
                laserFeed={1200}
                onLaserFeedChange={noop}
                laserPower={500}
                onLaserPowerChange={noop}
                laserSpot={0.3}
                onLaserSpotChange={noop}
                laserGamma={2}
                onLaserGammaChange={noop}
                laserSMin={0}
                onLaserSMinChange={noop}
                laserSMax={500}
                onLaserSMaxChange={noop}
                laserOverscan={2}
                onLaserOverscanChange={noop}
            />,
        );
        expect(screen.getByLabelText('Resolution (DPI)')).toHaveValue(dpi);
        expect(screen.getByLabelText('Resolution (DPI)')).toBeDisabled();
        expect(screen.getByLabelText('Gamma')).toBeDisabled();
        expect(screen.getByLabelText('Min power (%)')).toBeEnabled();
        expect(screen.getByLabelText('Overscan (mm)')).toBeEnabled();
    },
);
