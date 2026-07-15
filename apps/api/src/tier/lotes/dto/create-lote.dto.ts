import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateLoteDto {
  @IsUUID() tierId!: string;
  @IsString() @Length(1, 200) nome!: string;
}

// nome is editable (often a placeholder before the real value is known).
export class UpdateLoteDto {
  @IsOptional() @IsString() @Length(1, 200) nome?: string;
}
