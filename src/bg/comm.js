
var rpc_map = {};

function add_rpc_hook(system, op, callback) {
    var sys = rpc_map[system];
    if (!sys) {
        sys = rpc_map[system] = {};
    }
    sys[op] = callback;
}

add_rpc_hook('sync', 'set', function(data, callback) {
    chrome.storage.sync.set(data, callback);
});

add_rpc_hook('sync', 'get', function(data, callback) {
    chrome.storage.sync.get(data, callback);
});


chrome.runtime.onMessageExternal.addListener(function(msg, s, responder) {
    try {
        rpc_map[msg.system][msg.op](msg.data, function() {
            /* "arguments" breaks down in serialization. */
            var args = Array.prototype.slice.call(arguments);
            responder({
                success: true,
                data: args
            });
        });
        return true; /* Inform chrome that the response is async. */
    } catch(e) {
        console.error('RPC Listener:', e);
        responder({
            success: false,
            error: e.message
        });
    }
});
