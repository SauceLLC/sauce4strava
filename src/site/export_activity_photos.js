/* global sauce */

// The cleanest way to get activity photo info...
document.addEventListener('RenderMapImages', ev => {
    sauce.activityPhotos = ev.detail?.photos?.models?.map(x => x?.attributes)?.filter(x => x);
});
