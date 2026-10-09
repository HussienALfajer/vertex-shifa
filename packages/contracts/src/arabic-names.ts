/**
 * Arabic name normalization for search and duplicate matching (ADR 0006). Two spellings of the
 * same name give the same key; the key is for comparison only and is never shown or stored in
 * place of what the person typed.
 */

// Harakat, shadda, sukun, superscript alef, hamza marks and Quranic annotation signs.
const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭ]/g;
const TATWEEL = /ـ/g;
// Zero-width characters and bidirectional marks that keyboards and copy-paste leave behind.
const INVISIBLE = /[​-‏‪-‮⁦-⁩؜﻿]/g;
const ALEF_FORMS = /[آأإٱ]/g; // آ أ إ ٱ
const TEH_MARBUTA = /ة/g; // ة
const ALEF_MAKSURA = /ى/g; // ى

/**
 * Folds ة/ه, ى/ي and أ/إ/آ/ا, removes tatweel, diacritics and invisible marks, collapses spaces
 * and joins "عبد ال…" written with a space ("عبد الله" and "عبدالله" give the same key).
 */
export function normalizeArabicName(name: string): string {
  const words = name
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(DIACRITICS, '')
    .replace(TATWEEL, '')
    .replace(ALEF_FORMS, 'ا')
    .replace(TEH_MARBUTA, 'ه')
    .replace(ALEF_MAKSURA, 'ي')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const joined: string[] = [];
  for (const word of words) {
    if (joined.at(-1) === 'عبد' && word.startsWith('ال')) joined[joined.length - 1] += word;
    else joined.push(word);
  }
  return joined.join(' ');
}
