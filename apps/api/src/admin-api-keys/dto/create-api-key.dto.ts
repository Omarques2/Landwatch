import { ApiKeyScope } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  clientName!: string;

  @IsOptional()
  @IsUUID()
  orgId?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ApiKeyScope, { each: true })
  @IsOptional()
  scopes?: ApiKeyScope[];

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

export const DEFAULT_API_KEY_SCOPES: ApiKeyScope[] = [
  ApiKeyScope.analysis_read,
  ApiKeyScope.analysis_write,
  ApiKeyScope.pdf_read,
  ApiKeyScope.pdf_write,
];
