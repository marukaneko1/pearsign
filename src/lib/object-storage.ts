import { Storage } from "@google-cloud/storage";
import { randomUUID } from "crypto";
import { sql } from "./db";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function getPrivateObjectDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!dir) {
    throw new Error("PRIVATE_OBJECT_DIR not set");
  }
  return dir;
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const parts = path.split("/");
  if (parts.length < 3) throw new Error("Invalid path");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function signObjectURL(opts: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: opts.bucketName,
        object_name: opts.objectName,
        method: opts.method,
        expires_at: new Date(Date.now() + opts.ttlSec * 1000).toISOString(),
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to sign object URL: ${response.status}`);
  }
  const { signed_url } = await response.json();
  return signed_url;
}

export interface StorageUploadResult {
  objectPath: string;
  size: number;
}

export const TenantObjectStorage = {
  async uploadBuffer(
    tenantId: string,
    fileName: string,
    data: Buffer,
    contentType: string,
    category: string = "documents"
  ): Promise<StorageUploadResult> {
    const objectId = randomUUID();
    const ext = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".")) : "";
    const objectKey = `${category}/${tenantId}/${objectId}${ext}`;
    const privateDir = getPrivateObjectDir();
    const fullPath = `${privateDir}/${objectKey}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

    const bucket = storageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    await file.save(data, {
      contentType,
      metadata: {
        metadata: {
          "custom:tenantId": tenantId,
          "custom:originalName": fileName,
          "custom:uploadedAt": new Date().toISOString(),
        },
      },
    });

    await this.trackStorageChange(tenantId, data.length);

    return {
      objectPath: fullPath,
      size: data.length,
    };
  },

  async downloadBuffer(objectPath: string): Promise<{ data: Buffer; contentType: string }> {
    const { bucketName, objectName } = parseObjectPath(objectPath);
    const bucket = storageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    const [exists] = await file.exists();
    if (!exists) {
      throw new Error(`Object not found: ${objectPath}`);
    }

    const [data] = await file.download();
    const [metadata] = await file.getMetadata();

    return {
      data: Buffer.from(data),
      contentType: (metadata.contentType as string) || "application/octet-stream",
    };
  },

  async getSignedDownloadUrl(objectPath: string, ttlSec: number = 3600): Promise<string> {
    const { bucketName, objectName } = parseObjectPath(objectPath);
    return signObjectURL({ bucketName, objectName, method: "GET", ttlSec });
  },

  async getSignedUploadUrl(tenantId: string, fileName: string, category: string = "documents"): Promise<{ uploadUrl: string; objectPath: string }> {
    const objectId = randomUUID();
    const ext = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".")) : "";
    const objectKey = `${category}/${tenantId}/${objectId}${ext}`;
    const privateDir = getPrivateObjectDir();
    const fullPath = `${privateDir}/${objectKey}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

    const uploadUrl = await signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });

    return { uploadUrl, objectPath: fullPath };
  },

  async deleteObject(tenantId: string, objectPath: string): Promise<void> {
    const { bucketName, objectName } = parseObjectPath(objectPath);
    const bucket = storageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    const [exists] = await file.exists();
    if (!exists) return;

    const [metadata] = await file.getMetadata();
    const size = parseInt(metadata.size as string) || 0;

    await file.delete();

    if (size > 0) {
      await this.trackStorageChange(tenantId, -size);
    }
  },

  async trackStorageChange(tenantId: string, bytesChange: number): Promise<void> {
    try {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

      await sql`
        INSERT INTO tenant_usage (tenant_id, period_start, period_end, storage_bytes)
        VALUES (${tenantId}, ${periodStart}, ${periodEnd}, ${Math.max(0, bytesChange)})
        ON CONFLICT (tenant_id, period_start)
        DO UPDATE SET
          storage_bytes = GREATEST(0, tenant_usage.storage_bytes + ${bytesChange}),
          updated_at = NOW()
      `;
    } catch (error) {
      console.error("[ObjectStorage] Failed to track storage:", error);
    }
  },

  async getStorageUsage(tenantId: string): Promise<number> {
    try {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];

      const result = await sql`
        SELECT COALESCE(storage_bytes, 0) as storage_bytes
        FROM tenant_usage
        WHERE tenant_id = ${tenantId} AND period_start = ${periodStart}
      `;

      return result.length > 0 ? parseInt(result[0].storage_bytes as string) || 0 : 0;
    } catch {
      return 0;
    }
  },
};
