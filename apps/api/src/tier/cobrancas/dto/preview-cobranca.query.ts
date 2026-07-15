import { IsDateString, IsUUID } from 'class-validator';

export class PreviewCobrancaQuery {
  @IsUUID() proprietarioId!: string;
  @IsDateString() ini!: string;
  @IsDateString() fim!: string;
}
