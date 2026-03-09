import { Controller, Get, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { LearnService } from './learn.service';
import { AuthGuard } from '../auth/auth.guard';
import { getUserId } from '../common/utils/auth.utils';
import { UpdateLessonProgressDto } from './dto';

@Controller('learn')
@UseGuards(AuthGuard)
export class LearnController {
  constructor(private readonly learnService: LearnService) {}

  @Get('modules/:moduleId/lessons')
  getLessonsByModule(@Param('moduleId') moduleId: string) {
    return this.learnService.getLessonsByModule(parseInt(moduleId, 10));
  }

  @Get('progress')
  getProgress(@Request() req: { user?: { id: string } }, @Query('lessonIds') lessonIds: string) {
    const ids = lessonIds ? lessonIds.split(',').map((id) => parseInt(id, 10)).filter((n) => !Number.isNaN(n)) : [];
    return this.learnService.getProgress(getUserId(req), ids);
  }

  @Patch('lessons/:lessonId/progress')
  updateProgress(
    @Request() req: { user?: { id: string } },
    @Param('lessonId') lessonId: string,
    @Body() body: UpdateLessonProgressDto,
  ) {
    return this.learnService.updateProgress(
      getUserId(req),
      parseInt(lessonId, 10),
      body.status,
      body.score,
    );
  }
}
