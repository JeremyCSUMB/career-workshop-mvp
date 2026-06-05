const { getStore } = require('@netlify/blobs');
const fs = require('fs');
const path = require('path');

function isLocalDev() {
  return process.env.NETLIFY_DEV === 'true' ||
    process.env.NETLIFY_LOCAL === 'true' ||
    process.env.NODE_ENV === 'development' ||
    (process.env.URL || '').includes('localhost');
}

function keyPath(baseDir, key) {
  const safe = key.replace(/[^a-zA-Z0-9_.:-]/g, '_');
  return path.join(baseDir, `${safe}.json`);
}

function getLocalWorkshopStore() {
  const baseDir = path.resolve(process.cwd(), '.netlify', 'local-blobs', 'workshop');
  fs.mkdirSync(baseDir, { recursive: true });
  return {
    async get(key, opts = {}) {
      const file = keyPath(baseDir, key);
      if (!fs.existsSync(file)) return null;
      const text = fs.readFileSync(file, 'utf8');
      return opts.type === 'json' ? JSON.parse(text) : text;
    },
    async setJSON(key, value) {
      fs.writeFileSync(keyPath(baseDir, key), JSON.stringify(value, null, 2));
    },
    async list({ prefix = '' } = {}) {
      const blobs = fs.readdirSync(baseDir)
        .filter((file) => file.endsWith('.json'))
        .map((file) => ({ key: file.slice(0, -5) }))
        .filter((blob) => blob.key.startsWith(prefix));
      return { blobs };
    },
  };
}

function getWorkshopStore() {
  if (isLocalDev()) return getLocalWorkshopStore();

  const siteID = process.env.SITE_ID;
  const token = process.env.NETLIFY_PAT;
  if (siteID && token) {
    return getStore({ name: 'workshop', siteID, token, consistency: 'strong' });
  }

  return getStore({ name: 'workshop', consistency: 'strong' });
}

module.exports = { getWorkshopStore };
