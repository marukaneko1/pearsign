import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNumber,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SigningOrder } from '../entities/envelope.entity';

export class CreateEnvelopeDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(SigningOrder)
  signingOrder?: SigningOrder;

  @IsOptional()
  @IsBoolean()
  enableReminders?: boolean;

  @IsOptional()
  @IsNumber()
  reminderInterval?: number; // hours

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expirationDate?: Date;

  @IsOptional()
  @IsBoolean()
  requireAuthentication?: boolean;

  @IsOptional()
  @IsBoolean()
  allowDecline?: boolean;

  @IsOptional()
  @IsString()
  message?: string;
}
