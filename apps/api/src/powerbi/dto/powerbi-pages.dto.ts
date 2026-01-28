import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { toBoolean } from '../../common/dto/transformers';

export class PageGroupCreateDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  pageIds?: string[];
}

export class PageGroupUpdateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}

export class PageGroupPagesDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  pageIds!: string[];
}

export class PageGroupLinkDto {
  @Transform(toBoolean)
  @IsBoolean()
  isActive!: boolean;
}

export class PageAllowDto {
  @Transform(toBoolean)
  @IsBoolean()
  canView!: boolean;
}
