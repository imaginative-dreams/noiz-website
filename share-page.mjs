const SITE_URL = 'https://makenoiz.xyz';

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

export function videoPostText(video) {
  return `${video.title}\n\n${video.description}\n\nWatch the full transmission:\n${SITE_URL}/video/${video.slug}\n\n$NOIZ`;
}

export function globalRewardsPostText(value) {
  return `NOIZ HOLDERS HAVE RECEIVED ${value} ANSEM.\n\n3% of every $NOIZ transaction buys $ANSEM and distributes it to NOIZ holders.\n\nHOLD NOIZ. EARN ANSEM.\n\n${SITE_URL}/rewards`;
}

export function ansemRewardsPostText(earned, usdValue) {
  return `ANSEM IS EARNING ANSEM FROM HOLDING NOIZ.\n\n${earned} ANSEM earned\n${usdValue} current value\n\nANSEM HOLDS NOIZ.\nNOIZ PAYS HIM ANSEM.\n\nHOLD NOIZ. EARN ANSEM.\n\n${SITE_URL}/rewards/ansem`;
}

function metadata({ canonicalUrl, title, description, imageUrl, imageAlt }) {
  return `<title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="NOIZ">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}">
  <meta property="og:image:alt" content="${escapeHtml(imageAlt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  <meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}">`;
}

const baseStyle = `:root{--white:#f5f5f2;--soft:#a6a6a2;--line:#ffffff2b;--mono:'IBM Plex Mono',monospace}*{box-sizing:border-box}html{background:#050505}body{margin:0;min-height:100svh;background:#050505;color:var(--white);font-family:var(--mono)}a{color:inherit;text-decoration:none}button{font:inherit;color:inherit;cursor:pointer}a:focus-visible,button:focus-visible{outline:1px solid #fff;outline-offset:5px}.noise{position:fixed;inset:0;z-index:10;pointer-events:none;opacity:.07;mix-blend-mode:screen;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.8'/%3E%3C/svg%3E");animation:grain .24s steps(2) infinite}@keyframes grain{50%{background-position:2% -1%}}.shell{width:min(1240px,calc(100% - 40px));margin:auto;padding:24px 0 42px}.topbar{display:flex;align-items:center;justify-content:space-between;padding-bottom:23px;border-bottom:1px solid var(--line);font-size:10px;letter-spacing:.22em}.brand{font:400 22px/1 'Archivo Black',sans-serif;letter-spacing:-.04em}.back{color:#bdbdb8}.back:hover{color:#fff}.eyebrow{margin:0 0 16px;color:var(--soft);font-size:10px;letter-spacing:.3em}.actions{display:flex;align-items:center;flex-wrap:wrap;gap:18px;margin-top:25px}.primary{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border:1px solid #fff;background:#fff;color:#000;font-size:10px;font-weight:500;letter-spacing:.17em}.primary:hover{background:#000;color:#fff}.secondary{appearance:none;border:0;background:none;padding:12px 2px;color:#aaa;font-size:10px;letter-spacing:.17em}.secondary:hover{color:#fff}@media(max-width:700px){.shell{width:min(100% - 28px,680px);padding-top:18px}.topbar{padding-bottom:18px}.actions{align-items:stretch;flex-direction:column}.primary,.secondary{text-align:center;width:100%}}@media(prefers-reduced-motion:reduce){.noise{animation:none}}`;

const copyScript = `<script>function fallbackCopy(text){const field=document.createElement('textarea');field.value=text;field.setAttribute('readonly','');field.style.cssText='position:fixed;opacity:0;pointer-events:none';document.body.append(field);field.select();field.setSelectionRange(0,field.value.length);let copied=false;try{copied=document.execCommand('copy')}catch{}field.remove();return copied}async function copyAction(button){const text=button.dataset.copyText||button.dataset.url;if(!text)return;const original=button.dataset.label||button.textContent;let copied=false;try{if(navigator.clipboard?.writeText)copied=await navigator.clipboard.writeText(text).then(()=>true).catch(()=>false);if(!copied)copied=fallbackCopy(text)}catch{copied=fallbackCopy(text)}button.textContent=copied?'COPIED ✓':'COPY FAILED';clearTimeout(button._copyTimer);button._copyTimer=setTimeout(()=>button.textContent=original,1800)}document.querySelectorAll('[data-copy-text],[data-url]').forEach(button=>button.addEventListener('click',()=>copyAction(button)));</script>`;

