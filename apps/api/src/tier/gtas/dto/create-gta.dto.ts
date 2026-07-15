import { IsDateString, IsOptional, IsString, Length } from 'class-validator';

// Edited-fields payload for creating/updating a Tier GTA. Extraction pre-fills
// these; the user may correct them. Only `numero` is required.
export class SaveGtaDto {
  @IsString() @Length(1, 60) numero!: string;
  @IsOptional() @IsString() serie?: string;
  @IsOptional() @IsString() uf?: string;
  @IsOptional() @IsDateString() dataEmissao?: string;
  @IsOptional() @IsString() sistema?: string;
  @IsOptional() @IsString() origemNome?: string;
  @IsOptional() @IsString() origemCpfCnpj?: string;
  @IsOptional() @IsString() origemEstabelecimento?: string;
  @IsOptional() @IsString() origemCar?: string;
  @IsOptional() @IsString() origemMunicipio?: string;
  @IsOptional() @IsString() origemUf?: string;
  // Full extractor payload as a JSON string (optional); stored as jsonb.
  @IsOptional() @IsString() rawExtraction?: string;
}
