import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateFazendaDto {
  @IsString() @Length(1, 200) nome!: string;
  @IsOptional() @IsString() @Length(1, 120) municipio?: string;
  @IsOptional() @IsString() @Length(2, 2) estado?: string;
  @IsOptional() @IsString() @Length(1, 60) sistema?: string;
  @IsOptional() @IsUUID() proprietarioDonoId?: string;
}
