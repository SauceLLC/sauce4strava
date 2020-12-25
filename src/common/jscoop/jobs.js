
import {Event, Lock} from './locks.js';
import {Queue} from './queues.js';

/**
 * @typedef UnorderedWorkQueueOptions
 * @type {Object}
 * @property {Number} [maxPending] - The maximum number of pending promises to enqueue before blocking.
 * @property {Number} [maxFulfilled] - The maximum number of unclaimed fulfilled results to allow before blocking
 *                                     any more calls to [put]{@link UnorderedWorkQueue#put}.
 * @property {boolean} [allowErrors] - When set to {@link true} rejected jobs will just return their
 *                                     [Error]{@link external:Error} instead of throwing.
 */

/**
 * A job control system that permits up to a fixed number of jobs (awaitables)
 * to remain unfulfilled before blocking a producer from enqueueing any more work.
 * In effect it provides a simple way to build a producer/consumer pattern with
 * some regulation on the number of tasks the producer should enqueue based on
 * fulfillment of the work.  The results of each enqueue job are yielded in the
 * order they finish, not the order they are enqueued.
 *
 * @param {UnorderedWorkQueueOptions} [options] -  Unordered work queue options.
 *
 * @example
 * const sleep = ms => new Promise(r => setTimeout(r, ms));
 * const wq = new UnorderedWorkQueue({maxPending: 3});
 * await wq.put(sleep(1000));
 * await wq.put(sleep(1000));
 * await wq.put(sleep(1000));
 * await wq.put(sleep(1000)); // blocks for ~1 second waiting
 * for await (const _ of wq) {
 *    // Handle results...
 * }
 */
export class UnorderedWorkQueue {

    constructor(options={}) {
        this._allowErrors = options.allowErrors;
        this._maxPending = options.maxPending;
        this._idCounter = 0;
        this._pending = new Map();
        this._releasing = 0;
        this._fulfilled = new Queue(options.maxFulfilled);
        this._putters = [];
    }

    _canPut() {
        return (!this._maxPending || this._pending.size + this._releasing < this._maxPending) &&
            !this._fulfilled.full();
    }

    /**
     * Add a new job to the work queue immediately if a spot is available.  If
     * the pending queue or the fulfilled queues are full it will block.
     *
     * @param {external:Promise} promise - The awaitable to enqueue.
     */
    async put(promise) {
        if (this._putters.length && this._canPut()) {
            console.warn("XXX Cool, fixed this bug!! :)", Array.from(this._putters), promise, this._idCounter);
        }
        if (this._putters.length || !this._canPut()) {
            const ev = new Event();
            this._putters.push(ev);
            await ev.wait();
            this._releasing--;
        }
        if (this._pending.size >= this._maxPending || this._fulfilled.full()) {
            throw new Error("XXX assertion failed in put");
        }
        const id = this._idCounter++;
        this._pending.set(id, promise);
        promise.finally(() => void this._promote(id));
    }

    async _promote(id) {
        const promise = this._pending.get(id);
        // Prevent JS from flattening the promise when it's retrieved by wrapping it.
        await this._fulfilled.put({promise});
        this._pending.delete(id);
        this._maybeReleasePutter();
    }

    _maybeReleasePutter() {
        if (this._putters.length && this._canPut()) {
            this._releasing++;
            this._putters.shift().set();
        }
    }

    /**
     * Get one result from the fulfilled queue.
     *
     * @see [Queue.get]{@link Queue#get}
     * @throws {*} If [options.allowErrors]{@link UnorderedWorkQueueOptions} is unset and the
     *             job failed.
     * @returns {*} The return value from a completed job.
     */
    async get() {
        const {promise} = await this._fulfilled.get();
        try {
            return await promise;
        } catch(e) {
            if (this._allowErrors) {
                return e;
            }
            throw e;
        } finally {
            this._maybeReleasePutter();
        }
    }

    /**
     * @returns {Number} Jobs that have not finished yet or can not be retrieved yet.
     */
    pending() {
        return this._pending.size;
    }

    /**
     * @returns {Number} Jobs that are finished but have not be retrieved yet.
     */
    fulfilled() {
        return this._fulfilled.qsize();
    }

    /**
     * An async generator that yields the results of completed tasks.  Note that the
     * {@link UnorderedWorkQueue} instance itself is also iterable and produces the same
     * results.
     *
     * @generator
     * @yields {*} Return values from completed jobs as soon as they are ready.
     * @example
     * const wq = new UnorderedWorkQueue(10);
     * wq.put(1);
     * wq.put(2);
     * for await (const x of wq.asCompleted()) {
     *   console.log(x); // 1
     *                   // 2
     * }
     *
     * // or...
     * wq.put(1);
     * wq.put(2);
     * for await (const x of wq) {
     *   console.log(x); // 1
     *                   // 2
     * }
     */
    async *asCompleted() {
        while (this._pending.size || this._fulfilled.qsize()) {
            yield await this.get();
        }
    }

    [Symbol.asyncIterator]() {
        return this.asCompleted();
    }
}


const rateLimiterInstances = {};

/**
 * @typedef RateLimiterSpec
 * @type {Object}
 * @property {Number} limit - The maximum number of calls in a period
 * @property {Number} period - The period in milliseconds for constraining the {limit}
 * @property {boolean} [spread] - Instead of racing to the limit and then blocking until the period resets,
 *                                delay each call so the eventual usage is spread out over the period.
 */

