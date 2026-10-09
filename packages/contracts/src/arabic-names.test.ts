import { describe, expect, it } from 'vitest';
import { normalizeArabicName } from './arabic-names.js';

const same = (a: string, b: string) => normalizeArabicName(a) === normalizeArabicName(b);

describe('normalizeArabicName', () => {
  it.each([
    ['أحمد', 'احمد'],
    ['إبراهيم', 'ابراهيم'],
    ['آمنة', 'امنه'],
    ['ٱلياس', 'الياس'],
    ['فاطمة', 'فاطمه'],
    ['مصطفى', 'مصطفي'],
    ['مُحَمَّد', 'محمد'],
    ['محـــمد', 'محمد'],
    ['عبد الله', 'عبدالله'],
    ['عبد  الرحمن', 'عبدالرحمن'],
    ['عبد الرّحمن', 'عبدالرحمن'],
  ])('folds %s to the key of %s', (variant, plain) => {
    expect(normalizeArabicName(variant)).toBe(plain);
  });

  it('treats the folded letters as equal in both directions', () => {
    expect(same('أسامة', 'اسامه')).toBe(true);
    expect(same('ليلى', 'ليلي')).toBe(true);
    expect(same('إسراء', 'اسراء')).toBe(true);
  });

  it('keeps distinct names apart', () => {
    expect(same('حسن', 'حسين')).toBe(false);
    expect(same('سعد', 'سعيد')).toBe(false);
    expect(same('عبد ربه', 'عبدربه')).toBe(false);
    expect(same('علاء', 'علا')).toBe(false);
  });

  it('collapses and trims spaces of a full name', () => {
    expect(normalizeArabicName('  محمّد\t عبد الله \n الحلبي ')).toBe('محمد عبدالله الحلبي');
  });

  it('joins only a standalone "عبد" followed by a word starting with "ال"', () => {
    expect(normalizeArabicName('عبد الكريم عبد')).toBe('عبدالكريم عبد');
    expect(normalizeArabicName('عبدالله الحسن')).toBe('عبدالله الحسن');
    expect(normalizeArabicName('عبد عبد الله')).toBe('عبد عبدالله');
    expect(normalizeArabicName('عبد ربه')).toBe('عبد ربه');
  });

  it('removes zero-width and bidirectional marks', () => {
    expect(normalizeArabicName('‏محمد‌ ؜علي﻿')).toBe('محمد علي');
  });

  it('reads presentation forms as their letters', () => {
    expect(normalizeArabicName('ﻻﻣﺎ')).toBe('لاما');
    expect(normalizeArabicName('ﷲ')).toBe('الله');
  });

  it('composes a separate hamza or madda with its alef before folding', () => {
    expect(normalizeArabicName('أحمد')).toBe('احمد');
    expect(normalizeArabicName('آمنه')).toBe('امنه');
  });

  it('lowercases Latin letters', () => {
    expect(normalizeArabicName('Ahmad AL-Ali')).toBe('ahmad al-ali');
  });

  it('is idempotent', () => {
    for (const name of ['أحمد عبد الله', 'فاطِمة الزَّهراء', 'Ahmad', '', '   ']) {
      const once = normalizeArabicName(name);
      expect(normalizeArabicName(once)).toBe(once);
    }
  });

  it('returns an empty key for blank input', () => {
    expect(normalizeArabicName(' ـ َ ')).toBe('');
  });
});
