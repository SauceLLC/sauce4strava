/* global addTests, sauce, assertEqual  */

addTests([
    function test_data_activetime_basic() {
        const time = sauce.data.activeTime([0, 1, 2]);
        assertEqual(time, 2);
    },
    function test_data_activetime_2() {
        const time = sauce.data.activeTime([0, 1]);
        assertEqual(time, 1);
    },
    function test_data_activetime_1() {
        assertEqual(0, sauce.data.activeTime([0]));
        assertEqual(0, sauce.data.activeTime([1]));
    },
    function test_data_activetime_spaced() {
        assertEqual(4, sauce.data.activeTime([0, 2, 4]));
        assertEqual(16, sauce.data.activeTime([0, 4, 8, 12, 16]));
        assertEqual(16, sauce.data.activeTime([0, 4, 8, 12, 16]));
    },
    function test_data_activetime_irregular_spaced() {
        assertEqual(10, sauce.data.activeTime([0, 1, 3, 5, 6, 10]));
    },
    function test_data_activetime_with_gaps() {
        assertEqual(8, sauce.data.activeTime([0, 1, 2, 6, 7, 8]));
        assertEqual(4, sauce.data.activeTime([0, 1, 2, 10, 11, 12]));
        assertEqual(6, sauce.data.activeTime([0, 1, 2, 10, 11, 12, 100, 101, 102]));
    },
    function test_data_overlap_inside() {
        assertEqual(5, sauce.data.overlap([60, 65], [61, 70]));  // overflow end
        assertEqual(1, sauce.data.overlap([60, 65], [59, 60]));  // overflow start
        assertEqual(1, sauce.data.overlap([60, 65], [60, 60]));  // exact match start idx
        assertEqual(6, sauce.data.overlap([60, 65], [59, 68]));  // overflow both
        assertEqual(1, sauce.data.overlap([60, 65], [65, 70]));  // overflow end with matching start/end
        assertEqual(1, sauce.data.overlap([60, 65], [65, 65]));  // exact match end idx

        assertEqual(null, sauce.data.overlap([60, 65], [75, 100]));  // past end
        assertEqual(null, sauce.data.overlap([60, 65], [66, 70]));  // past end by 1
        assertEqual(null, sauce.data.overlap([60, 65], [66, 66]));  // past end by 1 (len 1)
        assertEqual(null, sauce.data.overlap([60, 65], [40, 50]));  // before start
        assertEqual(null, sauce.data.overlap([60, 65], [58, 59]));  // before start by 1
        assertEqual(null, sauce.data.overlap([60, 65], [59, 59]));  // before start by 1 (len 1)
    },
]);
