/* global sauce, addTests, assertEqual, assertLess, assertGreater, assertException */

addTests([
    function test_fixed_high() {
        assertEqual(Math.round(sauce.power.rank(5, 25.20, null, 1, 'male').level * 100), 100);
        assertGreater(sauce.power.rank(5, 25.20, null, 1, 'female').level, 1);
        assertEqual(Math.round(sauce.power.rank(5, 19.32, null, 1, 'female').level * 100), 100);
    },

    function test_fixed_low() {
        assertEqual(Math.round(sauce.power.rank(5, 10.11, null, 1, 'male').level * 100), 0);
        assertEqual(Math.round(sauce.power.rank(5, 8.93, null, 1, 'female').level * 100), 0);
        assertLess(sauce.power.rank(5, 8.93, null, 1, 'male').level, 0);
    },

    function test_fixed_require_gender() {
        assertException(() => sauce.power.rank(5, 24.04, null, 1), TypeError);
    }
]);
