import { Module, Global } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseService } from './supabase/supabase.service';
import { PrismaService } from './prisma/prisma.service';
import { AuthModule } from './auth/auth.module';
import { LearnModule } from './learn/learn.module';
import { BudgetModule } from './budget-simulation/budget-simulation.module';
import { InvestModule } from './invest-simulation/invest-simulation.module';

@Global()
@Module({
  imports: [
    ScheduleModule.forRoot(),
    AuthModule,
    LearnModule,
    BudgetModule,
    InvestModule,
  ],
  controllers: [AppController],
  providers: [AppService, SupabaseService, PrismaService],
  exports: [SupabaseService, PrismaService],
})
export class AppModule {}
