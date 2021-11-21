/* global addTests, sauce, assertEqual, assertTruthy, assertGreaterEqual, assertLessEqual */

addTests([
    function test_lru() {
        const lc = new sauce.LRUCache(2);
        lc.set(1, 1); // cache is {1=1}
        lc.set(2, 2); // cache is {1=1, 2=2}
        assertEqual(lc.get(1), 1);    // return 1
        lc.set(3, 3); // LRU key was 2, evicts key 2, cache is {1=1, 3=3}
        assertEqual(lc.get(2), undefined);    // returns -1 (not found)
        lc.set(4, 4); // LRU key was 1, evicts key 1, cache is {4=4, 3=3}
        assertEqual(lc.get(1), undefined);    // return -1 (not found)
        assertEqual(lc.get(3), 3);    // return 3
        assertEqual(lc.get(4), 4);    // return 4
    },
]);
