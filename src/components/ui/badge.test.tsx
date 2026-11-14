import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './badge';

describe('StatusBadge', () => {
  it('affiche un libellé ET une icône (la couleur n’est pas le seul indicateur)', () => {
    const { container } = render(<StatusBadge tone="danger">Critique</StatusBadge>);
    expect(screen.getByText('Critique')).toBeInTheDocument();
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });
});
