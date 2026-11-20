const api = globalThis.browser ?? globalThis.chrome;
const sitePermission = { origins: ['https://github.com/*'] };
const status = document.querySelector('#status');
const authorize = document.querySelector('#authorize');

async function refreshAuthorization() {
  const granted = await api.permissions.contains(sitePermission);
  status.textContent = granted ? '已启用' : '未授权';
  authorize.hidden = granted;
}

authorize.addEventListener('click', async () => {
  authorize.disabled = true;
  try {
    await api.permissions.request(sitePermission);
    await refreshAuthorization();
  } catch {
    status.textContent = '无法申请 GitHub 权限，请重试。';
  } finally {
    authorize.disabled = false;
  }
});

void refreshAuthorization();
