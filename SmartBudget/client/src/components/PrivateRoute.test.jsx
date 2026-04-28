import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

describe('PrivateRoute', () => {
  it('redirects to /login when user is not authenticated', async () => {
    vi.resetModules();
    vi.doMock('../contexts/AuthContext', () => {
      return {
        useAuth: () => ({ user: null, loading: false })
      };
    });

    const { default: PrivateRoute } = await import('./PrivateRoute');

    render(
      <MemoryRouter initialEntries={['/']}>
        <PrivateRoute>
          <div>Secret</div>
        </PrivateRoute>
      </MemoryRouter>
    );

    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });

  it('renders children when user is authenticated', async () => {
    vi.resetModules();
    vi.doMock('../contexts/AuthContext', () => {
      return {
        useAuth: () => ({ user: { id: 'u1' }, loading: false })
      };
    });

    const { default: PrivateRouteAuthed } = await import('./PrivateRoute');

    render(
      <MemoryRouter initialEntries={['/']}>
        <PrivateRouteAuthed>
          <div>Secret</div>
        </PrivateRouteAuthed>
      </MemoryRouter>
    );

    expect(screen.getByText('Secret')).toBeInTheDocument();
  });
});

