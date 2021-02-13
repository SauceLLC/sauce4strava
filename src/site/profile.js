/* global sauce, jQuery, currentAthlete */

sauce.ns('profile', ns => {
    'use strict';


    const idMatch = location.pathname.match(/\/(?:athletes|pros)\/([0-9]+)/);
    const athleteId = idMatch ? Number(idMatch[1]) : null;


    async function load() {
        const $holder = jQuery('.profile-heading .athlete-name');
        const name = $holder.text().trim();
        const $btn = await sauce.sync.createSyncButton({
            id: athleteId,
            name,
        });
        $btn.addClass('btn-sm');
        $holder.append($btn);
    }


    if (['interactive', 'complete'].indexOf(document.readyState) === -1) {
        addEventListener('DOMContentLoaded', () => load().catch(sauce.report.error));
    } else {
        load().catch(sauce.report.error);
    }
});
