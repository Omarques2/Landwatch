import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';

const VALUE_TYPES = ['text', 'int', 'uuid'] as const;
const DEFAULT_BEHAVIORS = ['allow', 'deny'] as const;
const TARGET_STATUSES = ['draft', 'active'] as const;
const RULE_OPS = ['include', 'exclude'] as const;

export class CreateTargetDto {
  @IsString()
  targetKey!: string;

  @IsString()
  displayName!: string;

  @IsString()
  factTable!: string;

  @IsString()
  factColumn!: string;

  @IsIn(VALUE_TYPES)
  valueType!: (typeof VALUE_TYPES)[number];

  @IsOptional()
  @IsIn(DEFAULT_BEHAVIORS)
  defaultBehavior?: (typeof DEFAULT_BEHAVIORS)[number];

  @IsOptional()
  @IsIn(TARGET_STATUSES)
  status?: (typeof TARGET_STATUSES)[number];
}

export class UpdateTargetDto {
  @IsOptional()
  @IsString()
  targetKey?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  factTable?: string;

  @IsOptional()
  @IsString()
  factColumn?: string;

  @IsOptional()
  @IsIn(VALUE_TYPES)
  valueType?: (typeof VALUE_TYPES)[number];

  @IsOptional()
  @IsIn(DEFAULT_BEHAVIORS)
  defaultBehavior?: (typeof DEFAULT_BEHAVIORS)[number];

  @IsOptional()
  @IsIn(TARGET_STATUSES)
  status?: (typeof TARGET_STATUSES)[number];
}

export class CreateRuleDto {
  @ValidateIf((o: CreateRuleDto) => !o.userId)
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @ValidateIf((o: CreateRuleDto) => !o.customerId)
  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsIn(RULE_OPS)
  op!: (typeof RULE_OPS)[number];

  @IsOptional()
  @IsString()
  valueText?: string | null;

  @IsOptional()
  @Transform(
    ({ value }: TransformFnParams): number | string | null | undefined => {
      if (value === undefined || value === null || value === '') {
        return value as null | undefined;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : String(value);
    },
  )
  @IsInt()
  valueInt?: number | string | null;

  @IsOptional()
  @IsUUID()
  valueUuid?: string | null;
}

export class CreateRulesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateRuleDto)
  items!: CreateRuleDto[];
}

export class ListRulesQueryDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class SnapshotQueryDto {
  @IsOptional()
  @IsString()
  format?: string;
}
