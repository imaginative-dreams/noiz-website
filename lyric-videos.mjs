const MEDIA_URL = 'https://media.makenoiz.xyz';
const SITE_URL = 'https://makenoiz.xyz';

export const lyricVideos = Object.freeze([
  { slug: 'black-bull-lyrics', musicSlug: 'black-bull', title: 'BLACK BULL', coverUrl: `${MEDIA_URL}/music/black-bull/lyric-video-cover.png`, videoUrl: `${MEDIA_URL}/music/black-bull/lyric-video.mp4` },
  { slug: 'turn-the-noiz-up-lyrics', musicSlug: 'turn-the-noiz-up', title: 'TURN THE NOIZ UP', coverUrl: `${MEDIA_URL}/music/turn-the-noiz-up/lyric-video-cover.png`, videoUrl: `${MEDIA_URL}/music/turn-the-noiz-up/lyric-video.mp4` },
  { slug: 'wallet-inspector-nova-lyrics', musicSlug: 'inspector-nova', title: 'WALLET INSPECTOR NOVA', coverUrl: `${MEDIA_URL}/music/inspector-nova/lyric-video-cover.png`, videoUrl: `${MEDIA_URL}/music/inspector-nova/lyric-video.mp4` },
  { slug: 'conviction-lyrics', musicSlug: 'conviction', title: 'CONVICTION — SAINT X ANSEM', coverUrl: `${MEDIA_URL}/music/conviction/lyric-video-cover.png`, videoUrl: `${MEDIA_URL}/music/conviction/lyric-video.mp4` },
  { slug: 'the-prophet-lyrics', musicSlug: 'the-prophet', title: 'THE PROPHET', coverUrl: `${MEDIA_URL}/music/the-prophet/lyric-video-cover.jpeg`, videoUrl: `${MEDIA_URL}/music/the-prophet/lyric-video.mp4` },
  { slug: 'welcome-to-the-trenches-lyrics', musicSlug: 'welcome-to-the-trenches', title: 'WELCOME TO THE TRENCHES', coverUrl: `${MEDIA_URL}/music/welcome-to-the-trenches/lyric-video-cover.png`, videoUrl: `${MEDIA_URL}/music/welcome-to-the-trenches/lyric-video.mp4` },
].map((video) => Object.freeze({ ...video, label: 'OFFICIAL LYRIC VIDEO', description: `${video.title} — official lyric video by NOIZ.` })));

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

export function lyricVideoPostText(video) {
  return `${video.title} — OFFICIAL LYRIC VIDEO\n\nWatch the lyrics. Feel the NOIZ.\n\n${SITE_URL}/video/${video.slug}\n\n$NOIZ`;
}

export function renderLyricVideosSection() {
  const cards = lyricVideos.map((video) => {
    const pageUrl = `${SITE_URL}/video/${video.slug}`;
    return `<article class="video-card lyric-video-card"><a class="video-thumb" href="/video/${escapeHtml(video.slug)}" aria-label="Watch ${escapeHtml(video.title)} official lyric video"><img src="${escapeHtml(video.coverUrl)}" alt="${escapeHtml(video.title)} lyric video cover" width="1672" height="941" loading="lazy"><span class="play-mark" aria-hidden="true"></span></a><div class="video-copy"><span class="video-index">${video.label}</span><h3>${escapeHtml(video.title)}</h3><div class="video-actions"><a href="/video/${escapeHtml(video.slug)}">WATCH</a><a href="${escapeHtml(video.videoUrl)}" download>DOWNLOAD VIDEO ↓</a><button type="button" data-copy-post="${escapeHtml(lyricVideoPostText(video))}">COPY POST</button><button type="button" data-copy-url="${pageUrl}">COPY LINK</button></div></div></article>`;
  }).join('\n    ');

  return `<section id="lyric-videos"><div class="archive lyric-videos"><div class="archive-head"><span class="kicker">04 / LYRIC VIDEOS</span><h2>READ THE SIGNAL.<br>FEEL THE NOIZ.</h2><p>Official lyric videos from the NOIZ music catalogue. Watch, download, and carry every word further.</p></div><div class="video-grid">\n    ${cards}\n  </div></div></section>`;
}
