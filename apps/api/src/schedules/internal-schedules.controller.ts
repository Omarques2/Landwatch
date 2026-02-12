import {
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { SchedulesService } from './schedules.service';

@Controller('internal/schedules')
@Public()
export class InternalSchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Post('run-due')
  async runDue(@Headers('x-job-token') token?: string) {
    const expected = process.env.SCHEDULES_JOB_TOKEN;
    if (!expected || token !== expected) {
      throw new UnauthorizedException({
        code: 'INVALID_JOB_TOKEN',
        message: 'Invalid job token',
      });
    }

    return this.schedules.runDue();
  }
}
