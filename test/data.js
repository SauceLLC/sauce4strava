/* global addTests, sauce, assertEqual  */

addTests([
    function test_data_movingtime_basic() {
        const time = sauce.data.movingTime([0, 1, 2]);
        assertEqual(time, 2);
    },
    function test_data_movingtime_2() {
        const time = sauce.data.movingTime([0, 1]);
        assertEqual(time, 1);
    },
    function test_data_movingtime_1() {
        assertEqual(0, sauce.data.movingTime([0]));
        assertEqual(0, sauce.data.movingTime([1]));
    },
    function test_data_movingtime_spaced() {
        assertEqual(4, sauce.data.movingTime([0, 2, 4]));
        assertEqual(16, sauce.data.movingTime([0, 4, 8, 12, 16]));
        assertEqual(16, sauce.data.movingTime([0, 4, 8, 12, 16]));
    },
    function test_data_movingtime_irregular_spaced() {
        assertEqual(10, sauce.data.movingTime([0, 1, 3, 5, 6, 10]));
    },
    function test_data_movingtime_with_gaps() {
        assertEqual(8, sauce.data.movingTime([0, 1, 2, 6, 7, 8]));
        assertEqual(4, sauce.data.movingTime([0, 1, 2, 10, 11, 12]));
        assertEqual(6, sauce.data.movingTime([0, 1, 2, 10, 11, 12, 100, 101, 102]));
    },
]);
