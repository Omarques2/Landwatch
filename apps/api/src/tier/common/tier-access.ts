import type { AuthedRequest } from '../../auth/authed-request.type';
import { ActorContextService } from '../../auth/actor-context.service';
import { AccessService } from '../../auth/access.service';

export const TIER_FEATURE = 'TIER' as const;

// Resolve the tenant actor and require the TIER feature. Every Tier controller
// handler calls this first (mirrors CarsController.actor()).
export async function requireTier(
  actorContext: ActorContextService,
  access: AccessService,
  req: AuthedRequest,
) {
  const actor = await actorContext.fromRequest(req, { orgMode: 'tenant' });
  await access.requireTenantFeature(actor, TIER_FEATURE);
  return actor;
}
