/* global Strava sauce */

sauce.ns('dashboard', function(ns) {

    const cardSelector = [
        '[id^="feed-entry-"]', // >= 2024-11-16
        '[class*="FeedEntry__entry-container--"]', // <= 2024-11
    ].join(', ');


    function _findActivityProps(p, _depth=1) {
        if (!p) {
            return;
        }
        // cursorData is just the most generic test property.
        if (p && p.cursorData) {
            return p;
        }
        if (_depth < 10) {
            if (Array.isArray(p.children)) {
                for (const x of p.children) {
                    if (x.props) {
                        const r = _findActivityProps(x.props, _depth + 1);
                        if (r) {
                            return r;
                        }
                    }
                }
            } else if (p.children) {
                if (p.children.props) {
                    const r = _findActivityProps(p.children.props, _depth + 1);
                    if (r) {
                        return r;
                    }
                }
            }
            if (p.memoizedProps) {
                const r = _findActivityProps(p.memoizedProps, _depth + 1);
                if (r) {
                    return r;
                }
            }
        }
    }


    // Group activities appear to be mechanistically translated to snake case (or vice versa).
    function snakeToCamelCase(input) {
        if (Array.isArray(input)) {
            return input.map(snakeToCamelCase);
        } else if (input !== null && typeof input === 'object') {
            return Object.fromEntries(Object.entries(input).map(([k, v]) => [
                k.split('_')
                    .map((x, i) => (x && i) ? x.substr(0, 1).toUpperCase() + x.substr(1) : x)
                    .join(''),
                snakeToCamelCase(v)
            ]));
        } else {
            return input;
        }
    }


    const _cardPropCache = new Map();
    function getCardProps(cardEl) {
        if (!_cardPropCache.has(cardEl)) {
            let props;
            try {
                for (const [k, o] of Object.entries(cardEl)) {
                    if (k.match(/^__reactEventHandlers\$|^__reactFiber\$/)) {
                        props = _findActivityProps(o);
                        if (props) {
                            // Normalize activities...
                            if (props.entity === 'GroupActivity') {
                                props.activities = props.rowData.activities.map(snakeToCamelCase).map(x => ({
                                    ...x,
                                    commentsCount: x.numComments,
                                    achievementsCount: x.achievements.length,
                                }));
                            } else if (props.entity === 'Activity') {
                                Object.assign(props.activity, {
                                    kudosCount: props.activity.kudosAndComments?.kudosCount,
                                    commentsCount: props.activity.kudosAndComments?.comments?.length,
                                    achievementsCount: props.activity.segAndBestEffortAchievements?.length,
                                });
                                props.activities = [props.activity];
                            }
                        }
                        break;
                    }
                }
                if (props) {
                    _cardPropCache.set(cardEl, props);
                } else {
                    console.warn("Could not find props for:", cardEl);
                    _cardPropCache.set(cardEl, null);
                }
            } catch(e) {
                console.error('Get card props error:', e);
                _cardPropCache.set(cardEl, null);
            }
        }
        return _cardPropCache.get(cardEl);
    }


    function isSelfEntity(props) {
        // Note we can't share the viewing/cur athlete ID var as the types are different.
        const selfId = +props.viewingAthlete.id;
        if (!selfId) {
            console.error("Self ID could not be determined"); // Not known to be possible.
            return;
        }
        if (props.entity === 'Activity') {
            return +props.activity.athlete.athleteId === selfId;
        } else if (props.entity === 'GroupActivity') {
            return props.rowData.activities.some(x => x.athlete_id === selfId);
        } else if (props.entity === 'Challenge') {
            return props.rowData.challenge_entries.some(x => x.athlete_id === selfId);
        } else if (props.entity === 'Club') {
            return props.rowData.club_entries.some(x => x.athlete_id === selfId);
        } else if (props.entity === 'Post') {
            return props.post.athlete_id === selfId;
        } else if (props.entity === 'PerformanceGoalCreated') {
            return props.rowData.goal_entries.some(x => x.athlete_id === selfId);
        } else if (['SuggestedRoutes', 'FancyPromo', 'SimplePromo'].includes(props.entity)) {
            return false;
        } else {
            console.warn("Unexpected entity type:", props.entity, props); // No known cases of this
        }
    }


    function isVirtual(props, tag) {
        const tags = (tag && tag !== '*') ?
            [tag] :
            ['zwift', 'trainerroad', 'peloton', 'virtual', 'whoop', 'wahoo systm'];
        if (props.entity === 'Activity') {
            if ((!tag || tag === '*') && props.activity.isVirtual) {
                return true;
            } else if (props.activity.mapAndPhotos && props.activity.mapAndPhotos.photoList) {
                // Catch the ones that don't claim to be virtual (but are).
                for (const x of props.activity.mapAndPhotos.photoList) {
                    if (x.enhanced_photo && tags.includes(x.enhanced_photo.name.toLowerCase())) {
                        return true;
                    }
                }
            }
            return false;
        } else if (props.entity === 'GroupActivity') {
            if ((!tag || tag === '*') && props.rowData.activities.every(x => x.is_virtual)) {
                return true;
            }
            return false;
        }
    }


    function isCommute({activities}) {
        return activities && activities.every(x => x.isCommute);
    }


    function isBaseType(props, sport) {
        const regexps = {
            ride: /ride|cycle/i,
            run: /run|walk|hike|snowshoe/i,
            swim: /swim/i,
            row: /row/i,
            ski: /ski|snowboard/i,
        };
        const sports = getSports(props);
        if (sports) {
            return sports.some(s => (sport === 'other') ?
                Object.values(regexps).every(x => !s.match(x)) :
                !!s.match(regexps[sport]));
        }
    }


    function isSport(props, sport) {
        const sports = getSports(props);
        if (sports) {
            return sports.some(x => x === sport);
        }
    }


    function getSports(props) {
        return props.activities && props.activities.map(x => x.type);
    }


    function hasAchievements({activities}) {
        return activities && activities.some(x => x.achievementsCount);
    }


    function hasComments({activities}) {
        return activities && activities.some(x => x.commentsCount);
    }


    function hasKudos({activities}) {
        return activities && activities.some(x => x.kudosCount);
    }


    function hasDescription({activities}) {
        return activities && activities.some(x => x.description);
    }


    let _numGroupSep;
    let _numDecimalSep;
    function parseLocaleNumber(v) {
        if (_numGroupSep === undefined) {
            const parts = Intl.NumberFormat().formatToParts(1000000.1);
            _numDecimalSep = parts.find(x => x.type === 'decimal').value;
            // Not sure if group sep is universal or when it kicks in.
            _numGroupSep = (parts.find(x => x.type === 'group') || {}).value;
        }
        if (_numGroupSep) {
            v = v.replace(_numGroupSep, '');
        }
        v = v.replace(_numDecimalSep, '.');
        return Number(v);
    }


    function parseStatParts(v) {
        // Parse the formatted html of a stat metric into it's parts that we can
        // then interpret using FormatterTranslations and Locales.DICTIONARY.
        let frag;
        try {
            frag = new DOMParser().parseFromString(v, 'text/html');
        } catch(e) {
            console.error("Failed to parse stat parts for:", v);
            return;
        }
        const parts = [];
        for (const unit of frag.querySelectorAll('.unit')) {
            parts.push({value: unit.previousSibling.textContent, label: unit.title});
        }
        return parts;
    }


    // I've searched high and low and this is the only way that I can figure
    // out how to parse activity time and distance.  It's still pretty bad
    // given the diversity of workout types.
    function parseLocaleStatTime(stats) {
        let localeTitle;
        let localeUnits;
        try {
            localeTitle = Strava.I18n.Locales.DICTIONARY.strava.activities.show_public.time;
            localeUnits = {
                [Strava.I18n.FormatterTranslations.elapsed_time.hours.long.label]: 3600,
                [Strava.I18n.FormatterTranslations.elapsed_time.minutes.long.label]: 60,
                [Strava.I18n.FormatterTranslations.elapsed_time.seconds.long.label]: 1,
            };
        } catch(e) {/*no-pragma*/}
        const parts = _parseLocaleStatParts(stats, localeTitle, localeUnits);
        if (parts) {
            let time = 0;
            for (const x of parts) {
                time += parseLocaleNumber(x.value) * localeUnits[x.label];
            }
            return time;
        }
    }


    // I've searched high and low and this is the only way that I can figure
    // out how to parse activity time and distance.  It's still pretty bad
    // given the diversity of workout types.
    function parseLocaleStatDist(stats) {
        let localeTitle;
        let localeUnits;
        try {
            localeTitle = Strava.I18n.Locales.DICTIONARY.strava.activities.show_public.distance;
            localeUnits = {
                [Strava.I18n.FormatterTranslations.distance.imperial.name_long]: 1609.344,
                [Strava.I18n.FormatterTranslations.distance.metric.name_long]: 1000,
                [Strava.I18n.FormatterTranslations.swim_distance.imperial.name_long]: 0.9144,
                [Strava.I18n.FormatterTranslations.swim_distance.metric.name_long]: 1,
            };
            for (const [key, val] of Object.entries(localeUnits)) {
                // Handle case variance seen in spanish translations.
                localeUnits[key.toLowerCase()] = val;
            }
        } catch(e) {/*no-pragma*/}
        const parts = _parseLocaleStatParts(stats, localeTitle, localeUnits);
        if (parts) {
            if (parts.length !== 1) {
                console.warn("Unexpected distance parts:", parts);
                return;
            }
            const p = parts[0];
            const unit = localeUnits[p.label] || localeUnits[p.label.toLowerCase()];
            return parseLocaleNumber(p.value) * unit;
        }
    }


    function _parseLocaleStatParts(stats, title, units) {
        if (!title || !units) {
            try {
                console.error("Assertion failure: locale field(s) not found");
                console.error('Debug Locales:', Strava.I18n.Locales);
                console.error('Debug FormatterTranslations:', Strava.I18n.FormatterTranslations);
            } catch(e) {
                console.error("Really bad assertion error:", e);
            }
            return;
        }
        let stat;
        for (const x of stats) {
            if (x.key.endsWith('_subtitle') && x.value === title) {
                stat = stats.find(xx => xx.key === x.key.split('_subtitle')[0]).value;
                break;
            }
        }
        if (!stat) {
            return;
        }
        return parseStatParts(stat);
    }


    function passesCriteria(props, criteria) {
        if (!criteria || criteria === '*' || criteria === '!') {
            return true;
        }
        return props.activities && props.activities.some(x => _passesCriteria(x, criteria));
    }


    function _passesCriteria(activity, criteria) {
        const type = criteria.split('-')[0];
        const parseStat = {
            time: parseLocaleStatTime,
            dist: parseLocaleStatDist,
        }[type];
        if (!parseStat) {
            console.warn("Unexpected critiera type", criteria);
            return false; // XXX maybe return undefined when that means something special (i.e. noop)
        }
        let value;
        if (type === 'time') {
            value = activity.elapsedTime;
            if (!value) {
                console.warn("Elapsed time not found:", activity);
            }
        }
        if (value == null) {
            value = parseStat(activity.stats);
        }
        if (isNaN(value)) {
            if (Number.isNaN(value)) {
                console.error("Unable to parse locale based time/distance", activity);
            }
            return false;
        }
        return value < Number(criteria.split('-')[1]);
    }


    function filterFeed(cards) {
        try {
            _filterFeed(cards);
        } catch(e) {
            console.error('Filter feed error:', e);
        }
    }


    function _filterFeed(cards) {
        const filters = sauce.options['activity-filters'];
        if (!filters || !filters.length) {
            return;
        }
        const handlers = {
            '*': () => true,
            'cat-promotion': x => !!x.entity?.match(/Promo/),
            'cat-challenge': x => x.entity === 'Challenge',
            'cat-club': x => x.entity === 'Club',
            'cat-club-post': x => x.entity === 'Post' && !!x.post.club_id,
            'cat-post': x => x.entity === 'Post',
            'cat-suggested-routes': x => x.entity === 'SuggestedRoutes',
            'cat-commute': isCommute,
            'virtual': isVirtual,
            'base': isBaseType,
            'sport': isSport,
            'social-achievements': hasAchievements,
            'social-comments': hasComments,
            'social-kudos': hasKudos,
            'social-description': hasDescription,
        };
        const actions = [];
        for (const card of cards) {
            if (card.classList.contains('sauce-checked')) {
                continue;
            }
            card.classList.add('sauce-checked');
            let props;
            try {
                props = getCardProps(card);
                if (!props || isSelfEntity(props)) {
                    continue;
                }
            } catch(e) {
                console.error("Failed to get card props:", e);
                continue;
            }
            for (const {type, criteria, action} of filters) {
                const [typePrefix, typeArg] = type.split('-', 2);
                const handler = handlers[type] || handlers[typePrefix];
                if (!handler) {
                    console.error("No filter handler found for:", type);
                    continue;
                }
                try {
                    let matches = handler(props, typeArg);
                    if (matches === undefined) {
                        continue;
                    }
                    if (criteria === '!') {
                        matches = !matches;
                    }
                    if (matches && passesCriteria(props, criteria)) {
                        actions.push({card, action, type, criteria});
                    }
                } catch(e) {
                    console.error('Internal feed filter error:', e);
                }
            }
        }
        if (actions.length) {
            for (const {card, action, criteria, type} of actions) {
                if (action === 'hide') {
                    card.classList.add('hidden-by-sauce');
                } else if (action === 'highlight') {
                    card.classList.add('highlight-by-sauce');
                    /*
                    if (!card.testing) {
                        card.style.position = 'relative';
                        card.innerHTML += '<div class="testing" style="position: absolute; top: 0; ' +
                            'z-index: 1000000; background: #24fc; color: white; padding: 1em;"></div>';
                        card.offsetWidth;
                        card.testing = card.querySelector('.testing');
                    }
                    card.testing.innerHTML += `<div>${criteria === '!' ? 'NOT' : criteria} :: ${type}</div>`;
                    */
                    criteria, type; // XXX lint testing
                } else if (action === 'hide-images') {
                    card.classList.add('hide-images-by-sauce');
                } else if (action === 'hide-media') {
                    card.classList.add('hide-media-by-sauce');
                } else {
                    console.warn("Unknown action:", action);
                }
            }
        }
    }


    function monitorFeed(feedEl) {
        const seenCards = new Set(Array.from(feedEl.querySelectorAll(cardSelector)));
        const mo = new MutationObserver(events => {
            const cards = feedEl.querySelectorAll(cardSelector);
            const beforeSize = seenCards.size;
            for (const x of cards) {
                seenCards.add(x);
            }
            if (seenCards.size > beforeSize) {
                filterFeed(cards);
            }
        });
        // Take note this page updates in unexpected ways.
        // 1. No feed element is present.
        // 2. Feed element is inserted and contains about some number of empty divs
        // 3. The empty divs are filled with feed entries.
        // 4. Sometimes the feed is immediately updated with additional div > feed entries.
        mo.observe(feedEl, {childList: true, subtree: true});
        if (seenCards.size) {
            filterFeed(Array.from(seenCards));
        }
    }


    function load() {
        const feedSelector = 'main .feature-feed';
        const feedEl = document.querySelector(feedSelector);
        if (!feedEl) {
            const mo = new MutationObserver(() => {
                const feedEl = document.querySelector(feedSelector);
                if (feedEl) {
                    mo.disconnect();
                    // Chrome devtools bug workaround...
                    setTimeout(() => monitorFeed(feedEl), 0);
                }
            });
            mo.observe(document.documentElement, {childList: true, subtree: true});
        } else {
            // Unlikely...
            monitorFeed(feedEl);
        }
        if (sauce.options['activity-hide-media']) {
            document.documentElement.classList.add('sauce-hide-dashboard-media');
        }
        if (sauce.options['activity-hide-images']) {
            document.documentElement.classList.add('sauce-hide-dashboard-images');
        }
        if (sauce.options['activity-dense-mode']) {
            document.documentElement.classList.add('sauce-dense-dashboard');
        }
    }


    return {
        load,
    };
});


sauce.dashboard.load();
