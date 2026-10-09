import type { TestProject } from 'vitest/node';
import { createTestDatabase } from '../src/testing.js';

declare module 'vitest' {
  export interface ProvidedContext {
    ownerUrl: string;
    appUrl: string;
    jobsUrl: string;
  }
}

/** A fresh migrated database for this run, its URLs handed to the tests, dropped afterwards. */
export default async function setup(project: TestProject) {
  const database = await createTestDatabase();
  project.provide('ownerUrl', database.ownerUrl);
  project.provide('appUrl', database.appUrl);
  project.provide('jobsUrl', database.jobsUrl);
  return database.drop;
}
