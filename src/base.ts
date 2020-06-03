import { PrimitiveTypes, isReferenceType, ensureType, TypeOf } from './helper';

/**
 * Shadowed object reference to an object at remote.
 * To get the actual value, you need to `await` the (sub-)properties and/or returned/constructed value.
 */
export type Shadow<T> = Function &
  (T extends PromiseLike<any> ? unknown : PromiseLike<T>) &
  (T extends (...args: infer A) => infer R ? (...args: A) => Shadow<R> : unknown) &
  (T extends new(...args: infer A) => infer R ? new(...args: A) => Shadow<R> : unknown) &
  { [K in keyof T]: Shadow<T[K]> };

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

export type PackedTypes = PrimitiveTypes | PackedToken | PackedSymbol | PackedValue | PackedError;

/** Message type. */
export const enum MessageTypes {
  prepare,
  assign,
  delete,
  apply,
  construct,
  resolve,
  success,
  failed,
}

interface Resolver {
  resolve(value?: any): void;
  reject(reason?: any): void;
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

const globalSolidObjects = new WeakSet();

class WrapperHandler<T> implements ProxyHandler<Shadow<T>> {
  private static cache = new WeakMap<any, WrapperHandler<any>>();
  private static baseTypeMixin: PromiseLike<any> & ThisType<any> = {
    then(onfulfilled, onrejected) {
      return WrapperHandler.get(this)?.resolve().then(onfulfilled, onrejected) ||
        Promise.reject(new TypeError('Cannot sync current object.'));
    },
  };

  private resolvePromise?: PromiseLike<T>;

  public static isHandler(obj: unknown): obj is Shadow<unknown> {
    return isReferenceType(obj) && this.cache.has(obj);
  }

  public static get<T>(wrappedObj: T) {
    if (isReferenceType(wrappedObj))
      return this.cache.get(wrappedObj) as WrapperHandler<T extends Shadow<infer R> ? R : unknown> | undefined;
  }

  public static makeSolid<T>(source: T) {
    if (!isReferenceType(source))
      return source;
    if (!this.isHandler(source)) {
      const clone = Object.assign(Object.create(null) as unknown, source);
      globalSolidObjects.add(clone);
      return clone;
    }
    const handler = this.get<T>(source);
    if (!handler || handler.handler.isSolid(source))
      return source;
    const proxy = handler.resolve(true);
    handler.handler.setSolid(proxy);
    return proxy as T;
  }

  public constructor(
    public handler: IWormHoleHandler,
    public id: number,
  ) { }

  public get(target: Shadow<T>, key: PropertyKey, receiver: any) {
    if (Reflect.has(target, key))
      return Reflect.get(target, key, receiver);
    let isSymbol = false;
    const into = this.handler.aquireToken();
    if (typeof key === 'symbol') {
      key = this.handler.fromSymbol(key);
      isSymbol = true;
    }
    this.handler.send({
      type: MessageTypes.prepare,
      from: this.id,
      key,
      isSymbol,
      into,
    });
    return this.handler.resolveRemote(into, true);
  }

  public set(target: Shadow<T>, key: PropertyKey, value: any) {
    if (Reflect.has(target, key)) return false;
    let isSymbol = false;
    if (typeof key === 'symbol') {
      key = this.handler.fromSymbol(key);
      isSymbol = true;
    }
    this.handler.send({
      type: MessageTypes.assign,
      from: this.id,
      key,
      isSymbol,
      value: this.handler.pack(value),
    });
    return true;
  }

  public deleteProperty(target: Shadow<T>, key: PropertyKey) {
    if (Reflect.has(target, key)) return false;
    let isSymbol = false;
    if (typeof key === 'symbol') {
      key = this.handler.fromSymbol(key);
      isSymbol = true;
    }
    this.handler.send({
      type: MessageTypes.delete,
      from: this.id,
      key,
      isSymbol,
    });
    return true;
  }

  public apply(_: Shadow<T>, thisArg: any, args: any[]) {
    const into = this.handler.aquireToken();
    this.handler.send({
      type: MessageTypes.apply,
      from: this.id,
      thisArg: this.handler.pack(thisArg),
      args: args.map(arg => this.handler.pack(arg)),
      into,
    });
    return this.handler.resolveRemote(into, true);
  }

  public construct(_: Shadow<T>, args: any[]) {
    const into = this.handler.aquireToken();
    this.handler.send({
      type: MessageTypes.construct,
      from: this.id,
      args: args.map(arg => this.handler.pack(arg)),
      into,
    });
    return this.handler.resolveRemote(into, true);
  }

  public getPrototypeOf() {
    return null;
  }

  public setPrototypeOf() {
    return false;
  }

  public isExtensible() {
    return true;
  }

