const fs = require('fs');
const https = require('https');
const path = require('path');

const dir = 'c:\\Project\\halo-ai\\public\\assets\\logos\\';

async function fetchHalopedia(filename, target) {
    const api = `https://www.halopedia.org/api.php?action=query&titles=File:${filename}&prop=imageinfo&iiprop=url&format=json`;
    return new Promise((resolve, reject) => {
        https.get(api, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const pages = json.query.pages;
                    const page = pages[Object.keys(pages)[0]];
                    if (page.imageinfo && page.imageinfo[0].url) {
                        const url = page.imageinfo[0].url;
                        const file = fs.createWriteStream(path.join(dir, target));
                        https.get(url, response => {
                            response.pipe(file);
                            file.on('finish', () => {
                                file.close();
                                console.log(`Replaced ${target} with official Halopedia asset.`);
                                resolve();
                            });
                        }).on('error', err => reject(err));
                    } else {
                        resolve();
                    }
                } catch(e) {
                    reject(e);
                }
            });
        }).on('error', err => reject(err));
    });
}

async function run() {
    await fetchHalopedia('Merch_UNSC_Logo_White.svg', 'unsc.svg');
    await fetchHalopedia('CovenantEye.svg', 'covenant.svg');
    await fetchHalopedia('Mendicant_Bias.svg', 'forerunner.svg');
    await fetchHalopedia('UNSC_Army_Logo.svg', 'noble.svg');
    // Using Navy for ODST as fallback since ODST logo isn't easily searchable by exact file name right now
    await fetchHalopedia('UNSC_Navy_Logo.svg', 'odst.svg');
}

run().catch(console.error);
