import { IsArray, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class GetProgressDto {
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  lessonIds: number[];
}
