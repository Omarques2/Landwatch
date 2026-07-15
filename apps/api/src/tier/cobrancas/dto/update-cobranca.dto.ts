import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class UpdateCobrancaDto {
  @IsOptional() @IsDateString() periodoIni?: string;
  @IsOptional() @IsDateString() periodoFim?: string;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  tierIds?: string[];
  @IsOptional() @IsBoolean() confirmOverlap?: boolean;
}
