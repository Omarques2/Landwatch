import { IsIn, IsOptional, IsUUID } from 'class-validator';

const ESCOPOS = [
  'PROPRIETARIO',
  'FAZENDA',
  'CAR',
  'TIER',
  'LOTE',
  'FRIGORIFICO',
] as const;

export class ListDocumentosQuery {
  @IsOptional() @IsIn(ESCOPOS) escopo?: (typeof ESCOPOS)[number];
  @IsOptional() @IsUUID() refId?: string;
  @IsOptional() @IsUUID() loteId?: string;
}
