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
    },
    normDownhill: {
        crr: 0.0065,
        cda: 0.40,
        loss: 0.035,
        weight: 86,
        wind: 0,
        slope: -0.065,
        el: 0
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
        for (const x of estimates) {
            assertNear(x.watts, 200);
        }
        assertNear(estimates[0].power, 200);
        assertNear(estimates[0].velocity, 2.5605702338950875);
    },
    function test_velocity_search_single_solution_simple2() {
        const estimates = search(400, cases.normUphill);
        assertEqual(estimates.length, 1);
        for (const x of estimates) {
            assertNear(x.watts, 400);
        }
        assertNear(estimates[0].power, 400);
        assertNear(estimates[0].velocity, 4.8783122778183445);
    },
    function test_velocity_search_single_solution_simple3() {
        const estimates = search(600, cases.normUphill);
        assertEqual(estimates.length, 1);
        for (const x of estimates) {
            assertNear(x.watts, 600);
        }
        assertNear(estimates[0].power, 400);
        assertNear(estimates[0].velocity, 6.874059857088878);
    },
    function test_velocity_search_multi_solution_zero() {
        const estimates = search(0, cases.normUphill);
        assertEqual(estimates.length, 2);
        for (const x of estimates) {
            assertNear(x.watts, 0);
        }
        estimates.sort((a, b) => b.velocity - a.velocity);
        assertNear(estimates[0].power, 0);
        assertNear(estimates[0].velocity, 0);
        assertNear(estimates[1].power, 0);
        assertNear(estimates[1].velocity, -10.501018128223807);
    },
    function test_velocity_search_flat_zero() {
        const estimates = search(0, cases.normFlat);
        assertEqual(estimates.length, 1);
        for (const x of estimates) {
            assertNear(x.watts, 0);
        }
        assertNear(estimates[0].power, 0);
        assertNear(estimates[0].velocity, 0);
    },
    function test_velocity_search_flat_zero_glass() {
        const estimates = search(0, Object.assign({}, cases.normFlat, {crr: 0}));
        assertEqual(estimates.length, 1);
        for (const x of estimates) {
            assertNear(x.watts, 0);
        }
        assertNear(estimates[0].power, 0);
        assertNear(estimates[0].velocity, 0);
    },
    function test_velocity_search_flat_zero_nodrag() {
        const estimates = search(0, Object.assign({}, cases.normFlat, {cda: 0}));
        assertEqual(estimates.length, 1);
        for (const x of estimates) {
            assertNear(x.watts, 0);
        }
        assertNear(estimates[0].power, 0);
        assertNear(estimates[0].velocity, 0);
    },
    function test_velocity_search_flat_zero_nodrag_glass() {
        const estimates = search(0, Object.assign({}, cases.normFlat, {cda: 0, crr: 0}));
        assertEqual(estimates.length, 1);
        for (const x of estimates) {
            assertNear(x.watts, 0);
        }
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
        for (const x of estimates) {
            assertNear(x.watts, 0);
        }
        // Velocity would be zero because it will take negative watts to NOT go Infinity! ha.
        assertNear(estimates[0].velocity, 0);
    },
    function test_velocity_search_downhill_zero_nodrag_glass_slight_braking() {
        const estimates = search(-1, Object.assign({}, cases.normFlat, {slope: -0.00001, cda: 0, crr: 0}));
        assertEqual(estimates.length, 2);
        for (const x of estimates) {
            assertNear(x.watts, -1);
        }
        estimates.sort((a, b) => b.velocity - a.velocity);
        assertNear(estimates[0].velocity, 98.403617993443);
        assertNear(estimates[1].velocity, -98.403617993443);
    },
    function test_velocity_search_downhill_multiple_matches() {
        const estimates = search(100, cases.normUphill);
        assertEqual(estimates.length, 3);
        for (const x of estimates) {
            assertNear(x.watts, 100);
        }
        estimates.sort((a, b) => b.velocity - a.velocity);
        assertNear(estimates[0].velocity, 1.298543798737424);
        assertNear(estimates[1].velocity, -5.7080199786328905);
        assertNear(estimates[2].velocity, -6.410722206210795);
    },
    function test_velocity_search_downhill_huge_negative() {
        const estimates = search(-200000, cases.normDownhill);
        assertEqual(estimates.length, 1);
        assertNear(estimates[0].velocity, -91.46928559597359)
        assertNear(estimates[0].watts, -200000, null, {epsilon: 0.0001})
    },
]);
