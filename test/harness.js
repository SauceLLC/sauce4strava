

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


function test_runner(tests) {
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
