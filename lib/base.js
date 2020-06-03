"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createShadow = exports.solid = exports.WormHoleHandler = void 0;
const helper_1 = require("./helper");
const globalSolidObjects = new WeakSet();
let WrapperHandler = /** @class */ (() => {
    class WrapperHandler {
        constructor(handler, id) {
            this.handler = handler;
            this.id = id;
        }
        static isHandler(obj) {
            return helper_1.isReferenceType(obj) && this.cache.has(obj);
        }
        static get(wrappedObj) {
            if (helper_1.isReferenceType(wrappedObj))
                return this.cache.get(wrappedObj);
        }
        static makeSolid(source) {
            if (!helper_1.isReferenceType(source))
                return source;
            if (!this.isHandler(source)) {
                const clone = Object.assign(Object.create(null), source);
                globalSolidObjects.add(clone);
                return clone;
            }
            const handler = this.get(source);
            if (!handler || handler.handler.isSolid(source))
                return source;
            const proxy = handler.resolve(true);
            handler.handler.setSolid(proxy);
            return proxy;
        }
        get(target, key, receiver) {
            if (Reflect.has(target, key))
                return Reflect.get(target, key, receiver);
            let isSymbol = false;
            const into = this.handler.aquireToken();
            if (typeof key === 'symbol') {
                key = this.handler.fromSymbol(key);
                isSymbol = true;
            }
            this.handler.send({
                type: 0 /* prepare */,
                from: this.id,
                key,
                isSymbol,
                into,
            });
            return this.handler.resolveRemote(into, true);
        }
        set(target, key, value) {
            if (Reflect.has(target, key))
                return false;
            let isSymbol = false;
            if (typeof key === 'symbol') {
                key = this.handler.fromSymbol(key);
                isSymbol = true;
            }
            this.handler.send({
                type: 1 /* assign */,
                from: this.id,
                key,
                isSymbol,
                value: this.handler.pack(value),
            });
            return true;
        }
        deleteProperty(target, key) {
            if (Reflect.has(target, key))
                return false;
            let isSymbol = false;
            if (typeof key === 'symbol') {
                key = this.handler.fromSymbol(key);
                isSymbol = true;
            }
            this.handler.send({
                type: 2 /* delete */,
                from: this.id,
                key,
                isSymbol,
            });
            return true;
        }
        apply(_, thisArg, args) {
            const into = this.handler.aquireToken();
            this.handler.send({
                type: 3 /* apply */,
                from: this.id,
                thisArg: this.handler.pack(thisArg),
                args: args.map(arg => this.handler.pack(arg)),
                into,
            });
            return this.handler.resolveRemote(into, true);
        }
        construct(_, args) {
            const into = this.handler.aquireToken();
            this.handler.send({
                type: 4 /* construct */,
                from: this.id,
                args: args.map(arg => this.handler.pack(arg)),
                into,
            });
            return this.handler.resolveRemote(into, true);
        }
        getPrototypeOf() {
            return null;
        }
        setPrototypeOf() {
            return false;
        }
        isExtensible() {
            return true;
        }
        preventExtensions() {
            return false;
        }
        defineProperty() {
            return false;
        }
        resolve(shadow) {
            if (shadow) {
                const { proxy, revoke } = Proxy.revocable(Object.assign(function () { }, WrapperHandler.baseTypeMixin), this);
                WrapperHandler.cache.set(proxy, this);
                this.handler.onDispose(revoke);
                return proxy;
            }
            if (!this.resolvePromise)
                this.resolvePromise = this.handler.resolveRemote(this.id);
            return this.resolvePromise;
        }
    }
    WrapperHandler.cache = new WeakMap();
    WrapperHandler.baseTypeMixin = {
        then(onfulfilled, onrejected) {
            var _a;
            return ((_a = WrapperHandler.get(this)) === null || _a === void 0 ? void 0 : _a.resolve().then(onfulfilled, onrejected)) ||
                Promise.reject(new TypeError('Cannot sync current object.'));
        },
    };
    return WrapperHandler;
})();
/** Default implementation of wormhole remote handler. */
class WormHoleHandler {
    constructor() {
        this.resolvers = new Map();
        this.solidObjects = new WeakSet();
        this.disposableCallbacks = new Set();
        this.key2Obj = new Map();
        this.obj2Key = new WeakMap();
        this.key2Sym = new Map();
        this.sym2Key = new Map();
    }
    registerToken(obj, token) {
        const handler = WrapperHandler.get(obj);
        if (handler)
            return handler.id;
        let id = this.obj2Key.get(obj);
        if (id != null)
            return id;
        id = token == null ? this.aquireToken() : token;
        this.storeLocal(id, obj);
        return id;
    }
    resolveRemote(token, shadowed) {
        if (shadowed)
            return createShadow(this, token);
        let promise = this.key2Obj.get(token);
        if (!promise) {
            promise = this.sendAndWait({
                type: 5 /* resolve */,
                from: token,
            });
            this.key2Obj.set(token, promise);
        }
        return promise;
    }
    async resolveLocal(id, type) {
        if (id == null || !this.key2Obj.has(id)) {
            if (!type)
                return;
            throw new ReferenceError('Invalid Id');
        }
        const result = await this.key2Obj.get(id);
        if (!helper_1.ensureType(result, type))
            throw new TypeError('Invalid type');
        return helper_1.isReferenceType(result) ? result : new Object(result);
    }
    storeLocal(id, obj) {
        if (id == null)
            throw new ReferenceError('Invalid Id');
        this.key2Obj.set(id, Promise.resolve(obj));
        if (helper_1.isReferenceType(obj))
            this.obj2Key.set(obj, id);
    }
    setSolid(obj) {
        if (helper_1.isReferenceType(obj))
            this.solidObjects.add(obj);
    }
    isSolid(obj) {
        return helper_1.isReferenceType(obj) && (this.solidObjects.has(obj) || globalSolidObjects.has(obj));
    }
    fromSymbol(sym) {
        let key = Symbol.keyFor(sym);
        if (key != null)
            return key;
        key = this.sym2Key.get(sym);
        if (key != null)
            return key;
        key = this.aquireToken();
        this.key2Sym.set(key, sym);
        this.sym2Key.set(sym, key);
        return key;
    }
    toSymbol(key) {
        if (typeof key === 'string')
            return Symbol.for(key);
        let sym = this.key2Sym.get(key);
        if (sym)
            return sym;
        sym = Symbol(key);
        this.key2Sym.set(key, sym);
        this.sym2Key.set(sym, key);
        return sym;
    }
    pack(value, clone) {
        switch (typeof value) {
            case 'symbol':
                return {
                    type: 'symbol',
                    key: this.fromSymbol(value),
                };
            case 'object':
            case 'function':
                if (!value)
                    break;
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
        return value;
    }
    unpack(value) {
        if (helper_1.isReferenceType(value))
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
    async unpackAll(...src) {
        src = src.map(this.unpack, this);
        const wait = [];
        for (let i = 0; i < src.length; i++)
            if (!WrapperHandler.isHandler(src[i]))
                wait[i] = src[i];
        const result = await Promise.all(wait);
        for (let i = 0; i < src.length; i++)
            if (wait[i] != null)
                src[i] = result[i];
        return src;
    }
    sendAndWait(data) {
        return new Promise((resolve, reject) => {
            const token = this.aquireToken();
            data.token = token;
            this.resolvers.set(token, { resolve, reject });
            this.send(data);
        });
    }
    resolveKey(data) {
        if (data.key == null)
            throw new TypeError('Key is not defined.');
        return data.isSymbol ? this.toSymbol(data.key) : data.key;
    }
    popResolver(token) {
        if (token == null || !this.resolvers.has(token))
            return;
        const resolver = this.resolvers.get(token);
        this.resolvers.delete(token);
        return resolver;
    }
    async onReceive(data) {
        var _a, _b;
        try {
            let value;
            let clone = false;
            switch (data.type) {
                case 0 /* prepare */: {
                    const from = await this.resolveLocal(data.from);
                    value = Reflect.get(from, this.resolveKey(data));
                    break;
                }
                case 1 /* assign */: {
                    const from = await this.resolveLocal(data.from);
                    [value] = await this.unpackAll(data.value);
                    Reflect.set(from, this.resolveKey(data), value);
                    break;
                }
                case 2 /* delete */: {
                    const from = await this.resolveLocal(data.from);
                    Reflect.deleteProperty(from, this.resolveKey(data));
                    break;
                }
                case 3 /* apply */: {
                    const from = await this.resolveLocal(data.from, 'function');
                    if (data.args == null)
                        throw new TypeError('Arguments are not defined.');
                    const [thisArg, ...args] = await this.unpackAll(data.thisArg, ...data.args);
                    value = Reflect.apply(from, thisArg, args);
                    break;
                }
                case 4 /* construct */: {
                    const from = await this.resolveLocal(data.from, Function);
                    if (data.args == null)
                        throw new TypeError('Arguments are not defined.');
                    const args = await this.unpackAll(...data.args);
                    value = Reflect.construct(from, args);
                    break;
                }
                case 5 /* resolve */: {
                    value = await this.resolveLocal(data.from);
                    clone = true;
                    break;
                }
                case 6 /* success */: {
                    (_a = this.popResolver(data.token)) === null || _a === void 0 ? void 0 : _a.resolve(this.unpack(data.value));
                    break;
                }
                case 7 /* failed */: {
                    (_b = this.popResolver(data.token)) === null || _b === void 0 ? void 0 : _b.reject(this.unpack(data.reason));
                    break;
                }
            }
            if (data.into != null)
                this.storeLocal(data.into, value);
            if (data.token != null)
                this.send({
                    type: 6 /* success */,
                    token: data.token,
                    value: this.pack(value, clone),
                });
        }
        catch (e) {
            if (data.token != null)
                this.send({
                    type: 7 /* failed */,
                    token: data.token,
                    reason: this.pack(e),
                });
        }
    }
    onDispose(callback) {
        this.disposableCallbacks.add(callback);
    }
    dispose() {
        for (const dispose of this.disposableCallbacks.values())
            try {
                dispose();
            }
            catch (_a) { }
        for (const prop of Object.getOwnPropertyNames(this))
            try {
                delete this[prop];
            }
            catch (_b) { }
    }
}
exports.WormHoleHandler = WormHoleHandler;
/**
 * Creates a "solid" object that will deeply clones to remote / instructs remote to resolves as value
 * before further actions.
 * @param source The source object need to transform.
 * If a shadow object is provided, it creates a identical clone which have same reference undely;
 * if a plain object is provided, it creates a shallow clone of the source;
 * other objects will be returned as-is and no actions are taken.
 */
function solid(source) {
    return WrapperHandler.makeSolid(source);
}
exports.solid = solid;
/**
 * Create a shadow object with custom handler implementation provided.
 * @param handler Instance of custom handler implementation.
 * @param token The token references to the corresponding remote object.
 */
function createShadow(handler, token) {
    return new WrapperHandler(handler, token).resolve(true);
}
exports.createShadow = createShadow;
//# sourceMappingURL=base.js.map