/* global sauce, jQuery */

sauce.ns('profile', ns => {
    'use strict';


    const idMatch = location.pathname.match(/\/(?:athletes|pros)\/([0-9]+)/);
    const athleteId = idMatch ? Number(idMatch[1]) : null;


    async function load() {
        const $name = jQuery('.profile-heading .athlete-name');
        const name = $name.text().trim();
        const $btn = await sauce.sync.createSyncButton(athleteId, {name});
        const $buttonBox = $name.siblings('.follow-action');
        if ($buttonBox.length) {
            // Peer
            $buttonBox.prepend($btn);
        } else {
            // Self
            $name.parent().append($btn);
        }
    }


    if (['interactive', 'complete'].indexOf(document.readyState) === -1) {
        addEventListener('DOMContentLoaded', () => load().catch(sauce.report.error));
    } else {
        load().catch(sauce.report.error);
    }
});
