/* global sauce */

const url = new URL(import.meta.url);

const modules = {
    fitness: 'fitness',
    peaks: 'peaks',
    compare: 'compare',
};

const module = modules[url.searchParams.get('module')];
if (!module) {
    throw new Error('Invalid module');
}

const load = () => sauce.loadScripts([`${sauce.extUrl}src/site/performance/${module}.mjs`], {module: true});

if (!self.Backbone) {
    sauce.propDefined('Backbone', load, {once: true});
} else {
    load();
}
