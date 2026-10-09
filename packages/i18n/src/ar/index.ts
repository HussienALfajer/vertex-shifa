import { clinic } from './clinic.js';
import { common } from './common.js';
import { platformConsole } from './console.js';
import { errors } from './errors.js';

/** The Arabic catalog, one namespace per file. */
export const ar = { common, clinic, console: platformConsole, errors };

export type Catalog = typeof ar;
