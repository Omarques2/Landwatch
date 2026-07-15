import { IsDateString, IsOptional, Matches, MinLength } from 'class-validator';

export class PagarCobrancaDto {
  @IsOptional() @IsDateString() dataPagamento?: string;
  @IsOptional() @Matches(/^\d+(\.\d{1,2})?$/) @MinLength(1) valorPago?: string;
}
