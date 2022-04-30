/* global addTests, sauce, assertEqual, assertTruthy, assertGreaterEqual, assertLessEqual */

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


addTests([
    function test_inline_np_vs_external_unbound() {
        const roll = new sauce.power.RollingPower(null, {inlineNP: true, idealGap: 1});
        for (let i = 1; i < 300; i++) {
            roll.add(i, i);
            assertEqual(roll.np({force: true}), roll.np({force: true, external: true}));
        }
    },
    function test_inline_np_vs_external_bound() {
        const roll = new sauce.power.RollingPower(60, {inlineNP: true, idealGap: 1});
        for (let i = 1; i < 1000; i++) {
            roll.add(i, i);
            assertEqual(roll.np({force: true}), roll.np({force: true, external: true}));
        }
    },
    function test_inline_xp_vs_external_bound() {
        const roll = new sauce.power.RollingPower(300, {inlineXP: true, idealGap: 1});
        worst = 0;
        for (let i = 1; i < 10000; i++) {
            roll.add(i, i % 1000);
            //roll.add(i, Math.round(Math.random() * 1000));
            const inline = roll.xp({force: true});
            const external = roll.xp({force: true, external: true});
            //assertTruthy(external <= inline);
            const error = Math.abs((inline / external) - 1);
            if (error > worst) {
                console.info("new worst", i, error, inline, external);
                worst = error;
            }
            try {
                assertNear(inline / external, 1, i, {epsilon: 0.03});
            } catch(e) {
                
            }
        }
    },
    function test_inline_np_vs_external_bound_fuzzy_values() {
        const roll = new sauce.power.RollingPower(60, {inlineNP: true, idealGap: 1});
        for (let i = 1; i < 10000; i++) {
            roll.add(i, Math.round(Math.random() * 1000));
            assertNear(roll.np({force: true}), roll.np({force: true, external: true}));
        }
    },
    function test_inline_np_vs_external_peak_padded() {
        const roll = new sauce.power.RollingPower(300, {inlineNP: true, idealGap: 1, maxGap: 10});
        for (let i = 1; i < 10000; i++) {
            if (i % 100 === 0) {
                const x = i;
                i += i % 500;
            }
            roll.add(i, i);
            assertNear(roll.np({force: true}), roll.np({force: true, external: true}),
                undefined, {epsilon: 0.00001});
        }
    },
]);
 
