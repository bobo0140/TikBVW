const socket = io();
const stack = document.getElementById('stack');
const speaking = document.getElementById('speaking');
const ttsPlayer = document.getElementById('ttsPlayer');

let overlayConfig = {
  showChat: true, showGifts: true, showFollows: true, showLikes: true,
  alertDurationMs: 6000
};

const ICONS = { chat: '💬', gift: '🎁', follow: '➕', share: '🔗' };
const LABELS = {
  chat: (e) => [e.user, e.message],
  gift: (e) => [`${e.user} изпрати подарък`, `${e.giftName} ×${e.count}`],
  follow: (e) => [e.user, 'последва канала'],
  share: (e) => [e.user, 'сподели стрийма']
};

function showAlert(type, evt) {
  const [title, subtitle] = LABELS[type](evt);
  const card = document.createElement('div');
  card.className = `alert ${type}`;
  card.style.setProperty('--hold', `${overlayConfig.alertDurationMs}ms`);
  card.innerHTML = `
    <div class="icon">${ICONS[type] || '★'}</div>
    <div class="text"><b>${escapeHtml(title)}</b><span>${escapeHtml(subtitle)}</span></div>
  `;
  stack.appendChild(card);
  const totalLife = overlayConfig.alertDurationMs + 500;
  setTimeout(() => card.remove(), totalLife);
  while (stack.children.length > 5) stack.removeChild(stack.firstChild);
}

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

socket.on('config:updated', (config) => {
  overlayConfig = { ...overlayConfig, ...config.overlay };
});

socket.on('tiktok:event', (evt) => {
  if (evt.type === 'chat' && overlayConfig.showChat) showAlert('chat', evt);
  if (evt.type === 'gift' && overlayConfig.showGifts) showAlert('gift', evt);
  if (evt.type === 'follow' && overlayConfig.showFollows) showAlert('follow', evt);
  if (evt.type === 'share' && overlayConfig.showFollows) showAlert('share', evt);
});

socket.on('tts:audio', ({ audio }) => {
  const blob = base64ToBlob(audio, 'audio/wav');
  const url = URL.createObjectURL(blob);
  ttsPlayer.src = url;
  speaking.classList.add('active');
  ttsPlayer.play().catch(() => {});
  ttsPlayer.onended = () => { speaking.classList.remove('active'); URL.revokeObjectURL(url); };
});

function base64ToBlob(base64, mime) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([new Uint8Array(byteNumbers)], { type: mime });
}
