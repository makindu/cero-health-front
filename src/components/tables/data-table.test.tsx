import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/core/api/types';
import { DataTable, type Column } from './data-table';

interface Row {
  id: string;
  name: string;
}
const columns: Column<Row>[] = [
  { id: 'name', header: 'Nom', cell: (r) => r.name, sortable: true, primary: true },
];
const base = { caption: 'Liste', columns, getRowId: (r: Row) => r.id };

describe('DataTable', () => {
  it('affiche l’état vide', () => {
    render(<DataTable {...base} rows={[]} />);
    expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
  });
  it('affiche l’état d’erreur avec réessai', async () => {
    const retry = vi.fn();
    render(
      <DataTable {...base} rows={[]} error={new ApiError('network', 'x', { source: 'health' })} onRetry={retry} />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(retry).toHaveBeenCalled();
  });
  it('déclenche le tri côté serveur', async () => {
    const onSort = vi.fn();
    render(<DataTable {...base} rows={[{ id: '1', name: 'Fictif' }]} onSortChange={onSort} />);
    await userEvent.click(screen.getByRole('button', { name: /Trier par Nom/ }));
    expect(onSort).toHaveBeenCalledWith({ columnId: 'name', direction: 'asc' });
  });
});
