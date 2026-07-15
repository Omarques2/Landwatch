import { Controller, Get, Req } from '@nestjs/common';
import type { AuthedRequest } from '../../auth/authed-request.type';
import { ActorContextService } from '../../auth/actor-context.service';
import { AccessService } from '../../auth/access.service';
import { requireTier } from '../common/tier-access';
import { CreditoService } from './credito.service';

@Controller('v1/tier/credito')
export class CreditoController {
  constructor(
    private readonly service: CreditoService,
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@Req() req: AuthedRequest) {
    await requireTier(this.actorContext, this.access, req);
    return this.service.list();
  }
}
