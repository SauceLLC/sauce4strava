const url = new URL(import.meta.url);
const module = url.searchParams.get('module');

(async function() {
    /* Ugly but makes web-ext lint (firefox) happy */
    let p;
    switch (module) {
    case '/common/jscoop/jobs':
        p = import('/src/common/jscoop/jobs.js');
        break;
    case '/site/data-views':
        p = import('/src/site/data-views.mjs');
        break;
    case '/site/export':
        p = import('/src/site/export.mjs');
        break;
    case '/site/jsfit/fit-parser':
        p = import('/src/site/jsfit/fit-parser.mjs');
        break;
    case '/site/view':
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
