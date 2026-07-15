import { IsOptional, IsString, Length } from 'class-validator';

export class CreateGrupoFrigorificoDto {
  @IsString() @Length(1, 200) nome!: string;
}

export class UpdateGrupoFrigorificoDto {
  @IsOptional() @IsString() @Length(1, 200) nome?: string;
}
