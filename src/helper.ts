export type TypeOf<T extends string> =
  T extends 'undefined' ? undefined :
  T extends 'boolean' ? boolean :
  T extends 'number' ? number :
  T extends 'bigint' ? bigint :
  T extends 'string' ? string :
  T extends 'symbol' ? symbol :
  T extends 'object' ? object | null :
  T extends 'function' ? Function :
  never;

export type PrimitiveTypes = undefined | null | boolean | number | bigint | string;

export function ensureType<T>(
  target: unknown, type: T,
): target is (
  T extends new (...args: any) => any ? InstanceType<T> :
  T extends string ? TypeOf<T> :
  unknown
) {
  switch (typeof type) {
    case 'function':
      return target instanceof type;
    case 'string':
      return typeof target === type;
    default:
      return false;
  }
}

export function isReferenceType(value: unknown): value is object {
  return value && (typeof value === 'object' || typeof value === 'function');
}
