/* global sauce jQuery Backbone */

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


async function init() {
    // Carefully optimized for low page load time...
    // Make web-ext lint happy, never use a var for import.
    let pmp;
    if (module === 'fitness') {
        pmp = import('./fitness.mjs');
    } else if (module === 'peaks') {
        pmp = import('./peaks.mjs');
    } else if (module === 'compare') {
        pmp = import('./compare.mjs');
    } else {
        throw new Error('Invalid module');
    }
    const urn = `sauce/performance/${module}`;
    const menuTitleKey = `menu_performance_${module}`;
    let RangeRouter;
    let pageLoad;
    let pageTitle;
    let globalOptions;
    let enAthletes;
    await Promise.all([
        import('./router.mjs').then(x => RangeRouter = x.default),
        pmp.then(x => pageLoad = x.default),
        sauce.locale.init(),
        sauce.locale.getMessagesObject(['performance', menuTitleKey]).then(l =>
            pageTitle = `${l[menuTitleKey]} | Sauce ${l.performance}`),
        sauce.proxy.connected.then(() => Promise.all([
            sauce.storage.fastPrefsReady(),
            sauce.storage.get('options').then(x => (globalOptions = x)),
            sauce.hist.getEnabledAthletes().then(x => (enAthletes = x)),
        ])),
    ]);
    const isAvailable = !location.search.match(/onboarding/) && sauce.patronLevel >= 10;
    const athletes = new Map(isAvailable ? enAthletes.map(x => [x.id, x]) : []);
    const router = new RangeRouter(urn, pageTitle);
    Backbone.history.start({pushState: true});
    const args = {athletes, router, pageLoad, globalOptions};
    if (['interactive', 'complete'].indexOf(document.readyState) === -1) {
        addEventListener('DOMContentLoaded', () => load(args));
    } else {
        load(args);
    }
}


async function load({athletes, router, pageLoad, globalOptions}) {
    for (const x of document.querySelectorAll('body > [data-react-class], body > link')) {
        x.remove();
    }
    const $page = jQuery(document.getElementById('error404'));
    $page.empty();
    $page.removeClass();  // removes all
    $page[0].id = 'sauce-performance';
    if (!athletes.size) {
        const views = await import('./views.mjs');
        const view = new views.OnboardingView({el: $page});
        await view.render();
    } else {
        await pageLoad({athletes, router, el: $page, globalOptions});
    }
}

if (self.Backbone) {
    init();
} else {
    sauce.propDefined('Backbone', init, {once: true});
}
