import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MachineSetupModal } from './MachineSetupModal';

describe('MachineSetupModal', () => {
    it('confirms a machine preset with its working-area limits', () => {
        const onChoose = jest.fn();
        render(
            <MachineSetupModal
                units="metric"
                machineProfileId="longmill-router"
                onChoose={onChoose}
            />,
        );

        expect(
            screen.getByText('Working area: 810 × 855 × 120 mm'),
        ).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Use this machine' }),
        );

        expect(onChoose).toHaveBeenCalledWith(
            'longmill-router',
            {
                maxXTravelMm: 810,
                maxYTravelMm: 855,
                minZTravelMm: -120,
                maxZTravelMm: null,
            },
            'metric',
        );
    });

    it('requires all custom axes and converts inch values to millimetres', () => {
        const onChoose = jest.fn();
        render(
            <MachineSetupModal
                units="imperial"
                machineProfileId="longmill-router"
                onChoose={onChoose}
            />,
        );
        fireEvent.change(screen.getByLabelText('Machine'), {
            target: { value: 'custom' },
        });
        const submit = screen.getByRole('button', { name: 'Use this machine' });
        expect(submit).toBeDisabled();

        fireEvent.change(screen.getByLabelText('Maximum X travel'), {
            target: { value: '10' },
        });
        fireEvent.change(screen.getByLabelText('Maximum Y travel'), {
            target: { value: '20' },
        });
        fireEvent.change(screen.getByLabelText('Maximum Z travel'), {
            target: { value: '4' },
        });
        expect(submit).toBeEnabled();
        fireEvent.click(submit);

        expect(onChoose).toHaveBeenCalledWith(
            'custom',
            {
                maxXTravelMm: 254,
                maxYTravelMm: 508,
                minZTravelMm: -101.6,
                maxZTravelMm: null,
            },
            'imperial',
        );
    });
    it('lets the user choose units before confirming the machine', () => {
        const onChoose = jest.fn();
        render(
            <MachineSetupModal
                units="metric"
                machineProfileId="longmill-router"
                onChoose={onChoose}
            />,
        );
        fireEvent.change(screen.getByLabelText('Preferred units'), {
            target: { value: 'imperial' },
        });
        expect(screen.getByText(/Working area:.*in/)).toBeInTheDocument();
        fireEvent.click(screen.getByText('Use this machine'));
        expect(onChoose).toHaveBeenCalledWith(
            'longmill-router',
            expect.objectContaining({ maxXTravelMm: 810 }),
            'imperial',
        );
    });
});
