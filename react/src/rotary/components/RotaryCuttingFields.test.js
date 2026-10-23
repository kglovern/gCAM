import { jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { blankSlots, saveSlots } from '../../tools/library';
import { recommendCuttingParameters } from '../../cutting-parameters/recommend';
import { DEFAULT_MACHINE_PROFILE } from '../../cutting-parameters/machines';
import { useRotaryState } from '../useRotaryState';

jest.unstable_mockModule('../../tools/ToolLibraryModal', () => ({
    ToolLibraryModal: () => null,
}));
const { RotaryCuttingFields } = await import('./RotaryCuttingFields');
let current;
function Harness({ manual = false, material = 'hardwood' }) {
    const R = useRotaryState();
    current = R;
    const mounted = React.useRef(false);
    React.useEffect(() => {
        if (mounted.current) return;
        mounted.current = true;
        R.setTool((tool) => ({
            ...tool,
            type: 'flat',
            slotNum: 1,
            dia: 6,
            feed: 1234,
            plunge: 321,
            spindle: 13500,
            manualCuttingParams: manual === 'legacy' ? undefined : manual,
        }));
    }, []);
    return (
        <RotaryCuttingFields
            rotary={R}
            units="metric"
            material={material}
            machineProfileId={DEFAULT_MACHINE_PROFILE.id}
        />
    );
}
import * as React from 'react';
beforeEach(() => {
    localStorage.clear();
    const slots = blankSlots();
    slots[0] = {
        ...slots[0],
        name: 'Test endmill',
        cuttingDiameterMm: 6,
        flutes: 2,
        cuttingLengthMm: 20,
    };
    saveSlots(localStorage, slots);
});
const expected = (material) =>
    recommendCuttingParameters({
        material,
        machine: DEFAULT_MACHINE_PROFILE,
        operation: 'profile-outside',
        stockDepthMm: 12.7,
        cutter: {
            toolType: 'flat',
            diameterMm: 6,
            flutes: 2,
            cuttingLengthMm: 20,
            cutterMaterial: '',
            fluteAngleDeg: null,
        },
    });

test('uses the main profile recommendation and saves the actual generated cutting values', () => {
    render(<Harness />);
    const recipe = expected('hardwood');
    expect(current.tool.feed).toBe(recipe.feedMmMin);
    expect(current.tool.plunge).toBe(recipe.plungeMmMin);
    expect(current.tool.spindle).toBe(recipe.rpm);
    expect(current.opsBase.roughStep).toBe(recipe.passDepthMm);
    act(() => current.saveToolpath());
    act(() => current.generate());
    expect(current.gcode).toContain(`S${recipe.rpm}`);
    expect(current.snapshotProject().tool.feed).toBe(recipe.feedMmMin);
});

test('preserves legacy/manual values, and using suggestions enables automatic updates', () => {
    const view = render(<Harness manual="legacy" />);
    // Explicit legacy/manual mode must never overwrite a saved job.
    view.rerender(<Harness manual="legacy" material="foam" />);
    expect(current.tool.feed).toBe(1234);
    fireEvent.click(screen.getByRole('button', { name: 'Use suggestions' }));
    expect(current.tool.feed).toBe(expected('foam').feedMmMin);
    expect(current.tool.manualCuttingParams).toBe(false);
});

test('manual overrides remain in force when material changes', () => {
    const view = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.change(
        screen.getByRole('spinbutton', { name: 'Feed (mm/min)' }),
        { target: { value: '900' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(current.tool.feed).toBe(900);
    expect(current.tool.manualCuttingParams).toBe(true);
    view.rerender(<Harness material="foam" />);
    expect(current.tool.feed).toBe(900);
});
