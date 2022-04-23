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
        const roll = new sauce.power.RollingPower(1200, {inlineNP: true, idealGap: 1});
        for (let i = 1; i < 3000; i++) {
            // XXX not finished, but this gets close.  Not sure we can do better with the inline method.
            roll.add(i, i / 3);
            //console.info(i, roll.np({force: true}) / roll.np({force: true, external: true}));
            //assertEqual(roll.np({force: true}), roll.np({force: true, external: true}));
        }
    },
]);
 
