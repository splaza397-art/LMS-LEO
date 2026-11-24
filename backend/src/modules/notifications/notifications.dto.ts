import {
  IsBoolean, IsOptional, IsString, IsUUID, Length, Matches, MaxLength,
} from 'class-validator';
import { trim } from '../../common/validation';

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
