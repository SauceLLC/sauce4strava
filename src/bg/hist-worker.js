/* global importScripts, sauce */

importScripts('/src/common/base.js');
self.sauceBaseInit();
importScripts('/src/common/lib.js');

const calls = {
    findPeaks,
};

self.addEventListener('message', async ev => {
    function resolve(value) {
        self.postMessage({success: true, value, id: ev.data.id});
    }
    function reject(error) {
        self.postMessage({success: false, value: error, id: ev.data.id});
    }
    if (!ev.data || !ev.data.call || ev.data.id == null) {
        reject('invalid-message');
        throw new Error("Invalid Message");
    }
    const call = ev.data.call;
    if (!calls[call]) {
        reject('invalid-call');
        throw new Error("Invalid Call");
    }
    try {
        resolve(await calls[call](...ev.data.args));
    } catch(e) {
        reject(e);
        throw e;
    }
});


async function findPeaks(...args) {
    return await sauce.research.findPeaks(...args);
}