function documentShell({ head, body, extraStyle = '', script = '' }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#050505">${head}<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23000'/%3E%3Cpath d='M13 15h9l20 20V15h9v34h-9L22 29v20h-9z' fill='white'/%3E%3C/svg%3E"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"><style>${baseStyle}${extraStyle}</style></head><body><div class="noise" aria-hidden="true"></div><div class="shell"><header class="topbar"><a class="brand" href="/" aria-label="NOIZ home">NOIZ</a><a class="back" href="/">BACK TO WEBSITE</a></header>${body}</div>${copyScript}${script}</body></html>`;
}

export function renderVideoPage(video) {
  const canonicalUrl = `${SITE_URL}/video/${encodeURIComponent(video.slug)}`;
  const imageAlt = `${video.title} — NOIZ film cover`;
  const head = metadata({ canonicalUrl, title: `${video.title} — NOIZ`, description: video.description, imageUrl: video.posterUrl, imageAlt });
  const style = `.film{display:grid;grid-template-columns:minmax(0,1.16fr) minmax(330px,.84fr);gap:clamp(36px,6vw,82px);align-items:center;min-height:calc(100svh - 92px);padding:clamp(40px,6vw,82px) 0}.frame{border:1px solid var(--line);background:#000;box-shadow:0 28px 90px #000}.frame video{display:block;width:100%;aspect-ratio:16/9;object-fit:contain;background:#000}.copy h1{font:400 clamp(46px,6vw,92px)/.88 'Archivo Black',sans-serif;letter-spacing:-.055em;margin:0;overflow-wrap:anywhere}.description{max-width:540px;margin:26px 0 0;color:#aaa;font-size:13px;line-height:1.75}@media(max-width:860px){.film{grid-template-columns:1fr;min-height:0;padding:38px 0 22px;gap:34px}.copy h1{font-size:clamp(44px,14vw,78px)}}`;
  const body = `<main class="film"><div class="frame"><video controls playsinline preload="metadata" poster="${escapeHtml(video.posterUrl)}"><source src="${escapeHtml(video.videoUrl)}" type="video/mp4"></video></div><div class="copy"><p class="eyebrow">${escapeHtml(video.index)} / NOIZ FILM</p><h1>${escapeHtml(video.title)}</h1><p class="description">${escapeHtml(video.description)}</p><div class="actions"><a class="primary" href="${escapeHtml(video.videoUrl)}" target="_blank" rel="noopener">WATCH ↗</a><a class="secondary" href="${escapeHtml(video.videoUrl)}" download>DOWNLOAD VIDEO ↓</a><button class="secondary" type="button" data-copy-text="${escapeHtml(videoPostText(video))}" data-label="COPY POST">COPY POST</button><button class="secondary" id="copy-link" type="button" data-url="${canonicalUrl}" data-label="COPY LINK">COPY LINK</button></div></div></main>`;
  return documentShell({ head, body, extraStyle: style });
}

