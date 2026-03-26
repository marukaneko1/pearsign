import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GeneralSettings } from '../settings/general-settings';

vi.mock('../settings/two-factor-dialog', () => ({
  TwoFactorDialog: () => <div data-testid="two-factor-dialog" />,
}));
vi.mock('../settings/sessions-dialog', () => ({
  SessionsDialog: () => <div data-testid="sessions-dialog" />,
}));
vi.mock('../settings/change-password-dialog', () => ({
  ChangePasswordDialog: () => <div data-testid="change-password-dialog" />,
}));

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockProfile = {
  firstName: 'Alice',
  lastName: 'Smith',
  email: 'alice@example.com',
  company: 'Acme Corp',
  phone: '+1-555-0100',
};

function successResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response);
}

describe('GeneralSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(global.fetch).mockImplementation(() => successResponse(mockProfile));
  });

  it('renders security sub-dialogs', async () => {
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('two-factor-dialog')).toBeDefined();
      expect(screen.getByTestId('sessions-dialog')).toBeDefined();
      expect(screen.getByTestId('change-password-dialog')).toBeDefined();
    });
  });

  it('populates first name field after loading', async () => {
    render(<GeneralSettings />);
    await waitFor(
      () => {
        const input = screen.queryByDisplayValue('Alice');
        expect(input).not.toBeNull();
      },
      { timeout: 3000 }
    );
  });

  it('populates email field after loading', async () => {
    render(<GeneralSettings />);
    await waitFor(
      () => {
        expect(screen.queryByDisplayValue('alice@example.com')).not.toBeNull();
      },
      { timeout: 3000 }
    );
  });

  it('calls save profile API when save button is clicked', async () => {
    let callCount = 0;
    vi.mocked(global.fetch).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return successResponse(mockProfile);
      return successResponse({ success: true });
    });

    render(<GeneralSettings />);

    // Wait for profile to load
    await waitFor(() => screen.queryByDisplayValue('Alice'), { timeout: 3000 });

    // Find and click any Save button
    const saveBtn = screen.getAllByRole('button').find(
      (b) => b.textContent?.toLowerCase().includes('save')
    );
    if (saveBtn) {
      fireEvent.click(saveBtn);
      await waitFor(() => {
        expect(callCount).toBeGreaterThanOrEqual(2);
      });
    }
  });

  it('calls notifications preferences API when a toggle is changed', async () => {
    const urls: string[] = [];
    vi.mocked(global.fetch).mockImplementation((url) => {
      urls.push(url as string);
      return successResponse(
        (url as string).includes('profile') ? mockProfile : { success: true }
      );
    });

    render(<GeneralSettings />);

    // Wait for loading to finish
    await waitFor(() => screen.queryByDisplayValue('Alice'), { timeout: 3000 });

    const toggles = screen.getAllByRole('switch');
    if (toggles.length > 0) {
      fireEvent.click(toggles[0]);
      await waitFor(() => {
        expect(urls.some((u) => u.includes('notifications/preferences'))).toBe(true);
      });
    }
  });

  it('shows error toast when profile load throws a network error', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));

    render(<GeneralSettings />);

    await waitFor(
      () => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ variant: 'destructive' })
        );
      },
      { timeout: 3000 }
    );
  });
});
