/* global sauce, jQuery */

sauce.ns('profile', ns => {
    'use strict';

    const idMatch = location.pathname.match(/\/(?:athletes|pros)\/([0-9]+)/);
    const athleteId = idMatch ? Number(idMatch[1]) : null;


    async function load() {
        if (sauce.patronLevel && sauce.patronLevel >= 10 &&
            self.currentAthlete && self.currentAthlete.isLoggedIn()) {
            const $name = jQuery('.profile-heading .athlete-name');
            const name = $name.text().trim();
            const genderGuess = document.querySelector(
                '#athlete-profile .main a.tab[href$="/segments/leader"]');
            const gender = (genderGuess && genderGuess.textContent.match(/QOMs/)) ? 'female' : undefined;
            const $btn = await sauce.sync.createSyncButton(athleteId, {name, gender});
            const $buttonBox = $name.siblings('.follow-action');
            if ($buttonBox.length) {
                // Peer
                $buttonBox.prepend($btn);
            } else {
                // Self
                $name.parent().append($btn);
            }
        }
        const avatar = document.querySelector('.avatar-content img.avatar-img');
        if (avatar) {
            if (avatar.src.match(/.*(large|medium)\.jpg$/)) {
                avatar.addEventListener('click', () => {
                    window.open(avatar.src.replace(/(large|medium)\.jpg$/, 'full.jpg'));
                });
            }
        }
    }


    if (['interactive', 'complete'].indexOf(document.readyState) === -1) {
        addEventListener('DOMContentLoaded', load);
    } else {
        load();
    }
});
