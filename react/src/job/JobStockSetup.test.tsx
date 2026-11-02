import { render, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import { JobStockSetup } from './JobStockSetup';
import { DEFAULT_JOB_STOCK } from './stock';
import {
    DEFAULT_LASER_ROTARY,
    type LaserRotarySetup,
} from '../cam/laser-rotary.js';

const props = {
    units: 'metric' as const,
    maxXTravelMm: null,
    maxYTravelMm: null,
    machineName: 'Test machine',
    laser: true,
};
test('new flat laser jobs do not offer the deferred rotary attachment', () => {
    render(
        <JobStockSetup
            {...props}
            stock={DEFAULT_JOB_STOCK}
            onChange={() => {}}
        />,
    );
    expect(screen.queryByText('Rotary attachment')).toBeNull();
    expect(screen.getByLabelText('Stock origin')).toBeVisible();
});
test('existing rotary projects retain their setup and can explicitly return to flat', () => {
    const onChange = jest.fn();
    render(
        <JobStockSetup
            {...props}
            stock={{
                ...DEFAULT_JOB_STOCK,
                laserRotary: DEFAULT_LASER_ROTARY as LaserRotarySetup,
            }}
            onChange={onChange}
        />,
    );
    expect(screen.getByText('Rotary attachment')).toBeVisible();
    fireEvent.click(screen.getByLabelText('Use a rotary attachment'));
    expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ laserRotary: undefined }),
    );
});
