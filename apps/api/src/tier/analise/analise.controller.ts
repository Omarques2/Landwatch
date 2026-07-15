import { Controller, Get, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import type { AuthedRequest } from '../../auth/authed-request.type';
import { ActorContextService } from '../../auth/actor-context.service';
import { AccessService } from '../../auth/access.service';
import { requireTier } from '../common/tier-access';
import { AnaliseService } from './analise.service';

// Shares the /v1/tier/cars base path; route :id/analise is distinct from the
// cars CRUD routes.
@Controller('v1/tier/cars')
export class AnaliseController {
  constructor(
    private readonly service: AnaliseService,
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
  ) {}

  @Get(':id/analise')
  async analise(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.getForCar(id);
  }
}
