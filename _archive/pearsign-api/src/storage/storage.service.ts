import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';

export interface UploadResult {
  key: string;
  url: string;
  hash: string;
  size: number;
}

export interface FinalArtifacts {
  finalPdfUrl: string;
  certificateUrl: string;
  combinedPdfUrl: string;
  finalPdfHash: string;
}

/**
 * StorageService
 *
 * Handles S3-compatible storage for all document artifacts
 *
 * CRITICAL RULES:
 * - All final artifacts MUST be stored permanently
 * - URLs are immutable
 * - Hash verified before upload
 * - Access controlled via signed URLs
 *
 * Bucket Structure:
 * /orgs/{orgId}/envelopes/{envelopeId}/final.pdf
 * /orgs/{orgId}/envelopes/{envelopeId}/certificate.pdf
 * /orgs/{orgId}/envelopes/{envelopeId}/combined.pdf
 * /orgs/{orgId}/documents/{documentId}/original.pdf
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client;
  private bucket: string;

  constructor(private configService: ConfigService) {
    this.initializeS3Client();
  }

  /**
   * Initialize S3 client
   */
  private initializeS3Client(): void {
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1');
    const endpoint = this.configService.get<string>('AWS_S3_ENDPOINT');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );
    this.bucket = this.configService.get<string>(
      'AWS_S3_BUCKET',
      'pearsign-documents',
    );

    const config: any = {
      region,
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
    };

    // For MinIO or other S3-compatible services
    if (endpoint) {
      config.endpoint = endpoint;
      config.forcePathStyle = true; // Required for MinIO
    }

    this.s3Client = new S3Client(config);

    this.logger.log(
      `S3 client initialized: ${endpoint || `AWS ${region}`} → ${this.bucket}`,
    );
  }

  /**
   * Upload final envelope artifacts to S3
   *
   * CRITICAL: This is the source of truth for all final documents
   *
   * Returns permanent URLs for:
   * - Final signed PDF
   * - Certificate (separate)
   * - Combined PDF (PDF + certificate)
   */
  async uploadFinalArtifacts(
    organizationId: string,
    envelopeId: string,
    artifacts: {
      finalPdf: Uint8Array;
      certificate: Uint8Array;
      combinedPdf: Uint8Array;
      finalPdfHash: string;
    },
  ): Promise<FinalArtifacts> {
    this.logger.log(`Uploading final artifacts for envelope ${envelopeId}`);

    // Verify hash before upload
    const computedHash = this.generateHash(artifacts.finalPdf);
    if (computedHash !== artifacts.finalPdfHash) {
      throw new Error(
        `Hash mismatch for final PDF. Expected: ${artifacts.finalPdfHash}, Got: ${computedHash}`,
      );
    }

    // Upload all three artifacts in parallel
    const [finalPdfResult, certificateResult, combinedPdfResult] =
      await Promise.all([
        this.uploadFile({
          organizationId,
          key: `orgs/${organizationId}/envelopes/${envelopeId}/final.pdf`,
          data: artifacts.finalPdf,
          contentType: 'application/pdf',
        }),
        this.uploadFile({
          organizationId,
          key: `orgs/${organizationId}/envelopes/${envelopeId}/certificate.pdf`,
          data: artifacts.certificate,
          contentType: 'application/pdf',
        }),
        this.uploadFile({
          organizationId,
          key: `orgs/${organizationId}/envelopes/${envelopeId}/combined.pdf`,
          data: artifacts.combinedPdf,
          contentType: 'application/pdf',
        }),
      ]);

    this.logger.log(
      `Successfully uploaded final artifacts for envelope ${envelopeId}`,
    );

    return {
      finalPdfUrl: finalPdfResult.url,
      certificateUrl: certificateResult.url,
      combinedPdfUrl: combinedPdfResult.url,
      finalPdfHash: artifacts.finalPdfHash,
    };
  }

  /**
   * Upload original document to S3
   */
  async uploadOriginalDocument(
    organizationId: string,
    documentId: string,
    fileData: Buffer,
    fileName: string,
  ): Promise<UploadResult> {
    const extension = fileName.split('.').pop() || 'pdf';
    const key = `orgs/${organizationId}/documents/${documentId}/original.${extension}`;

    return this.uploadFile({
      organizationId,
      key,
      data: fileData,
      contentType: 'application/pdf',
      metadata: {
        originalFileName: fileName,
      },
    });
  }

  /**
   * Internal: Upload file to S3
   */
  private async uploadFile(params: {
    organizationId: string;
    key: string;
    data: Buffer | Uint8Array;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<UploadResult> {
    const { key, data, contentType, metadata } = params;

    const buffer = Buffer.from(data);
    const hash = this.generateHash(buffer);
    const size = buffer.length;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: {
        ...metadata,
        hash,
        uploadedAt: new Date().toISOString(),
      },
    });

    try {
      await this.s3Client.send(command);

      // Generate permanent URL (or signed URL for private buckets)
      const url = await this.getSignedDownloadUrl(key, 365 * 24 * 60 * 60); // 1 year expiry

      this.logger.log(`Uploaded file: ${key} (${this.formatBytes(size)})`);

      return {
        key,
        url,
        hash,
        size,
      };
    } catch (error) {
      this.logger.error(`Failed to upload file ${key}:`, error);
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  /**
   * Generate signed download URL
   *
   * CRITICAL: Use signed URLs for access control
   * - Short expiry for temporary downloads
   * - Long expiry for permanent links
   */
  async getSignedDownloadUrl(
    key: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      return url;
    } catch (error) {
      this.logger.error(`Failed to generate signed URL for ${key}:`, error);
      throw new Error(`Failed to generate download URL: ${error.message}`);
    }
  }

  /**
   * Check if file exists in S3
   */
  async fileExists(key: string): Promise<boolean> {
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Generate SHA-256 hash
   */
  private generateHash(data: Buffer | Uint8Array): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Format bytes for logging
   */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  /**
   * Get public URL for file (for public buckets)
   * Use signed URLs for private buckets
   */
  getPublicUrl(key: string): string {
    const endpoint = this.configService.get<string>('AWS_S3_ENDPOINT');
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1');

    if (endpoint) {
      // MinIO or custom S3 endpoint
      return `${endpoint}/${this.bucket}/${key}`;
    } else {
      // AWS S3
      return `https://${this.bucket}.s3.${region}.amazonaws.com/${key}`;
    }
  }
}
