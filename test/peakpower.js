/* global addTests, sauce, assertEqual, assertTruthy, assertGreaterEqual, assertLessEqual */

function *range(startOrSize, end, step) {
    let size;
    let start;
    if (end === undefined && step === undefined) {
        size = startOrSize;
        start = 0;
        step = 1;
    } else {
        start = startOrSize;
        step = step || 1;
        size = (end - start) / step;
    }
    for (let x = start, i = 0; i < size; x += step, i++) {
        yield x;
    }
}

function timeStream() {
    return Array.from(range.apply(this, arguments));
}


function valueStream(fnOrValue, size) {
    let fn;
    if (!(fnOrValue instanceof Function)) {
        fn = () => fnOrValue;
    } else {
        fn = fnOrValue;
    }
    return Array.from(range(size)).map(fn);
}


addTests([
    function test_peakpower_period() {
        const cp = sauce.power.peakPower(5, timeStream(10), valueStream(1, 10));
        assertEqual(cp.period, 5);
    },
    function test_peakpower_full_when_more_than() {
        const cp = sauce.power.peakPower(5, timeStream(10), valueStream(1, 10));
        assertTruthy(cp.full());
        assertEqual(cp.elapsed(), 5);
    },
    function test_peakpower_full_when_exact_size() {
        const cp = sauce.power.peakPower(5, timeStream(6), valueStream(1, 6));
        assertTruthy(cp.full());
        assertEqual(cp.elapsed(), 5);
    },
    function test_peakpower_undefined_when_less_than_by_1() {
        const cp = sauce.power.peakPower(6, timeStream(5), valueStream(1, 5));
        assertEqual(cp, undefined);
    },
    function test_peakpower_undefined_with_exactly_one() {
        const cp = sauce.power.peakPower(1, timeStream(1), valueStream(1, 1));
        assertEqual(cp, undefined);
    },
    function test_peakpower_undefined_with_zero() {
        const cp = sauce.power.peakPower(1, [], []);
        assertEqual(cp, undefined);
    },
    function test_peakpower_correct_avg_when_exact_size() {
        let cp = sauce.power.peakPower(5, timeStream(6), valueStream(1, 6));
        assertEqual(cp.avg(), 1);
        assertEqual(cp.elapsed(), 5);
        cp = sauce.power.peakPower(5, timeStream(6), valueStream(i => i - 1, 6));
        assertEqual(cp.avg(), 2);
        assertEqual(cp.elapsed(), 5);
    },
    function test_peakpower_correct_avg_with_one_more_sample_high_at_start() {
        let cp = sauce.power.peakPower(5, timeStream(7), [6, 5, 4, 3, 2, 1, 0]);
        assertEqual(cp.avg(), 3);
        assertEqual(cp.elapsed(), 5);
        assertEqual(cp.firstTime(), 0);
    },
    function test_peakpower_correct_avg_with_one_more_sample_high_at_end() {
        let cp = sauce.power.peakPower(5, timeStream(7), [0, 0, 1, 2, 3, 4, 5]);
        assertEqual(cp.avg(), 3);
        assertEqual(cp.elapsed(), 5);
        assertEqual(cp.firstTime(), 1);
    },
    function test_peakpower_correct_avg_with_irregular_times() {
        let cp = sauce.power.peakPower(5, timeStream(0, 10, 2), valueStream(1, 5));
        assertEqual(cp.avg(), 1);
        assertGreaterEqual(cp.elapsed(), 5);
        assertLessEqual(cp.elapsed(), 6);
        assertEqual(cp.firstTime(), 2);
    },
    function test_peakpower_correct_avg_with_offset_start_exact_size() {
        let cp = sauce.power.peakPower(5, timeStream(5, 11), valueStream(1, 6));
        assertEqual(cp.avg(), 1);
        assertEqual(cp.elapsed(), 5);
        assertEqual(cp.firstTime(), 5);
    },
    function test_peakpower_correct_avg_with_offset_start_larger_size_by_one() {
        let cp = sauce.power.peakPower(4, timeStream(5, 10), valueStream(1, 5));
        assertEqual(cp.avg(), 1);
        assertEqual(cp.elapsed(), 4);
        assertEqual(cp.firstTime(), 5);
    },
    function test_peakpower_huge_gaps() {
        let cp = sauce.power.peakPower(5, [0, 240, 420, 600, 1200, 1800],
                                       [200, 300, 400, 600, 800, 1000]);
        assertEqual(cp.avg(), 1000);
        assertEqual(cp.elapsed(), 600);
        assertEqual(cp.firstTime(), 1200);
    },
    function test_peakpower_correct_avg_with_gaps() {
        let cp = sauce.power.peakPower(5, [0, 1, 2, 3, 100, 101, 102, 103], valueStream(1, 8));
        assertEqual(cp.avg(), 4 / 5);
        assertEqual(cp.elapsed(), 5);
        assertEqual(cp.firstTime(), 98);
        assertEqual(cp.firstTime({noPad:true}), 100);
    },
    function test_correctedpower_size_2() {
        let cp = sauce.power.correctedPower([0, 1], [100, 200]);
        assertEqual(cp.avg(), 200);
        assertEqual(cp.elapsed(), 1);
    },
    function test_correctedpower_irregular_gaps() {
        let cp = sauce.power.correctedPower([0, 1, 3], [100, 200, 300]);
        assertEqual(cp.avg(), (200 + (300 * 2)) / 3);
        assertEqual(cp.elapsed(), 3);
    },
]);
