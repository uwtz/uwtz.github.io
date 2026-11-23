const gallery = document.getElementById('gallery');
const overlay = document.getElementById('overlay');
const panel = overlay.querySelector('.panel');
let items = [], tiles = [], colCount = 0;
let galleryVideosToResume = [];

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

// Gallery videos autoplay muted; detail videos keep controls.
function makeMedia(m, mode) {
  if (m.type === 'video') {
    const v = document.createElement('video');
    const galleryVideo = mode === 'gallery';
    const autoplay = galleryVideo || mode === 'detail-autoplay';
    v.controls = !galleryVideo;
    v.muted = mode !== 'controls';
    v.loop = autoplay;
    v.playsInline = true;
    v.preload = 'auto';
    v.addEventListener('error', () => {
      const code = v.error && v.error.code;
      const reasons = {
        1: 'Playback was aborted.',
        2: 'The browser could not read the video file.',
        3: 'The browser could not decode the video.',
        4: 'The browser does not support this video source.'
      };
      const message = h(
        'p',
        'video-error',
        `${reasons[code] || 'The video could not be played.'} (Media error ${code || 'unknown'}): ${m.src}`
      );
      v.insertAdjacentElement('afterend', message);
    }, { once: true });
    v.src = m.src;
    if (m.poster) v.poster = m.poster;
    if (autoplay) {
      v.autoplay = true;
      v.dataset.autoplay = '1';
    }
    if (m.ratio) v.style.aspectRatio = m.ratio;
    return v;
  }
  const img = document.createElement('img');
  img.src = m.src;
  img.alt = m.alt || m.title || '';
  img.loading = 'lazy';
  if (m.ratio) img.style.aspectRatio = m.ratio;
  return img;
}

function makeTile(item) {
  const el = h('div', 'item' + (item.detail ? ' has-detail' : ''));
  el.tabIndex = 0;
  const media = makeMedia(item, 'gallery');
  el.append(media);

  const label = h('div', 'hover' + (!item.caption && item.detail ? ' no-caption' : ''));
  label.append(h('b', '', item.title));
  if (item.caption || item.detail) {
    const meta = h('div', 'hover-meta');
    if (item.caption) meta.append(h('span', '', item.caption));
    if (item.detail) meta.append(h('em', '', 'View details'));
    label.append(meta);
  }
  el.append(label);

  if (item.detail) {
    el.addEventListener('click', () => openDetail(item));
    el.addEventListener('keydown', e => { if (e.key === 'Enter') openDetail(item); });
  }
  return el;
}

function startVideo(video) {
  if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
    if (video.dataset.waitingToStart) return;
    video.dataset.waitingToStart = '1';
    video.addEventListener('canplay', () => {
      delete video.dataset.waitingToStart;
      startVideo(video);
    }, { once: true });
    return;
  }
  video.play().catch(error => {
    if (error.name === 'NotAllowedError') return;
    console.warn('Could not play video:', video.currentSrc, error);
  });
}

// columns: data-columns on wide screens, fewer on small screens
function layout() {
  const max = +gallery.dataset.columns || 3;
  const n = innerWidth < 600 ? 1 : innerWidth < 1000 ? Math.min(2, max) : max;
  if (n === colCount) return;
  colCount = n;
  gallery.replaceChildren(...Array.from({ length: n }, () => h('div', 'col')));
  tiles.forEach((t, i) => gallery.children[i % n].append(t));
  gallery.querySelectorAll('video[data-autoplay]').forEach(startVideo);
}

// ---- details page: a list of "blocks", plus an optional HTML fragment ----
const figure = (el, caption, width) => {
  const f = h('figure');
  f.append(el);
  if (caption) f.append(h('figcaption', '', caption));
  if (width) { f.style.maxWidth = width; f.style.marginInline = 'auto'; }
  return f;
};

