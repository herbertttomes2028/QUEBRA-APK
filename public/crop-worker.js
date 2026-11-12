/* Recorte e codificação da imagem da partida FORA da thread principal (Web Worker). Faz o mesmo que cropToBlob em game.js: recorta no centro para a proporção
 * pedida, redimensiona para W×H e codifica em JPEG 0,9. A thread principal só entrega o bitmap já decodificado e recebe o resultado (medido: ~10 ms de bloqueio
 * contra 100 a 700 ms). Não lê nem envia nada além do que recebe por mensagem; sem rede, sem armazenamento. */
'use strict';
self.onmessage = function (e) {
  var d = e.data || {};
  function falha(err) { self.postMessage({ id: d.id, erro: String((err && err.name) || err) }); }
  try {
    var bm = d.bm, W = d.W | 0, H = d.H | 0;
    if (!bm || W < 1 || H < 1 || W > 4096 || H > 4096) { falha('invalid'); return; }
    var ar = W / H, sw = bm.width, sh = bm.height, sx = 0, sy = 0;
    if (sw / sh > ar) { var nw = sh * ar; sx = (sw - nw) / 2; sw = nw; } else { var nh = sw / ar; sy = (sh - nh) / 2; sh = nh; }
    var oc = new OffscreenCanvas(W, H), c = oc.getContext('2d');
    c.imageSmoothingQuality = 'high'; c.drawImage(bm, sx, sy, sw, sh, 0, 0, W, H); bm.close();
    oc.convertToBlob({ type: 'image/jpeg', quality: 0.9 }).then(function (blob) { self.postMessage({ id: d.id, blob: blob }); }, falha);
  } catch (err) { falha(err); }
};
