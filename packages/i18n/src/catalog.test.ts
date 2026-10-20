import { auditActions, errorCodes } from '@vertex-shifa/contracts';
import { describe, expect, it } from 'vitest';
import { ar, formatDateTime, formatLocale } from './index.js';

function texts(value: unknown, path: string): [string, unknown][] {
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => texts(child, `${path}.${key}`));
  }
  return [[path, value]];
}

describe('Arabic catalog', () => {
  const all = texts(ar, 'ar');

  it('holds only non-empty strings', () => {
    for (const [path, text] of all) {
      expect(typeof text, path).toBe('string');
      expect((text as string).trim(), path).not.toBe('');
    }
  });

  it('writes digits in Latin, never Arabic-Indic', () => {
    for (const [path, text] of all) {
      expect(text, path).not.toMatch(/[٠-٩۰-۹]/);
    }
  });

  it('has a text for every error code', () => {
    expect(Object.keys(ar.errors).sort()).toEqual([...errorCodes].sort());
  });

  it('has a label for every audit action', () => {
    expect(Object.keys(ar.audit).sort()).toEqual([...auditActions].sort());
  });

  it('gives every counted text all six Arabic plural forms', () => {
    const pluralForms = ['zero', 'one', 'two', 'few', 'many', 'other'];
    const counted = new Map<string, string[]>();
    for (const [path] of all) {
      const match = /^(.*)_(zero|one|two|few|many|other)$/.exec(path);
      if (match?.[1] && match[2]) {
        counted.set(match[1], [...(counted.get(match[1]) ?? []), match[2]]);
      }
    }
    expect(counted.size).toBeGreaterThan(0);
    for (const [path, forms] of counted) {
      expect(forms.sort(), path).toEqual([...pluralForms].sort());
    }
  });
});

describe('format locale', () => {
  it('formats numbers and dates with Latin digits', () => {
    expect(new Intl.NumberFormat(formatLocale).format(1234567)).toMatch(/^[0-9٬,.]+$/);
    const date = new Intl.DateTimeFormat(formatLocale, { dateStyle: 'short', timeZone: 'UTC' });
    expect(date.format(new Date(Date.UTC(2026, 9, 9)))).not.toMatch(/[٠-٩]/);
    expect(date.format(new Date(Date.UTC(2026, 9, 9)))).toMatch(/2026/);
  });

  it('formats a date and time with the Syrian month name, in Damascus time', () => {
    expect(formatDateTime('2026-09-20T10:00:00Z')).toBe('20 أيلول 2026، 1:00 م');
    expect(formatDateTime('2026-10-19T21:30:00Z')).toBe('20 تشرين الأول 2026، 12:30 ص');
  });
});
