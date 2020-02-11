/* global sauce */
/* exported addTests */
/* exported assertTruthy, assertFalsy, assertEqual, assertException */
/* exported assertGreater, assertLess, assertGreaterEqual, assertLessEqual */
/* exported assertEqualArray */

class TestError extends Error {}

class AssertionError extends TestError {
    constructor(message, extraMessage) {
        if (extraMessage) {
            message += ` (${extraMessage})`;
        }
        super(message);
    }
}


function assertTruthy(condition, failMessage) {
    if (!condition) {
        throw new AssertionError('condition is not true', failMessage);
    }
}


function assertFalsy(condition, failMessage) {
    if (condition) {
        throw new AssertionError('condition is not false', failMessage);
    }
}


function assertException(fn, exc, failMessage) {
    try {
        fn();
    } catch(e) {
        if (!(e instanceof exc)) {
            throw new AssertionError(`Invalid Exception: '${e.name}' not instance of '${exc.name}'`,
                                     failMessage);
        } else {
            return;
        }
    }
    throw new AssertionError('No Exception Caught', failMessage);
}


function assertEqual(a, b, failMessage) {
    if (a !== b) {
        throw new AssertionError(`${a} !== ${b}`, failMessage);
    }
}

function assertEqualArray(a, b, failMessage) {
    if (!(a instanceof Array)) {
        throw new AssertionError(`first arg is not array`, failMessage);
    }
    if (!(b instanceof Array)) {
        throw new AssertionError(`second arg is not array`, failMessage);
    }
    if (a.length !== b.length) {
        throw new AssertionError(`arrays different length`, failMessage);
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            throw new AssertionError(`Array index ${i} differs: ${a[i]} !== ${b[i]}a}`, failMessage);
        }
    }
}


function assertGreater(a, b, failMessage) {
    if (!(a > b)) {
        throw new AssertionError(`${a} not greater than ${b}`, failMessage);
    }
}


function assertLess(a, b, failMessage) {
    if (!(a < b)) {
        throw new AssertionError(`${a} not less than ${b}`, failMessage);
    }
}


function assertGreaterEqual(a, b, failMessage) {
    if (!(a >= b)) {
        throw new AssertionError(`${a} not greater than or equal to ${b}`, failMessage);
    }
}


function assertLessEqual(a, b, failMessage) {
    if (!(a <= b)) {
        throw new AssertionError(`${a} not less than or equal to ${b}`, failMessage);
    }
}


self.sauce = self.sauce || {};
sauce.testing = true;
sauce.rpc = {};
sauce.rpc.reportError = function() {};


let logEl;


function infoLog(html) {
    logEl.innerHTML += `<div class="log info">${html}</div>\n`;
}

function errorLog(html) {
    logEl.innerHTML += `<div class="log error">${html}</div>\n`;
}



class Runner {
    constructor() {
        this._pending = []; 
        this._finished = []; 
    }

    async start() {
        this._starting = false;
        this._started = true;
        this._running = true;
        let count = 0;
        const runnerStart = Date.now();
        try {
            while (this._pending.length) {
                const test = this._pending.shift();
                const testStart = Date.now();
                count++;
                try {
                    await test();
                    const elapsed = (Date.now() - testStart).toLocaleString();
                    console.info(`${test.name}: PASS (${elapsed}ms)`);
                    infoLog(`<b>[${count}] ${test.name}</b>: <span style="color: green">PASS</span> (${elapsed}ms)`);
                } catch(e) {
                    console.error(`${test.name}: FAIL`);
                    errorLog(`<b>[${count}] ${test.name}</b>: <span style="color: red">FAIL</span> - ${e.message} ` +
                             `<pre class="stack">${e.stack}</pre>`);
                    throw e;
                }
            }
        } finally {
            this._running = false;
        }
        const elapsed = (((Date.now() - runnerStart) / 1000).toFixed(2)).toLocaleString();
        console.info(`Ran ${count} tests in ${elapsed}ms`);
        infoLog(`<br/><h2>Ran ${count} tests in ${elapsed}s</h2>`);
    }

    addTests(tests) {
        this._pending.push.apply(this._pending, tests);
        if (!this._running && this._started && !this._starting) {
            this._starting = true;
            setTimeout(0, () => this.start());
        }
    }
}


let _runner;

function main() {
    logEl = document.body;
    if (!_runner) {
        _runner = new Runner();
    }
    _runner.start();
}


function addTests(tests) {
    if (!_runner) {
        _runner = new Runner();
    }
    _runner.addTests(tests);
}


addEventListener('load', main);

