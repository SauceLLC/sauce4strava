/**
 * A [Promise]{@link external:Promise} like object that allows for easy external fulfillment.
 * Modeled after Python's [asyncio.Future]{@link https://docs.python.org/3/library/asyncio-future.html}
 *
 * @extends external:Promise
 */
export class Future extends Promise {
    constructor() {
        let _resolve;
        let _reject;
        super((resolve, reject) => {
            _resolve = resolve;
            _reject = reject;
        });
        this._resolve = _resolve;
        this._reject = _reject;
        this._pending = true;
    }

    // Allow use of then/catch chaining.
    static get [Symbol.species]() {
        return Promise;
    }

    get [Symbol.toStringTag]() {
        return 'Future';
    }

    /**
     * Indicates if the Future is fullfilled.
     *
     * @returns {boolean}
     */
    done() {
        return !this._pending;
    }

    /**
     * Return the result of a fulfilled Future.  If the Future is not fulfilled
     * it will throw an Error.
     *
     * @returns {*}
     */
    result() {
        if (this._pending) {
            throw new Error('Unfulfilled Awaitable');
        }
        if (this._error) {
            throw self._error;
        }
        return self._result;
    }

    /**
     * Return the Error of a fulfilled but rejected Future.  If the Future is not
     * fulfilled it will throw an Error.
     *
     * @returns {Error}
     */
    error() {
        if (this._pending) {
            throw new Error('Unfulfilled Awaitable');
        }
        return self._error;
    }

    /**
     * Set the result of a Future and resolve it.  The Future will be put into
     * the fulfilled state and any functions awaiting the result will be resumed
     * on the next event loop tick.
     *
     * @param {*} result - Any value that should be passed to awaiters.
     */
    setResult(result) {
        if (!this._pending) {
            throw new Error('Already fulfilled');
        }
        this._result = result;
        this._pending = false;
        this._resolve(result);
    }

    /**
     * Set the Error of a Future and reject it.  The Future will be put into
     * the fulfilled state and any functions awaiting the result will be resumed
     * on the next event loop tick.
     *
     * @param {Error} e - A valid Error that will be thrown to awaiters.
     */
    setError(e) {
        if (!this._pending) {
            throw new Error('Already fulfilled');
        }
        this._error = e;
        this._pending = false;
        this._reject(e);
    }
}


/**
 * The built in Promise object.
 *
 * @external Promise
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise}
 */

