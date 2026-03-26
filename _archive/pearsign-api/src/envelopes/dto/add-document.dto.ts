import { IsString, IsOptional, IsNumber, IsObject } from 'class-validator';

export class AddDocumentDto {
  @IsString()
  documentId: string;

  @IsOptional()
  @IsNumber()
  documentOrder?: number;

  @IsOptional()
  @IsObject()
  metadata?: {
    pageRange?: string;
    includeInCertificate?: boolean;
    [key: string]: any;
  };
}
