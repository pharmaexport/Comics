const REPO = 'pharmaexport/Comics';
const CATALOG_PATH = 'catalog.json';
const DRIVE_FOLDER_ID = '1RPiklCtvPT6nMhqOBlPxeF3YeZVhd4KO';

const textEncoder = new TextEncoder();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cleanName = value => (value || 'manga').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
const slug = value => cleanName(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const b64 = bytes => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
};

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

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: settings.googleClientId,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    })
  });
  if (!tokenRes.ok) throw new Error(`OAuth Google refusé (${tokenRes.status}).`);
  const token = await tokenRes.json();
  await chrome.storage.local.set({
    googleToken: token.access_token,
    googleTokenExpiresAt: Date.now() + Number(token.expires_in || 3600) * 1000
  });
  return token.access_token;
}

async function fetchJpeg(url) {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new Error(`Image inaccessible (${response.status})`);
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  return { bytes: new Uint8Array(await jpeg.arrayBuffer()), width: canvas.width, height: canvas.height };
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
  for (let i = 0; i < images.length; i += 1) {
    pageIds.push(nextId++);
    imageIds.push(nextId++);
  }
  objects[1] = textEncoder.encode('<< /Type /Catalog /Pages 2 0 R >>');
  objects[2] = textEncoder.encode(`<< /Type /Pages /Count ${images.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`);

  images.forEach((img, index) => {
    const pageId = pageIds[index];
    const imageId = imageIds[index];
    const contentId = nextId++;
    const draw = `q\n${img.width} 0 0 ${img.height} 0 0 cm\n/Im${index} Do\nQ\n`;
    objects[pageId] = textEncoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${img.width} ${img.height}] /Resources << /XObject << /Im${index} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects[imageId] = concat([
      textEncoder.encode(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`),
      img.bytes,
      textEncoder.encode('\nendstream')
    ]);
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
  const init = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'application/pdf',
      'X-Upload-Content-Length': String(blob.size)
    },
    body: JSON.stringify({ name: fileName, parents: [DRIVE_FOLDER_ID] })
  });
  if (!init.ok) throw new Error(`Création Drive impossible (${init.status}).`);
  const sessionUrl = init.headers.get('Location');
  const uploaded = await fetch(sessionUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: blob });
  if (!uploaded.ok) throw new Error(`Téléversement Drive impossible (${uploaded.status}).`);
  const file = await uploaded.json();
  await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'anyone', role: 'reader' })
  });
  return file;
}

async function updateCatalog({ title, driveFile }) {
  const { githubToken } = await getSettings();
  if (!githubToken) throw new Error('Configure d’abord le jeton GitHub dans les options de l’extension.');
  const headers = { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const get = await fetch(`https://api.github.com/repos/${REPO}/contents/${CATALOG_PATH}`, { headers });
  if (!get.ok) throw new Error(`Catalogue GitHub inaccessible (${get.status}).`);
  const current = await get.json();
  const decoded = decodeURIComponent(escape(atob(current.content.replace(/\n/g, ''))));
  const catalog = JSON.parse(decoded);
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
    url: `https://drive.usercontent.google.com/download?id=${driveFile.id}&export=download&confirm=t`
  };
  const index = catalog.findIndex(item => item.id === id);
  if (index >= 0) catalog[index] = entry; else catalog.unshift(entry);
  const content = btoa(unescape(encodeURIComponent(`${JSON.stringify(catalog, null, 2)}\n`)));
  const put = await fetch(`https://api.github.com/repos/${REPO}/contents/${CATALOG_PATH}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Ajouter ${title} depuis MyReadingManga`, content, sha: current.sha, branch: 'main' })
  });
  if (!put.ok) throw new Error(`Mise à jour GitHub impossible (${put.status}).`);
}

async function importMrm(url) {
  const tab = await chrome.tabs.create({ url, active: true });
  for (let i = 0; i < 60; i += 1) {
    await sleep(500);
    try {
      const result = await chrome.tabs.sendMessage(tab.id, { type: 'COLLECT_MRM' });
      if (!result?.ok) continue;
      const selected = result.images.filter(Boolean);
      if (!selected.length) throw new Error('Aucune page détectée.');
      const pages = [];
      for (let p = 0; p < selected.length; p += 1) {
        chrome.runtime.sendMessage({ type: 'IMPORT_PROGRESS', value: Math.round((p / selected.length) * 70), label: `Image ${p + 1}/${selected.length}` }).catch(() => {});
        try { pages.push(await fetchJpeg(selected[p])); } catch (error) { console.warn(error); }
      }
      if (!pages.length) throw new Error('Les images n’ont pas pu être téléchargées.');
      const title = cleanName(result.title);
      const pdf = makePdf(pages);
      chrome.runtime.sendMessage({ type: 'IMPORT_PROGRESS', value: 80, label: 'Envoi vers Drive' }).catch(() => {});
      const driveFile = await uploadDrive(pdf, `${title}.pdf`);
      chrome.runtime.sendMessage({ type: 'IMPORT_PROGRESS', value: 92, label: 'Mise à jour GitHub' }).catch(() => {});
      await updateCatalog({ title, driveFile });
      chrome.runtime.sendMessage({ type: 'IMPORT_PROGRESS', value: 100, label: 'Import terminé' }).catch(() => {});
      return { ok: true, message: `${title} a été enregistré dans Drive et ajouté à Comics.` };
    } catch (error) {
      if (i === 59) throw error;
    }
  }
  throw new Error('La page n’a pas pu être analysée. Vérifie Cloudflare puis réessaie.');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'IMPORT_MRM') return;
  importMrm(message.url)
    .then(sendResponse)
    .catch(error => sendResponse({ ok: false, message: error.message || 'Échec de l’import.' }));
  return true;
});
