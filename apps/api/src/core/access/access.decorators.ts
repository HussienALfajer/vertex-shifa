/**
 * What each route declares, read by `AccessGuard` and checked by the architecture test (ADR 0005,
 * ADR 0013, ADR 0020): exactly one access decorator and exactly one entitlement decorator, on the
 * handler or on its controller (the handler's wins).
 */

/** Who may call the route. Permissions are checked against the session's role (S02). */
export type Access =
  | { kind: 'public' }
  | { kind: 'patient' }
  | { kind: 'staff'; permission: string }
  | { kind: 'console'; permission: string };

/** The commercial feature the tenant needs (S05), or none for routes outside any package. */
export type Entitlement = { kind: 'feature'; feature: string } | { kind: 'none' };

export const ACCESS = Symbol('Access');
export const ENTITLEMENT = Symbol('Entitlement');

function declare(key: symbol, value: Access | Entitlement): ClassDecorator & MethodDecorator {
  return ((target: object, property?: string | symbol, descriptor?: PropertyDescriptor) => {
    const holder: object = descriptor?.value ?? target;
    if (Reflect.hasOwnMetadata(key, holder)) {
      const name = property === undefined ? (target as { name: string }).name : String(property);
      throw new Error(`${name} declares its ${key.description?.toLowerCase()} twice`);
    }
    Reflect.defineMetadata(key, value, holder);
  }) as ClassDecorator & MethodDecorator;
}

/** Anyone, signed in or not. */
export const Public = () => declare(ACCESS, { kind: 'public' });

/** A signed-in patient, through the patient app. */
export const PatientRoute = () => declare(ACCESS, { kind: 'patient' });

/** Clinic staff whose role in the session's tenant grants `permission`. */
export const StaffRoute = (permission: string) => declare(ACCESS, { kind: 'staff', permission });

/** Platform staff holding `permission`; the route lives under `/api/console/`. */
export const ConsoleRoute = (permission: string) =>
  declare(ACCESS, { kind: 'console', permission });

/** The tenant's contract must include `feature`. */
export const RequiresFeature = (feature: string) =>
  declare(ENTITLEMENT, { kind: 'feature', feature });

/** The route belongs to no commercial feature (health check, sign-in, console). */
export const NoFeature = () => declare(ENTITLEMENT, { kind: 'none' });
