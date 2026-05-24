import { IsString, IsBoolean, IsOptional, IsDateString, IsInt, Min, Max, MinLength, MaxLength } from 'class-validator';
export class CreateTaskDto {
  @IsString() @MinLength(5) @MaxLength(2000) rawInput: string;
  @IsBoolean() @IsOptional() shadowMode?: boolean;
  @IsDateString() @IsOptional() scheduleAt?: string;
  @IsInt() @Min(1) @Max(10) @IsOptional() priority?: number;
}