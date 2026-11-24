import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID,
  Length, Matches, MaxLength, Min, IsDateString,
} from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class RegisterDto {
  @IsEmail() @MaxLength(254) @trim() email: string;
  @IsString() @Length(10, 128)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, { message: 'La contraseña requiere mayúscula, minúscula y número' })
  password: string;
  @IsString() @trim() @Length(2, 80) firstName: string;
  @IsString() @trim() @Length(2, 80) lastName: string;
  @IsIn([true], { message: 'Debes aceptar el aviso de privacidad' }) consent: boolean;
  /** Campo trampa anti-bot: una persona nunca lo ve ni lo llena. */
  @IsOptional() @IsString() @MaxLength(200) website?: string;
}

export class UpdateProfileDto {
  @IsString() @trim() @Length(2, 80) firstName: string;
  @IsString() @trim() @Length(2, 80) lastName: string;
  @IsOptional() @IsString() @trim() @MaxLength(30) phone?: string;
}

export class ApplyDto { @IsUUID() programId: string; }

export class DecisionDto {
  @IsIn(['admitida', 'rechazada']) decision: 'admitida' | 'rechazada';
  @IsOptional() @IsUUID() cohortId?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class SuspendDto { @IsBoolean() suspended: boolean; }

export class RolesDto {
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) roles: string[];
  @IsOptional() @IsUUID() programId?: string;
}

export class EnrolmentDto {
  @Type(() => Number) @IsInt() @Min(2) courseId: number;
  @IsBoolean() active: boolean;
}

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

export class InfoRequestDto {
  @IsString() @trim() @Length(2, 120) name: string;
  @IsEmail() @MaxLength(254) @trim() email: string;
  @IsOptional() @IsString() @trim() @MaxLength(30) phone?: string;
  @IsOptional() @IsUUID() programId?: string;
  @IsString() @trim() @Length(5, 2000) message: string;
  @IsIn([true], { message: 'Debes aceptar el aviso de privacidad' }) consent: boolean;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
}

export class InfoStatusDto { @IsIn(['nueva', 'atendida']) status: 'nueva' | 'atendida'; }

export class ContentDto {
  @IsIn(['noticia', 'pagina', 'faq', 'docente', 'autoridad', 'contacto']) type: string;
  @IsString() @trim() @Matches(/^[a-z0-9-]{2,120}$/) slug: string;
  @IsString() @trim() @Length(2, 200) title: string;
  @IsOptional() @IsString() @MaxLength(600) summary?: string;
  @IsOptional() @IsString() @MaxLength(100000) body?: string;
  @IsOptional() @IsString() @Matches(/^(https:\/\/|\/(?![/\\]))/) @MaxLength(500) imageUrl?: string;
  @IsOptional() @IsString() @MaxLength(160) seoTitle?: string;
  @IsOptional() @IsString() @MaxLength(320) seoDescription?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsIn(['borrador', 'publicado']) status: string;
}

export class BroadcastDto {
  @IsOptional() @IsUUID() programId?: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsString() @trim() @Length(3, 120) title: string;
  @IsString() @trim() @Length(3, 500) body: string;
  @IsOptional() @IsString() @Matches(/^\/[^/]/) @MaxLength(300) link?: string;
}

export class DeviceDto {
  @IsString() @Length(8, 512) token: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}
