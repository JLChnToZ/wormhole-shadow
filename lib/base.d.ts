import { PrimitiveTypes } from './helper';
/**
 * Shadowed object reference to an object at remote.
 * To get the actual value, you need to `await` the (sub-)properties and/or returned/constructed value.
 */
export declare type Shadow<T> = Function & (T extends PromiseLike<any> ? unknown : PromiseLike<T>) & (T extends (...args: infer A) => infer R ? (...args: A) => Shadow<R> : unknown) & (T extends new (...args: infer A) => infer R ? new (...args: A) => Shadow<R> : unknown) & {
    [K in keyof T]: Shadow<T[K]>;
};
export interface PackedTypeBase<T extends string = string> {
    type: T;
}
export interface PackedToken extends PackedTypeBase<'solid' | 'shadow'> {
    key: number;
}
export interface PackedSymbol extends PackedTypeBase<'symbol'> {
    key: number | string;
}
export interface PackedValue extends PackedTypeBase<'value'> {
    value: any;
}
export interface PackedError extends PackedTypeBase<'error'> {
    name?: string;
    message?: string;
    stack?: string;
}
export declare type PackedTypes = PrimitiveTypes | PackedToken | PackedSymbol | PackedValue | PackedError;
/** Message type. */
export declare const enum MessageTypes {
    prepare = 0,
    assign = 1,
    delete = 2,
    apply = 3,
    construct = 4,
    resolve = 5,
    success = 6,
    failed = 7
}
/** A message send between local and remote. */
export interface Message {
    type: MessageTypes;
    token?: number;
    from?: number;
    into?: number;
    thisArg?: any;
    args?: any[];
    key?: string | number;
    isSymbol?: boolean;
    value?: any;
    reason?: any;
}
/**
 * Wormhole remote handler automates object manuipation between
 * local and remote.
 */
export interface IWormHoleHandler {
    /** Aquires an unique unused token. */
    aquireToken(): number;
    /**
     * Get / register a token of an object for use in remote referencing.
     * @param obj The object which needs to register a token.
     * @param token The token should be assigned if it is not yet registered.
     */
    registerToken(obj: object, token?: number): number;
    /**
     * Resolves a object (clone from remote) to local.
     * @param token The token points to the object requested.
     * @param shadowed Should a wrapped shadow object to be returned instead of resolved object.
     */
    resolveRemote<T>(token: number, shadowed: true): Shadow<T>;
    resolveRemote<T>(token: number, shadowed?: false): PromiseLike<T>;
    resolveRemote<T>(token: number, shadowed?: boolean): PromiseLike<T> | Shadow<T>;
    /**
     * Converts a symbol to token that can be remotely referenced.
     * @param sym The symbol needs to be converted.
     */
    fromSymbol(sym: symbol): string | number;
    /**
     * Converts a token references an unique symbol back to symbol.
     * @param id The token references an unique symbol.
     */
    toSymbol(id: string | number): symbol;
    /**
     * Sets an wrapped object "solid"
     * (It will be resolved to its normal form in remote before applying any action with it).
     * @param wrappedObj The object should be marked.
     */
    setSolid(wrappedObj: object): void;
    /**
     * Check if an object is marked "solid".
     * @param wrappedObj The object to be checked.
     */
    isSolid(wrappedObj: object): boolean;
    /**
     * Packs a single value to a form that can be passed to remote if applicable.
     * @param value The value that have to check and converted.
     * @param clone Should the object enforced to be cloneed instead of pass as token.
     */
    pack(value: any, clone?: boolean): PackedTypes;
    /**
     * Unpacks a single value back to original / shadowed form
     * from remote and ready to use in local.
     * @param value The value that have to check and converted.
     */
    unpack(value: PackedTypes): any;
    /**
     * Sends data to the remote.
     * @param m The message object that contains instruction / data / response to the remote.
     */
    send(m: Message): void;
    /**
     * Sends data mixed with a new token to the remote,
     * and waits for remote responses.
     * @param m The message object that contains instruction / data to the remote.
     */
    sendAndWait<T>(m: Message): PromiseLike<T>;
    /**
     * Registers callback for dispose event.
     * @param callback Callback when disposed.
     */
    onDispose(callback: () => void): void;
}
/** Default implementation of wormhole remote handler. */
export declare abstract class WormHoleHandler implements IWormHoleHandler {
    private resolvers;
    private solidObjects;
    private disposableCallbacks;
    private key2Obj;
    private obj2Key;
    private key2Sym;
    private sym2Key;
    registerToken(obj: object, token?: number): number;
    resolveRemote<T>(token: number, shadowed: true): Shadow<T>;
    resolveRemote<T>(token: number, shadowed?: false): PromiseLike<T>;
    resolveRemote<T>(token: number, shadowed?: boolean): PromiseLike<T> | Shadow<T>;
    private resolveLocal;
    private storeLocal;
    setSolid(obj: object): void;
    isSolid(obj: object): boolean;
    abstract aquireToken(): number;
    fromSymbol(sym: symbol): string | number;
    toSymbol(key: number | string): symbol;
    pack(value: unknown, clone?: boolean): PackedTypes;
    unpack(value: PackedTypes): any;
    private unpackAll;
    abstract send(data: Message): void;
    sendAndWait<T>(data: Message): Promise<T>;
    private resolveKey;
    private popResolver;
    protected onReceive(data: Message): Promise<void>;
    onDispose(callback: () => void): void;
    protected dispose(): void;
}
/**
 * Creates a "solid" object that will deeply clones to remote / instructs remote to resolves as value
 * before further actions.
 * @param source The source object need to transform.
 * If a shadow object is provided, it creates a identical clone which have same reference undely;
 * if a plain object is provided, it creates a shallow clone of the source;
 * other objects will be returned as-is and no actions are taken.
 */
export declare function solid<T>(source: T): T;
/**
 * Create a shadow object with custom handler implementation provided.
 * @param handler Instance of custom handler implementation.
 * @param token The token references to the corresponding remote object.
 */
export declare function createShadow<T>(handler: IWormHoleHandler, token: number): Shadow<T>;
//# sourceMappingURL=base.d.ts.map