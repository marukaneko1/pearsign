/**
 * PearSign API Client
 *
 * Centralized API client for all backend communication
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

// Token storage
let accessToken: string | null = null;
let refreshToken: string | null = null;

// Initialize tokens from localStorage (client-side only)
if (typeof window !== 'undefined') {
  accessToken = localStorage.getItem('accessToken');
  refreshToken = localStorage.getItem('refreshToken');
}

/**
 * Set authentication tokens
 */
export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  if (typeof window !== 'undefined') {
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);
  }
}

/**
 * Clear authentication tokens
 */
export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }
}

/**
 * Get current access token
 */
export function getAccessToken() {
  return accessToken;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated() {
  return !!accessToken;
}

/**
 * Make authenticated API request
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (accessToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle token refresh
  if (response.status === 401 && refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
      const retryResponse = await fetch(url, { ...options, headers });
      if (!retryResponse.ok) {
        throw new ApiError(retryResponse.status, await retryResponse.text());
      }
      return retryResponse.json();
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = errorText;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.message || errorText;
    } catch {}
    throw new ApiError(response.status, errorMessage);
  }

  // Handle empty responses
  const text = await response.text();
  if (!text) return {} as T;

  return JSON.parse(text);
}

/**
 * Refresh access token
 */
async function refreshAccessToken(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      setTokens(data.accessToken, data.refreshToken);
      return true;
    }
  } catch {}

  clearTokens();
  return false;
}

/**
 * API Error class
 */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// ============================================
// AUTH API
// ============================================

export const authApi = {
  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    organizationName: string;
  }) {
    const response = await apiRequest<{
      accessToken: string;
      refreshToken: string;
      user: User;
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setTokens(response.accessToken, response.refreshToken);
    return response;
  },

  async login(email: string, password: string) {
    const response = await apiRequest<{
      accessToken: string;
      refreshToken: string;
      user: User;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setTokens(response.accessToken, response.refreshToken);
    return response;
  },

  async logout() {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      clearTokens();
    }
  },

  async getMe() {
    return apiRequest<User>('/auth/me');
  },
};

// ============================================
// ENVELOPES API
// ============================================

