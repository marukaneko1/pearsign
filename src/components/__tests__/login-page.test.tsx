import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from '@/app/login/page';

// fetch is mocked globally in src/test/setup.ts

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the sign-in form by default', () => {
    render(<LoginPage />);
    // The labels are visually hidden but present; find by placeholder instead
    expect(screen.getByPlaceholderText('Email')).toBeDefined();
    expect(screen.getByPlaceholderText('Password')).toBeDefined();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDefined();
  });

  it('has an accessible form with aria-label', () => {
    render(<LoginPage />);
    expect(screen.getByRole('form', { name: /sign in form/i })).toBeDefined();
  });

  it('shows an error when login API returns an error', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ success: false, error: 'Invalid credentials' }),
    } as Response);

    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'wrongpassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText('Invalid credentials')).toBeDefined();
    });
  });

  it('shows verify-email message when server returns that error', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ success: false, error: 'Please verify your email address' }),
    } as Response);

    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'unverified@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(/verify your email/i)).toBeDefined();
    });
  });

  it('shows success message after successful login', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as Response);

    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });

    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'correctpassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeDefined();
      expect(screen.getByText(/signed in successfully/i)).toBeDefined();
    });
  });

  it('handles non-JSON error responses gracefully', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => { throw new SyntaxError('Not JSON'); },
    } as unknown as Response);

    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toMatch(/server error|login failed/i);
    });
  });

  it('switches to forgot-password mode', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText(/forgot password/i));
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeDefined();
  });

  it('sends forgot-password request with the typed email', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as Response);

    render(<LoginPage />);
    fireEvent.click(screen.getByText(/forgot password/i));

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'reset@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/forgot-password',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('disables submit button while loading', async () => {
    vi.mocked(global.fetch).mockReturnValueOnce(new Promise(() => {}));

    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'password' },
    });

    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect((submitBtn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('shows password toggle button', () => {
    render(<LoginPage />);
    const toggleBtn = screen.getByRole('button', { name: /show password/i });
    expect(toggleBtn).toBeDefined();
  });

  it('password toggle changes input type', () => {
    render(<LoginPage />);
    const passwordInput = screen.getByPlaceholderText('Password') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(passwordInput.type).toBe('text');
  });
});
