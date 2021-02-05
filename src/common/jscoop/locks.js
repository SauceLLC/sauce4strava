/* eslint no-unsafe-finally: "off" */

import {Future} from './futures.js';


/**
 * A classic multitasking Condition mechanism.
 *
 * @param {Lock} [lock] - A shared lock object that is used to synchronize multiple Conditions.
 * @borrows {Lock.acquire} as foo
 * @borrows Lock.release as bar
 *
 * @example
 * const cond = new Condition();
 * await cond.acquire();
 * setTimeout(() => cond.notify(), 1000);
 * await cond.wait(); // will wait for 1000ms
 * // do work...
 * cond.release();
 * @see Python's [asyncio.Condition]{@link https://docs.python.org/3/library/asyncio-sync.html#condition}
 */
export class Condition {

    constructor(lock) {
        if (lock === undefined) {
            lock = new Lock();
        }
        this._lock = lock;
        this.release = lock.release.bind(lock);
        this._waiters = [];
    }

    /**
     * The internal lock state.
     *
     * @see [Lock.locked]{@link Lock#locked}
     *
     * @returns {boolean}
     */
    locked() {
        return this.lock.locked();
    }

    /**
     * Acquire the internal lock.
     *
     * @see [Lock.acquire]{@link Lock#acquire}
     */
    async acquire() {
        return await this.lock.acquire();
    }

    /**
     * Release the internal lock.
     *
     * @see [Lock.release]{@link Lock#release}
     */
    release() {
        return this.lock.release();
    }

    /**
     * Wait until the condition is satisfied.  When multiple awaiters exist they will
     * be woken up one at a time if [notify]{@link Condition#notify} is used.  If
     * [notifyAll]{@link Condition#notifyAll} is used then all awaiters will be woken up.
     * Once completed the internal {@link Lock} is reacquired.
     */
    async wait() {
        if (!this.locked()) {
            throw new Error('Lock not acquired');
        }
        this.release();
        try {
            const f = new Future();
            this._waiters.push(f);
            try {
                return await f;
            } finally {
                this._waiters.splice(this._waiters.indexOf(f), 1);
            }
        } finally {
            await this.acquire();
        }
    }

    /**
     * Wake up any awaiters using [wait]{@link Condition#wait}.
     *
     * @param {Number} [n=1] - The number of awaiters to wake up.
     */
    notify(n=1) {
        if (!this.locked()) {
            throw new Error('Lock not acquired');
        }
        let idx = 0;
        for (const f of this._waiters) {
            if (idx >= n) {
                break;
            }
            if (!f.done()) {
                idx++;
                f.setResult(true);
            }
        }
    }

    /**
     * Wake up ALL awaiters using [wait]{@link Condition#wait}.
     */
    notifyAll() {
        this.notify(this._waiters.length);
    }
}


/**
 * A classic multitasking lock mechanism.
 *
 * @see Python's [asyncio.Lock]{@link https://docs.python.org/3/library/asyncio-sync.html#lock}
 */
export class Lock {
    constructor() {
        this._waiters = [];
        this._locked = false;
    }

    /**
     * Indicates the internal locked state of the Lock.
     *
     * @returns {boolean}
     */
    locked() {
        return this._locked;
    }

    /**
     * Acquire the lock if available, otherwise wait until it is released
     * and then take the lock and return.
     */
    async acquire() {
        if (!this._locked) {
            this._locked = true;
            return true;
        }
        const f = new Future();
        f.addImmediateCallback(() => {
            if (!f.error()) {
                this._locked = true;
            }
        });
        this._waiters.push(f);
        try {
            await f;
            return true;
        } finally {
            this._waiters.splice(this._waiters.indexOf(f), 1);
        }
    }

    /**
     * Release this lock and wake up and calls to [acquire]{@link Lock#acquire}.
     */
    release() {
        if (!this._locked) {
            throw new Error('Lock is not acquired');
        }
        this._locked = false;
        for (const f of this._waiters) {
            if (!f.done()) {
                f.setResult(true);
                break;
            }
        }
    }
}


/**
 * A classic counting Semaphore used to regulate access to a resource.
 *
 * @param {Number} [value=1] - The number of simultaneous acquisitions
 *                             this semaphore will permit before blocking.
 * @see Python's [asyncio.Semaphore]{@link https://docs.python.org/3/library/asyncio-sync.html#semaphore}
 */
export class Semaphore {
    constructor(value=1) {
        if (value < 0) {
            throw new Error('Value must be >= 0');
        }
        this._value = value;
        this._waiters = [];
    }

    _wakeUpNext() {
        while (this._waiters.length) {
            const waiter = this._waiters.shift();
            if (!waiter.done()) {
                waiter.setResult();
                return;
            }
        }
    }

    /**
     * Has the semaphore exhausted all acquisitions.
     *
     * @returns {boolean} True if it will block an [acquire]{@link Semaphore#acquire}
     */
    locked() {
        return this._value === 0;
    }

    /**
     * Attempt to acquire one of the available slots in this semaphore.
     * If none are available, wait in line until one is available.
     *
     * @returns {boolean} true
     */
    async acquire() {
        while (this._value <= 0) {
            const f = new Future();
            this._waiters.push(f);
            try {
                await f;
            } catch(e) {
                if (this._value > 0) {
                    this._wakeUpNext();
                }
                throw e;
            }
        }
        this._value--;
        return true;
    }

    /**
     * Release a slot previously acquired with [acquire]{@link Semaphore#acquire}
     */
    async release() {
        this._value++;
        this._wakeUpNext();
    }
}


/**
 * A very simple object for indicating when some event has been triggered.
 *
 * @see Python's [asyncio.Event]{@link https://docs.python.org/3/library/asyncio-sync.html#event}
 */
export class Event {
    constructor() {
        this._waiters = [];
        this._isSet = false;
    }

    /**
     * @returns {boolean} True if [set]{@link Event#set} was called.
     */
    isSet() {
        return this._isSet;
    }

    /**
     * Wake ALL awaiters of [wait]{@link Event#wait}
     */
    set() {
        if (!this._isSet) {
            this._isSet = true;
            for (const f of this._waiters) {
                f.setResult(true);
            }
        }
    }

    /**
     * Opposite of [set]{@link Event#set}.  Clear the Event state so future
     * calls to [wait]{@link Event#wait} will block.
     */
    clear() {
        this._isSet = false;
    }

    /**
     * Wait until this event object is triggered with [set]{@link Event#set}.
     *
     * @returns {boolean} true
     */
    async wait() {
        if (this._isSet) {
            return true;
        }
        const f = new Future();
        this._waiters.push(f);
        try {
            return await f;
        } finally {
            this._waiters.splice(this._waiters.indexOf(f), 1);
        }
    }
}
