/* global addTests, sauce, assertEqual, assertNear */

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

void timeStream;
void valueStream;


addTests([
    function test_np_var_samplerates_unbound() {
        const roll1 = new sauce.power.RollingPower(null, {inlineNP: true, idealGap: 1});
        const roll2 = new sauce.power.RollingPower(null, {inlineNP: true, idealGap: 2});
        for (let i = 1; i < 10000; i++) {
            roll1.add(i, i % 1000);
            if (i % 2 === 0) {
                roll2.add(i, i % 1000);
            }
            if (i > 60) {
                assertNear(roll1.np({force: true}), roll2.np({force: true}), {epsilon: 1});
            }
        }
    },
    function test_xp_var_samplerates_unbound() {
        const roll1 = new sauce.power.RollingPower(null, {inlineNP: true, idealGap: 1});
        const roll2 = new sauce.power.RollingPower(null, {inlineNP: true, idealGap: 2});
        for (let i = 1; i < 10000; i++) {
            roll1.add(i, i % 1000);
            if (i % 2 === 0) {
                roll2.add(i, i % 1000);
            }
            if (i > 60) {
                assertNear(roll1.xp({force: true}), roll2.xp({force: true}), {epsilon: 1});
            }
        }
    },
    function test_inline_np_vs_external_unbound() {
        const roll = new sauce.power.RollingPower(null, {inlineNP: true, idealGap: 1});
        for (let i = 1; i < 10000; i++) {
            roll.add(i, i % 1000);
            assertNear(roll.np({force: true}), roll.np({force: true, external: true}), {epsilon: 1e-6});
        }
    },
    function test_inline_np_vs_external_bound() {
        for (const period of [30, 90, 120, 300, 1200, 3600, 86400]) {
            const roll = new sauce.power.RollingPower(period, {inlineNP: true, idealGap: 1});
            for (let i = 1; i < 10000; i++) {
                roll.add(i, i);
                assertNear(roll.np({force: true}), roll.np({force: true, external: true}));
            }
        }
    },
    function test_inline_xp_vs_external_bound_hard_edges() {
        // NOTE: by design xp is highly sensitive to small datasets.  Trying
        // to match short periods will lead to higher error.
        for (const period of [300, 1200, 3600, 86400]) {
            const roll = new sauce.power.RollingPower(period, {inlineXP: true, idealGap: 1});
            for (let i = 1; i < 10000; i++) {
                // builds to 1000 then cliffs to 0, this is worst case for inline vs external
                roll.add(i, i % 1000);
                const inline = roll.xp({force: true});
                const external = roll.xp({force: true, external: true});
                assertNear(inline, external, {epsilon: 1.8});
            }
        }
    },
    function test_inline_xp_vs_external_bound() {
        for (const period of [120, 300, 1200, 3600, 86400]) {
            const roll = new sauce.power.RollingPower(period, {inlineXP: true, idealGap: 1});
            for (let i = 1; i < 10000; i++) {
                // builds to 1000 then cliffs to 0, this is worst case for inline vs external
                roll.add(i, (Math.sin(i / 1000) + 1) * 600 | 0);
                const inline = roll.xp({force: true});
                const external = roll.xp({force: true, external: true});
                assertNear(inline, external, {epsilon: 1});
            }
        }
    },
    function test_inline_xp_vs_external_exact_unshifted() {
        const roll = new sauce.power.RollingPower(null, {inlineXP: true, idealGap: 1});
        for (let i = 1; i < 10000; i++) {
            roll.add(i, i % 1000);
            const inline = roll.xp({force: true});
            const external = roll.xp({force: true, external: true});
            assertEqual(inline, external);
        }
    },
    function test_inline_np_vs_external_bound_fuzzy_values() {
        for (const period of [30, 90, 120, 300, 1200, 3600, 86400]) {
            let coasting = false;
            const roll = new sauce.power.RollingPower(period, {inlineNP: true, idealGap: 1});
            for (let i = 1; i < 10000; i++) {
                roll.add(i, coasting ? 0 : Math.round(Math.random() * 1000));
                const inline = roll.np({force: true});
                const external = roll.np({force: true, external: true});
                // ieee754 slop wreaks havoc around small values and the np algo amplifies this...
                if (inline > 1 || external > 1) {
                    assertNear(inline, external, {epsilon: 1e-3}, `period:${period} i:${i}`);
                } else {
                    assertNear(inline, external, {epsilon: 1}, `[SUB 1] period:${period} i:${i}`);
                }
                if (Math.random() > 0.99) {
                    coasting = !coasting;
                }
            }
        }
    },
    function test_inline_np_vs_external_peak_padded() {
        const roll = new sauce.power.RollingPower(300, {inlineNP: true, idealGap: 1, maxGap: 10});
        for (let i = 1; i < 10000; i++) {
            if (i % 100 === 0) {
                i += i % 500;
            }
            roll.add(i, i);
            assertNear(roll.np({force: true}), roll.np({force: true, external: true}), {epsilon: 0.00001});
        }
    },
    function test_np_period() {
        const data = [];
        for (let i = 0; i < 10000; i++) {
            data.push(i % 1000);
        }
        for (const period of [30, 90, 120, 300, 1200, 3600]) {
            const peak = sauce.power.peakNP(period, data.map((x, i) => i), data);
            assertEqual(peak.active(), period);
            assertEqual(peak.elapsed(), period);
        }
    },
    function test_peak_np_padded_data() {
        const times = Array.from(new Array(200)).map((x, i) => i ** 2);
        const values = times.map(() => 1000);
        for (const period of [300, 1200, 3600]) {
            const peak = sauce.power.peakNP(period, times, values);
            assertEqual(peak.active(), period);
            assertEqual(peak.elapsed(), period);
            assertEqual(peak.np(), 1000);
            assertEqual(peak.np({external: true}), 1000);
        }
    },
    function test_peak_xp_padded_data() {
        const times = Array.from(new Array(200)).map((x, i) => i ** 2);
        const values = times.map(() => 1000);
        for (const period of [300, 1200, 3600]) {
            const peak = sauce.power.peakXP(period, times, values);
            assertEqual(peak.active(), period);
            assertEqual(peak.elapsed(), period);
            assertEqual(peak.xp(), 1000);
            assertEqual(peak.xp({external: true}), 1000);
        }
    },
    function test_np_clone() {
        const times = Array.from(new Array(200)).map((x, i) => i);
        const values = times.map(x => 100 + x);
        const roll = new sauce.power.correctedPower(times, values, {inlineNP: true});
        const clone = roll.clone();
        const clone2 = clone.clone();
        assertEqual(roll.np({force: true, external: false}), clone.np({force: true, external: false}));
        roll.add(210, 1000000);
        clone.resize();
        clone2.resize();
        assertEqual(roll.np({force: true, external: false}), clone.np({force: true, external: false}));
        assertEqual(roll.np({force: true, external: false}), clone2.np({force: true, external: false}));
    },
    function test_xp_clone() {
        const times = Array.from(new Array(200)).map((x, i) => i);
        const values = times.map(x => 100 + x);
        const roll = new sauce.power.correctedPower(times, values, {inlineXP: true});
        const clone = roll.clone();
        const clone2 = clone.clone();
        assertEqual(roll.xp({force: true, external: false}), clone.xp({force: true, external: false}));
        roll.add(210, 1000000);
        clone.resize();
        clone2.resize();
        assertEqual(roll.xp({force: true, external: false}), clone.xp({force: true, external: false}));
        assertEqual(roll.xp({force: true, external: false}), clone2.xp({force: true, external: false}));
    },
    function test_np_noclone() {
        const times = Array.from(new Array(200)).map((x, i) => i);
        const values = times.map(x => 100 + x);
        const roll = new sauce.power.correctedPower(times, values, {inlineNP: true});
        const clone = roll.clone({inlineNP: false});
        assertEqual(clone.np({force: true, external: false}), undefined);
    },
    function test_xp_noclone() {
        const times = Array.from(new Array(200)).map((x, i) => i);
        const values = times.map(x => 100 + x);
        const roll = new sauce.power.correctedPower(times, values, {inlineXP: true});
        const clone = roll.clone({inlineXP: false});
        assertEqual(clone.xp({force: true, external: false}), undefined);
    },
]);
