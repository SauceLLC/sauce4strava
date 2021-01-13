const url = new URL(import.meta.url);
const module = url.searchParams.get('module');

(async function() {
    const ev = new Event(url.searchParams.get('ondone'));
    try {
        ev.module = await import(`${module}`);
    } catch(e) {
        ev.error = e;
    }
    document.dispatchEvent(ev);
})();
