import { errorResponseSchema } from '@vertex-shifa/contracts';
import { z } from 'zod';
import type { Route } from '../routes.js';

const COMPONENTS = '#/components/schemas/';

/** The stable `.meta({ id })` of a contract schema (ADR 0020), or undefined. */
export function schemaId(schema: unknown): string | undefined {
  return schema instanceof z.ZodType ? z.globalRegistry.get(schema)?.id : undefined;
}

function reference(schema: unknown, route: Route): { $ref: string } {
  const id = schemaId(schema);
  if (!id) throw new Error(`${route.name} answers with a schema that has no .meta({ id })`);
  return { $ref: `${COMPONENTS}${id}` };
}

/** Every contract schema with an id, as OpenAPI components that refer to each other by id. */
function components() {
  const { schemas } = z.toJSONSchema(z.globalRegistry, { uri: (id) => `${COMPONENTS}${id}` });
  return Object.fromEntries(
    Object.entries(schemas)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, { $schema: _, $id: __, ...schema }]) => [id, schema]),
  );
}

/**
 * The OpenAPI 3.1 document of the API, generated from its routes and the Zod contracts they
 * declare (ADR 0002). `apps/api/openapi.json` holds the committed copy; a test fails when it drifts.
 */
export function buildOpenApiDocument(routes: Route[]) {
  const paths: Record<string, Record<string, unknown>> = {};
  const sorted = [...routes].sort((a, b) => a.path.localeCompare(b.path));
  for (const route of sorted) {
    const path = route.path.replace(/:(\w+)/g, '{$1}');
    paths[path] ??= {};
    paths[path][route.method.toLowerCase()] = {
      operationId: route.name,
      responses: {
        '200': {
          description: 'OK',
          content: { 'application/json': { schema: reference(route.responseSchema, route) } },
        },
        default: {
          description: 'Error',
          content: { 'application/json': { schema: reference(errorResponseSchema, route) } },
        },
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: { title: 'Vertex Shifa API', version: '0.0.0' },
    paths,
    components: { schemas: components() },
  };
}
