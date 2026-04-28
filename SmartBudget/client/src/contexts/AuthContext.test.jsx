import React, { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AuthProvider, useAuth } from './AuthContext';

const apiPost = vi.fn();
const apiGet = vi.fn();

vi.mock('../services/api', () => {
  return {
    default: {
      post: (...args) => apiPost(...args),
      get: (...args) => apiGet(...args),
      defaults: { headers: { common: {} } }
    }
  };
});

function LoginHarness() {
  const { login, user, loading } = useAuth();

  useEffect(() => {
    login('test@example.com', 'pw');
  }, [login]);

  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="user">{user ? user.email : 'none'}</div>
    </div>
  );
}

describe('AuthContext', () => {
  it('login stores token and sets user', async () => {
    apiPost.mockResolvedValueOnce({
      data: {
        status: 'success',
        data: { token: 't1', user: { id: 'u1', email: 'test@example.com' } }
      }
    });

    render(
      <AuthProvider>
        <LoginHarness />
      </AuthProvider>
    );

    expect(await screen.findByText('test@example.com')).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBe('t1');
  });
});

