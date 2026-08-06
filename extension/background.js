const REPO = 'pharmaexport/Comics';
const CATALOG_PATH = 'catalog.json';
const DRIVE_FOLDER_ID = '1wkTA4RodQeSyBhSgnwBLvGqqK1e1umv3';
const MAX_PARALLEL = 3;
const MIN_PAGE_WIDTH = 420;
const MIN_PAGE_HEIGHT = 560;

const textEncoder = new TextEncoder();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const cleanName = value => (value || 'manga').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
const slug = value => cleanName(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function progress(value, label) {
  chrome.runtime.sendMessage({ type: 'IMPORT_PROGRESS', value, label }).catch(() => {});
}

function b64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

async function sha256Base64Url(value) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(value)));
  return b64(hash).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(size = 64) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return b64(bytes).replace(/[^a-zA-Z0-9]/g, '').slice(0, size);
}

async function getSettings() {
  return chrome.storage.local.get(['googleClientId', 'githubToken', 'googleToken', 'googleTokenExpiresAt']);
}

async function fetchWithRetry(url, options = {}, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok || (response.status < 500 && response.status !== 408 && response.status !== 429)) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500 * 2 ** attempt + Math.floor(Math.random() * 250));
  }
  throw lastError || new Error('Requête impossible.');
}

async function getGoogleToken() {
  const settings = await getSettings();
  if (settings.googleToken && Number(settings.googleTokenExpiresAt || 0) > Date.now() + 60000) return settings.googleToken;
  if (!settings.googleClientId) throw new Error('Configure d’abord le Client ID Google dans les options de l’extension.');

  const verifier = randomString(80);
  const challenge = await sha256Base64Url(verifier);
  const redirectUri = chrome.identity.getRedirectURL('google');
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', settings.googleClientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.file');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('access_type', 'online');
  authUrl.searchParams.set('prompt', 'consent');

  const redirected = await chrome.identity.launchWebAuthFlow({ url: authUrl.href, interactive: true });
  const code = new URL(redirected).searchParams.get('code');
  if (!code) throw new Error('Autorisation Google annulée.');

  const tokenRes = await fetchWithRetry('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: settings.googleClientId, code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirectUri })
  });
  if (!tokenRes.ok) throw new Error(`OAuth Google refusé (${tokenRes.status}).`);
  const token = await tokenRes.json();
  await chrome.storage.local.set({ googleToken: token.access_token, googleTokenExpiresAt: Date.now() + Number(token.expires_in || 3600) * 1000 });
  return token.access_token;
}

async function fetchJpeg(url) {
  const response = await fetchWithRetry(url, { credentials: 'include', cache: 'no-store', referrerPolicy: 'no-referrer-when-downgrade' }, 4);
  if (!response.ok) throw new Error(`Image inaccessible (${response.status})`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('La ressource reçue n’est pas une image.');
  const bitmap = await createImageBitmap(blob);
  if (bitmap.width < MIN_PAGE_WIDTH || bitmap.height < MIN_PAGE_HEIGHT) {
    bitmap.close();
    throw new Error('Image trop petite pour être une planche.');
  }
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  return { bytes: new Uint8Array(await jpeg.arrayBuffer()), width: canvas.width, height: canvas.height };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = await worker(items[index], index); }
      catch (error) { console.warn('Planche ignorée', items[index], error); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results.filter(Boolean);
}

function concat(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

function makePdf(images) {
  const objects = [];
  const pageIds = [];
  const imageIds = [];
  let nextId = 3;
  for (let i = 0; i < images.length; i += 1) { pageIds.push(nextId++); imageIds.push(nextId++); }
  objects[1] = textEncoder.encode('<< /Type /Catalog /Pages 2 0 R >>');
  objects[2] = textEncoder.encode(`<< /Type /Pages /Count ${images.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`);

  images.forEach((img, index) => {
    const pageId = pageIds[index];
    const imageId = imageIds[index];
    const contentId = nextId++;
    const draw = `q\n${img.width} 0 0 ${img.height} 0 0 cm\n/Im${index} Do\nQ\n`;
    objects[pageId] = textEncoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${img.width} ${img.height}] /Resources << /XObject << /Im${index} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects[imageId] = concat([textEncoder.encode(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`), img.bytes, textEncoder.encode('\nendstream')]);
    objects[contentId] = textEncoder.encode(`<< /Length ${textEncoder.encode(draw).length} >>\nstream\n${draw}endstream`);
  });

  const parts = [textEncoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  const offsets = [0];
  let cursor = parts[0].length;
  for (let id = 1; id < objects.length; id += 1) {
    if (!objects[id]) continue;
    offsets[id] = cursor;
    const wrapped = concat([textEncoder.encode(`${id} 0 obj\n`), objects[id], textEncoder.encode('\nendobj\n')]);
    parts.push(wrapped);
    cursor += wrapped.length;
  }
  const xrefAt = cursor;
  const count = objects.length;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < count; id += 1) xref += `${String(offsets[id] || 0).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  parts.push(textEncoder.encode(xref));
  return new Blob(parts, { type: 'application/pdf' });
}

async function uploadDrive(blob, fileName) {
  const token = await getGoogleToken();
  const init = await fetchWithRetry('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/pdf', 'X-Upload-Content-Length': String(blob.size) },
    body: JSON.stringify({ name: fileName, parents: [DRIVE_FOLDER_ID], description: 'Import automatique depuis MyReadingManga via Comics Importer' })
  });
  if (!init.ok) throw new Error(`Création Drive impossible (${init.status}).`);
  const sessionUrl = init.headers.get('Location');
  if (!sessionUrl) throw new Error('Session de téléversement Drive absente.');

  const uploaded = await fetchWithRetry(sessionUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(blob.size) }, body: blob }, 4);
  if (!uploaded.ok) throw new Error(`Téléversement Drive impossible (${uploaded.status}).`);
  const file = await uploaded.json();
  const permission = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'anyone', role: 'reader' })
  }, 3);
  if (!permission.ok) console.warn('Le fichier a été envoyé, mais le partage public a échoué.', permission.status);
  return file;
}

