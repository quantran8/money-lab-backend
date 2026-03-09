import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Request body for PATCH /learn/lessons/:lessonId/progress.
 */
export class UpdateLessonProgressDto {
  @IsString()
  status: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  score?: number;
}