export function renderRewardsPage({ variant }) {
  const isAnsem = variant === 'ansem';
  const path = isAnsem ? '/rewards/ansem' : '/rewards';
  const canonicalUrl = `${SITE_URL}${path}`;
  const title = isAnsem ? 'Ansem Rewards — NOIZ' : 'NOIZ Holder Rewards';
  const description = isAnsem ? 'ANSEM is earning ANSEM from holding NOIZ.' : 'ANSEM rewards distributed to NOIZ holders.';
  const imageUrl = `${SITE_URL}/assets/${isAnsem ? 'ansem-rewards-social-card.png' : 'holder-rewards-social-card.png'}`;
  const fallbackPost = isAnsem ? 'ANSEM IS EARNING ANSEM FROM HOLDING NOIZ.' : 'NOIZ HOLDER REWARDS';
  const shareUrl = `https://x.com/intent/post?text=${encodeURIComponent(fallbackPost)}&url=${encodeURIComponent(canonicalUrl)}`;
  const head = metadata({ canonicalUrl, title, description, imageUrl, imageAlt: `${title} social card` });
  const style = `.reward{min-height:calc(100svh - 92px);display:flex;flex-direction:column;justify-content:center;padding:clamp(60px,10vw,130px) 0}.reward h1{max-width:1050px;font:400 clamp(48px,8vw,118px)/.86 'Archivo Black',sans-serif;letter-spacing:-.06em;margin:0}.reward h1 span{display:block}.amount{margin:clamp(38px,6vw,72px) 0 8px;font:400 clamp(42px,8vw,104px)/1 'Archivo Black',sans-serif;letter-spacing:-.055em}.unit{font-size:11px;letter-spacing:.24em;color:var(--soft)}.narrative{max-width:650px;margin:26px 0 0;color:#bbb;font-size:clamp(13px,1.5vw,18px);line-height:1.7;letter-spacing:.02em}.status{min-height:1.4em;margin:12px 0 0;color:#777;font-size:9px;letter-spacing:.18em}@media(max-width:700px){.reward h1{font-size:clamp(43px,14vw,70px)}.amount{font-size:clamp(42px,15vw,76px)}}`;
  const heading = isAnsem ? '<span>ANSEM IS EARNING ANSEM</span><span>FROM HOLDING NOIZ</span>' : '<span>NOIZ HOLDER</span><span>REWARDS</span>';
  const body = `<main class="reward"><p class="eyebrow">ON-CHAIN HOLDER REWARDS</p><h1>${heading}</h1><div class="amount" id="reward-amount" aria-live="polite">—</div><div class="unit">ANSEM ${isAnsem ? 'EARNED' : 'DISTRIBUTED'}</div><p class="status" id="reward-status">CONNECTING TO REWARDS FEED…</p><p class="narrative">${isAnsem ? 'Holding NOIZ generates ANSEM rewards.' : 'ANSEM is earning ANSEM from holding NOIZ.'}</p><div class="actions"><a class="primary" id="share-x" href="${escapeHtml(shareUrl)}" target="_blank" rel="noopener">SHARE ON X ↗</a><button class="secondary" id="copy-post" type="button" data-copy-text="" data-label="COPY POST">COPY POST</button><button class="secondary" id="copy-link" type="button" data-url="${canonicalUrl}" data-label="COPY LINK">COPY LINK</button></div></main>`;
  const numberScript = `const format=value=>Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});`;
  const dataScript = isAnsem
    ? `<script>${numberScript}fetch('/data/noiz-holder-rewards.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error();return response.json()}).then(data=>{if(!Number.isFinite(data.ansem?.ansemEarned)||!Number.isFinite(data.ansem?.ansemUsdValue))throw new Error();const earned=format(data.ansem.ansemEarned),usd='$'+format(data.ansem.ansemUsdValue),post='ANSEM IS EARNING ANSEM FROM HOLDING NOIZ.\\n\\n'+earned+' ANSEM earned\\n'+usd+' current value\\n\\nANSEM HOLDS NOIZ.\\nNOIZ PAYS HIM ANSEM.\\n\\nHOLD NOIZ. EARN ANSEM.\\n\\nhttps://makenoiz.xyz/rewards/ansem';document.querySelector('#reward-amount').textContent=earned;document.querySelector('#reward-status').textContent='LATEST CONFIRMED REWARDS SNAPSHOT';document.querySelector('#copy-post').dataset.copyText=post;document.querySelector('#share-x').href='https://x.com/intent/post?text='+encodeURIComponent(post)}).catch(()=>document.querySelector('#reward-status').textContent='REWARDS DATA TEMPORARILY UNAVAILABLE');</script>`
    : `<script>${numberScript}const amount=document.querySelector('#reward-amount'),status=document.querySelector('#reward-status');let done=false,socket,timer;function finish(ok){if(done)return;done=true;clearTimeout(timer);if(socket&&socket.readyState<2)socket.close();if(!ok)status.textContent='REWARDS FEED TEMPORARILY UNAVAILABLE'}try{socket=new WebSocket('wss://backend.padre.gg/fast-stats/holder-rewards/Adgt7dseCq71eN6GDuoUgpsNQp81ZNhq24nrF7pxpump/subscribe');timer=setTimeout(()=>finish(false),15000);socket.onmessage=event=>{try{const message=JSON.parse(event.data),snapshot=message.snapshot;if(message.type==='init'&&snapshot?.quoteMint==='9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump'&&Number.isFinite(snapshot.totalDistributedUi)){const value=format(snapshot.totalDistributedUi),post='NOIZ HOLDERS HAVE RECEIVED '+value+' ANSEM.\\n\\n3% of every $NOIZ transaction buys $ANSEM and distributes it to NOIZ holders.\\n\\nHOLD NOIZ. EARN ANSEM.\\n\\nhttps://makenoiz.xyz/rewards';amount.textContent=value;status.textContent='LIVE DISTRIBUTION SNAPSHOT';document.querySelector('#copy-post').dataset.copyText=post;document.querySelector('#share-x').href='https://x.com/intent/post?text='+encodeURIComponent(post);finish(true)}}catch{finish(false)}};socket.onerror=()=>finish(false);socket.onclose=()=>finish(false)}catch{finish(false)}</script>`;
  return documentShell({ head, body, extraStyle: style, script: dataScript });
}
