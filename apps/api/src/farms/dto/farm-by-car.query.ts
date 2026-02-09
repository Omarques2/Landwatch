import { IsString, Length } from 'class-validator';

export class FarmByCarQuery {
  @IsString()
  @Length(5, 200)
  carKey!: string;
}
