
addTests([
    function test_critpower_basic() {
        assertEqual(sauce.power.critpower(5, [0, 1, 2, 3, 4, 5], [10, 20, 30, 40, 50]), 10);
        //assertGreater(sauce.power.rank(5, 25.20, 'female'), 1);
        //assertEqual(Math.round(sauce.power.rank(5, 19.32, 'female') * 100), 100);
    }
]);