export const envelopesApi = {
  async create(data: CreateEnvelopeDto) {
    return apiRequest<Envelope>('/envelopes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async list() {
    return apiRequest<Envelope[]>('/envelopes');
  },

  async get(id: string) {
    return apiRequest<Envelope>(`/envelopes/${id}`);
  },

  async addRecipient(envelopeId: string, data: AddRecipientDto) {
    return apiRequest<Recipient>(`/envelopes/${envelopeId}/recipients`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async addDocument(envelopeId: string, data: { documentId: string; documentOrder?: number }) {
    return apiRequest(`/envelopes/${envelopeId}/documents`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async send(envelopeId: string) {
    return apiRequest<Envelope>(`/envelopes/${envelopeId}/send`, {
      method: 'POST',
    });
  },

  async getDownloadUrl(envelopeId: string, type: 'final' | 'certificate' | 'combined') {
    return apiRequest<{ url: string }>(`/envelopes/${envelopeId}/download/${type}`);
  },
};

// ============================================
// DOCUMENTS API
// ============================================

export const documentsApi = {
  async upload(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/documents/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new ApiError(response.status, await response.text());
    }

    return response.json();
  },

  async list() {
    return apiRequest<Document[]>('/documents');
  },

  async get(id: string) {
    return apiRequest<Document>(`/documents/${id}`);
  },

  async delete(id: string) {
    return apiRequest(`/documents/${id}`, { method: 'DELETE' });
  },
};

// ============================================
// TEMPLATES API
// ============================================

export const templatesApi = {
  async create(data: CreateTemplateDto) {
    return apiRequest<Template>('/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async list(filters?: { category?: string; includeArchived?: boolean }) {
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.includeArchived) params.append('includeArchived', 'true');
    return apiRequest<Template[]>(`/templates?${params}`);
  },

  async get(id: string) {
    return apiRequest<Template>(`/templates/${id}`);
  },

  async update(id: string, data: Partial<CreateTemplateDto>) {
    return apiRequest<Template>(`/templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string) {
    return apiRequest(`/templates/${id}`, { method: 'DELETE' });
  },

  async archive(id: string) {
    return apiRequest<Template>(`/templates/${id}/archive`, { method: 'POST' });
  },

  async unarchive(id: string) {
    return apiRequest<Template>(`/templates/${id}/unarchive`, { method: 'POST' });
  },

  async use(id: string, data: UseTemplateDto) {
    return apiRequest<Envelope>(`/templates/${id}/use`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async createFromEnvelope(envelopeId: string, templateName: string) {
    return apiRequest<Template>('/templates/from-envelope', {
      method: 'POST',
      body: JSON.stringify({ envelopeId, templateName }),
    });
  },
};

// ============================================
// BULK SEND API
// ============================================

export const bulkSendApi = {
  async createJob(data: CreateBulkSendJobDto) {
    return apiRequest<BulkSendJob>('/bulk-send', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async uploadCsv(file: File, title: string, options?: {
    message?: string;
    enableReminders?: boolean;
    expirationDays?: number;
  }) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    if (options?.message) formData.append('message', options.message);
    if (options?.enableReminders) formData.append('enableReminders', 'true');
    if (options?.expirationDays) formData.append('expirationDays', String(options.expirationDays));

    const response = await fetch(`${API_BASE_URL}/bulk-send/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new ApiError(response.status, await response.text());
    }

    return response.json();
  },

  async getJobStatus(jobId: string) {
    return apiRequest<BulkSendJob>(`/bulk-send/${jobId}/status`);
  },

  async listJobs() {
    return apiRequest<BulkSendJob[]>('/bulk-send/jobs');
  },

  async getExampleCsv() {
    return apiRequest<{ csv: string; headers: string[]; description: string }>('/bulk-send/example-csv');
  },
};

// ============================================
// AUDIT API
// ============================================

export const auditApi = {
  async getEnvelopeAuditTrail(envelopeId: string, options?: {
    actionFilter?: string[];
    limit?: number;
    offset?: number;
    sortOrder?: 'ASC' | 'DESC';
  }) {
    const params = new URLSearchParams();
    if (options?.actionFilter) params.append('actionFilter', options.actionFilter.join(','));
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));
    if (options?.sortOrder) params.append('sortOrder', options.sortOrder);

    return apiRequest<AuditTrailResponse>(`/audit/envelopes/${envelopeId}?${params}`);
  },

  async exportCsv(envelopeId: string) {
    const response = await fetch(`${API_BASE_URL}/audit/envelopes/${envelopeId}/export/csv`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.text();
  },

  async exportPdf(envelopeId: string) {
    const response = await fetch(`${API_BASE_URL}/audit/envelopes/${envelopeId}/export/pdf`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.blob();
  },

  async getSummary(envelopeId: string) {
    return apiRequest<AuditSummary>(`/audit/envelopes/${envelopeId}/summary`);
  },
};

// ============================================
// PUBLIC SIGNING API (No auth required)
// ============================================

export const publicSigningApi = {
  async getSigningData(token: string) {
    return fetch(`${API_BASE_URL.replace('/v1', '')}/public/sign/${token}`)
      .then(r => r.json());
  },

  async markViewed(token: string) {
    return fetch(`${API_BASE_URL.replace('/v1', '')}/public/sign/${token}/viewed`, {
      method: 'POST',
    });
  },

  async captureSignature(token: string, fieldId: string, data: string) {
    return fetch(`${API_BASE_URL.replace('/v1', '')}/public/sign/${token}/signature`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fieldId, data }),
    }).then(r => r.json());
  },

  async complete(token: string) {
    return fetch(`${API_BASE_URL.replace('/v1', '')}/public/sign/${token}/complete`, {
      method: 'POST',
    }).then(r => r.json());
  },

  async decline(token: string, reason: string) {
    return fetch(`${API_BASE_URL.replace('/v1', '')}/public/sign/${token}/decline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
  },
};

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  organizationId: string;
}

export interface Envelope {
  id: string;
  title: string;
  description?: string;
  status: 'draft' | 'ready_to_send' | 'in_signing' | 'viewed' | 'completed' | 'voided' | 'declined' | 'expired';
  signingOrder: 'sequential' | 'parallel';
  organizationId: string;
  createdBy: string;
  recipients: Recipient[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  settings?: {
    enableReminders?: boolean;
    reminderInterval?: number;
    message?: string;
  };
  metadata?: {
    documentCount?: number;
    recipientCount?: number;
    viewedCount?: number;
    completedCount?: number;
    finalPdfUrl?: string;
    certificateUrl?: string;
    combinedPdfUrl?: string;
  };
}

export interface Recipient {
  id: string;
  name: string;
  email: string;
  role: 'signer' | 'cc' | 'viewer' | 'approver';
  status: 'pending' | 'sent' | 'viewed' | 'signing' | 'signed' | 'completed' | 'declined' | 'expired';
  signingOrder: number;
  sentAt?: string;
  viewedAt?: string;
  signedAt?: string;
}

export interface Document {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  hash: string;
  status: 'draft' | 'processing' | 'ready' | 'error';
  url?: string;
  createdAt: string;
}

export interface Template {
  id: string;
  name: string;
  description?: string;
  category: 'legal' | 'hr' | 'sales' | 'real_estate' | 'finance' | 'custom';
  signingOrder: 'sequential' | 'parallel';
  recipients: Array<{
    role: string;
    placeholderLabel: string;
    signingOrder: number;
  }>;
  usageCount: number;
  isPublic: boolean;
  isArchived: boolean;
  createdAt: string;
}

export interface BulkSendJob {
  id: string;
  title: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial_success';
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  startedAt?: string;
  completedAt?: string;
  results?: {
    envelopeIds: string[];
    errors: Array<{ row: number; recipientEmail: string; error: string }>;
  };
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  actor: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface AuditTrailResponse {
  total: number;
  logs: AuditLog[];
  hash: string;
}

export interface AuditSummary {
  envelope: Envelope;
  logs: AuditLog[];
  summary: {
    totalEvents: number;
    emailsSent: number;
    recipientsViewed: number;
    recipientsSigned: number;
    reminders: number;
    completedAt?: string;
  };
  auditHash: string;
}

// DTOs
export interface CreateEnvelopeDto {
  title: string;
  description?: string;
  signingOrder?: 'sequential' | 'parallel';
  enableReminders?: boolean;
  reminderInterval?: number;
  requireAuthentication?: boolean;
  allowDecline?: boolean;
  message?: string;
  expirationDate?: string;
}

export interface AddRecipientDto {
  name: string;
  email: string;
  role?: 'signer' | 'cc' | 'viewer' | 'approver';
  signingOrder?: number;
}

export interface CreateTemplateDto {
  name: string;
  description?: string;
  category: string;
  signingOrder: string;
  recipients: Array<{
    role: string;
    placeholderLabel: string;
    signingOrder: number;
  }>;
  isPublic?: boolean;
}

export interface UseTemplateDto {
  title: string;
  recipients: Array<{
    placeholderLabel: string;
    name: string;
    email: string;
  }>;
  message?: string;
}

export interface CreateBulkSendJobDto {
  title: string;
  csvContent: string;
  documentId?: string;
  message?: string;
  enableReminders?: boolean;
  reminderInterval?: number;
  expirationDays?: number;
}
