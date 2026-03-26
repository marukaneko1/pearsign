import { IsString, IsEnum, IsOptional } from 'class-validator';

export enum SignatureType {
  DRAWN = 'drawn',
  TYPED = 'typed',
  UPLOADED = 'uploaded',
}

export class CaptureSignatureDto {
  @IsString()
  fieldId: string;

  @IsEnum(SignatureType)
  type: SignatureType;

  @IsString()
  data: string; // SVG data for drawn, text for typed, base64 for uploaded

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}
