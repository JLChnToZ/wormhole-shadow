"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.load = void 0;
const worker_threads_1 = require("worker_threads");
const base_1 = require("./base");
var base_2 = require("./base");
Object.defineProperty(exports, "solid", { enumerable: true, get: function () { return base_2.solid; } });
class WorkerThreadHandler extends base_1.WormHoleHandler {
    constructor(port, sharedCounter) {
        super();
        this.port = port;
        port
            .on('message', this.onReceive.bind(this))
            .on('close', this.dispose.bind(this));
        this.counter = new Uint32Array(sharedCounter);
    }
    send(data) {
        return this.port.postMessage(data);
    }
    aquireToken() {
        return ++this.counter[0];
    }
}
/**
 * Loads a module in a new thread.
 * @param path The path (relative to the helper module).
 */
function load(path) {
    const sharedCounter = new SharedArrayBuffer(4);
    return new WorkerThreadHandler(new worker_threads_1.Worker(__filename, {
        workerData: { path, sharedCounter, id: 0 },
    }), sharedCounter).resolveRemote(0, true);
}
exports.load = load;
if (!worker_threads_1.isMainThread && worker_threads_1.parentPort)
    // Defer 1 tick to let the module systems registers to allow require back.
    process.nextTick((p, d) => p.registerToken(require(d.path), d.id), new WorkerThreadHandler(worker_threads_1.parentPort, worker_threads_1.workerData.sharedCounter), worker_threads_1.workerData);
//# sourceMappingURL=worker-thread.js.map