import { audit } from './audit.js';
import { clinic } from './clinic.js';
import { common } from './common.js';
import { platformConsole } from './console.js';
import { errors } from './errors.js';
import { messaging } from './messaging.js';
import { patient } from './patient.js';
import { site } from './site.js';

/** The Arabic catalog, one namespace per file. */
export const ar = {
  common,
  audit,
  clinic,
  console: platformConsole,
  site,
  patient,
  errors,
  messaging,
};

export type Catalog = typeof ar;
