/* Since base is used as an eval source in preloading too, we must manually initialize it. */
self.sauceBaseInit();
if (self.browser.runtime.getURL('').startsWith('safari-web-extension:')) {
    // Workaround for visibiltyState = 'prerender' causing GC to pause until unload
    Object.defineProperty(document, 'visiblityState', {value: 'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
}
