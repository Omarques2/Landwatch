import {
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

// No @nestjs/mapped-types; fields explicit, all optional. Analysis fields
// (analiseStatus/analiseSnapshotAt/landwatchAnaliseId) are NOT editable here.
export class UpdateCarDto {
  @IsOptional() @IsUUID() fazendaId?: string;
  @IsOptional() @IsString() @Length(5, 200) carNumero?: string;
  @IsOptional() @IsIn(['PROPRIO', 'ARRENDAMENTO', 'COMODATO']) vinculo?:
    | 'PROPRIO'
    | 'ARRENDAMENTO'
    | 'COMODATO';
  @IsOptional() @IsString() @Length(1, 200) titularNome?: string;
  @IsOptional() @IsString() @Length(1, 40) titularCpfCnpj?: string;
  @IsOptional() @IsString() @Length(1, 120) municipio?: string;
  @IsOptional() @IsString() @Length(2, 2) uf?: string;
  @IsOptional() @IsNumberString() areaHa?: string;
}
