// Not dosyalarının basit YAML frontmatter'ı ve karar satırı işaretleri.

function deger(ham) {
  const text = ham.trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

export function frontmatterAyir(metin) {
  const text = String(metin ?? '').replace(/^\u{FEFF}/u, '').replace(/\r\n?/gu, '\n');
  if (!text.startsWith('---\n')) return { veri: {}, govde: text };
  const end = text.indexOf('\n---', 4);
  if (end < 0) return { veri: {}, govde: text };
  const after = text.indexOf('\n', end + 4);
  const govde = after < 0 ? '' : text.slice(after + 1);
  const veri = {};
  let listKey = null;
  for (const line of text.slice(4, end).split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = /^\s+-\s+(.*)$/u.exec(line) ?? /^-\s+(.*)$/u.exec(line);
    if (item && listKey) {
      veri[listKey].push(deger(item[1]));
      continue;
    }
    const pair = /^([A-Za-z0-9_çğıöşüÇĞİÖŞÜ-]+):\s*(.*)$/u.exec(line);
    if (!pair) { listKey = null; continue; }
    if (pair[2] === '') {
      veri[pair[1]] = [];
      listKey = pair[1];
    } else {
      veri[pair[1]] = deger(pair[2]);
      listKey = null;
    }
  }
  return { veri, govde };
}

export function notTarihi(veri) {
  const ham = veri?.date ?? veri?.tarih;
  if (typeof ham !== 'string' || !/^\d{4}-\d{2}-\d{2}/u.test(ham)) return null;
  const [y, m, d] = ham.slice(0, 10).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) || date.getMonth() !== m - 1 ? null : date;
}

export function gecersizMi(satir) {
  const text = String(satir ?? '');
  return /GEÇERSİZ|GECERSIZ|geçersiz/u.test(text) || /~~.+~~/u.test(text);
}
