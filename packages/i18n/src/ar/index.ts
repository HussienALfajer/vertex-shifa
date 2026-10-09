import { clinic } from './clinic.js';
import { common } from './common.js';
import { errors } from './errors.js';

/** The Arabic catalog, one namespace per file. */
export const ar = { common, clinic, errors };

export type Catalog = typeof ar;
