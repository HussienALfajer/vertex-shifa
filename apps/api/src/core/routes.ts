import { type INestApplication, RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  MODULE_PATH,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants.js';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum.js';
import { CLASS_SERIALIZER_OPTIONS } from '@nestjs/common/serializer/class-serializer.constants.js';
import { ModulesContainer } from '@nestjs/core';
import { ACCESS, type Access, ENTITLEMENT, type Entitlement } from './access/access.decorators.js';

export const API_PREFIX = 'api';

/** One HTTP route of the application with what it declares. */
export type Route = {
  /** `Controller.handler`, for messages. */
  name: string;
  method: string;
  /** Full path with Nest parameters: `/api/appointments/:id`. */
  path: string;
  access: Access | undefined;
  entitlement: Entitlement | undefined;
  /** From `@SerializeOptions({ schema })`: what the route answers. */
  responseSchema: unknown;
  /** Takes `@Res()` or `@Next()`, which answer outside the response serializer. */
  rawResponse: boolean;
};

function paths(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return [typeof value === 'string' ? value : '/'];
}

function join(...parts: string[]): string {
  const path = parts
    .flatMap((part) => part.split('/'))
    .filter(Boolean)
    .join('/');
  return `/${path}`;
}

/** Method names of a prototype and its ancestors, as Nest's `MetadataScanner.getAllMethodNames`. */
function methodNames(prototype: object): string[] {
  const names = new Set<string>();
  for (
    let current: object | null = prototype;
    current && current !== Object.prototype;
    current = Reflect.getPrototypeOf(current)
  ) {
    for (const property of Object.getOwnPropertyNames(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, property);
      if (property === 'constructor' || typeof descriptor?.value !== 'function') continue;
      names.add(property);
    }
  }
  return [...names];
}

/** The handler's own metadata, else its controller's (as `Reflector.getAllAndOverride` reads). */
function declared<T>(key: unknown, handler: object, controller: object): T | undefined {
  return Reflect.getMetadata(key, handler) ?? Reflect.getMetadata(key, controller);
}

/**
 * Every route the application serves, read from Nest's metadata. Used by the architecture test
 * and to build the OpenAPI document.
 */
export function listRoutes(app: INestApplication): Route[] {
  const routes: Route[] = [];
  const modules = app.get(ModulesContainer);
  for (const module of modules.values()) {
    // A `RouterModule` path, read as Nest's `RoutesResolver` does.
    const modulePath: string =
      Reflect.getMetadata(MODULE_PATH + modules.applicationId, module.metatype) ??
      Reflect.getMetadata(MODULE_PATH, module.metatype) ??
      '';
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as (new (...args: never[]) => object) | null;
      if (!controller) continue;
      const prototype = controller.prototype as Record<string, unknown>;
      for (const property of methodNames(prototype)) {
        const handler = prototype[property] as object;
        const method: RequestMethod | undefined = Reflect.getMetadata(METHOD_METADATA, handler);
        if (method === undefined) continue;
        const options = declared<{ schema?: unknown }>(
          CLASS_SERIALIZER_OPTIONS,
          handler,
          controller,
        );
        const params: Record<string, unknown> =
          Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, property) ?? {};
        const rawResponse = Object.keys(params).some((key) => {
          const type = Number(key.split(':')[0]);
          return type === RouteParamtypes.RESPONSE || type === RouteParamtypes.NEXT;
        });
        for (const base of paths(Reflect.getMetadata(PATH_METADATA, controller))) {
          for (const own of paths(Reflect.getMetadata(PATH_METADATA, handler))) {
            routes.push({
              name: `${controller.name}.${property}`,
              method: RequestMethod[method],
              path: join(API_PREFIX, modulePath, base, own),
              access: declared(ACCESS, handler, controller),
              entitlement: declared(ENTITLEMENT, handler, controller),
              responseSchema: options?.schema,
              rawResponse,
            });
          }
        }
      }
    }
  }
  return routes;
}
