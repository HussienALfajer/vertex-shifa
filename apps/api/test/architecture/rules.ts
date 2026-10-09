import { posix } from 'node:path';
import * as common from '@nestjs/common';
import { SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants.js';
import * as core from '@nestjs/core';
import ts from 'typescript';
import { schemaId } from '../../src/core/openapi/openapi.js';
import type { Route } from '../../src/core/routes.js';

/**
 * The rules ADR 0020 puts on the API's shape, as functions that return their violations, so the
 * architecture test can run them on the real application and prove each one on a broken example.
 */

export function routeViolations(routes: Route[]): string[] {
  const violations: string[] = [];
  for (const route of routes) {
    if (!route.access) {
      violations.push(
        `${route.name} declares no access (@Public, @PatientRoute, @StaffRoute or @ConsoleRoute)`,
      );
    }
    if (!route.entitlement) {
      violations.push(`${route.name} declares no entitlement (@RequiresFeature or @NoFeature)`);
    }
    const underConsole = route.path === '/api/console' || route.path.startsWith('/api/console/');
    if ((route.access?.kind === 'console') !== underConsole) {
      violations.push(`${route.name}: console routes, and only they, live under /api/console/`);
    }
    if (!schemaId(route.responseSchema)) {
      violations.push(
        `${route.name} declares no response schema with an id (@SerializeOptions({ schema }))`,
      );
    }
    if (route.rawResponse) {
      violations.push(`${route.name} takes @Res() or @Next(), which skip the response serializer`);
    }
  }
  return violations;
}

/**
 * Classes Nest constructs whose constructor takes a parameter without `@Inject(token)`: the build
 * emits no decorator metadata, so such a parameter would silently be `undefined`.
 */
export function injectionViolations(app: common.INestApplication): string[] {
  const classes = new Set<new (...args: never[]) => unknown>();
  for (const module of app.get(core.ModulesContainer).values()) {
    classes.add(module.metatype as new (...args: never[]) => unknown);
    for (const wrapper of [
      ...module.providers.values(),
      ...module.controllers.values(),
      ...module.injectables.values(),
      ...module.middlewares.values(),
    ]) {
      if (typeof wrapper.metatype === 'function' && wrapper.metatype.prototype) {
        classes.add(wrapper.metatype as new (...args: never[]) => unknown);
      }
    }
  }
  const nest = new Set<unknown>([...Object.values(common), ...Object.values(core)]);
  const violations: string[] = [];
  for (const type of classes) {
    // Nest's own classes are compiled with metadata or are Nest's exports (ModuleRef).
    if (nest.has(type) || Reflect.hasMetadata('design:paramtypes', type)) continue;
    const injected: unknown[] = Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, type) ?? [];
    if (type.length > injected.length) {
      violations.push(`${type.name} has constructor parameters without @Inject(token)`);
    }
  }
  return violations;
}

const LAYERS = ['platform', 'health', 'clinic'];

type Place =
  | { area: 'module'; layer: string; module: string }
  | { area: 'core' }
  | { area: 'other' };

function place(file: string): Place {
  const parts = file.split('/');
  if (parts[0] === 'core') return { area: 'core' };
  const [first, layer, module] = parts;
  if (first === 'modules' && layer && module && parts.length >= 4) {
    return { area: 'module', layer, module };
  }
  return { area: 'other' };
}

/**
 * Module boundaries in `src/` (ADR 0001, ADR 0020), from each file's imports. `files` maps a path
 * relative to `src/` (with `/`) to its source. A module lives in `modules/<layer>/<module>/`, reaches
 * another module only through its `index.ts`, and only in its own layer or one below
 * (clinic → health → platform); `core/` imports no module.
 */
export function boundaryViolations(files: Map<string, string>): string[] {
  const violations: string[] = [];
  for (const [file, source] of files) {
    const from = place(file);
    if (file.startsWith('modules/') && (from.area !== 'module' || !LAYERS.includes(from.layer))) {
      violations.push(`${file} is not in modules/<platform|health|clinic>/<module>/`);
      continue;
    }
    for (const { fileName } of ts.preProcessFile(source, true, true).importedFiles) {
      if (!fileName.startsWith('.')) continue;
      const target = posix.join(posix.dirname(file), fileName).replace(/\.js$/, '.ts');
      const to = place(target);
      if (to.area !== 'module') continue;
      if (from.area === 'core') {
        violations.push(`${file} imports ${target}: the core imports no module`);
        continue;
      }
      if (from.area !== 'module' || (from.layer === to.layer && from.module === to.module)) {
        continue;
      }
      if (target !== `modules/${to.layer}/${to.module}/index.ts`) {
        violations.push(`${file} imports ${target}: another module only through its index.ts`);
      }
      if (LAYERS.indexOf(to.layer) > LAYERS.indexOf(from.layer)) {
        violations.push(`${file} imports ${target}: the ${to.layer} layer is above ${from.layer}`);
      }
    }
  }
  return violations;
}
