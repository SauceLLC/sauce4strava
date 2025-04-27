/* global addTests, sauce, assertEqual, assertNear, assertTruthy */

function timeStream() {
    return Array.from(sauce.data.range.apply(this, arguments));
}


function valueStream(fnOrValue, size) {
    let fn;
    if (!(fnOrValue instanceof Function)) {
        fn = () => fnOrValue;
    } else {
        fn = fnOrValue;
    }
    return Array.from(sauce.data.range(size)).map(fn);
}

void timeStream;
void valueStream;


function assertRollEqual(a, b) {
    assertEqual(a.firstTime(), a.firstTime());
    assertEqual(a.lastTime(), a.lastTime());
    assertNear(a.avg(), a.avg());
    assertEqual(a._valuesAcc, b._valuesAcc);
    assertEqual(a._activeAcc, b._activeAcc);
    const aValues = a.values();
    const bValues = a.values();
    const aTimes = a.values();
    const bTimes = a.values();
    assertEqual(aValues.length, bValues.length);
    assertEqual(aTimes.length, bTimes.length);
    assertTruthy(aValues.every((x, i) => x === bValues[i]));
    assertTruthy(aTimes.every((x, i) => x === bTimes[i]));
}


addTests([
    function test_roll_shift() {
        const roll1 = new sauce.data.RollingAverage();
        const roll2 = new sauce.data.RollingAverage();
        for (let i = 2; i < 4; i++) {
            roll1.add(i, i);
        }
        for (let i = 1; i < 4; i++) {
            roll2.add(i, i);
        }
        roll2.shift();
        assertRollEqual(roll1, roll2);
    },

    function test_roll_pop() {
        const roll1 = new sauce.data.RollingAverage();
        const roll2 = new sauce.data.RollingAverage();
        for (let i = 1; i < 3; i++) {
            roll1.add(i, i);
        }
        for (let i = 1; i < 4; i++) {
            roll2.add(i, i);
        }
        roll2.pop();
        assertRollEqual(roll1, roll2);
    },

    function test_roll_shift_pop() {
        const roll1 = new sauce.data.RollingAverage();
        const roll2 = new sauce.data.RollingAverage();
        for (let i = 2; i < 4; i++) {
            roll1.add(i, i);
        }
        for (let i = 1; i < 5; i++) {
            roll2.add(i, i);
        }
        roll2.shift();
        roll2.pop();
        assertRollEqual(roll1, roll2);
    },

    function test_roll_pop_shift() {
        const roll1 = new sauce.data.RollingAverage();
        const roll2 = new sauce.data.RollingAverage();
        for (let i = 2; i < 4; i++) {
            roll1.add(i, i);
        }
        for (let i = 1; i < 5; i++) {
            roll2.add(i, i);
        }
        roll2.pop();
        roll2.shift();
        assertRollEqual(roll1, roll2);
    },

    function test_roll_n2_pop_shift() {
        const roll1 = new sauce.data.RollingAverage();
        const roll2 = new sauce.data.RollingAverage();
        for (let i = 3; i < 5; i++) {
            roll1.add(i, i);
        }
        for (let i = 1; i < 7; i++) {
            roll2.add(i, i);
        }
        roll2.pop();
        roll2.pop();
        roll2.shift();
        roll2.shift();
        assertRollEqual(roll1, roll2);
    },

    function test_roll_zero_shift() {
        const roll1 = new sauce.data.RollingAverage();
        const roll2 = new sauce.data.RollingAverage();
        for (let i = 3; i < 7; i++) {
            roll1.add(i, i % 2 === 0 ? i : 0);
        }
        for (let i = 1; i < 7; i++) {
            roll2.add(i, i % 2 === 0 ? i : 0);
        }
        roll2.shift();
        roll2.shift();
        assertRollEqual(roll1, roll2);
    },

    function test_roll_zero_pop() {
        const roll1 = new sauce.data.RollingAverage();
        const roll2 = new sauce.data.RollingAverage();
        for (let i = 1; i < 5; i++) {
            roll1.add(i, i % 2 === 0 ? i : 0);
        }
        for (let i = 1; i < 7; i++) {
            roll2.add(i, i % 2 === 0 ? i : 0);
        }
        roll2.pop();
        roll2.pop();
        assertRollEqual(roll1, roll2);
    },
]);
