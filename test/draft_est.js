/* global addTests, sauce, assertEqual, assertTruthy, assertGreaterEqual, assertLessEqual, assertDefined */

(function() {
    const cases = {
        normUphill: {
            crr: 0.005,
            cda: 0.35,
            loss: 0.035,
            weight: 75,
            wind: 0,
            slope: 0.07,
            el: 1000
        },
        normFlat: {
            crr: 0.005,
            cda: 0.35,
            loss: 0.035,
            weight: 75,
            wind: 0,
            slope: 0,
            el: 1000
        },
        normDownhill: {
            crr: 0.005,
            cda: 0.32,
            loss: 0.035,
            weight: 75,
            wind: 0,
            slope: -0.07,
            el: 0
        }
    };

    function search(riders, positions, power, c) {
        assertDefined(c.slope, 'cases.slope');
        assertDefined(c.weight, 'cases.weight');
        assertDefined(c.crr, 'cases.crr');
        assertDefined(c.cda, 'cases.cda');
        assertDefined(c.el, 'cases.el');
        assertDefined(c.wind, 'cases.wind');
        assertDefined(c.loss, 'cases.loss');
        return sauce.power.cyclingPowerVelocitySearchMultiPosition(riders, positions, {power, ...c});
    }

    void search;


    addTests([
        function test_velocity_search_with_2_person_draft() {
            //const estimates = search(2, [{position: 1, pct: 0.5}, {position: 2, pct: 0.5}], 200,
            //                         cases.normFlat);
            /*assertEqual(estimates.length, 1);
            for (const x of estimates) {
                assertNear(x.watts, 200);
            }
            assertNear(estimates[0].power, 200);
            assertNear(estimates[0].velocity, 2.5605702338950875);*/
        },
        function test_velocity_search_with_3_person_draft() {
            //const estimates = search(3, [{position: 1, pct: 1/3}, {position: 2, pct: 1/3},
            //    {position: 3, pct: 1/3}], 300, cases.normFlat);
            /*
            assertEqual(estimates.length, 1);
            for (const x of estimates) {
                assertNear(x.watts, 200);
            }
            assertNear(estimates[0].power, 200);
            assertNear(estimates[0].velocity, 2.5605702338950875);*/
        },
    ]);
})();