/**
 * An extensible rate limiter that can be used to prevent abuse of external
 * services or limited resources.  The storage methods are intended for override
 * to support rate limiting across multiple sessions or devices if you have a
 * shared storage backing.
 *
 * @param {String} label - The unique label used for singleton uses and storage keys.
 * @param {RateLimiterSpec} spec - The configuration for this limiter.
 */
export class RateLimiter {

    /**
     * Create or return an existing instance.
     *
     * @param {String} label - Unique identifier for this singleton.
     * @param {RateLimiterSpec} spec - The spec to be used if, and only if, a new instance is created.
     * @returns {RateLimiter} A new or existing instance.
     */
    static async singleton(label, spec) {
        if (!rateLimiterInstances[label]) {
            rateLimiterInstances[label] = new this(label, spec);
        }
        const instance = rateLimiterInstances[label];
        await instance._init;
        return instance;
    }

    constructor(label, spec) {
        this.version = 1;
        this.label = label;
        this.spec = spec;
        this._lock = new Lock();
        this._init = this._loadState();
        this._sleeping = false;
        this._resumes = null;
    }

    /**
     * Subclasses can override to use permanent storage like IndexedDB.  Otherwise
     * state is just local to this instance.
     *
     * @abstract
     * @returns {Object} Meta data about the current usage.
     */
    async getState() {
        return this._state;
    }

    /**
     * Subclasses can override to use permanent storage like IndexedDB.  Otherwise
     * state is just local to this instance.
     *
     * @abstract
     * @param {Object} state - Meta data about the current state.
     */
    async setState(state) {
        this._state = state;
    }

    /**
     * Blocks until it is safe to run again.  Note that this routine is concurrency-safe, so some
     * calls for a given context may block longer than expected because of multiple accesses.
     */
    async wait() {
        await this._lock.acquire();
        try {
            await this._init;
            await this._wait();
            await this._increment();
        } finally {
            this._lock.release();
        }
    }

    /**
     * @returns {boolean}
     */
    sleeping() {
        return this._sleeping;
    }

    /**
     * @returns {Number} Date milliseconds when a sleeping limiter will
     *                   wake.
     */
    resumes() {
        return this._resumes;
    }

    async _wait() {
        if (!this.state.first || Date.now() - this.state.first > this.spec.period) {
            return;
        }
        if (this.state.count >= this.spec.limit) {
            await this._sleep(this.spec.period - (Date.now() - this.state.first));
        } else if (this.spec.spread) {
            const remTime = this.spec.period - (Date.now() - this.state.first);
            const remCount = this.spec.limit - this.state.count;
            await this._sleep(remTime / (remCount + 1));
        }
    }

    /**
     * Reset the internal state.  Use with caution
     */
    async reset(ctx) {
        await this._init;
        this.state.count = 0;
        this.state.first = 0;
        await this._saveState();
    }

    async _increment() {
        if (Date.now() - this.state.first > this.spec.period || this.state.count >= this.spec.limit) {
            this.state.count = 1;
            this.state.first = Date.now();
        } else {
            this.state.count++;
        }
        await this._saveState();
    }

    async _sleep(ms) {
        this._sleeping = true;
        this._resumes = Date.now + ms;
        try {
            await new Promise(resolve => setTimeout(resolve, ms));
        } finally {
            this._sleeping = false;
            this._resumes = null;
        }
    }

    toString() {
        return `RateLimiter [${this.label}]: period: ${this.spec.period / 1000}s, ` +
            `usage: ${this.state.count}/${this.spec.limit}`;
    }

    async _loadState() {
        const state = await this.getState();
        if (!state || state.version !== this.version) {
            this.state = {
                version: this.version,
                first: 0,
                count: 0,
                spec: this.spec
            };
            await this._saveState();
        } else {
            this.state = state;
        }
    }

    async _saveState() {
        await this.setState(this.state);
    }
}


/**
 * A grouping for {@link RateLimiter} classes.
 *
 * @extends {@link external:Array}
 */
export class RateLimiterGroup extends Array {

    constructor() {
        super();
        this._lock = new Lock();
    }

    // Just return simple Array for calls like map().
    static get [Symbol.species]() {
        return Array;
    }

    /**
     * Add a {RateLimiter} singleton to this group.
     *
     * @param {String} label - The unique label identifying the {@link RateLimiter}.
     * @param {RateLimiterSpec} spec - The spec to be used for the {@link RateLimiter}.
     */
    async add(label, spec) {
        this.push(await RateLimiter.singleton(label, spec));
    }

    /**
     * Wait for all the limiters in this group to unblock.
     */
    async wait() {
        await this._lock.acquire();
        try {
            await Promise.all(this.map(x => x._init));
            await Promise.all(this.map(x => x._wait()));
            await Promise.all(this.map(x => x._increment()));
        } finally {
            this._lock.release();
        }
    }

    /**
     * @returns {boolean} True if any of the limiters are sleeping.
     */
    sleeping() {
        return this.some(x => x.sleeping());
    }

    /**
     * @returns {Number} When the group will resume from sleeping.
     */
    resumes() {
        let ts = null; 
        for (const x of this) {
            if (x.sleeping()) {
                const resumes = x.resumes();
                if (!ts || ts < resumes) {
                    ts = resumes;
                }
            }
        }
        return ts;
    }

    async wait() {
        await this._lock.acquire();
        try {
            await Promise.all(this.map(x => x._init));
            await Promise.all(this.map(x => x._wait()));
            await Promise.all(this.map(x => x._increment()));
        } finally {
            this._lock.release();
        }
    }

}


/**
 * The built in Array object.
 *
 * @external Array
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array}
 */
