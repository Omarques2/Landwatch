import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateFarmDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(5, 200)
  carKey?: string;

  @IsOptional()
  @IsString()
  @Length(11, 18)
  cpfCnpj?: string;
}
