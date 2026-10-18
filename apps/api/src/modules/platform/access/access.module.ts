import { Module } from '@nestjs/common';
import { AccessController } from './access.controller.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';

/**
 * Staff memberships, branch scopes and the permission catalog (spec S02). Sign-in, devices and
 * sessions read memberships through `memberships.ts`; staff management reaches accounts, devices
 * and doctor profiles through the ports in `ports.ts`, which identity and practitioners provide.
 */
@Module({ controllers: [AccessController, StaffController], providers: [StaffService] })
export class AccessModule {}
