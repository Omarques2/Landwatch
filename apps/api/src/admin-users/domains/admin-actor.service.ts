import { Injectable } from '@nestjs/common';
import { UserRepository } from '../repositories/user.repository';

@Injectable()
export class AdminActorService {
  constructor(private readonly users: UserRepository) {}

  async resolveActorUserId(actorSub: string | null): Promise<string | null> {
    if (!actorSub) return null;
    const actor = await this.users.findBySub(actorSub);
    return actor?.id ?? null;
  }
}
