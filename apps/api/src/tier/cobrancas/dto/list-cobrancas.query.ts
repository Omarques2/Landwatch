import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { TierCobrancaStatus } from '@prisma/client';

export class ListCobrancasQuery {
  @IsOptional() @IsUUID() proprietarioId?: string;
  @IsOptional() @IsEnum(TierCobrancaStatus) status?: TierCobrancaStatus;
  @IsOptional() @IsDateString() ini?: string;
  @IsOptional() @IsDateString() fim?: string;
}
