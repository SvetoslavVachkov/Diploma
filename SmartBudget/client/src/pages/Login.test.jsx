import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Login from './Login';

const loginMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('../contexts/AuthContext', () => {
  return {
    useAuth: () => ({ login: loginMock })
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    Link: ({ to, children }) => <a href={to}>{children}</a>
  };
});

describe('Login page', () => {
  it('submits email/password and navigates on success', async () => {
    loginMock.mockResolvedValueOnce({ success: true });

    render(<Login />);

    await userEvent.type(screen.getByPlaceholderText('Имейл'), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('Парола'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Влез' }));

    expect(loginMock).toHaveBeenCalledWith('a@b.com', 'pw');
    expect(navigateMock).toHaveBeenCalledWith('/');
  });
});

