import {
  ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength,
} from 'class-validator';
import { trim } from '../../common/validation';

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

export class SuspendDto { @IsBoolean() suspended: boolean; }

export class RolesDto {
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) roles: string[];
  @IsOptional() @IsUUID() programId?: string;
}
