import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { GcodeSettings } from './GcodeSettings';
import { controllerPreset } from './profiles';

function Settings() {
    const [value, setValue] = useState(controllerPreset);
    const [arcs, setArcs] = useState(true);
    return (
        <GcodeSettings
            value={value}
            onChange={setValue}
            emitArcs={arcs}
            onEmitArcsChange={setArcs}
        />
    );
}
test('preset selection, command editing and per-block reset update the preview', () => {
    render(<Settings />);
    expect(screen.getByLabelText('Controller preset')).toHaveValue('grblhal');
    expect(
        screen.getByText('Customise output').closest('details'),
    ).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Customise output'));
    fireEvent.change(screen.getByLabelText('Controller preset'), {
        target: { value: 'mach3' },
    });
    expect(screen.getByLabelText('Line endings')).toHaveValue('CRLF');
    fireEvent.change(screen.getByLabelText('Dwell format'), {
        target: { value: 'P-milliseconds' },
    });
    fireEvent.change(screen.getByLabelText('Spindle delay (seconds)'), {
        target: { value: '2' },
    });
    fireEvent.click(screen.getByText('Example output', { exact: true }));
    expect(screen.getByText(/G4 P2000/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Command blocks', { exact: true }));
    fireEvent.change(screen.getByLabelText('Spindle start / speed change'), {
        target: { value: 'M3 S{missing}' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
        'Unknown export variable: missing',
    );
    fireEvent.click(
        screen.getByRole('button', {
            name: 'Reset spindle start / speed change',
        }),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Controller preset'), {
        target: { value: 'marlin' },
    });
    expect(
        screen.getByLabelText('Emit G2/G3 arcs (including helical entry)'),
    ).not.toBeChecked();
    expect(screen.getByLabelText('File extension')).toHaveValue('gcode');
});
