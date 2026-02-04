import { IsOptional, IsString, Length } from 'class-validator';

export class CreateFarmDto {
  @IsString()
  @Length(2, 200)
  name!: string;

  @IsString()
  @Length(5, 200)
  carKey!: string;

  @IsOptional()
  @IsString()
  @Length(11, 18)
  cpfCnpj?: string;
}
