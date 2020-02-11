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
    function test_bestpace_period() {
        const cp = sauce.pace.bestPace(5, timeStream(10), valueStream(i => i, 10));
        assertEqual(cp.period, 5);
    },
    function test_bestpace_full_when_more_than() {
        const cp = sauce.pace.bestPace(5, timeStream(10), valueStream(i => i, 10));
        assertTruthy(cp.full());
        assertEqual(cp.elapsed(), 5);
        assertEqual(cp.distance(), 5);
    },
    function test_bestpace_full_when_exact_size() {
        const cp = sauce.pace.bestPace(5, timeStream(6), valueStream(i => i, 6));
        assertTruthy(cp.full());
        assertEqual(cp.elapsed(), 5);
        assertEqual(cp.distance(), 5);
    },
    function test_bestpace_undefined_when_less_than_by_1() {
        const cp = sauce.pace.bestPace(6, timeStream(6), valueStream(i => i, 6));
        assertEqual(cp, undefined);
    },
    function test_bestpace_undefined_with_exactly_one() {
        const cp = sauce.pace.bestPace(1, timeStream(1), valueStream(i => i, 1));
        assertEqual(cp, undefined);
    },
    function test_bestpace_undefined_with_zero() {
        const cp = sauce.pace.bestPace(1, [], []);
        assertEqual(cp, undefined);
    },
    function test_bestpace_correct_avg_when_exact_size() {
        let cp = sauce.pace.bestPace(5, timeStream(6), valueStream(i => i, 6));
        assertEqual(cp.avg(), 1);
        assertEqual(cp.elapsed(), 5);
        assertEqual(cp.distance(), 5);
        cp = sauce.pace.bestPace(5, timeStream(6), valueStream(i => i * 2, 6));
        assertEqual(cp.avg(), 0.5);
        assertEqual(cp.elapsed(), 3);
        assertGreaterEqual(cp.distance(), 5);
        assertLessEqual(cp.distance(), 6);
    },
    function test_bestpace_correct_avg_with_one_more_sample_high_at_start() {
        let cp = sauce.pace.bestPace(5, timeStream(7), [0, 1, 2, 3, 4, 5, 5.5]);
        assertEqual(cp.avg(), 1);
        assertEqual(cp.elapsed(), 5);
        assertEqual(cp.distance(), 5);
        assertEqual(cp.firstTime(), 0);
    },
    function test_bestpace_correct_avg_with_one_more_sample_high_at_end() {
        let cp = sauce.pace.bestPace(5, timeStream(6), [0, 1, 2, 3, 4, 6]);
        assertEqual(cp.avg(), 0.8);
        assertEqual(cp.elapsed(), 4);
        assertEqual(cp.distance(), 5);
        assertEqual(cp.firstTime(), 1);
    },
    function test_bestpace_correct_avg_with_irregular_times() {
        let cp = sauce.pace.bestPace(5, timeStream(0, 12, 2), valueStream(i => i, 6));
        assertEqual(cp.avg(), 2);
        assertEqual(cp.elapsed(), 10);
        assertEqual(cp.firstTime(), 0);
    },
    function test_bestpace_correct_avg_with_offset_start_exact_size() {
        let cp = sauce.pace.bestPace(5, timeStream(5, 11), valueStream(i => i, 6));
        assertEqual(cp.avg(), 1);
        assertEqual(cp.elapsed(), 5);
        assertEqual(cp.distance(), 5);
        assertEqual(cp.firstTime(), 5);
    },
    function test_bestpace_correct_avg_with_offset_start_larger_size_by_one() {
        let cp = sauce.pace.bestPace(5, timeStream(5, 11), valueStream(i => i, 6));
        assertEqual(cp.avg(), 1);
        assertEqual(cp.elapsed(), 5);
        assertEqual(cp.distance(), 5);
        assertEqual(cp.firstTime(), 5);
    },
    function test_bestpace_correct_avg_with_gaps() {
        let cp = sauce.pace.bestPace(5, [0, 1, 2, 3, 100, 101, 102, 103], valueStream(i => i, 8));
        assertEqual(cp.avg(), 101 / 5);
        assertEqual(cp.elapsed(), 101);
        assertEqual(cp.distance(), 5);
        assertEqual(cp.firstTime(), 2);
    },
]);
