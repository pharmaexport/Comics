const googleClientId = document.getElementById('googleClientId');
const githubToken = document.getElementById('githubToken');
const status = document.getElementById('status');

chrome.storage.local.get(['googleClientId', 'githubToken']).then(values => {
  googleClientId.value = values.googleClientId || '';
  githubToken.value = values.githubToken || '';
});

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    googleClientId: googleClientId.value.trim(),
    githubToken: githubToken.value.trim(),
    googleToken: null,
    googleTokenExpiresAt: 0
  });
  status.textContent = 'Configuration enregistrée.';
});
