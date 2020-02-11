/* global addTests, sauce, assertTruthy, assertEqual, assertEqualArray  */

addTests([
    async function test_upsample_double_odd_array() {
        const upped = await sauce.data.resample([0, 1, 2, 3, 4], 10);
        assertEqualArray(upped, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5]);
    },
    async function test_upsample_double_even_array() {
        const upped = await sauce.data.resample([0, 1, 2, 3, 4, 5], 12);
        assertEqualArray(upped, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]);
    },
    async function test_upsample_triple_even_array() {
        const upped = await sauce.data.resample([0, 3, 6, 9], 12);
        assertEqualArray(upped, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    },
    async function test_upsample_big() {
        const upped = await sauce.data.resample([1, 1], 100000);
        assertEqual(upped.length, 100000);
        assertTruthy(upped.every(x => x === 1));
    },
    async function test_upsample_size_ranges() {
        const inData = [];
        for (let inSize = 1; inSize <= 51; inSize++) {
            inData.push(inSize);
            for (let outSize = 1; outSize <= 51; outSize++) {
                const out = await sauce.data.resample(inData, outSize);
                assertEqual(out.length, outSize);
            }
        }
    },
    async function test_downsample_halve_even_array() {
        const down = await sauce.data.resample([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 5);
        assertEqualArray(down, [0, 2, 4, 6, 8]);
    },
    async function test_downsample_halve_odd_array() {
        const down = await sauce.data.resample([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 5);
        assertEqualArray(down, [0, 22, 44, 66, 88]);
    },
    async function test_downsample_big() {
        const ones = Array.from(Array(100000)).map(() => 1);
        const down = await sauce.data.resample(ones, 2);
        assertEqualArray(down, [1, 1]);
    },
    async function test_up_down_rounded_equality() {
        for (let size = 1; size < 27; size++) {
            const data = [];
            for (let i = 0; i < size; i++) {
                data.push(i + 1);
            }
            const up = await sauce.data.resample(data, 1000);
            const down = await sauce.data.resample(up, data.length);
            assertEqualArray(data, down.map(x => Math.round(x)), `size ${size}`);
        }
    },
]);
