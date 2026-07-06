import { IsOptional, IsString, IsInt, IsArray } from 'class-validator';

export class CreateFileDto {
  @IsString()
  name!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  taskId?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  tags?: string[];
}

export class UpdateFileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  metadata?: Record<string, unknown>;
}