function decodeBase64Utf8(value) {
  const bytes = Uint8Array.from(atob(value.replace(/\n/g, '')), c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(value) {
  return b64(new TextEncoder().encode(value));
}

async function updateCatalog({ title, driveFile }) {
  const { githubToken } = await getSettings();
  if (!githubToken) throw new Error('Configure d’abord le jeton GitHub dans les options de l’extension.');
  const headers = { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const get = await fetchWithRetry(`https://api.github.com/repos/${REPO}/contents/${CATALOG_PATH}?ref=main`, { headers }, 3);
    if (!get.ok) throw new Error(`Catalogue GitHub inaccessible (${get.status}).`);
    const current = await get.json();
    const catalog = JSON.parse(decodeBase64Utf8(current.content));
    const id = slug(title);
    const entry = {
      id,
      title,
      volume: '',
      subtitle: 'Import MyReadingManga',
      authors: '',
      format: 'pdf',
      driveFileId: driveFile.id,
      driveUrl: driveFile.webViewLink || `https://drive.google.com/file/d/${driveFile.id}/view`,
      url: `https://drive.usercontent.google.com/download?id=${driveFile.id}&export=download&confirm=t`,
      source: 'myreadingmanga',
      importedAt: new Date().toISOString()
    };
    const index = catalog.findIndex(item => item.id === id);
    if (index >= 0) catalog[index] = { ...catalog[index], ...entry }; else catalog.unshift(entry);

    const put = await fetch(`https://api.github.com/repos/${REPO}/contents/${CATALOG_PATH}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Ajouter ${title} depuis MyReadingManga`, content: encodeBase64Utf8(`${JSON.stringify(catalog, null, 2)}\n`), sha: current.sha, branch: 'main' })
    });
    if (put.ok) return;
    if (put.status !== 409 && put.status !== 422) throw new Error(`Mise à jour GitHub impossible (${put.status}).`);
    await sleep(700 * (attempt + 1));
  }
  throw new Error('Le catalogue a changé pendant l’import. Réessaie une fois.');
}

async function waitForCollection(tabId) {
  let lastError;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await sleep(attempt < 10 ? 400 : 750);
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: 'COLLECT_MRM' });
      if (result?.ok && Array.isArray(result.images) && result.images.length) return result;
      if (result?.message) lastError = new Error(result.message);
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('La page n’a pas pu être analysée. Vérifie Cloudflare puis réessaie.');
}

async function importMrm(url) {
  const tab = await chrome.tabs.create({ url, active: true });
  progress(3, 'Ouverture de la publication');
  const result = await waitForCollection(tab.id);
  const selected = [...new Set(result.images.filter(Boolean))];
  if (!selected.length) throw new Error('Aucune planche détectée.');

  let completed = 0;
  const pages = await mapLimit(selected, MAX_PARALLEL, async (imageUrl, index) => {
    const page = await fetchJpeg(imageUrl);
    completed += 1;
    progress(8 + Math.round((completed / selected.length) * 64), `Planche ${completed}/${selected.length}`);
    return { ...page, index };
  });
  pages.sort((a, b) => a.index - b.index);
  if (!pages.length) throw new Error('Aucune planche exploitable n’a pu être téléchargée.');
  if (pages.length < Math.max(2, Math.floor(selected.length * 0.5))) throw new Error(`Import incomplet : seulement ${pages.length}/${selected.length} planches récupérées.`);

  const title = cleanName(result.title);
  progress(76, 'Création du PDF');
  const pdf = makePdf(pages);
  progress(83, 'Envoi vers Drive');
  const driveFile = await uploadDrive(pdf, `${title}.pdf`);
  progress(94, 'Mise à jour de la bibliothèque');
  await updateCatalog({ title, driveFile });
  progress(100, 'Import terminé');
  return { ok: true, message: `${title} : ${pages.length} planches enregistrées dans Imports MyReadingManga et ajoutées à Comics.`, driveFileId: driveFile.id };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'IMPORT_MRM') return;
  importMrm(message.url).then(sendResponse).catch(error => sendResponse({ ok: false, message: error.message || 'Échec de l’import.' }));
  return true;
});
