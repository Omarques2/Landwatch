import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

// No @nestjs/mapped-types in this project; fields declared explicitly, all optional.
export class UpdateFazendaDto {
  @IsOptional() @IsString() @Length(1, 200) nome?: string;
  @IsOptional() @IsString() @Length(1, 120) municipio?: string;
  @IsOptional() @IsString() @Length(2, 2) estado?: string;
  @IsOptional() @IsString() @Length(1, 60) sistema?: string;
  @IsOptional() @IsUUID() proprietarioDonoId?: string;
}
