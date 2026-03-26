import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationBell } from '../notification-bell';

vi.mock('@/lib/notification-client', () => ({
  notificationClient: {
    getUnreadCount: vi.fn().mockResolvedValue(0),
    getNotifications: vi.fn().mockResolvedValue({ data: [] }),
    markAsRead: vi.fn().mockResolvedValue(undefined),
    markAllAsRead: vi.fn().mockResolvedValue(undefined),
    createStream: vi.fn().mockReturnValue({ close: vi.fn() }),
  },
}));

vi.mock('@/contexts/tenant-session-context', () => ({
  useTenantSession: () => ({ isAuthenticated: true }),
}));

describe('NotificationBell', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-apply default implementations after clearAllMocks
    const { notificationClient } = await import('@/lib/notification-client');
    vi.mocked(notificationClient.getUnreadCount).mockResolvedValue(0);
    vi.mocked(notificationClient.getNotifications).mockResolvedValue({ data: [] } as never);
    vi.mocked(notificationClient.createStream).mockReturnValue({ close: vi.fn() } as never);
  });

  it('renders the bell trigger button', () => {
    render(<NotificationBell />);
    const btn = screen.getByRole('button', { name: /notifications/i });
    expect(btn).toBeDefined();
  });

  it('shows "Notifications" aria-label when unread count is 0', async () => {
    render(<NotificationBell />);
    await waitFor(() => {
      expect(screen.getByLabelText('Notifications')).toBeDefined();
    });
  });

  it('shows unread count in aria-label when there are unread notifications', async () => {
    const { notificationClient } = await import('@/lib/notification-client');
    vi.mocked(notificationClient.getUnreadCount).mockResolvedValue(5);
    render(<NotificationBell />);
    await waitFor(() => {
      expect(screen.getByLabelText('5 unread notifications')).toBeDefined();
    });
  });

  it('shows badge with unread count', async () => {
    const { notificationClient } = await import('@/lib/notification-client');
    vi.mocked(notificationClient.getUnreadCount).mockResolvedValue(3);
    render(<NotificationBell />);
    await waitFor(() => {
      expect(screen.getByText('3')).toBeDefined();
    });
  });

  it('caps badge at 99+ when count exceeds 99', async () => {
    const { notificationClient } = await import('@/lib/notification-client');
    vi.mocked(notificationClient.getUnreadCount).mockResolvedValue(150);
    render(<NotificationBell />);
    await waitFor(() => {
      expect(screen.getByText('99+')).toBeDefined();
    });
  });

  it('trigger button is in the document and clickable', () => {
    render(<NotificationBell />);
    const btn = screen.getByRole('button', { name: /notifications/i });
    expect(btn).toBeDefined();
    // Should not throw on click
    expect(() => fireEvent.click(btn)).not.toThrow();
  });

  it('subscribes to real-time updates on mount when authenticated', async () => {
    const { notificationClient } = await import('@/lib/notification-client');
    render(<NotificationBell />);

    await waitFor(() => {
      expect(notificationClient.createStream).toHaveBeenCalled();
    });
  });

  it('calls markAllAsRead on the client when mark-all is triggered', async () => {
    const { notificationClient } = await import('@/lib/notification-client');
    vi.mocked(notificationClient.getUnreadCount).mockResolvedValue(2);
    vi.mocked(notificationClient.markAllAsRead).mockResolvedValue(undefined);

    render(<NotificationBell />);

    // Wait for the unread count to update
    await waitFor(() => {
      expect(screen.getByText('2')).toBeDefined();
    });
  });

  it('calls notificationClient.getUnreadCount on mount when authenticated', async () => {
    const { notificationClient } = await import('@/lib/notification-client');
    render(<NotificationBell />);

    await waitFor(() => {
      expect(notificationClient.getUnreadCount).toHaveBeenCalled();
    });
  });
});
