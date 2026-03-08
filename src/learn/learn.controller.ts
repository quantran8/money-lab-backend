import { Controller, Get, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { LearnService } from './learn.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('learn')
@UseGuards(AuthGuard)
export class LearnController {
    constructor(private readonly learnService: LearnService) { }

    @Get('modules/:moduleId/lessons')
    getLessonsByModule(@Param('moduleId') moduleId: string) {
        return this.learnService.getLessonsByModule(parseInt(moduleId));
    }

    @Get('progress')
    getProgress(@Request() req, @Query('lessonIds') lessonIds: string) {
        const ids = lessonIds ? lessonIds.split(',').map(id => parseInt(id)) : [];
        return this.learnService.getProgress(req.user.id, ids);
    }

    @Patch('lessons/:lessonId/progress')
    updateProgress(
        @Request() req,
        @Param('lessonId') lessonId: string,
        @Body() updateDto: { status: string; score?: number },
    ) {
        return this.learnService.updateProgress(
            req.user.id,
            parseInt(lessonId),
            updateDto.status,
            updateDto.score,
        );
    }
}
