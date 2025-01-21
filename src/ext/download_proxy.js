/* global sauce */


function downloadBlob(blob, name) {
    const link = document.createElement('a');
    link.download = name;
    link.style.setProperty('display', 'none');
    link.href = URL.createObjectURL(blob);
    try {
        document.body.appendChild(link);
        link.click();
    } finally {
        URL.revokeObjectURL(link.href);
        link.remove();
    }
}


async function download({id}) {
    const fileCache = new sauce.cache.TTLCache('file-cache', 900 * 1000);
    const {blob, name} = await fileCache.get(id);
    document.body.textContent = `Downloading: ${name}`;
    downloadBlob(blob, name);
    await fileCache.delete(id);
}


addEventListener('message', ev => {
    if (ev.data.op === 'download') {
        download(ev.data.options);
    } else {
        console.error('Invalid message:', ev.data);
        throw new Error("unexpected message payload");
    }
});
