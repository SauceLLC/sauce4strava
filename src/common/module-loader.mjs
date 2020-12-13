const url = new URL(import.meta.url);
const target = url.searchParams.get('script');

(async function() {
    const ev = new Event(url.searchParams.get('doneEvent'));
    try {
        ev.module = await import(`${target}`);
    } catch(e) {
        ev.error = e;
    }
    document.dispatchEvent(ev);
})();
