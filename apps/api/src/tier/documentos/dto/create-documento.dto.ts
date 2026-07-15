import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

const TIPOS = [
  'INSCRICAO_ESTADUAL',
  'PROCURACAO',
  'CONTRATO_COMODATO',
  'DOC_PESSOAL',
  'PARECER_TECNICO',
  'DECLARACAO_M049',
  'NF',
  'OUTRO',
] as const;

const ESCOPOS = [
  'PROPRIETARIO',
  'FAZENDA',
  'CAR',
  'TIER',
  'LOTE',
  'FRIGORIFICO',
] as const;

// Multipart form fields arrive as strings alongside the uploaded file.
export class CreateDocumentoDto {
  @IsIn(TIPOS) tipo!: (typeof TIPOS)[number];
  @IsOptional() @IsString() @Length(1, 200) nome?: string;
  @IsIn(ESCOPOS) escopo!: (typeof ESCOPOS)[number];
  @IsUUID() refId!: string;
  @IsOptional() @IsUUID() loteId?: string;
  @IsOptional() @IsDateString() dataRef?: string;
}
