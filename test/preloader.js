/* global addTests, sauce, assertFalsy, assertEqual  */

addTests([
    async function test_prop_defined_one_at_a_time() {
        let done;
        const obj = {};
        sauce.propDefined('foo.bar', x => done = x, {root: obj});
        assertFalsy(done);
        assertFalsy(obj.foo);
        obj.foo = {};
        assertFalsy(done);
        assertFalsy(obj.foo.bar);
        obj.foo.bar = 1;
        assertEqual(done, 1);
        assertEqual(obj.foo.bar, 1);
    },
    async function test_prop_defined_multiple_at_a_time() {
        let done;
        const obj = {};
        sauce.propDefined('foo.bar', x => done = x, {root: obj});
        assertFalsy(done);
        obj.foo = {bar: 1};
        assertEqual(done, 1);
        assertEqual(obj.foo.bar, 1);
    },
    async function test_prop_defined_concurrency() {
        let done1;
        let done2;
        const obj = {};
        sauce.propDefined('foo.bar', x => done1 = x, {root: obj});
        sauce.propDefined('foo.bar', x => done2 = x, {root: obj});
        assertFalsy(done1);
        assertFalsy(done2);
        obj.foo = {};
        assertFalsy(done1);
        assertFalsy(done2);
        obj.foo.bar = 1;
        assertEqual(done1, 1);
        assertEqual(done2, 1);
        assertEqual(obj.foo.bar, 1);
    },
    async function test_prop_defined_concurrency_shared_root() {
        let done1;
        let done2;
        const obj = {};
        sauce.propDefined('foo.bar.aaa', x => done1 = x, {root: obj});
        sauce.propDefined('foo.bar.bbb', x => done2 = x, {root: obj});
        assertFalsy(done1);
        assertFalsy(done2);
        obj.foo = {};
        assertFalsy(done1);
        assertFalsy(done2);
        obj.foo.bar = {};
        obj.foo.bar.aaa = 'aaa';
        assertEqual(done1, 'aaa');
        assertEqual(obj.foo.bar.aaa, 'aaa');
        assertFalsy(done2);
        assertFalsy(obj.foo.bar.bbb);
        obj.foo.bar.bbb = 'bbb';
        assertEqual(done2, 'bbb');
        assertEqual(obj.foo.bar.bbb, 'bbb');
    },
    async function test_prop_defined_set_with_non_extensible_value_first() {
        let done;
        const obj = {};
        sauce.propDefined('foo.bar.aaa', x => done = x, {root: obj});
        assertFalsy(done);
        obj.foo = {};
        assertFalsy(done);
        obj.foo.bar = 1;
        assertFalsy(done);
        obj.foo.bar = {};
        assertFalsy(done);
        obj.foo.bar.aaa = 2;
        assertEqual(done, 2);
        assertEqual(obj.foo.bar.aaa, 2);
    },
    async function test_prop_defined_double_set() {
        const obj = {};
        const done = [];
        sauce.propDefined('foo.bar', x => {
            done.push(x);
        }, {root: obj});
        assertFalsy(done.length);
        assertFalsy(obj.foo);
        obj.foo = {};
        assertFalsy(done.length);
        assertFalsy(obj.foo.bar);
        obj.foo.bar = 1;
        assertEqual(obj.foo.bar, 1);
        assertEqual(done.length, 1);
        assertEqual(done[0], 1);
        obj.foo.bar = 2;
        assertEqual(obj.foo.bar, 2);
        assertEqual(done.length, 2);
        assertEqual(done[0], 1);
        assertEqual(done[1], 2);
    },
    async function test_prop_defined_double_set_same_value() {
        const obj = {};
        const done = [];
        sauce.propDefined('foo.bar', x => {
            done.push(x);
        }, {root: obj});
        assertFalsy(done.length);
        assertFalsy(obj.foo);
        obj.foo = {};
        assertFalsy(done.length);
        assertFalsy(obj.foo.bar);
        obj.foo.bar = 1;
        assertEqual(obj.foo.bar, 1);
        assertEqual(done.length, 1);
        assertEqual(done[0], 1);

        obj.foo.bar = 1;
        assertEqual(obj.foo.bar, 1);
        assertEqual(done.length, 1);
        assertEqual(done[0], 1);
    },
    async function test_prop_defined_double_set_replace_structure() {
        const obj = {};
        const done = [];
        sauce.propDefined('foo.bar', x => {
            done.push(x);
        }, {root: obj});
        assertFalsy(done.length);
        assertFalsy(obj.foo);
        obj.foo = {};
        assertFalsy(done.length);
        assertFalsy(obj.foo.bar);
        obj.foo.bar = 1;
        assertEqual(obj.foo.bar, 1);
        assertEqual(done.length, 1);
        assertEqual(done[0], 1);

        obj.foo = {bar: 2};
        assertEqual(obj.foo.bar, 2);
        assertEqual(done.length, 2);
        assertEqual(done[0], 1);
        assertEqual(done[1], 2);
    },
    async function test_prop_defined_double_set_replace_root_structure() {
        const obj = {};
        const done = [];
        sauce.propDefined('foo.bar.baz', x => {
            done.push(x);
        }, {root: obj});
        assertFalsy(done.length);
        assertFalsy(obj.foo);
        obj.foo = {bar: {baz: 1}};
        obj.foo.bar.baz = 1;
        assertEqual(obj.foo.bar.baz, 1);
        assertEqual(done.length, 1);
        assertEqual(done[0], 1);

        obj.foo = {bar: {baz: 2}};
        assertEqual(obj.foo.bar.baz, 2);
        assertEqual(done.length, 2);
        assertEqual(done[0], 1);
        assertEqual(done[1], 2);
    },
    async function test_prop_defined_triple_set() {
        const obj = {};
        const done = [];
        sauce.propDefined('foo.bar', x => {
            done.push(x);
        }, {root: obj});
        assertFalsy(done.length);
        assertFalsy(obj.foo);
        obj.foo = {};
        assertFalsy(done.length);
        assertFalsy(obj.foo.bar);
        obj.foo.bar = 1;
        assertEqual(obj.foo.bar, 1);
        assertEqual(done.length, 1);
        assertEqual(done[0], 1);

        obj.foo = {bar: 2};  // clobbers the catches
        assertEqual(obj.foo.bar, 2);
        assertEqual(done.length, 2);
        assertEqual(done[0], 1);
        assertEqual(done[1], 2);

        obj.foo.bar = 3;
        assertEqual(obj.foo.bar, 3);
        assertEqual(done.length, 3);
        assertEqual(done[0], 1);
        assertEqual(done[1], 2);
        assertEqual(done[2], 3);
    },
    async function test_prop_defined_multiple_incomplete_sets() {
        const obj = {};
        const done = [];
        sauce.propDefined('foo.bar.baz', x => {
            done.push(x);
        }, {root: obj});
        assertFalsy(done.length);
        assertFalsy(obj.foo);
        obj.foo = {};
        assertFalsy(done.length);
        assertFalsy(obj.foo.bar);
        obj.foo.bar = 1;
        assertEqual(obj.foo.bar, 1);
        assertEqual(obj.foo.bar.baz, undefined);
        assertEqual(done.length, 0);

        obj.foo = {meh: 2};
        obj.foo = {meh: 3};
        obj.foo = {meh: 4};
        assertEqual(obj.foo.bar, undefined);
        obj.foo = {bar: {baz: 1}};
        assertEqual(done.length, 1);
        assertEqual(obj.foo.bar.baz, 1);
    },
    async function test_prop_defined_same_value_many_complete() {
        const obj = {};
        const done = [];
        sauce.propDefined('foo.bar.baz', x => {
            done.push(x);
        }, {root: obj});
        const val = {bar: {baz: 'x'}};
        obj.foo = val;
        assertEqual(obj.foo.bar.baz, 'x');
        assertEqual(done.length, 1);
        for (let i = 0; i < 1000; i++) {  // look for stack overflow
            obj.foo = val;
        }
        assertEqual(obj.foo.bar.baz, 'x');
        assertEqual(done.length, 1);
    },
    async function test_prop_defined_same_value_many_incomplete() {
        const obj = {};
        const done = [];
        sauce.propDefined('foo.bar.baz', x => {
            done.push(x);
        }, {root: obj});
        const val = {bar: {}};
        obj.foo = val;
        assertEqual(obj.foo.bar.baz, undefined);
        assertEqual(done.length, 0);
        for (let i = 0; i < 1000; i++) {  // look for stack overflow
            obj.foo = val;
        }
        assertEqual(obj.foo.bar.baz, undefined);
        assertEqual(done.length, 0);
        obj.foo.bar.baz = 'x';
        assertEqual(obj.foo.bar.baz, 'x');
        assertEqual(done.length, 1);
    },
    async function test_prop_defined_same_value_many_incomplete_single_build_up() {
        const obj = {};
        const done = [];
        sauce.propDefined('foo.bar.baz', x => {
            done.push(x);
        }, {root: obj});
        obj.foo = {};
        obj.foo.bar = {};
        const val = obj.foo;
        assertEqual(obj.foo.bar.baz, undefined);
        assertEqual(done.length, 0);
        for (let i = 0; i < 1000; i++) {  // look for stack overflow
            obj.foo = val;
        }
        assertEqual(obj.foo.bar.baz, undefined);
        assertEqual(done.length, 0);
        obj.foo.bar.baz = 'x';
        assertEqual(obj.foo.bar.baz, 'x');
        assertEqual(done.length, 1);
    },
    async function test_prop_defined_same_value_many_incomplete_multi_listener() {
        const obj = {};
        const barDone = [];
        sauce.propDefined('foo.bar', x => {
            barDone.push(x);
        }, {root: obj});
        const bazDone = [];
        sauce.propDefined('foo.bar.baz', x => {
            bazDone.push(x);
        }, {root: obj});
        assertEqual(barDone.length, 0);
        obj.foo = {};
        assertEqual(barDone.length, 0);
        obj.foo.bar = {};
        assertEqual(barDone.length, 1);
        assertEqual(obj.foo.bar.baz, undefined);
        assertEqual(barDone.length, 1);
        assertEqual(bazDone.length, 0);

        for (let i = 0; i < 1000; i++) {  // look for stack overflow
            obj.foo = obj.foo;
        }
        assertEqual(obj.foo.bar.baz, undefined);
        assertEqual(barDone.length, 1);
        assertEqual(bazDone.length, 0);

        for (let i = 0; i < 1000; i++) {  // look for stack overflow
            obj.foo.bar = obj.foo.bar;
        }
        assertEqual(obj.foo.bar.baz, undefined);
        assertEqual(barDone.length, 1);
        assertEqual(bazDone.length, 0);

        const baz = function() {};
        for (let i = 0; i < 1000; i++) {  // look for stack overflow
            obj.foo.bar.baz = baz;
        }
        assertEqual(obj.foo.bar.baz, baz);
        assertEqual(barDone.length, 1);
        assertEqual(bazDone.length, 1);
    },
    async function test_prop_defined_deep_struct() {
        const obj = {};
        const done = [];
        const props = 'abcdefghijklmnopqrstuvwxyz'.split('');
        sauce.propDefined(props.join('.') + '.end', x => {
            done.push(x);
        }, {root: obj});
        for (let i = 0; i < 100; i++) {
            let o = obj;
            for (const p of props) {
                o = (o[p] = (o[p] || {}));
            }
            assertEqual(done.length, 0);
        }
        let o = obj;
        for (const p of props) {
            o = (o[p] = (o[p] || {}));
        }
        assertEqual(done.length, 0);
        for (let i = 0; i < 100; i++) {
            o.end = i;
            assertEqual(done.length, i + 1);
            assertEqual(done[i], i);
        }
    },
    async function test_prop_defined_preexisting_simple() {
        const obj = {a: 1};
        const done = [];
        sauce.propDefined('a', x => done.push(x), {root: obj});
        assertEqual(done[0], 1);
    },
    async function test_prop_defined_preexisting_object() {
        const val = {b: 1};
        const obj = {a: val};
        const done = [];
        sauce.propDefined('a', x => done.push(x), {root: obj});
        assertEqual(done[0], val);
    },
    async function test_prop_defined_preexisting_listener_simple() {
        const obj = {a: 1};
        const done = [];
        sauce.propDefined('a', null, {root: obj});
        sauce.propDefined('a', x => done.push(x), {root: obj});
        assertEqual(done[0], 1);
    },
    async function test_prop_defined_preexisting_object() {
        const val = {b: 1};
        const obj = {a: val};
        const done = [];
        sauce.propDefined('a', null, {root: obj});
        sauce.propDefined('a', x => done.push(x), {root: obj});
        assertEqual(done[0], val);
    },
]);
