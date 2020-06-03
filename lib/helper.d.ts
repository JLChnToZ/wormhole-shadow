export declare type TypeOf<T extends string> = T extends 'undefined' ? undefined : T extends 'boolean' ? boolean : T extends 'number' ? number : T extends 'bigint' ? bigint : T extends 'string' ? string : T extends 'symbol' ? symbol : T extends 'object' ? object | null : T extends 'function' ? Function : never;
export declare type PrimitiveTypes = undefined | null | boolean | number | bigint | string;
export declare function ensureType<T>(target: unknown, type: T): target is (T extends new (...args: any) => any ? InstanceType<T> : T extends string ? TypeOf<T> : unknown);
export declare function isReferenceType(value: unknown): value is object;
//# sourceMappingURL=helper.d.ts.map