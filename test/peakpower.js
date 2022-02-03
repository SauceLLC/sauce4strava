/* global addTests, sauce, assertEqual, assertTruthy, assertGreaterEqual, assertLessEqual */

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
        assertEqual(cp.avg(), 928);
        assertEqual(cp.elapsed(), 600);
        assertEqual(cp.active(), 600);
        assertEqual(cp.firstTime(), 1200);
        assertEqual(cp.lastTime(), 1800);
        cp = sauce.power.peakPower(5, [0, 240, 420, 600, 1200, 1800],
                                      [200, 300, 400, 600, 800, 1000],
                                   {allowPadBounds: true});
        assertEqual(cp.avg(), 1000);
        assertEqual(cp.elapsed(), 60);
        assertEqual(cp.active(), 60);
        assertEqual(cp.elapsed({allowPadBounds: false}), 0);
        assertEqual(cp.active({allowPadBounds: false}), 0);
        assertEqual(cp.firstTime({noPad: true}), 1800);
        assertEqual(cp.lastTime({noPad: true}), 1800);
        assertEqual(cp.firstTime(), 1740);
        assertEqual(cp.lastTime(), 1800);
    },
    function test_peakpower_correct_avg_with_gaps() {
        let cp = sauce.power.peakPower(5, [0, 1, 2, 3, 100, 101, 102, 103], valueStream(1, 8), {allowPadBounds: true});
        assertEqual(cp.avg(), 4 / 5);
        assertEqual(cp.elapsed(), 5);
        assertEqual(cp.firstTime(), 98);
        assertEqual(cp.firstTime({noPad:true}), 100);
        cp = sauce.power.peakPower(5, [0, 1, 2, 3, 100, 101, 102, 103], valueStream(1, 8));
        assertEqual(cp.avg(), 0.04);
        assertEqual(cp.avg({active: true}), 1);
        assertEqual(cp.elapsed(), 100);
        assertEqual(cp.active(), 4);
        assertEqual(cp.firstTime(), 3);
        assertEqual(cp.lastTime(), 103);
        assertEqual(cp.firstTime({noPad: true}), 3);
        assertEqual(cp.lastTime({noPad: true}), 103);
    },
    function test_correctedpower_size_2() {
        let cp = sauce.power.correctedPower([0, 1], [100, 200]);
        assertEqual(cp.avg(), 200);
        assertEqual(cp.elapsed(), 1);
    },
    function test_correctedpower_irregular_gaps() {
        let cp = sauce.power.correctedPower([0, 1, 3], [100, 200, 300]);
        assertEqual(Math.round(cp.avg()), 246);
        assertEqual(cp.elapsed(), 3);
    },
    function test_correctedpower_pad_lots_avoid_stack_overflow() {
        sauce.power.correctedPower(timeStream(1, 1000000, 100000),
                                   valueStream(1, 1000000 / 100000),
                                   {idealgap: 2, maxGap: 1});
    },
    function test_correctedpower_bad_active_gap() {
        // Source: https://www.strava.com/activities/1483302698/analysis/4883/4892
        const times =   [1, 2, 3, 4, 5, 6, 7, 8, 100,  101,  102, 103, 104, 105, 106];
        const values =  [0, 0, 0, 0, 0, 0, 0, 0, 2000, 2000, 100, 100, 100, 100, 100];
        const actives = values.map(() => true);
        const p5Pad = sauce.power.peakPower(5, times, values, {idealGap: 1, maxGap: 5, activeStream: actives, allowPadBounds: true});
        const p5NoPad = sauce.power.peakPower(5, times, values, {idealGap: 1, maxGap: 5, activeStream: actives, allowPadBounds: false});
        assertTruthy(p5Pad.full());
        assertTruthy(p5NoPad.full());
        assertFalsy(p5Pad.full({allowPadBounds: false}));
        assertTruthy(p5Pad.values()[0] instanceof sauce.data.Pad);
        assertFalsy(p5NoPad.values()[0] instanceof sauce.data.Pad);
        assertEqual(Math.round(p5Pad.avg()), 1709);
        assertEqual(p5NoPad.avg(), 480);
    },
    function test_correctedpower_time_with_head_and_tail_padding() {
        const times =   [ 1,  2, 100,  101, 200, 201];
        const values =  [10, 10,  10,   10,  10,  10];
        const full = sauce.power.correctedPower(times, values, {idealGap: 1, maxGap: 5});
        const headTailPad = full.slice(50, 150);
        assertEqual(headTailPad.elapsed({allowPadBounds: true}), 100);
        assertEqual(headTailPad.active({allowPadBounds: true}), 2);
        assertEqual(headTailPad.elapsed(), 1);
        assertEqual(headTailPad.active(), 1);
    },
]);
