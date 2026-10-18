// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './button';
import { Stepper } from './stepper';
import { UnsavedChangesDialog } from './unsaved-changes-dialog';

afterEach(cleanup);

const steps = ['1. a', '2. b', '3. c'];

describe('Stepper', () => {
  it('marks completed, current and upcoming steps, one segment each', () => {
    render(<Stepper aria-label="steps" steps={steps} current={1} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.getAttribute('data-state'))).toEqual([
      'completed',
      'current',
      'upcoming',
    ]);
    expect(items[1]?.getAttribute('aria-current')).toBe('step');
    // Not clickable without onSelect.
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  it('goes back to a completed step, never forward', () => {
    const onSelect = vi.fn();
    render(<Stepper aria-label="steps" steps={steps} current={1} onSelect={onSelect} />);
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['1. a']);
    fireEvent.click(screen.getByRole('button', { name: '1. a' }));
    expect(onSelect).toHaveBeenCalledWith(0);
  });
});

describe('UnsavedChangesDialog', () => {
  const labels = { title: 'leave?', description: 'lost', stay: 'stay', leave: 'leave' };

  it('stays by default and leaves only when asked', async () => {
    const onStay = vi.fn();
    const onLeave = vi.fn();
    render(<UnsavedChangesDialog open onStay={onStay} onLeave={onLeave} labels={labels} />);
    const stay = await screen.findByRole('button', { name: 'stay' });
    await vi.waitFor(() => expect(document.activeElement).toBe(stay));
    fireEvent.click(stay);
    expect(onStay).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'leave' }));
    expect(onLeave).toHaveBeenCalledOnce();
  });
});

describe('Button loading', () => {
  it('keeps its label for its width, is busy and does nothing', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'save' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