  public preventExtensions() {
    return false;
  }

  public defineProperty() {
    return false;
  }

  public resolve(shadow: true): Shadow<T>;
  public resolve(): PromiseLike<T>;
  public resolve(shadow?: boolean) {
    if (shadow) {
      const { proxy, revoke } = Proxy.revocable<any>(
        Object.assign(function () { }, WrapperHandler.baseTypeMixin),
        this,
      );
      WrapperHandler.cache.set(proxy, this);
      this.handler.onDispose(revoke);
      return proxy;
    }
    if (!this.resolvePromise)
      this.resolvePromise = this.handler.resolveRemote<T>(this.id);
    return this.resolvePromise;
  }
}

/** Default implementation of wormhole remote handler. */
export abstract class WormHoleHandler implements IWormHoleHandler {
  private resolvers = new Map<number, Resolver>();
  private solidObjects = new WeakSet<object>();
  private disposableCallbacks = new Set<() => void>();
  private key2Obj = new Map<number, Promise<any>>();
  private obj2Key = new WeakMap<object, number>();
  private key2Sym = new Map<number, symbol>();
  private sym2Key = new Map<symbol, number>();

  public registerToken(obj: object, token?: number) {
    const handler = WrapperHandler.get(obj);
    if (handler) return handler.id;
    let id = this.obj2Key.get(obj);
    if (id != null) return id;
    id = token == null ? this.aquireToken() : token;
    this.storeLocal(id, obj);
    return id;
  }

  public resolveRemote<T>(token: number, shadowed: true): Shadow<T>;
  public resolveRemote<T>(token: number, shadowed?: false): PromiseLike<T>;
  public resolveRemote<T>(token: number, shadowed?: boolean): PromiseLike<T> | Shadow<T>;
  public resolveRemote(token: number, shadowed?: boolean): PromiseLike<any> | Shadow<any> {
    if (shadowed) return createShadow(this, token);
    let promise: Promise<any> | undefined = this.key2Obj.get(token);
    if (!promise) {
      promise = this.sendAndWait({
        type: MessageTypes.resolve,
        from: token,
      });
      this.key2Obj.set(token, promise);
    }
    return promise;
  }

  private resolveLocal<T extends new (...args: any) => any>(id: number | undefined, type: T): Promise<InstanceType<T>>;
  private resolveLocal<T extends string>(id: number | undefined, type: T): Promise<TypeOf<T>>;
  private resolveLocal(id: number | undefined, silent: true): Promise<object | undefined>;
  private resolveLocal(id: number | undefined): Promise<object>;
  private async resolveLocal(id: number | undefined, type?: boolean | string | NewableFunction) {
    if (id == null || !this.key2Obj.has(id)) {
      if (!type) return;
      throw new ReferenceError('Invalid Id');
    }
    const result = await this.key2Obj.get(id);
    if (!ensureType(result, type))
      throw new TypeError('Invalid type');
    return isReferenceType(result) ? result : new Object(result);
  }

  private storeLocal(id: number | undefined, obj: object) {
    if (id == null)
      throw new ReferenceError('Invalid Id');
    this.key2Obj.set(id, Promise.resolve(obj));
    if (isReferenceType(obj))
      this.obj2Key.set(obj, id);
  }

  public setSolid(obj: object) {
    if (isReferenceType(obj)) this.solidObjects.add(obj);
  }

  public isSolid(obj: object) {
    return isReferenceType(obj) && (this.solidObjects.has(obj) || globalSolidObjects.has(obj));
  }

  public abstract aquireToken(): number;

  public fromSymbol(sym: symbol) {
    let key: number | string | undefined = Symbol.keyFor(sym);
    if (key != null) return key;
    key = this.sym2Key.get(sym);
    if (key != null) return key;
    key = this.aquireToken();
    this.key2Sym.set(key, sym);
    this.sym2Key.set(sym, key);
    return key;
  }

  public toSymbol(key: number | string) {
    if (typeof key === 'string')
      return Symbol.for(key);
    let sym = this.key2Sym.get(key);
    if (sym) return sym;
    sym = Symbol(key);
    this.key2Sym.set(key, sym);
    this.sym2Key.set(sym, key);
    return sym;
  }

  public pack(value: unknown, clone?: boolean): PackedTypes {
    switch (typeof value) {
      case 'symbol':
        return {
          type: 'symbol',
          key: this.fromSymbol(value),
        };
      case 'object':
      case 'function':
        if (!value) break;
        if (value instanceof Error)
          return {
            type: 'error',
            name: value.name,
            message: value.message,
            stack: value.stack,
          };
        if (clone || (this.isSolid(value) && !WrapperHandler.isHandler(value)))
          return { type: 'value', value };
        return {
          type: this.isSolid(value) ? 'solid' : 'shadow',
          key: this.registerToken(value),
        };
    }
    return value as PrimitiveTypes;
  }

