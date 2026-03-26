/**
 * PearSign SDK - Official TypeScript/JavaScript Client
 *
 * @version 1.0.0
 * @license MIT
 *
 * Usage:
 * ```typescript
 * import { PearSignClient } from '@pearsign/sdk';
 *
 * const client = new PearSignClient({
 *   apiKey: process.env.PEARSIGN_API_KEY!,
 * });
 *
 * // Create an envelope
 * const envelope = await client.envelopes.create({
 *   name: 'Employment Contract',
 *   signerEmail: 'john@example.com',
 *   signerName: 'John Doe',
 * });
 *
 * // Send the envelope
 * await client.envelopes.send(envelope.id);
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PearSignClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  debug?: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total?: number;
    pages?: number;
    hasMore?: boolean;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export class PearSignError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(error: ApiError, status: number) {
    super(error.message);
    this.name = "PearSignError";
    this.code = error.code;
    this.status = status;
    this.details = error.details;
  }
}

// ============================================================================
// ENVELOPE TYPES
// ============================================================================

export type EnvelopeStatus = "draft" | "sent" | "viewed" | "completed" | "voided" | "declined" | "expired";

export interface Envelope {
  id: string;
  name: string;
  status: EnvelopeStatus;
  signerEmail: string;
  signerName?: string;
  documentUrl?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface EnvelopeCreateParams {
  name: string;
  signerEmail: string;
  signerName?: string;
  documentUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface EnvelopeUpdateParams {
  name?: string;
  signerEmail?: string;
  signerName?: string;
}

export interface EnvelopeListParams extends PaginationParams {
  status?: EnvelopeStatus;
}

export interface EnvelopeSendResult {
  id: string;
  status: "sent";
  signingUrl: string;
}

// ============================================================================
// TEMPLATE TYPES
// ============================================================================

export interface Template {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// AUDIT LOG TYPES
// ============================================================================

export interface ApiLog {
  id: string;
  apiKeyId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  ip: string;
  userAgent: string;
  responseTime: number;
  createdAt: string;
}

export interface ApiStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  requestsByEndpoint: Record<string, number>;
  requestsByDay: { date: string; count: number }[];
}

// ============================================================================
// HTTP CLIENT
// ============================================================================

interface RequestConfig {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  params?: Record<string, string | number | undefined>;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly debug: boolean;

  constructor(config: PearSignClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || "/api/v1";
    this.timeout = config.timeout || 30000;
    this.maxRetries = config.maxRetries || 3;
    this.debug = config.debug || false;
  }

  async request<T>(config: RequestConfig): Promise<T> {
    const { method, path, body, params } = config;

    // Build URL with query params
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          searchParams.set(key, String(value));
        }
      }
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "PearSign-SDK/1.0.0",
    };

    // Retry logic for idempotent methods
    const isIdempotent = method === "GET" || method === "PUT" || method === "DELETE";
    const maxAttempts = isIdempotent ? this.maxRetries : 1;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (this.debug) {
          console.log(`[PearSign SDK] ${method} ${url} (attempt ${attempt})`);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const data = await response.json();

        if (!response.ok) {
          const error = data.error || { code: "unknown", message: "Unknown error" };
          throw new PearSignError(error, response.status);
        }

        return data as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx)
        if (error instanceof PearSignError && error.status >= 400 && error.status < 500) {
          throw error;
        }

        // Wait before retry (exponential backoff)
        if (attempt < maxAttempts) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          if (this.debug) {
            console.log(`[PearSign SDK] Retrying in ${delay}ms...`);
          }
          await sleep(delay);
        }
      }
    }

    throw lastError || new Error("Request failed");
  }
}

// ============================================================================
// RESOURCE CLASSES
// ============================================================================

/**
 * Envelopes API
 */
class EnvelopesResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List envelopes
   */
  async list(params?: EnvelopeListParams): Promise<PaginatedResponse<Envelope>> {
    return this.http.request({
      method: "GET",
      path: "/envelopes",
      params: {
        page: params?.page,
        limit: params?.limit,
        status: params?.status,
      },
    });
  }

  /**
   * Get a single envelope
   */
  async get(id: string): Promise<{ data: Envelope }> {
    return this.http.request({
      method: "GET",
      path: `/envelopes/${id}`,
    });
  }

  /**
   * Create an envelope
   */
  async create(params: EnvelopeCreateParams): Promise<{ data: Envelope }> {
    return this.http.request({
      method: "POST",
      path: "/envelopes",
      body: params,
    });
  }

  /**
   * Update an envelope
   */
  async update(id: string, params: EnvelopeUpdateParams): Promise<{ data: Envelope }> {
    return this.http.request({
      method: "PATCH",
      path: `/envelopes/${id}`,
      body: params,
    });
  }

  /**
   * Send an envelope for signing
   */
  async send(id: string): Promise<{ data: EnvelopeSendResult }> {
    return this.http.request({
      method: "POST",
      path: `/envelopes/${id}/send`,
    });
  }

  /**
   * Void an envelope
   */
  async void(id: string): Promise<{ data: { id: string; status: "voided" } }> {
    return this.http.request({
      method: "DELETE",
      path: `/envelopes/${id}`,
    });
  }
}

/**
 * Templates API
 */
class TemplatesResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List templates
   */
  async list(params?: PaginationParams): Promise<PaginatedResponse<Template>> {
    return this.http.request({
      method: "GET",
      path: "/templates",
      params: {
        page: params?.page,
        limit: params?.limit,
      },
    });
  }

  /**
   * Get a single template
   */
  async get(id: string): Promise<{ data: Template }> {
    return this.http.request({
      method: "GET",
      path: `/templates/${id}`,
    });
  }
}

/**
 * Audit API
 */
class AuditResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List API logs
   */
  async listLogs(params?: {
    apiKeyId?: string;
    endpoint?: string;
    method?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: ApiLog[]; meta: { count: number; limit: number; offset: number } }> {
    return this.http.request({
      method: "GET",
      path: "/audit/api-logs",
      params: params as Record<string, string | number | undefined>,
    });
  }

  /**
   * Get API usage stats
   */
  async getStats(days?: number): Promise<{ data: ApiStats }> {
    return this.http.request({
      method: "GET",
      path: "/audit/stats",
      params: { days },
    });
  }
}

// ============================================================================
// MAIN CLIENT
// ============================================================================

/**
 * PearSign API Client
 *
 * @example
 * ```typescript
 * const client = new PearSignClient({
 *   apiKey: 'ps_live_xxx.secret',
 * });
 *
 * const envelope = await client.envelopes.create({
 *   name: 'Contract',
 *   signerEmail: 'john@example.com',
 * });
 * ```
 */
export class PearSignClient {
  private readonly http: HttpClient;

  /**
   * Envelopes API
   */
  public readonly envelopes: EnvelopesResource;

  /**
   * Templates API
   */
  public readonly templates: TemplatesResource;

  /**
   * Audit API
   */
  public readonly audit: AuditResource;

  constructor(config: PearSignClientConfig) {
    if (!config.apiKey) {
      throw new Error("PearSign API key is required");
    }

    if (!config.apiKey.startsWith("ps_test_") && !config.apiKey.startsWith("ps_live_")) {
      throw new Error("Invalid API key format. Expected: ps_test_xxx.secret or ps_live_xxx.secret");
    }

    this.http = new HttpClient(config);

    this.envelopes = new EnvelopesResource(this.http);
    this.templates = new TemplatesResource(this.http);
    this.audit = new AuditResource(this.http);
  }

  /**
   * Get the environment from the API key
   */
  get environment(): "test" | "live" {
    return this.http["apiKey"].startsWith("ps_live_") ? "live" : "test";
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default PearSignClient;
