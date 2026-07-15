import { IsOptional, IsString } from 'class-validator';

export class ListGtasQuery {
  @IsOptional() @IsString() search?: string;
}
