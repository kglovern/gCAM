import { jest } from '@jest/globals';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { LaserMaterialLibrary } from './LaserMaterialLibrary';
import type { LaserRecipe } from './laser-recipes';

const entry: LaserRecipe = {
    id: 'one',
    name: 'Plywood fine',
    laser: 'diode:10:test',
    machine: 'test',
    material: 'plywood',
    thickness: 3,
    operation: 'laser-fill',
    feed: 1200,
    power: 400,
    interval: 0.1,
    options: {},
    source: 'User settings',
};
test('surface thickness scope is staged and saved without applying a recipe', () => {
    const changed = jest.fn(),
        applied = jest.fn();
    render(
        <LaserMaterialLibrary
            recipes={[entry]}
            onChange={changed}
            canApply={() => true}
            onApply={applied}
        />,
    );
    fireEvent.click(screen.getByText('Material library (1)'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit settings' }));
    fireEvent.click(screen.getByLabelText('Recipe any thickness'));
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(changed).toHaveBeenCalledWith([
        {
            ...entry,
            thicknessIndependent: true,
            source: 'User-edited settings',
        },
    ]);
    expect(applied).not.toHaveBeenCalled();
});
test('cut settings do not offer thickness-independent engraving', () => {
    render(
        <LaserMaterialLibrary
            recipes={[{ ...entry, operation: 'laser-cut' }]}
            onChange={() => {}}
            canApply={() => true}
            onApply={() => {}}
        />,
    );
    fireEvent.click(screen.getByText('Material library (1)'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit settings' }));
    expect(screen.queryByLabelText('Recipe any thickness')).toBeNull();
});
test('rename, remove and undo persist the library without applying settings', () => {
    localStorage.clear();
    const applied = jest.fn();
    function Library() {
        const [recipes, setRecipes] = useState([entry]);
        return (
            <LaserMaterialLibrary
                recipes={recipes}
                onChange={setRecipes}
                canApply={() => true}
                onApply={applied}
            />
        );
    }
    render(<Library />);
    fireEvent.click(screen.getByText('Material library (1)'));
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Material recipe name'), {
        target: { value: ' ' },
    });
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Material recipe name'), {
        target: { value: 'Plywood detail' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(
        JSON.parse(localStorage.getItem('gcam.laserRecipes.v1')!)[0].name,
    ).toBe('Plywood detail');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(JSON.parse(localStorage.getItem('gcam.laserRecipes.v1')!)).toEqual(
        [],
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo remove' }));
    expect(screen.getByText('Plywood detail')).toBeVisible();
    expect(applied).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use settings' }));
    expect(applied).toHaveBeenCalledWith({ ...entry, name: 'Plywood detail' });
});
test('incompatible recipes cannot be applied', () => {
    render(
        <LaserMaterialLibrary
            recipes={[entry]}
            onChange={() => {}}
            canApply={() => false}
            onApply={() => {
                throw new Error('Must not apply');
            }}
        />,
    );
    fireEvent.click(screen.getByText('Material library (1)'));
    expect(screen.getByRole('button', { name: 'Use settings' })).toBeDisabled();
});

test('imperial edits are staged, validated and applied separately', () => {
    localStorage.clear();
    const applied = jest.fn();
    const original = {
        ...entry,
        feed: 2540,
        interval: 0.254,
        overscan: 2.54,
        source: 'User calibrated',
        options: { passes: 2, scanAngle: 30, airAssist: true },
    };
    function Library() {
        const [recipes, setRecipes] = useState<LaserRecipe[]>([original]);
        return (
            <LaserMaterialLibrary
                recipes={recipes}
                units="imperial"
                onChange={setRecipes}
                canApply={() => true}
                onApply={applied}
            />
        );
    }
    render(<Library />);
    fireEvent.click(screen.getByText('Material library (1)'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit settings' }));
    expect(screen.getByLabelText('Recipe speed')).toHaveValue(100);
    expect(screen.getByLabelText('Recipe interval')).toHaveValue(0.01);
    fireEvent.change(screen.getByLabelText('Recipe speed'), {
        target: { value: '50' },
    });
    fireEvent.change(screen.getByLabelText('Recipe power percent'), {
        target: { value: '30' },
    });
    fireEvent.change(screen.getByLabelText('Recipe passes'), {
        target: { value: '1.5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(localStorage.getItem('gcam.laserRecipes.v1')).toBeNull();
    expect(applied).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Recipe passes'), {
        target: { value: '3' },
    });
    fireEvent.change(screen.getByLabelText('Recipe interval'), {
        target: { value: '0.02' },
    });
    fireEvent.change(screen.getByLabelText('Recipe overscan'), {
        target: { value: '0.2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    const saved = JSON.parse(localStorage.getItem('gcam.laserRecipes.v1')!)[0];
    expect(saved).toEqual({
        ...original,
        feed: 1270,
        power: 300,
        interval: 0.508,
        overscan: 5.08,
        options: { ...original.options, passes: 3 },
        source: 'User-edited settings',
    });
    expect(applied).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit settings' }));
    fireEvent.change(screen.getByLabelText('Recipe speed'), {
        target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel edit' }));
    expect(
        JSON.parse(localStorage.getItem('gcam.laserRecipes.v1')!)[0],
    ).toEqual(saved);
    fireEvent.click(screen.getByRole('button', { name: 'Use settings' }));
    expect(applied).toHaveBeenCalledWith(saved);
});
