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
    async function test_prop_defined_preexisting_null_branch() {
        let done;
        const root = {a: null};
        sauce.propDefined('a.b', x => done = x, {root});
        root.a = {};
        assertFalsy(done);
        root.a.b = 11;
        assertEqual(done, 11);
    },
    async function test_prop_defined_preexisting_null_branch_deep() {
        let done;
        const root = {a: null};
        sauce.propDefined('a.b.c', x => done = x, {root});
        root.a = {};
        assertFalsy(done);
        root.a.b = {};
        root.a.b.c = 11;
        assertEqual(done, 11);
    },
    async function test_prop_defined_null_temp_assignment() {
        let done;
        const root = {};
        sauce.propDefined('a.b', x => done = x, {root});
        root.a = null;
        assertFalsy(done);
        root.a = {};
        root.a.b = 11;
        assertEqual(done, 11);
    },
    async function test_prop_defined_nested_null_branch_temp_assignment() {
        let done;
        const root = {};
        sauce.propDefined('a.b.c', x => done = x, {root});
        root.a = {b: null};
        assertFalsy(done);
        root.a.b = {c: 11};
        assertEqual(done, 11);
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
        const val = {b: {c:{}}};
        const obj = {a: val};
        const done = [];
        sauce.propDefined('a', x => done.push(x), {root: obj});
        assertEqual(done[0], val);
        sauce.propDefined('a.b.c', x => done.push(x), {root: obj});
        sauce.propDefined('a.b.c', x => done.push(x), {root: obj});
        sauce.propDefined('a.b.c', x => done.push(x), {root: obj});
    },
    async function test_prop_defined_preexisting_leaky() {
        const val = {b: {c:{}}};
        const obj = {a: val};
        const done = [];
        sauce.propDefined('a', x => done.push(x), {root: obj});
        assertEqual(done[0], val);
        for (let i = 0; i < 100; i++) {
            sauce.propDefined('a.b.c', x => done.push(x), {root: obj});
        }
    },
    async function test_prop_defined_once_root() {
        const valueTypeCatalog = [
            [111, 222],
            ['111', '222'],
            [{}, {}],
            [{a: 1}, {b: 1}],
            [new Error(), new Error],
            [() => void 0, () => void 0]
        ];
        for (const [val, val2] of valueTypeCatalog) {
            const root = {};
            const done = [];
            sauce.propDefined('a', x => done.push(x), {root, once: true});
            root.a = val;
            assertEqual(root.a, val);
            assertEqual(done.pop(), val);
            assertEqual(done.length, 0);
            root.a = val;
            assertEqual(done.length, 0);
            root.a = val2;
            assertEqual(done.length, 0);
            assertEqual(root.a, val2);
        }
    },
    async function test_prop_defined_once_multi_on_same_prop() {
        const root = {};
        const done = [];
        const done2 = [];
        const val = 11;
        const val2 = 22;
        sauce.propDefined('a', x => done.push(x), {root, once: true});
        sauce.propDefined('a', x => done2.push(x), {root, once: true});
        root.a = val;
        assertEqual(root.a, val);
        assertEqual(done.pop(), val);
        assertEqual(done.length, 0);
        assertEqual(done2.pop(), val);
        assertEqual(done2.length, 0);
        root.a = val;
        assertEqual(done.length, 0);
        assertEqual(done2.length, 0);
        root.a = val2;
        assertEqual(root.a, val2);
        assertEqual(done.length, 0);
        assertEqual(done2.length, 0);
    },
    async function test_prop_defined_once_multi_on_dif_prop_same_value() {
        const root = {};
        const done = [];
        const done2 = [];
        const val = 11;
        const val2 = 22;
        sauce.propDefined('a', x => done.push(x), {root, once: true});
        sauce.propDefined('b', x => done2.push(x), {root, once: true});
        root.a = val;
        root.b = val;
        assertEqual(root.a, val);
        assertEqual(done.pop(), val);
        assertEqual(done.length, 0);
        assertEqual(root.b, val);
        assertEqual(done2.pop(), val);
        assertEqual(done2.length, 0);
        root.a = val;
        root.b = val;
        assertEqual(done.length, 0);
        assertEqual(done2.length, 0);
        root.a = val2;
        root.b = val2;
        assertEqual(root.a, val2);
        assertEqual(root.b, val2);
        assertEqual(done.length, 0);
        assertEqual(done2.length, 0);
    },
    async function test_prop_defined_once_multi_on_dif_prop_same_value_nested() {
        const root = {};
        const done = [];
        const done2 = [];
        const val = 11;
        const val2 = 11;
        const outerVal = {_2ndLevel: val};
        const outerVal2 = {_2ndLevel: val2};
        sauce.propDefined('a._2ndLevel', x => done.push(x), {root, once: true});
        sauce.propDefined('b._2ndLevel', x => done2.push(x), {root, once: true});
        root.a = outerVal;
        root.b = outerVal;
        assertEqual(root.a, outerVal);
        assertEqual(done.pop(), val);
        assertEqual(done.length, 0);
        assertEqual(root.b, outerVal);
        assertEqual(done2.pop(), val);
        assertEqual(done2.length, 0);
        root.a = outerVal;
        root.b = outerVal;
        assertEqual(done.length, 0);
        assertEqual(done2.length, 0);
        root.a = outerVal2;
        root.b = outerVal2;
        assertEqual(root.a, outerVal2);
        assertEqual(root.b, outerVal2);
        assertEqual(done.length, 0);
        assertEqual(done2.length, 0);
    },
    async function test_prop_defined_once_multi_on_same_prop() {
        const root = {};
        const done = [];
        const done2 = [];
        const val = 11;
        const val2 = 22;
        sauce.propDefined('a', x => done.push(x), {root, once: true});
        sauce.propDefined('a', x => done2.push(x), {root, once: false});
        root.a = val;
        assertEqual(root.a, val);
        assertEqual(done.pop(), val);
        assertEqual(done.length, 0);
        assertEqual(done2.pop(), val);
        assertEqual(done2.length, 0);
        root.a = val;
        assertEqual(done.length, 0);
        assertEqual(done2.length, 0);
        root.a = val2;
        assertEqual(root.a, val2);
        assertEqual(done.length, 0);
        assertEqual(done2.length, 1);
    },
    async function test_prop_defined_once_multi_different_depths() {
        const root = {};
        const done = [];
        const done2 = [];
        sauce.propDefined('a', x => done.push(x), {root, once: true});
        sauce.propDefined('a.b', x => done2.push(x), {root, once: true});
        const obj = {};
        root.a = obj;
        root.a.b = 11;
        assertEqual(root.a.b, 11);
        assertEqual(done.pop(), obj);
        assertEqual(done.length, 0);
        assertEqual(done2.pop(), 11);
        assertEqual(done2.length, 0);
    },
    async function test_prop_defined_once_cleanup_listeners() {
        const root = {};
        sauce.propDefined('a.b', () => void 0, {root, once: true});
        root.a = {};
        root.a.b = 11;
        assertEqual(root.a.b, 11);
        assertFalsy(Object.getOwnPropertyDescriptor(root, 'a').set);
        assertFalsy(Object.getOwnPropertyDescriptor(root.a, 'b').set);
    },
    async function test_prop_defined_once_branch_reassigned() {
        const root = {a: {}};
        let done;
        sauce.propDefined('a.b', () => done = true, {root, once: true});
        root.a = {};
        root.a.b = 11;
        assertEqual(root.a.b, 11);
        assertTruthy(done);
    },
    async function test_prop_defined_with_preexisting_define_prop_value() {
        const root = {};
        const done = [];
        Object.defineProperty(root, 'a', {value: 11});
        sauce.propDefined('a', x => done.push(x), {root, once: true});
        assertEqual(root.a, 11);
        assertEqual(done.pop(), 11);
    },
    async function test_prop_defined_with_preexisting_define_prop_getter_leaf_unconfigurable() {
        const root = {};
        Object.defineProperty(root, 'a', {
            value: 11,
            configurable: false,
        });
        assertException(() => sauce.propDefined('a', null, {root, once: false}), TypeError);
        let done;
        sauce.propDefined('a', x => done = x, {root, once: true});
        assertEqual(done, 11);
    },
    async function test_prop_defined_with_preexisting_define_prop_getter_leaf_readonly() {
        const root = {};
        Object.defineProperty(root, 'a', {
            get: () => 11,
            configurable: true,
        });
        assertException(() => sauce.propDefined('a', null, {root, once: false}), TypeError);
        let done;
        sauce.propDefined('a', () => done = true, {root, once: true});
        assertTruthy(done);
    },

    async function test_prop_defined_with_preexisting_define_prop_getter_leaf_writeonly() {
        const root = {};
        Object.defineProperty(root, 'a', {
            set: () => 11,
            configurable: true,
        });
        assertException(() => sauce.propDefined('a', null, {root, once: false}), TypeError);
        assertException(() => sauce.propDefined('a', null, {root, once: true}), TypeError);
        assertEqual(root.a, undefined);
    },
    async function test_prop_defined_with_preexisting_define_prop_getter_branch_readonly() {
        for (const configurable of [true, false]) {
            const root = {};
            const done = [];
            const obj = {};
            let getterCalls = 0;
            Object.defineProperty(root, 'a', {
                get: () => (getterCalls++, obj),
                set: configurable ? undefined : x => void 0,
                configurable,
            });
            assertException(() => sauce.propDefined('a.b', x => done.push(x), {root}), TypeError);
            assertException(() => sauce.propDefined('a.b', x => done.push(x), {root, once: true}), TypeError);
            sauce.propDefined('a.b', x => done.push(x), {root, ignoreDefinedParents: true});
            assertEqual(root.a, obj);
            root.a.b = 11;
            assertEqual(done.pop(), 11);
            const called = getterCalls;
            root.a;
            assertEqual(getterCalls, called + 1);
        }
    },
    async function test_prop_defined_with_preexisting_define_prop_setter_leaf() {
        const root = {};
        const done = [];
        let internal;
        Object.defineProperty(root, 'a', {
            get: () => internal,
            set: x => internal = '' + x,
            configurable: true,
        });
        sauce.propDefined('a', x => done.push(x), {root});
        root.a = 11;
        assertEqual(done.pop(), '11'); // Value should be post-setter based.
        assertEqual(root.a, '11');
        root.a = 22;
        assertEqual(root.a, '22');
    },
    async function test_prop_defined_once_with_preexisting_define_prop_setter_leaf() {
        const root = {};
        const done = [];
        let internal;
        Object.defineProperty(root, 'a', {
            get: () => internal,
            set: x => internal = '' + x,
            configurable: true,
        });
        sauce.propDefined('a', x => done.push(x), {root, once: true});
        root.a = 11;
        assertEqual(done.pop(), '11'); // Value should be post-setter based.
        assertEqual(root.a, '11');
        root.a = 22;
        assertEqual(root.a, '22');
    },
]);
