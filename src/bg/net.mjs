/* global sauce, browser */


export class FetchError extends Error {
    static fromResp(resp) {
        const msg = `${this.name}: ${resp.url} [${resp.status}]`;
        const instance = new this(msg);
        instance.resp = resp;
        return instance;
    }
}


export class Timeout extends Error {}


export class CancelledError extends Error {
    constructor() {
        super("cancelled");
    }
}


export async function online(timeout) {
    if (navigator.onLine === undefined || navigator.onLine) {
        return;
    }
    console.debug("Network offline");
    await new Promise((resolve, reject) => {
        let timeoutID;
        const cb = () => {
            if (navigator.onLine) {
                console.debug("Network online");
                if (timeout) {
                    clearTimeout(timeoutID);
                }
                removeEventListener('online', cb);
                resolve();
            }
        };
        addEventListener('online', cb);
        if (timeout) {
            timeoutID = setTimeout(() => {
                console.warn("Timeout waiting for online network");
                removeEventListener('online', cb);
                reject(new Timeout('network offline'));
            }, timeout);
        }
    });
}


export async function retryFetch(urn, options={}) {
    const maxErrors = 3;
    const headers = options.headers || {};
    headers["x-requested-with"] = "XMLHttpRequest";  // Required for most Strava endpoints
    const url = `https://www.strava.com${urn}`;
    for (let r = 1;; r++) {
        let resp;
        let fetchError;
        await online(120000);
        try {
            resp = await fetch(url, Object.assign({headers}, options));
        } catch(e) {
            fetchError = e;
        }
        if (resp && resp.ok) {
            return resp;
        }
        if ((!resp || (resp.status >= 500 && resp.status < 600)) && r <= maxErrors) {
            console.info(`Server error: ${urn} - Retry: ${r}/${maxErrors}`);
            // To avoid triggering Anti-DDoS HTTP Throttling of Extension-Originated Requests
            // perform a cool down before relinquishing control. Ie. do one last sleep.
            // See: http://dev.chromium.org/throttling
            const sleeping = sauce.sleep(5000 * 2 ** r);
            if (options.cancelEvent) {
                await Promise.race([sleeping, options.cancelEvent.wait()]);
                if (options.cancelEvent.isSet()) {
                    throw new CancelledError();
                }
            } else {
                await sleeping;
            }
            if (r < maxErrors) {
                continue;
            }
        }
        if (fetchError) {
            throw fetchError;
        } else if (resp.status === 429) {
            const delay = 30000 * 2 ** r;
            console.warn(`Hit Throttle Limits: Delaying next request for ${Math.round(delay / 1000)}s`);
            if (options.cancelEvent) {
                await Promise.race([sauce.sleep(delay), options.cancelEvent.wait()]);
                if (options.cancelEvent.isSet()) {
                    throw new CancelledError();
                }
            } else {
                await sauce.sleep(delay);
            }
            continue;
        } else {
            throw FetchError.fromResp(resp);
        }
    }
}


