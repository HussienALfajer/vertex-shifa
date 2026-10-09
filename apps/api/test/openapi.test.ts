import { expect, it } from 'vitest';
import { buildOpenApiDocument } from '../src/core/openapi/openapi.js';
import { listRoutes } from '../src/core/routes.js';
import { createTestApp } from './app.js';

// The committed document is what clients are generated from: a route or contract change that
// alters it fails here until the file is regenerated (apps/api/CLAUDE.md) and reviewed.
it('matches the committed openapi.json', async () => {
  const app = await createTestApp();
  const document = buildOpenApiDocument(listRoutes(app));
  await app.close();
  await expect(`${JSON.stringify(document, null, 2)}\n`).toMatchFileSnapshot('../openapi.json');
});
