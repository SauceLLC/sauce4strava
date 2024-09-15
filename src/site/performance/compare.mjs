/* global */

import * as views from './views.mjs';


class CompareMainView extends views.MainView {
    static tpl = 'performance/compare/main.html';

    async render() {
        await super.render();
        // XXX Fill out
    }
}


export default async function load(options) {
    self.pv = new views.PageView({...options, MainView: CompareMainView});
    await self.pv.render();
}
