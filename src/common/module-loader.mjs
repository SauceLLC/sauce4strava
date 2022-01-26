const url = new URL(import.meta.url);
const module = url.searchParams.get('module');

(async function() {
    /* Ugly but makes web-ext lint (firefox) happy */
    let p;
    switch (module) {
    case '/lib/jscoop/jobs':
        p = import('/lib/jscoop/jobs.mjs');
        break;
    case '/src/site/data-views':
        p = import('/src/site/data-views.mjs');
        break;
    case '/src/site/export':
        p = import('/src/site/export.mjs');
        break;
    case '/src/site/jsfit/fit-parser':
        p = import('/src/site/jsfit/fit-parser.mjs');
        break;
    case '/src/site/view':
        p = import('/src/site/view.mjs');
        break;
    }
    const ev = new Event(url.searchParams.get('ondone'));
    if (p) {
        try {
            ev.module = p;
        } catch(e) {
            ev.error = e;
        }
    } else {
        ev.error = new Error("Invalid Module");
    }
    document.dispatchEvent(ev);
})();
