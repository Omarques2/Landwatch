import { IsOptional, IsUUID } from 'class-validator';

export class ListLotesQuery {
  @IsOptional() @IsUUID() tierId?: string;
}
