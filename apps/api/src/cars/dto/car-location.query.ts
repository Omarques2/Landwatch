import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CarLocationQuery {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  carKey!: string;
}
