import { IsString, Length } from 'class-validator';

export class UpdateFornecedorCarDto {
  @IsString()
  @Length(5, 200)
  car!: string;
}
