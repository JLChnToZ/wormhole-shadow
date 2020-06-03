"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isReferenceType = exports.ensureType = void 0;
function ensureType(target, type) {
    switch (typeof type) {
        case 'function':
            return target instanceof type;
        case 'string':
            return typeof target === type;
        default:
            return false;
    }
}
exports.ensureType = ensureType;
function isReferenceType(value) {
    return value && (typeof value === 'object' || typeof value === 'function');
}
exports.isReferenceType = isReferenceType;
//# sourceMappingURL=helper.js.map