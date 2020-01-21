/* global addTests, sauce, assertFalsy, assertEqual  */

addTests([
    async function test_prop_defined_one_at_a_time() {
        let done;
        const obj = {};
        sauce.propDefined('foo.bar', x => done = x, obj);
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
        sauce.propDefined('foo.bar', x => done = x, obj);
        assertFalsy(done);
        obj.foo = {bar: 1};
        assertEqual(done, 1);
        assertEqual(obj.foo.bar, 1);
    },
    async function test_prop_defined_concurrency() {
        let done1;
        let done2;
        const obj = {};
        sauce.propDefined('foo.bar', x => done1 = x, obj);
        sauce.propDefined('foo.bar', x => done2 = x, obj);
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
        sauce.propDefined('foo.bar.aaa', x => done1 = x, obj);
        sauce.propDefined('foo.bar.bbb', x => done2 = x, obj);
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
        sauce.propDefined('foo.bar.aaa', x => done = x, obj);
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
]);
