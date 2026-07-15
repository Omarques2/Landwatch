import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class CreateCobrancaDto {
  @IsUUID() proprietarioId!: string;
  @IsDateString() periodoIni!: string;
  @IsDateString() periodoFim!: string;
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  tierIds!: string[];
  @IsOptional() @IsBoolean() confirmOverlap?: boolean;
}
