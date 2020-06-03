import {
  isMainThread,
  Worker,
  MessagePort,
  workerData,
  parentPort,
} from 'worker_threads';
import { WormHoleHandler, Message } from './base';
export { solid } from './base';

class WorkerThreadHandler extends WormHoleHandler {
  private counter: Uint32Array;

  public constructor(
    public port: MessagePort | Worker,
    sharedCounter: SharedArrayBuffer,
  ) {
    super();
    port
    .on('message', this.onReceive.bind(this))
    .on('close', this.dispose.bind(this));
    this.counter = new Uint32Array(sharedCounter);
  }

  public send(data: Message) {
    return this.port.postMessage(data);
  }

  public aquireToken() {
    return ++this.counter[0];
  }
}

/**
 * Loads a module in a new thread.
 * @param path The path (relative to the helper module).
 */
export function load<T>(path: string) {
  const sharedCounter = new SharedArrayBuffer(4);
  return new WorkerThreadHandler(new Worker(__filename, {
    workerData: { path, sharedCounter, id: 0 },
  }), sharedCounter).resolveRemote<T>(0, true);
}

if (!isMainThread && parentPort)
  // Defer 1 tick to let the module systems registers to allow require back.
  process.nextTick(
    (p: WorkerThreadHandler, d: any) => p.registerToken(require(d.path), d.id),
    new WorkerThreadHandler(parentPort, workerData.sharedCounter),
    workerData,
  );
