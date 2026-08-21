import { Transform } from 'class-transformer';
import {
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

function parseDocuments(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [value];
  } catch {
    return [value];
  }
}

export class CreateGeometryAnalysisDto {
  @IsString()
  @Length(2, 200)
  name!: string;

  @IsOptional()
  @Transform(({ value }) => parseDocuments(value))
  @IsArray()
  @IsString({ each: true })
  @Length(11, 18, { each: true })
  documents?: string[];

  @IsOptional()
  @IsISO8601()
  analysisDate?: string;
}
