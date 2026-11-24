import { Type } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, Min,
} from 'class-validator';
import { trim } from '../../common/validation';

export class ProgramDto {
  @IsString() @trim() @Matches(/^[a-z0-9-]{3,80}$/) slug: string;
  @IsString() @trim() @Length(3, 160) name: string;
  @IsIn(['licenciatura', 'diplomado', 'certificacion', 'curso']) level: string;
  @IsString() @trim() @Length(3, 400) summary: string;
  @IsOptional() @IsString() @MaxLength(20000) description?: string;
  @IsOptional() @IsString() @MaxLength(80) duration?: string;
  @IsOptional() @IsString() @MaxLength(80) modality?: string;
  @IsBoolean() published: boolean;
  @IsOptional() @IsString() @Matches(/^(https:\/\/|\/(?![/\\]))/) @MaxLength(500) imageUrl?: string;
}

export class CohortDto {
  @IsString() @trim() @Length(2, 120) name: string;
  @IsOptional() @IsDateString() startsOn?: string;
  @IsOptional() @IsDateString() endsOn?: string;
}

export class ProgramCourseDto { @Type(() => Number) @IsInt() @Min(2) moodleCourseId: number; }

export class TeacherDto {
  @IsUUID() userId: string;
  @Type(() => Number) @IsInt() @Min(2) courseId: number;
  @IsBoolean() active: boolean;
}
