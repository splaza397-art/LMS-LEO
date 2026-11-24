import { Type } from 'class-transformer';
import {
  IsIn, IsInt, IsOptional, IsString, Length, Matches, MaxLength,
} from 'class-validator';
import { trim } from '../../common/validation';

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
