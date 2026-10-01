const SITE_URL = 'https://makenoiz.xyz';

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

export function renderMusicPage(release) {
  const title = escapeHtml(release.title);
  const artist = escapeHtml(release.artist);
  const description = escapeHtml(release.description);
  const coverUrl = escapeHtml(release.coverUrl);
  const spotifyUrl = escapeHtml(release.spotifyUrl);
  const spotifyEmbedUrl = escapeHtml(release.spotifyEmbedUrl);
  const canonicalUrl = `${SITE_URL}/music/${encodeURIComponent(release.slug)}`;
  const imageAlt = `${release.title} by ${release.artist} — official artwork`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#050505">
  <title>${title} — ${artist}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${canonicalUrl}">

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="NOIZ">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:title" content="${title} — ${artist}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${coverUrl}">
  <meta property="og:image:secure_url" content="${coverUrl}">
  <meta property="og:image:alt" content="${escapeHtml(imageAlt)}">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title} — ${artist}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${coverUrl}">
  <meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}">

  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23000'/%3E%3Cpath d='M13 15h9l20 20V15h9v34h-9L22 29v20h-9z' fill='white'/%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://open.spotify.com">
  <link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root{--white:#f5f5f2;--soft:#a6a6a2;--line:#ffffff2b;--mono:'IBM Plex Mono',monospace}*{box-sizing:border-box}html{background:#050505}body{margin:0;min-height:100svh;background:#050505;color:var(--white);font-family:var(--mono)}a{color:inherit;text-decoration:none;-webkit-tap-highlight-color:transparent}a:focus-visible{outline:1px solid #fff;outline-offset:5px}.noise{position:fixed;inset:0;z-index:10;pointer-events:none;opacity:.07;mix-blend-mode:screen;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.8'/%3E%3C/svg%3E");animation:grain .24s steps(2) infinite}@keyframes grain{50%{background-position:2% -1%}}.shell{width:min(1240px,calc(100% - 40px));margin:auto;padding:24px 0 42px}.topbar{display:flex;align-items:center;justify-content:space-between;padding-bottom:23px;border-bottom:1px solid var(--line);font-size:10px;letter-spacing:.22em}.brand{font:400 22px/1 'Archivo Black',sans-serif;letter-spacing:-.04em}.back{color:#bdbdb8;transition:color .2s}.back:hover{color:#fff}.release{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(340px,.92fr);gap:clamp(36px,6vw,88px);align-items:center;min-height:calc(100svh - 92px);padding:clamp(42px,7vw,92px) 0}.artwork{position:relative;aspect-ratio:1200/630;border:1px solid var(--line);background:#0b0b0b;overflow:hidden;box-shadow:0 28px 90px #000}.artwork:after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(150deg,#fff1,transparent 28%,#0004)}.artwork img{display:block;width:100%;height:100%;object-fit:cover}.eyebrow{margin:0 0 16px;color:var(--soft);font-size:10px;letter-spacing:.3em}.copy h1{font:400 clamp(48px,7vw,104px)/.84 'Archivo Black',sans-serif;letter-spacing:-.06em;margin:0;overflow-wrap:anywhere}.artist{margin:22px 0 34px;color:#d0d0cb;font-size:12px;letter-spacing:.28em}.player{display:block;width:100%;height:152px;border:0;border-radius:12px;background:#111}.actions{display:flex;align-items:center;flex-wrap:wrap;gap:18px;margin-top:25px}.spotify{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border:1px solid #fff;background:#fff;color:#000;font-size:10px;font-weight:500;letter-spacing:.17em;transition:background .2s,color .2s}.spotify:hover{background:#000;color:#fff}.website{padding:12px 2px;color:#aaa;font-size:10px;letter-spacing:.17em}.website:hover{color:#fff}@media(max-width:820px){.shell{width:min(100% - 28px,680px);padding-top:18px}.release{grid-template-columns:1fr;min-height:0;padding:38px 0 22px;gap:34px}.copy h1{font-size:clamp(46px,15vw,84px)}.artwork{order:0}.copy{order:1}.topbar{padding-bottom:18px}.actions{align-items:stretch;flex-direction:column}.spotify,.website{text-align:center;width:100%}}@media(max-width:380px){.shell{width:calc(100% - 20px)}.copy h1{font-size:42px}.player{height:152px}}@media(prefers-reduced-motion:reduce){.noise{animation:none}}
  </style>
</head>
<body>
  <div class="noise" aria-hidden="true"></div>
  <div class="shell">
    <header class="topbar"><a class="brand" href="/" aria-label="NOIZ home">NOIZ</a><a class="back" href="/">BACK TO WEBSITE</a></header>
    <main class="release">
      <div class="artwork"><img src="${coverUrl}" alt="${escapeHtml(imageAlt)}" width="1200" height="630"></div>
      <div class="copy">
        <p class="eyebrow">OFFICIAL MUSIC RELEASE</p>
        <h1>${title}</h1>
        <p class="artist">${artist}</p>
        <iframe class="player" src="${spotifyEmbedUrl}" title="Listen to ${title} by ${artist} on Spotify" loading="eager" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>
        <div class="actions">
          <a class="spotify" href="${spotifyUrl}" target="_blank" rel="noopener">LISTEN ON SPOTIFY ↗</a>
          <a class="website" href="/">BACK TO WEBSITE</a>
        </div>
      </div>
    </main>
  </div>
</body>
</html>`;
}
