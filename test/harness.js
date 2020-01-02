

TestError = function(msg) {
    this.message = msg;
};
TestError.prototype = new Error();
TestError.prototype.name = 'TestError';

assert = console.assert.bind(console);

assertException = function(fn, exc) {
    try {
        fn();
    } catch(e) {
        if (!(e instanceof exc)) {
            throw new TestError('Invalid Exception: (' + e.name + ' != ' + exc.name + ')');
        } else {
            return;
        }
    }
    throw new TestError('No Exception Caught');
};


assertEqual = function(a, b) {
    if (a !== b) {
        throw new TestError(a + ' !== ' + b);
    }
};


assertGreater = function(a, b) {
    if (!(a > b)) {
        throw new TestError('!(' + a + ' > ' + b + ')');
    }
};


assertLess = function(a, b) {
    if (!(a < b)) {
        throw new TestError('!(' + a + ' < ' + b + ')');
    }
};


assertGreaterEqual = function(a, b) {
    if (!(a >= b)) {
        throw new TestError('!(' + a + ' >= ' + b + ')');
    }
};


assertLessEqual = function(a, b) {
    if (!(a <= b)) {
        throw new TestError('!(' + a + ' <= ' + b + ')');
    }
};

sauce = self.sauce || {};
sauce.testing = true;
sauce.rpc = {};
sauce.rpc.reportError = function() {};


let logEl;


infoLog = function(html) {
    logEl.innerHTML += `<div class="log info">${html}</div>\n`;
}

errorLog = function(html) {
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
                    console.info(test.name + ': %cPASS', 'color: green');
                    infoLog(`<b>${test.name}</b>: <span style="color: green">PASS</span>`);
                } catch(e) {
                    console.error(test.name + ': %cFAIL', 'color: red');
                    console.error(e.message, e.stack);
                    errorLog(`<b>${test.name}</b>: <span style="color: red">FAIL</span> - ${e.message} ` +
                             `<pre class="stack">${e.stack}</pre>`);
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
            setTimeout(0, start);
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
    tests.forEach(function(x) {
        try {
            x();
            console.log(x.name + ': %cPASS', 'color: green');
        } catch(e) {
            console.log(x.name + ': %cFAIL', 'color: red');
            console.error(e.message, e.stack);
        }
    });
}


addEventListener('load', main);

