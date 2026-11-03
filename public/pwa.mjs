const button = document.querySelector('#install-app');
const status = document.querySelector('#install-status');
let installPrompt;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  button.hidden = false;
});
button.addEventListener('click', async () => {
  if (!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = null;
  button.hidden = true;
  try { await prompt.prompt(); await prompt.userChoice; }
  catch { status.textContent = '브라우저의 설치 메뉴를 확인해 주세요. 기기 승인은 별도로 필요합니다.'; }
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  button.hidden = true;
  status.textContent = '앱을 설치했습니다. 자료 접근에는 서버의 기기 승인이 별도로 필요합니다.';
});
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    status.textContent = '오프라인 안내를 준비하지 못했습니다. 온라인 상태에서 사용해 주세요. 기기 승인은 별도로 확인합니다.';
  });
}