  public unpack(value: PackedTypes): any {
    if (isReferenceType(value))
      switch (value.type) {
        case 'symbol':
          return this.toSymbol(value.key);
        case 'value':
          return value.value;
        case 'solid':
        case 'shadow':
          return this.resolveRemote(value.key, value.type === 'shadow');
        case 'error':
          return Object.assign(new Error(value.message), {
            name: value.name,
            stack: value.stack,
          });
      }
    return value;
  }

  private async unpackAll(...src: any[]) {
    src = src.map(this.unpack, this);
    const wait: any[] = [];
    for (let i = 0; i < src.length; i++)
      if (!WrapperHandler.isHandler(src[i]))
        wait[i] = src[i];
    const result = await Promise.all(wait);
    for (let i = 0; i < src.length; i++)
      if (wait[i] != null)
        src[i] = result[i];
    return src;
  }

  public abstract send(data: Message): void;

  public sendAndWait<T>(data: Message) {
    return new Promise<T>((resolve, reject) => {
      const token = this.aquireToken();
      data.token = token;
      this.resolvers.set(token, { resolve, reject });
      this.send(data);
    });
  }

  private resolveKey(data: Message) {
    if (data.key == null)
      throw new TypeError('Key is not defined.');
    return data.isSymbol ? this.toSymbol(data.key) : data.key;
  }

  private popResolver(token: number | undefined) {
    if (token == null || !this.resolvers.has(token))
      return;
    const resolver = this.resolvers.get(token);
    this.resolvers.delete(token);
    return resolver;
  }

  protected async onReceive(data: Message) {
    try {
      let value: any;
      let clone = false;
      switch (data.type) {
        case MessageTypes.prepare: {
          const from = await this.resolveLocal(data.from);
          value = Reflect.get(from, this.resolveKey(data));
          break;
        }
        case MessageTypes.assign: {
          const from = await this.resolveLocal(data.from);
          [value] = await this.unpackAll(data.value);
          Reflect.set(from, this.resolveKey(data), value);
          break;
        }
        case MessageTypes.delete: {
          const from = await this.resolveLocal(data.from);
          Reflect.deleteProperty(from, this.resolveKey(data));
          break;
        }
        case MessageTypes.apply: {
          const from = await this.resolveLocal(data.from, 'function');
          if (data.args == null)
            throw new TypeError('Arguments are not defined.');
          const [thisArg, ...args] = await this.unpackAll(
            data.thisArg, ...data.args
          );
          value = Reflect.apply(from, thisArg, args);
          break;
        }
        case MessageTypes.construct: {
          const from = await this.resolveLocal(data.from, Function);
          if (data.args == null)
            throw new TypeError('Arguments are not defined.');
          const args = await this.unpackAll(...data.args);
          value = Reflect.construct(from, args);
          break;
        }
        case MessageTypes.resolve: {
          value = await this.resolveLocal(data.from);
          clone = true;
          break;
        }
        case MessageTypes.success: {
          this.popResolver(data.token)?.resolve(this.unpack(data.value));
          break;
        }
        case MessageTypes.failed: {
          this.popResolver(data.token)?.reject(this.unpack(data.reason));
          break;
        }
      }
      if (data.into != null)
        this.storeLocal(data.into, value);
      if (data.token != null)
        this.send({
          type: MessageTypes.success,
          token: data.token,
          value: this.pack(value, clone),
        });
    } catch (e) {
      if (data.token != null)
        this.send({
          type: MessageTypes.failed,
          token: data.token,
          reason: this.pack(e),
        });
    }
  }

  public onDispose(callback: () => void) {
    this.disposableCallbacks.add(callback);
  }

  protected dispose() {
    for (const dispose of this.disposableCallbacks.values())
      try { dispose(); } catch { }
    for (const prop of Object.getOwnPropertyNames(this))
      try { delete (this as any)[prop]; } catch { }
  }
}

/**
 * Creates a "solid" object that will deeply clones to remote / instructs remote to resolves as value
 * before further actions.
 * @param source The source object need to transform.
 * If a shadow object is provided, it creates a identical clone which have same reference undely;
 * if a plain object is provided, it creates a shallow clone of the source;
 * other objects will be returned as-is and no actions are taken.
 */
export function solid<T>(source: T) {
  return WrapperHandler.makeSolid(source);
}

/**
 * Create a shadow object with custom handler implementation provided.
 * @param handler Instance of custom handler implementation.
 * @param token The token references to the corresponding remote object.
 */
export function createShadow<T>(handler: IWormHoleHandler, token: number) {
  return new WrapperHandler<T>(handler, token).resolve(true);
}
