import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class SetTierStatusDto {
  @IsIn(['SUBMETIDO', 'APROVADO', 'RECUSADO']) status!:
    | 'SUBMETIDO'
    | 'APROVADO'
    | 'RECUSADO';
  @IsOptional() @IsString() @Length(1, 200) validadoPor?: string;
}
