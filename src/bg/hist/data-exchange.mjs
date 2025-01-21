/* global sauce */

import * as hist from '/src/bg/hist.mjs';
import * as fflate from '/src/common/fflate.mjs';
import {FITSerializer, TCXSerializer, GPXSerializer} from '/src/common/export.mjs';


const {
    ActivitiesStore,
    StreamsStore,
    AthletesStore,
} = sauce.hist.db;

const DBTrue = 1;

const actsStore = ActivitiesStore.singleton();
const streamsStore = StreamsStore.singleton();
const athletesStore = AthletesStore.singleton();


class SauceZip extends fflate.Zip {
    constructor() {
        super();
        this.ondata = this._ondata.bind(this);
        this.size = 0;
        this._chunks = [];
        this._isDone;
    }

    _ondata(e, data, isLast) {
        if (e) {
            throw e;
        }
        this._chunks.push(data);
        this.size += data.byteLength;
    }

    addFile(name, data, {level, mem, mtime}={}) {
        if (this._isDone) {
            throw new TypeError("ZIP is done");
        }
        const prevSize = this.size;
        const zf = new fflate.ZipDeflate(name, {level, mem});
        if (mtime) {
            zf.mtime = +mtime;
        }
        this.add(zf);
        zf.push(data instanceof ArrayBuffer ? new Uint8Array(data) : data, /*isLast*/ true);
        return this.size - prevSize;
    }

    end() {
        super.end();
        this._isDone = true;
    }

    getBlob() {
        if (!this._isDone) {
            this.end();
        }
        const b = new Blob(this._chunks, {type: 'application/octet-stream'});
        this._chunks.length = 0;
        return b;
    }
}


export class DataExchange extends sauce.proxy.Eventing {
    constructor(athleteId, {name}={}) {
        super();
        this.name = name;
        this.fileNum = 1;
        this.athleteId = athleteId;
        this.importing = {};
        this.importedAthletes = new Set();
        this.fileCache = new sauce.cache.TTLCache('file-cache', 900 * 1000);
    }

    async export() {
        // Use a size estimate scheme to try and stay within platform limits.
        let sizeEstimate = 0;
        const sizeLimit = 4 * 1024 * 1024;
        const batch = [];
        const dispatch = () => {
            const ev = new Event('data');
            ev.data = batch.map(JSON.stringify);
            batch.length = 0;
            sizeEstimate = 0;
            this.dispatchEvent(ev);
        };
        if (this.athleteId) {
            batch.push({store: 'athletes', data: await athletesStore.get(this.athleteId)});
            sizeEstimate += 1000;
        } else {
            for (const data of await athletesStore.getAll()) {
                sizeEstimate += 1000;
                batch.push({store: 'athletes', data});
            }
        }
        const actsWork = (async () => {
            const iter = this.athleteId ?
                actsStore.byAthlete(this.athleteId) :
                actsStore.values(null);
            for await (const data of iter) {
                // We want a clean slate on restore.
                if (data.syncState && data.syncState.local) {
                    delete data.syncState.local;
                }
                batch.push({store: 'activities', data});
                sizeEstimate += 1500;  // Tuned on my data + headroom.
                if (sizeEstimate >= sizeLimit) {
                    dispatch();
                }
            }
        })();
        const streamsWork = (async () => {
            const iter = this.athleteId ?
                streamsStore.byAthlete(this.athleteId, null) :
                streamsStore.values(null);
            const estSizePerArrayEntry = 6.4;  // Tuned on my data + headroom.
            for await (const data of iter) {
                batch.push({store: 'streams', data});
                sizeEstimate += 100 + (data && data.data) ?
                    data.data.length * estSizePerArrayEntry : 0;
                if (sizeEstimate >= sizeLimit) {
                    dispatch();
                }
            }
        })();
        await Promise.all([actsWork, streamsWork]);
        if (batch.length) {
            dispatch();
        }
    }

    async import(data) {
        if (hist.syncManager && !hist.syncManager.stopped) {
            await hist.syncManager.stop();
        }
        let newAthletes;
        for (const x of data) {
            const {store, data} = JSON.parse(x);
            if (!this.importing[store]) {
                this.importing[store] = [];
            }
            this.importing[store].push(data);
            newAthletes |= store === 'athletes';  // Immediate flush for client UI.
        }
        const size = sauce.data.sum(Object.values(this.importing).map(x => x.length));
        if (size > 1000 || newAthletes) {
            await this.flush();
        }
    }

