import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LearnService {
  constructor(private prisma: PrismaService) {}

  async getModules() {
    const modules = await this.prisma.module.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    return modules;
  }

  async getLessonsByModule(moduleId: number) {
    const lessons = await this.prisma.lesson.findMany({
      where: { moduleId },
      orderBy: { orderIndex: 'asc' },
    });

    // Convert BigInt to string for JSON serialization
    return lessons.map((lesson) => ({
      ...lesson,
      id: lesson.id.toString(),
    }));
  }

  async getProgress(userId: string, lessonIds: number[]) {
    const progress = await this.prisma.userLessonProgress.findMany({
      where: {
        userId: userId,
        lessonId: { in: lessonIds.map((id) => BigInt(id)) },
      },
    });

    return progress.map((p) => ({
      ...p,
      id: p.id.toString(),
      lessonId: p.lessonId.toString(),
    }));
  }

  async updateProgress(
    userId: string,
    lessonId: number,
    status: string,
    score?: number,
  ) {
    const lessonBigIntId = BigInt(lessonId);

    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonBigIntId },
    });

    if (!lesson) {
      throw new NotFoundException(`Lesson with ID ${lessonId} not found`);
    }

    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'completed') {
      updateData.lastAttemptAt = new Date();
    }

    if (score !== undefined) {
      // Logic for bestScore: update if new score is higher
      const currentProgress = await this.prisma.userLessonProgress.findUnique({
        where: { userId_lessonId: { userId, lessonId: lessonBigIntId } },
      });

      if (
        !currentProgress ||
        currentProgress.bestScore === null ||
        score > currentProgress.bestScore
      ) {
        updateData.bestScore = score;
      }
    }

    const progress = await this.prisma.userLessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId: lessonBigIntId } },
      update: updateData,
      create: {
        userId,
        lessonId: lessonBigIntId,
        ...updateData,
      },
    });

    return {
      ...progress,
      id: progress.id.toString(),
      lessonId: progress.lessonId.toString(),
    };
  }
}
