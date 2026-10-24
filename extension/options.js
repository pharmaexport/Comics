const googleClientId = document.getElementById('googleClientId');
const status = document.getElementById('status');

chrome.storage.local.get(['googleClientId']).then(values => {
  googleClientId.value = values.googleClientId || '';
});
chrome.storage.local.remove(['githubToken']).catch(() => {});

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    googleClientId: googleClientId.value.trim(),
    googleToken: null,
    googleTokenExpiresAt: 0
  });
  status.textContent = 'Configuration enregistrée.';
});