    async flush() {
        if (this.importing.athletes && this.importing.athletes.length) {
            const athletes = this.importing.athletes.splice(0, Infinity);
            for (const x of athletes) {
                x.sync = DBTrue;  // It's possible to export disabled athletes.  Just reenable them.
                this.importedAthletes.add(x.id);
                console.debug(`Importing athlete: ${x.name} [${x.id}]`);
                await athletesStore.put(x);
                if (hist.syncManager) {
                    hist.syncManager.emitForAthleteId(x.id, 'importing-athlete', x);
                }
            }
        }
        if (this.importing.activities && this.importing.activities.length) {
            const activities = this.importing.activities.splice(0, Infinity);
            // Ensure we do a full resync after athlete is enabled.
            for (const x of activities) {
                if (x.syncState && x.syncState.local) {
                    delete x.syncState.local;
                }
            }
            console.debug(`Importing ${activities.length} activities`);
            await actsStore.putMany(activities);
        }
        if (this.importing.streams && this.importing.streams.length) {
            const streams = this.importing.streams.splice(0, Infinity);
            console.debug(`Importing ${streams.length} streams`);
            await streamsStore.putMany(streams);
        }
    }

    async finish() {
        this._finishing = true;
        if (hist.syncManager) {
            if (hist.syncManager.stopped) {
                hist.syncManager.start();
            }
            for (const x of this.importedAthletes) {
                await hist.syncManager.enableAthlete(x);
            }
        }
    }

    async dispatchBlob(blob) {
        const name = `${this.name}-${this.fileNum++}.zip`;
        const id = crypto.randomUUID();
        await this.fileCache.set(id, {blob, name});
        const ev = new Event('file');
        ev.data = {id, name};
        this.dispatchEvent(ev);
    }

    async exportActivityFiles({type='fit'}={}) {
        const s = Date.now();
        const Serializer = {
            fit: FITSerializer,
            tcx: TCXSerializer,
            gpx: GPXSerializer,
        }[type];
        const athlete = await athletesStore.get(this.athleteId, {model: true});
        const activities = await actsStore.getAllForAthlete(this.athleteId);
        const athleteName = athlete.get('name');
        const gender = athlete.get('gender');
        let zip = new SauceZip();
        const maxSize = 512 * 1024 * 1024;
        const step = 100;  // Speedup IDB
        const dir = athleteName.replace(/[^a-zA-Z0-9]/g, '');
        for (let offt = 0; offt < activities.length; offt += step) {
            const actsBatch = activities.slice(offt, offt + step);
            const streamsBatch = await streamsStore.getManyForActivities(actsBatch.map(x => x.id),
                {index: 'activity'});
            console.debug("Adding FIT files to ZIP archive", offt + actsBatch.length, activities.length);
            for (const [i, streams] of streamsBatch.entries()) {
                const act = actsBatch[i];
                if (!streams || !streams.time || !streams.time.length) {
                    continue;
                }
                const date = new Date(act.ts);
                const serializer = new Serializer({
                    name: act.name,
                    desc: act.desc,
                    type: act.basetype,
                    date,
                    athlete: {
                        name: athleteName,
                        weight: athlete.getWeightAt(act.ts),
                        gender,
                    }
                });
                serializer.start();
                serializer.loadStreams(streams);
                const file = serializer.toFile();
                // file.size is uncompressed but we don't want to go over..
                if (zip.size + file.size > maxSize) {
                    await this.dispatchBlob(zip.getBlob());
                    zip = new SauceZip();
                }
                zip.addFile(`${dir}/${act.id}.${type}`,
                    await file.arrayBuffer(), {mtime: date});
                const ev = new Event('progress');
                ev.data = zip.size;
                this.dispatchEvent(ev);
            }
        }
        if (zip.size) {
            await this.dispatchBlob(zip.getBlob());
        }
        console.info("FIT export completed in", Math.round((Date.now() - s) / 1000), 'seconds');
    }

    delete() {
        if (!this._finishing) {
            this.finish();
        }
    }
}
