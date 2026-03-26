import { IsString, IsOptional } from 'class-validator';

export class CompleteSigningDto {
  @IsString()
  recipientId: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}
