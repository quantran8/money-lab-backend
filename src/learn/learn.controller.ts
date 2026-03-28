import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { LearnService } from './learn.service';
import { AuthGuard } from '../auth/auth.guard';
import { getUserId } from '../common/utils/auth.utils';
import { GetProgressDto, UpdateLessonProgressDto } from './dto';

@Controller('learning_path')
@UseGuards(AuthGuard)
export class LearnController {
  constructor(private readonly learnService: LearnService) {}

  @Get('modules')
  getModules() {
    return this.learnService.getModules();
  }

  @Get('modules/:moduleId/lessons')
  getLessonsByModule(@Param('moduleId') moduleId: string) {
    return this.learnService.getLessonsByModule(parseInt(moduleId, 10));
  }

  @Post('progress')
  getProgress(
    @Request() req: { user?: { id: string } },
    @Body() body: GetProgressDto,
  ) {
    return this.learnService.getProgress(getUserId(req), body.lessonIds);
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
