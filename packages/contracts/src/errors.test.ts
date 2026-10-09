import { describe, expect, it } from 'vitest';
import {
  DomainError,
  errorCodeSchema,
  errorCodes,
  errorResponseSchema,
  errorStatus,
} from './errors.js';

describe('error codes', () => {
  it('are upper snake case and unique', () => {
    for (const code of errorCodes) expect(code).toMatch(/^[A-Z]+(_[A-Z]+)*$/);
    expect(new Set(errorCodes).size).toBe(errorCodes.length);
  });

  it('each map to a client or server error status', () => {
    for (const code of errorCodes) {
      expect(errorStatus[code]).toBeGreaterThanOrEqual(400);
      expect(errorStatus[code]).toBeLessThan(600);
    }
  });

  it('include the codes the conventions name', () => {
    expect(errorCodes).toEqual(
      expect.arrayContaining(['NOT_ENTITLED', 'TENANT_SUSPENDED', 'VALIDATION_FAILED']),
    );
  });

  it('are the only codes the schema accepts', () => {
    expect(errorCodeSchema.parse('NOT_FOUND')).toBe('NOT_FOUND');
    expect(errorCodeSchema.safeParse('SOMETHING_ELSE').success).toBe(false);
  });
});

describe('error response', () => {
  it('carries a known code and an English message', () => {
    expect(errorResponseSchema.parse({ code: 'FORBIDDEN', message: 'Missing permission' })).toEqual(
      {
        code: 'FORBIDDEN',
        message: 'Missing permission',
      },
    );
    expect(errorResponseSchema.safeParse({ code: 'forbidden', message: 'x' }).success).toBe(false);
    expect(errorResponseSchema.safeParse({ code: 'FORBIDDEN' }).success).toBe(false);
  });
});

describe('DomainError', () => {
  it('is an Error with its code and message', () => {
    const error = new DomainError('CONFLICT', 'Already changed');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DomainError');
    expect(error.code).toBe('CONFLICT');
    expect(error.message).toBe('Already changed');
  });
});
