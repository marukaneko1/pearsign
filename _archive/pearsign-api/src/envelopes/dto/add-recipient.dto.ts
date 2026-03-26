import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsNumber,
  IsObject,
} from 'class-validator';
import { RecipientRole } from '../entities/recipient.entity';

export class AddRecipientDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsEnum(RecipientRole)
  role: RecipientRole;

  @IsOptional()
  @IsNumber()
  signingOrder?: number;

  @IsOptional()
  @IsObject()
  metadata?: {
    phoneNumber?: string;
    company?: string;
    title?: string;
    customFields?: Record<string, any>;
  };
}

export class AddRecipientsDto {
  recipients: AddRecipientDto[];
}
