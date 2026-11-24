import { Type } from 'class-transformer';
import {
  IsBoolean, IsInt, Min,
} from 'class-validator';

export class EnrolmentDto {
  @Type(() => Number) @IsInt() @Min(2) courseId: number;
  @IsBoolean() active: boolean;
}
