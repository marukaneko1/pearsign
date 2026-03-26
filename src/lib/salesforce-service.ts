import { sql } from "@/lib/db";

interface SalesforceConfig {
  accessToken: string;
  refreshToken: string;
  instanceUrl: string;
  tokenType: string;
  issuedAt: string;
  userEmail: string;
  userName: string;
  organizationId: string;
  syncContacts?: string;
  syncDocuments?: string;
  createTasks?: string;
}

/**
 * Refresh Salesforce access token
 */
async function refreshAccessToken(config: SalesforceConfig, tenantId: string): Promise<string> {
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
  const salesforceLoginUrl = process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";

  if (!clientId || !clientSecret || !config.refreshToken) {
    throw new Error("Cannot refresh token: missing credentials");
  }

  console.log("[Salesforce] Refreshing access token...");

  const response = await fetch(`${salesforceLoginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: config.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("[Salesforce] Token refresh failed:", data);
    throw new Error("Failed to refresh access token");
  }

  const newConfig = {
    ...config,
    accessToken: data.access_token,
    issuedAt: data.issued_at,
  };

  await sql`
    UPDATE integration_configs
    SET config = ${JSON.stringify(newConfig)}::jsonb, updated_at = NOW()
    WHERE org_id = ${tenantId} AND integration_type = 'salesforce'
  `;

  return data.access_token;
}

/**
 * Get Salesforce config from database
 */
async function getSalesforceConfig(tenantId: string): Promise<SalesforceConfig | null> {
  try {
    const result = await sql`
      SELECT config, enabled FROM integration_configs
      WHERE org_id = ${tenantId} AND integration_type = 'salesforce' AND enabled = true
    `;

    if (result.length === 0) {
      return null;
    }

    return result[0].config as SalesforceConfig;
  } catch {
    return null;
  }
}

/**
 * Make an authenticated request to Salesforce API
 */
async function salesforceRequest(
  tenantId: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const config = await getSalesforceConfig(tenantId);
  if (!config) {
    return { success: false, error: "Salesforce not connected" };
  }

  let accessToken = config.accessToken;

  let response = await fetch(`${config.instanceUrl}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (response.status === 401) {
    try {
      accessToken = await refreshAccessToken(config, tenantId);
      response = await fetch(`${config.instanceUrl}${endpoint}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });
    } catch (refreshError) {
      return { success: false, error: "Authentication failed" };
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: errorData.message || `Request failed with status ${response.status}`
    };
  }

  const data = await response.json().catch(() => ({}));
  return { success: true, data };
}

/**
 * Search for a contact by email in Salesforce
 */
export async function findContactByEmail(tenantId: string, email: string): Promise<{ id: string; name: string } | null> {
  const result = await salesforceRequest(
    tenantId,
    `/services/data/v59.0/query?q=${encodeURIComponent(`SELECT Id, Name, Email FROM Contact WHERE Email = '${email}' LIMIT 1`)}`
  );

  if (!result.success || !result.data) {
    return null;
  }

  const records = (result.data as { records: Array<{ Id: string; Name: string }> }).records;
  if (records && records.length > 0) {
    return { id: records[0].Id, name: records[0].Name };
  }

  return null;
}

/**
 * Create a contact in Salesforce
 */
export async function createContact(tenantId: string, data: {
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  let accountId: string | undefined;

  if (data.company) {
    const accountResult = await salesforceRequest(
      tenantId,
      `/services/data/v59.0/query?q=${encodeURIComponent(`SELECT Id FROM Account WHERE Name = '${data.company}' LIMIT 1`)}`
    );

    const accounts = (accountResult.data as { records: Array<{ Id: string }> })?.records;
    if (accounts && accounts.length > 0) {
      accountId = accounts[0].Id;
    } else {
      const newAccountResult = await salesforceRequest(tenantId, "/services/data/v59.0/sobjects/Account", {
        method: "POST",
        body: JSON.stringify({ Name: data.company }),
      });
      if (newAccountResult.success) {
        accountId = (newAccountResult.data as { id: string }).id;
      }
    }
  }

  const contactData: Record<string, string> = {
    FirstName: data.firstName,
    LastName: data.lastName,
    Email: data.email,
  };

  if (accountId) {
    contactData.AccountId = accountId;
  }

  const result = await salesforceRequest(tenantId, "/services/data/v59.0/sobjects/Contact", {
    method: "POST",
    body: JSON.stringify(contactData),
  });

  if (result.success) {
    return { success: true, id: (result.data as { id: string }).id };
  }

  return { success: false, error: result.error };
}

/**
 * Log a document signing event as a Task in Salesforce
 */
export async function logSigningTask(tenantId: string, data: {
  contactEmail: string;
  documentTitle: string;
  signedAt: Date;
  envelopeId: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const config = await getSalesforceConfig(tenantId);
  if (!config || config.createTasks !== "true") {
    return { success: false, error: "Task creation not enabled" };
  }

  const contact = await findContactByEmail(tenantId, data.contactEmail);
  if (!contact) {
    return { success: false, error: "Contact not found in Salesforce" };
  }

  const taskData = {
    Subject: `Document Signed: ${data.documentTitle}`,
    Description: `Document "${data.documentTitle}" was signed on ${data.signedAt.toISOString()}.\n\nEnvelope ID: ${data.envelopeId}`,
    Status: "Completed",
    Priority: "Normal",
    WhoId: contact.id,
    ActivityDate: data.signedAt.toISOString().split("T")[0],
  };

  const result = await salesforceRequest(tenantId, "/services/data/v59.0/sobjects/Task", {
    method: "POST",
    body: JSON.stringify(taskData),
  });

  if (result.success) {
    console.log("[Salesforce] Created task for signing:", data.documentTitle);
    return { success: true, id: (result.data as { id: string }).id };
  }

  return { success: false, error: result.error };
}

/**
 * Sync a signer to Salesforce as a Contact (if not exists)
 */
export async function syncSignerToSalesforce(tenantId: string, data: {
  email: string;
  name: string;
  company?: string;
}): Promise<void> {
  const config = await getSalesforceConfig(tenantId);
  if (!config || config.syncContacts !== "true") {
    return;
  }

  try {
    const existing = await findContactByEmail(tenantId, data.email);
    if (existing) {
      console.log("[Salesforce] Contact already exists:", data.email);
      return;
    }

    const nameParts = data.name.trim().split(" ");
    const firstName = nameParts[0] || "Unknown";
    const lastName = nameParts.slice(1).join(" ") || "Contact";

    const result = await createContact(tenantId, {
      firstName,
      lastName,
      email: data.email,
      company: data.company,
    });

    if (result.success) {
      console.log("[Salesforce] Created contact:", data.email);
    } else {
      console.error("[Salesforce] Failed to create contact:", result.error);
    }
  } catch (error) {
    console.error("[Salesforce] Error syncing contact:", error);
  }
}

/**
 * Check if Salesforce integration is enabled
 */
export async function isSalesforceEnabled(tenantId: string): Promise<boolean> {
  const config = await getSalesforceConfig(tenantId);
  return config !== null;
}

/**
 * Get Salesforce connection info
 */
export async function getSalesforceInfo(tenantId: string): Promise<{
  connected: boolean;
  instanceUrl?: string;
  userName?: string;
  userEmail?: string;
} | null> {
  const config = await getSalesforceConfig(tenantId);
  if (!config) {
    return { connected: false };
  }

  return {
    connected: true,
    instanceUrl: config.instanceUrl,
    userName: config.userName,
    userEmail: config.userEmail,
  };
}
