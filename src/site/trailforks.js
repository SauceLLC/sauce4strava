/* global sauce  */

sauce.ns('trailforks', ns => {
    'use strict';

    const tfCache = new sauce.cache.TTLCache('trailforks', 43200 * 1000);
 
    function *middleOutIter(data, start) {
        const len = data.length;
        let count = 0;
        let left = Math.max(0, Math.min(len, start || Math.floor(len / 2)));
        let right = left;
        while (count++ < len) {
            let idx;
            if ((count % 2 && left > 0) || right === len) {
                idx = --left;
            } else {
                idx = right++;
            }
            yield [data[idx], idx];
        }
    }


    async function fetchTrailsUnofficial(bbox) {
        const tfHost = 'https://d35dnzkynq0s8c.cloudfront.net';
        const bboxKey = `bbox-${JSON.stringify(bbox)}`;
        let data = await tfCache.get(bboxKey);
        if (!data) {
            const q = new URLSearchParams();
            q.set('rmsP', 'j2');
            q.set('mod', 'trailforks');
            q.set('op', 'tracks');
            q.set('format', 'geojson');
            q.set('z', '100');  // nearly zero impact, but must be roughly over 10
            q.set('layers', 'tracks'); // comma delim (markers,tracks,polygons)
            q.set('bboxa', [bbox.swc[1], bbox.swc[0], bbox.nec[1], bbox.nec[0]].join(','));
            const resp = await fetch(`${tfHost}/rms/?${q.toString()}`);
            data = await resp.json();
            if (data.rmsS === false) {
                throw new Error(`TF API Error: ${data.rmsM}`);
            }
            await tfCache.set(bboxKey, data);
        }
        const trailQ = new URLSearchParams();
        trailQ.set('scope', 'full');
        trailQ.set('api_key', tfApiKey());
        const trails = data.features.filter(x => x.type === 'Feature' && x.properties.type === 'trail');
        // In leu of having a working trails API, do it manually..
        return await Promise.all(trails.map(async x => { 
            const trailKey = `trail-${x.id}`;
            let data = await tfCache.get(trailKey);
            if (!data) {
                trailQ.set('id', x.id);
                const resp = await fetch(`${tfHost}/api/1/trail/?${trailQ.toString()}`);
                data = await resp.json();
                if (data.error !== 0) {
                    throw new Error(`TF API Error: ${data.error} ${data.message}`);
                }
                await tfCache.set(trailKey, data);
            }
            return data.data;
        }));
        /*return data.features.filter(x => x.type === 'Feature' && x.properties.type === 'trail').map(x => {
            // Make data look more like the official api
            return Object.assign({}, x.properties, {
                title: x.properties.name,
                track: {
                    encodedPath: x.geometry.encodedpath
                }
            });
        });*/
    }


    function tfApiKey() {
        return 'cats'.split('').map((_, i) =>
            String.fromCharCode(1685021555 >> i * 8 & 0xff)).reverse().join('');
    }


    /*
    async function fetchTrails(bbox) {
        //const tfHost = 'https://www.trailforks.com';
        const tfHost = 'https://d35dnzkynq0s8c.cloudfront.net';
        const q = new URLSearchParams();
        q.set('api_key', tfApiKey());
        q.set('rows', '100');
        q.set('scope', 'full');
        q.set('filter', `bbox::${[bbox.swc[0], bbox.swc[1], bbox.nec[0], bbox.nec[1]].join(',')}`);
        const trails = [];
        let page = 1;
        for (;;) {
            q.set('page', page++);
            const resp = await fetch(`${tfHost}/api/1/trails?${q.toString()}`);
            const data = await resp.json();
            if (data.error !== 0) {
                throw new Error(`TF API Error: ${data.error} ${data.message}`);
            }
            if (data.data && data.data.length) {
                for (const x of data.data) {
                    trails.push(x);
                }
            } else {
                break;
            }
        }
        return trails;
    }
    */


    const bench = new sauce.Benchmark('tf');
    ns.intersections = async function(latlngStream, distStream) {
        bench.enter();
        const hashData = new Float32Array([].concat(
            latlngStream.map(x => x[0]),
            latlngStream.map(x => x[1]),
            distStream));
        const argsHash = await sauce.digest('SHA-1', hashData);
        bench.step();
        const cacheKey = `intersections-${argsHash}`;
        const cacheHit = await tfCache.get(cacheKey);
        if (cacheHit) {
            bench.leave();
            return cacheHit;
        }
        const bbox = sauce.geo.boundingBox(latlngStream);
        const trails = await fetchTrailsUnofficial(bbox);
        //const trails = await fetchTrails(bbox);
        console.info("Raw trail count:", trails.length); // XXX
        bench.step();
        const trailIntersectMatrix = [];
        for (const trail of trails) {
            const lats = trail.track.latitude.split(',');
            const lngs = trail.track.longitude.split(',');
            const path = lats.map((x, i) => [Number(x), Number(lngs[i])]);
            if (!sauce.geo.boundsOverlap(sauce.geo.boundingBox(path), bbox)) {
                continue;
            }
            const intersections = [];
            let match;
            let lastIntersectIdx;
            const minMatchDistance = 10;
            for (let i = 0; i < latlngStream.length; i++) {
                let intersects = null;
                let closestDistance = Infinity;
                for (const [xLoc, ii] of middleOutIter(path, lastIntersectIdx + 1)) {
                    const distance = sauce.geo.distance(latlngStream[i], xLoc);
                    if (distance < closestDistance) {
                        closestDistance = distance;
                    }
                    if (distance <= minMatchDistance) {
                        intersects = ii;
                        match = true;
                        lastIntersectIdx = ii;
                        break;
                    }
                }
                if (closestDistance > minMatchDistance * 10) {
                    // Optimization..
                    // Scan fwd till we are at least potentially near the trail.
                    const offt = distStream[i];
                    const maxSkipDistance = closestDistance * 0.80 - minMatchDistance;
                    while (i < latlngStream.length - 1) {
                        const covered = distStream[i + 1] - offt;
                        if (covered < maxSkipDistance) {
                            intersections.push(null);
                            i++;
                        } else {
                            break;
                        }
                    }
                }
                intersections.push(intersects);
            }
            if (match) {
                const indexes = intersections.reduce((agg, x, i) => (x != null && agg.push([x, i]), agg), []);
                let lastPathIdx;
                let lastStreamIdx;
                for (const [pathIdx, streamIdx] of indexes) {
                    // Fill any gaps where pathIdx is contiguous.
                    // XXX do sanity distance checks because sometimes a ride can touch a trail head
                    // on the start and end of a ride which leads to the entire ride getting filled.
                    if (lastPathIdx !== undefined) {
                        if (Math.abs(pathIdx - lastPathIdx) === 1 &&
                            Math.abs(streamIdx - lastStreamIdx) !== 1) {
                            const fwd = streamIdx > lastStreamIdx;
                            const start = fwd ? lastStreamIdx : streamIdx;
                            const end = fwd ? streamIdx : lastStreamIdx;
                            for (let i = start + 1; i < end; i++) {
                                intersections[i] = pathIdx + ((lastPathIdx - pathIdx) / 2);
                            }
                        }
                    }
                    lastPathIdx = pathIdx;
                    lastStreamIdx = streamIdx;
                }
                trailIntersectMatrix.push({
                    path,
                    trail,
                    intersections,
                    indexes: intersections.reduce((agg, x, i) => (x != null && agg.push([x, i]), agg), [])
                });
            }
        }
        console.info("Matching trail count:", trailIntersectMatrix.length); // XXX
        await tfCache.set(cacheKey, trailIntersectMatrix);
        bench.leave();
        return trailIntersectMatrix;
    };
});