const renderers = {
  heading: b => h('h3', '', b.text),
  text: b => [].concat(b.text).map(t => h('p', '', t)),
  image: b => figure(makeMedia(b, 'controls'), b.caption, b.width),
  video: b => figure(makeMedia(b, b.autoplay ? 'detail-autoplay' : 'controls'), b.caption, b.width),
  row: b => {                                   // media side by side
    const row = h('div', 'row');
    row.style.setProperty('--n', b.items.length);
    b.items.forEach(i => row.append(...[].concat(renderBlock(i))));
    return row;
  },
  embed: b => {                                 // YouTube, or a local page like demos/foo.html
    const f = document.createElement('iframe');
    f.src = b.url; f.loading = 'lazy'; f.allowFullscreen = true;
    f.title = b.title || b.caption || 'Embedded content';
    f.style.aspectRatio = b.ratio || '16/9';
    return figure(f, b.caption, b.width);
  },
  code: b => { const pre = h('pre'); pre.append(h('code', '', b.text)); return pre; },
  links: b => {
    const box = h('div', 'links');
    b.items.forEach(l => { const a = h('a', '', l.label); a.href = l.url; a.target = '_blank'; a.rel = 'noopener'; box.append(a); });
    return box;
  },
  html: b => { const d = h('div'); d.innerHTML = b.html; return d; }   // your own markup, inserted as-is
};

function renderBlock(b) {
  const fn = renderers[b.type];
  if (!fn) { console.warn('Unknown block type:', b.type); return []; }
  return fn(b);
}

// older entries with description / media / links still work
function blocksOf(d) {
  if (d.blocks) return d.blocks;
  return [
    ...[].concat(d.description || []).map(text => ({ type: 'text', text })),
    ...(d.media || []),
    ...(d.links && d.links.length ? [{ type: 'links', items: d.links }] : [])
  ];
}

let openToken = 0;
function openDetail(item) {
  const d = item.detail, token = ++openToken;
  galleryVideosToResume = [...gallery.querySelectorAll('video')].filter(v => !v.paused);
  galleryVideosToResume.forEach(v => v.pause());
  panel.replaceChildren(h('h2', '', item.title));
  blocksOf(d).forEach(b => panel.append(...[].concat(renderBlock(b))));
  panel.querySelectorAll('video').forEach(video => video.load());
  panel.querySelectorAll('video[data-autoplay]').forEach(startVideo);
  if (d.page) {                                 // a whole HTML fragment, appended after the blocks
    fetch(d.page).then(r => { if (!r.ok) throw 0; return r.text(); })
      .then(html => {
        if (token !== openToken) return;
        const box = h('div', 'page');
        box.innerHTML = html;
        panel.append(box);
        box.querySelectorAll('video').forEach(video => video.load());
        box.querySelectorAll('video[data-autoplay]').forEach(startVideo);
      })
      .catch(() => { if (token === openToken) panel.append(h('p', '', 'Could not load ' + d.page)); });
  }
  panel.scrollTop = 0;
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  history.replaceState(null, '', '#' + item.id);   // makes the details page linkable
  panel.focus();
}

function closeDetail() {
  if (overlay.hidden) return;
  openToken++;
  panel.querySelectorAll('video').forEach(v => v.pause());
  overlay.hidden = true;
  document.body.style.overflow = '';
  history.replaceState(null, '', location.pathname + location.search);
  galleryVideosToResume.forEach(startVideo);
  galleryVideosToResume = [];
}

overlay.addEventListener('click', e => { if (e.target === overlay) closeDetail(); });  // click the sides
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });
addEventListener('resize', layout);

if (!Array.isArray(window.galleryItems)) {
  gallery.append(h('p', '', 'Could not load gallery items. Check that the page includes its data script.'));
} else {
  items = window.galleryItems;
  tiles = items.map(makeTile);
  layout();
  const hit = items.find(i => i.detail && '#' + i.id === location.hash);
  if (hit) openDetail(hit);
}
