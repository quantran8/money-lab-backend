import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Welcome to Money Lab API';
  }

  getModules() {
    return [
      { id: 1, title: 'Money Foundations', status: 'available' },
      { id: 2, title: 'Budget Simulation & Lifestyle Choices', status: 'locked' },
      { id: 3, title: 'Investment Fundamentals', status: 'locked' },
      { id: 4, title: 'Fictional Investment World Simulator', status: 'locked' },
    ];
  }
}
