/* global sauce, jQuery, currentAthlete */

sauce.ns('profile', ns => {
    'use strict';

    async function load() {
        await sauce.propDefined('currentAthlete');
        const $holder = jQuery('.profile-heading .athlete-name');
        const $btn = await sauce.sync.createSyncButton({
            id: currentAthlete.id,
            gender: currentAthlete.get('gender') === 'F' ? 'female' : 'male',
            name: currentAthlete.get('display_name'),
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
