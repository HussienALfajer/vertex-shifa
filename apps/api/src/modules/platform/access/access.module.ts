import { Module } from '@nestjs/common';
import { AccessController } from './access.controller.js';

/**
 * Staff memberships, branch scopes and the permission catalog (spec S02). Sign-in, devices and
 * sessions read memberships through `memberships.ts`; invitations and access changes arrive with
 * the staff routes.
 */
@Module({ controllers: [AccessController] })
export class AccessModule {}
