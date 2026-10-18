import { describe, expect, it } from 'vitest';
import { eventCatalog } from './events.js';

describe('the event catalog', () => {
  it('names every event with a version', () => {
    for (const type of Object.keys(eventCatalog)) {
      expect(type).toMatch(/^[a-z_]+\.[a-z_]+\.v\d+$/);
    }
  });

  it('keeps only the ids of an invitation, dropping anything else', () => {
    const payload = {
      tenantId: '0190a000-0000-7000-8000-000000000001',
      membershipId: '0190a000-0000-7000-8000-000000000002',
    };
    const schema = eventCatalog['staff.invitation_created.v1'];
    expect(schema.parse({ ...payload, phone: '+963900000001' })).toEqual(payload);
    expect(schema.safeParse({ tenantId: payload.tenantId }).success).toBe(false);
  });
});
