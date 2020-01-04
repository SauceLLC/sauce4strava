/* global sauce */
/* exported assertTruthy, assertFalsy, assertEqual, assertException */
/* exported assertGreater, assertLess, assertGreaterEqual, assertLessEqual */
/* exported addTests */

class TestError extends Error {}

class AssertionError extends TestError {}


function assertTruthy(condition, failMessage) {
    if (!condition) {
        throw new AssertionError(failMessage || 'condition is not true');
    }
}


function assertFalsy(condition, failMessage) {
    if (condition) {
        throw new AssertionError(failMessage || 'condition is not false');
    }
}


function assertException(fn, exc) {
    try {
        fn();
    } catch(e) {
        if (!(e instanceof exc)) {
            throw new AssertionError(`Invalid Exception: '${e.name}' not instance of '${exc.name}'`);
        } else {
            return;
        }
    }
    throw new AssertionError('No Exception Caught');
}


function assertEqual(a, b) {
    if (a !== b) {
        throw new AssertionError(`${a} !== ${b}`);
    }
}


function assertGreater(a, b) {
    if (!(a > b)) {
        throw new AssertionError(`${a} not greater than ${b}`);
    }
}


function assertLess(a, b) {
    if (!(a < b)) {
        throw new AssertionError(`${a} not less than ${b}`);
    }
}


function assertGreaterEqual(a, b) {
    if (!(a >= b)) {
        throw new AssertionError(`${a} not greater than or equal to ${b}`);
    }
}


function assertLessEqual(a, b) {
    if (!(a <= b)) {
        throw new AssertionError(`${a} not less than or equal to ${b}`);
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
        try {
            while (this._pending.length) {
                const test = this._pending.shift();
                try {
                    await test();
                    console.info(`${test.name}: PASS`);
                    infoLog(`<b>${test.name}</b>: <span style="color: green">PASS</span>`);
                } catch(e) {
                    console.error(`${test.name}: FAIL`);
                    errorLog(`<b>${test.name}</b>: <span style="color: red">FAIL</span> - ${e.message} ` +
                             `<pre class="stack">${e.stack}</pre>`);
                    throw e;
                }
            }
        } finally {
            this._running = false;
        }
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

