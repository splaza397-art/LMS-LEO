import {
  IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength,
} from 'class-validator';
import { trim } from '../../common/validation';

export class ApplyDto { @IsUUID() programId: string; }

export class DecisionDto {
  @IsIn(['admitida', 'rechazada']) decision: 'admitida' | 'rechazada';
  @IsOptional() @IsUUID() cohortId?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
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
