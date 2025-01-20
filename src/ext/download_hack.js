/* global sauce */


function download(blob, name) {
    const link = document.createElement('a');
    link.download = name;
    link.style.display = 'none';
    link.href = URL.createObjectURL(blob);
    try {
        document.body.appendChild(link);
        try {
            link.click();
        } finally {
            link.remove();
        }
    } finally {
        URL.revokeObjectURL(link.href);
    }
}


async function main() {
    const q = new URLSearchParams(location.search);
    const id = q.get('id');
    const transferCache = new sauce.cache.TTLCache('transfer-cache', 900 * 1000);
    const {blob, name} = await transferCache.get(id);
    document.body.innerHTML = `Downloading: ${name}`;
    download(blob, name);
    await transferCache.delete(id);
    setTimeout(() => {
        close();
    }, 1000);
}

main();
