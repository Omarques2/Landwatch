import { SetMetadata } from '@nestjs/common';

export const ALLOW_INACTIVE_SELF_STATUS_KEY = 'allowInactiveSelfStatus';

export const AllowInactiveSelfStatus = () =>
  SetMetadata(ALLOW_INACTIVE_SELF_STATUS_KEY, true);
