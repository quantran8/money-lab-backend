import { Module, Global } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseService } from './supabase/supabase.service';
import { PrismaService } from './prisma/prisma.service';
import { AuthModule } from './auth/auth.module';
import { LearnModule } from './learn/learn.module';
import { BudgetModule } from './budget-simulation/budget-simulation.module';

@Global()
@Module({
  imports: [AuthModule, LearnModule, BudgetModule],
  controllers: [AppController],
  providers: [AppService, SupabaseService, PrismaService],
  exports: [SupabaseService, PrismaService],
})
export class AppModule { }
