/**
 * Notification Client API
 * Frontend client for notification operations
 */

import type { Notification, NotificationPreferences } from './notifications';

const API_BASE = '/api/notifications';

interface NotificationsResponse {
  success: boolean;
  data: Notification[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

interface UnreadCountResponse {
  success: boolean;
  count: number;
}

interface NotificationResponse {
  success: boolean;
  data: Notification;
}

interface PreferencesResponse {
  success: boolean;
  data: NotificationPreferences;
}

export const notificationClient = {
  /**
   * Get notifications for the current user
   */
  async getNotifications(options: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
  } = {}): Promise<NotificationsResponse> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));
    if (options.unreadOnly) params.set('unreadOnly', 'true');

    const response = await fetch(`${API_BASE}?${params.toString()}`);
    return response.json();
  },

  /**
   * Get unread notification count
   */
  async getUnreadCount(): Promise<number> {
    const response = await fetch(`${API_BASE}/unread-count`);
    const data: UnreadCountResponse = await response.json();
    return data.count;
  },

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string): Promise<Notification | null> {
    const response = await fetch(`${API_BASE}/${notificationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read' }),
    });
    const data: NotificationResponse = await response.json();
    return data.success ? data.data : null;
  },

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<number> {
    const response = await fetch(API_BASE, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read-all' }),
    });
    const data = await response.json();
    return data.count || 0;
  },

  /**
   * Get notification preferences
   */
  async getPreferences(): Promise<NotificationPreferences> {
    const response = await fetch(`${API_BASE}/preferences`);
    const data: PreferencesResponse = await response.json();
    return data.data;
  },

  /**
   * Update notification preferences
   */
  async updatePreferences(
    preferences: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    const response = await fetch(`${API_BASE}/preferences`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preferences),
    });
    const data: PreferencesResponse = await response.json();
    return data.data;
  },

  /**
   * Seed sample notifications (for testing)
   */
  async seedNotifications(): Promise<void> {
    await fetch(`${API_BASE}/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  },

  /**
   * Create an SSE connection for real-time updates
   */
  createStream(onMessage: (data: {
    type: 'count' | 'update';
    count: number;
    notifications?: Notification[];
  }) => void): EventSource | null {
    if (typeof window === 'undefined') return null;

    const eventSource = new EventSource(`${API_BASE}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
    };

    return eventSource;
  },
};
