/* global addTests, sauce, assertEqual, assertTruthy, assertGreaterEqual, assertLessEqual */

const cases = {
    normUphill: {
        crr: 0.0255,
        cda: 0.40,
        loss: 0.035,
        weight: 100,
        wind: 0,
        slope: 0.05,
        el: 1000
    },
    normFlat: {
        crr: 0.0255,
        cda: 0.40,
        loss: 0.035,
        weight: 100,
        wind: 0,
        slope: 0,
        el: 1000
    } 
};

function search(power, c) {
    assertDefined(c.slope, 'case.slope');
    assertDefined(c.weight, 'case.weight');
    assertDefined(c.crr, 'case.crr');
    assertDefined(c.cda, 'case.cda');
    assertDefined(c.el, 'case.el');
    assertDefined(c.wind, 'case.wind');
    assertDefined(c.loss, 'case.loss');
    return sauce.power.cyclingPowerVelocitySearch(power, c.slope, c.weight, c.crr, c.cda, c.el, c.wind, c.loss);
}


addTests([
    function test_velocity_search_single_solution_simple() {
        const estimates = search(200, cases.normUphill);
        assertEqual(estimates.length, 1);
        assertNear(estimates[0].power, 200);
        assertNear(estimates[0].velocity, 2.5605702338950875);
    },
    function test_velocity_search_single_solution_simple2() {
        const estimates = search(400, cases.normUphill);
        assertEqual(estimates.length, 1);
        assertNear(estimates[0].power, 400);
        assertNear(estimates[0].velocity, 4.8783122778183445);
    },
    function test_velocity_search_single_solution_simple3() {
        const estimates = search(600, cases.normUphill);
        assertEqual(estimates.length, 1);
        assertNear(estimates[0].power, 400);
        assertNear(estimates[0].velocity, 6.874059857088878);
    },
    function test_velocity_search_multi_solution_zero() {
        const estimates = search(0, cases.normUphill);
        assertEqual(estimates.length, 2);
        estimates.sort((a, b) => b.velocity - a.velocity);
        assertNear(estimates[0].power, 0);
        assertNear(estimates[0].velocity, 0);
        assertNear(estimates[1].power, 0);
        assertNear(estimates[1].velocity, -10.501018128223807);
    },
    function test_velocity_search_flat_zero() {
        const estimates = search(0, cases.normFlat);
        assertEqual(estimates.length, 1);
        assertNear(estimates[0].power, 0);
        assertNear(estimates[0].velocity, 0);
    },
    function test_velocity_search_flat_zero_glass() {
        const estimates = search(0, Object.assign({}, cases.normFlat, {crr: 0}));
        assertEqual(estimates.length, 1);
        assertNear(estimates[0].power, 0);
        assertNear(estimates[0].velocity, 0);
    },
    function test_velocity_search_flat_zero_nodrag() {
        const estimates = search(0, Object.assign({}, cases.normFlat, {cda: 0}));
        assertEqual(estimates.length, 1);
        assertNear(estimates[0].power, 0);
        assertNear(estimates[0].velocity, 0);
    },
    function test_velocity_search_flat_zero_nodrag_glass() {
        const estimates = search(0, Object.assign({}, cases.normFlat, {cda: 0, crr: 0}));
        assertEqual(estimates.length, 1);
        assertNear(estimates[0].power, 0);
        assertNear(estimates[0].velocity, 299792458, null, {epsilon: 10000000});
    },
    function test_velocity_search_downhill_zero_nodrag_glass_overpower() {
        const estimates = search(1, Object.assign({}, cases.normFlat, {slope: -0.00001, cda: 0, crr: 0}));
        // There are no solutions when power is 1, the result would be Infinity velocity
        assertEqual(estimates.length, 0);
    },
    function test_velocity_search_downhill_zero_nodrag_glass_nopower() {
        const estimates = search(0, Object.assign({}, cases.normFlat, {slope: -0.00001, cda: 0, crr: 0}));
        assertEqual(estimates.length, 1);
        // Velocity would be zero because it will take negative watts to NOT go Infinity! ha.
        assertNear(estimates[0].velocity, 0);
    },
    function test_velocity_search_downhill_zero_nodrag_glass_slight_braking() {
        const estimates = search(-1, Object.assign({}, cases.normFlat, {slope: -0.00001, cda: 0, crr: 0}));
        assertEqual(estimates.length, 2);
        estimates.sort((a, b) => b.velocity - a.velocity);
        assertNear(estimates[0].velocity, 98.403617993443);
        assertNear(estimates[1].velocity, -98.403617993443);
    },
    function test_velocity_search_downhill_multiple_matches() {
        const estimates = search(100, cases.normUphill);
        assertEqual(estimates.length, 3);
        estimates.sort((a, b) => b.velocity - a.velocity);
        assertNear(estimates[0].velocity, 1.298543798737424);
        assertNear(estimates[1].velocity, -5.7080199786328905);
        assertNear(estimates[2].velocity, -6.410722206210795);
    },




/*
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
*/
]);
