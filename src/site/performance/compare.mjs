/* global */

import * as views from './views.mjs';


class CompareMainView extends views.MainView {
    static tpl = 'performance/compare/main.html';

    async render() {
        await super.render();
        // XXX Fill out
    }
}


export default async function load({athletes, router, $page}) {
    self.pv = new views.PageView({athletes, router, MainView: CompareMainView, el: $page});
    await self.pv.render();
}
