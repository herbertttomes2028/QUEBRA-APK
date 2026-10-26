/* aplica o tema e o tamanho do texto antes de desenhar a tela (evita piscar) */
try {
  var s = JSON.parse(localStorage.getItem('qc.settings') || '{}'), d = document.documentElement;
  if (s.text) d.setAttribute('data-text', s.text);
  var dark = s.theme === 'dark' || (s.theme !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  d.setAttribute('data-theme', dark ? 'dark' : 'light');
  if (s.motion === 'reduce') d.setAttribute('data-motion', 'reduce');
} catch (e) { /* ignora */ }
