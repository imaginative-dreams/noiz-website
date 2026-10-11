import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { musicReleases } from '../music-releases.mjs';
import {
  musicCanonicalUrl,
  musicDownloadUrl,
  musicPostText,
  renderMusicListing,
  renderMusicPage,
} from '../music-page.mjs';
import { lyricVideoPostText, lyricVideos, renderLyricVideosSection } from '../lyric-videos.mjs';
import {
  ansemRewardsPostText,
  globalRewardsPostText,
  renderRewardsPage,
  renderLyricVideoPage,
  renderVideoPage,
  videoPostText,
} from '../share-page.mjs';
import { videoReleases } from '../video-releases.mjs';

const requiredSocialTags = [
  '<title>',
  '<meta name="description"',
  '<link rel="canonical"',
  '<meta property="og:type"',
  '<meta property="og:url"',
  '<meta property="og:title"',
  '<meta property="og:description"',
  '<meta property="og:image"',
  '<meta name="twitter:card"',
  '<meta name="twitter:title"',
  '<meta name="twitter:description"',
  '<meta name="twitter:image"',
];

function assertSocialPage(html, canonicalUrl) {
  for (const tag of requiredSocialTags) assert.ok(html.includes(tag), `missing ${tag}`);
  assert.ok(html.includes(`<link rel="canonical" href="${canonicalUrl}">`));
  assert.ok(html.includes(`<meta property="og:url" content="${canonicalUrl}">`));
  assert.ok(html.includes(`data-url="${canonicalUrl}"`));
}

test('video pages expose complete social metadata and the native-upload raid workflow', () => {
  for (const video of videoReleases) {
    const canonicalUrl = `https://makenoiz.xyz/video/${video.slug}`;
    const html = renderVideoPage(video);
    assertSocialPage(html, canonicalUrl);
    assert.ok(html.includes(video.videoUrl));
    assert.match(html, /DOWNLOAD VIDEO ↓/);
    assert.match(html, /COPY POST/);
    assert.ok(html.includes(videoPostText(video).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')));
    assert.doesNotMatch(html, /SHARE ON X/);
  }
});

test('prepared captions remain concise and include each canonical video URL', () => {
  for (const video of videoReleases) {
    const post = videoPostText(video);
    assert.ok(post.startsWith(`${video.title}\n\n${video.description}`));
    assert.ok(post.includes(`Watch the full transmission:\nhttps://makenoiz.xyz/video/${video.slug}`));
    assert.ok(post.endsWith('$NOIZ'));
    assert.ok(post.length <= 280, `${video.slug} caption exceeds the X limit`);
  }
});

test('the required video routes are represented in the release data', () => {
  const slugs = new Set(videoReleases.map((video) => video.slug));
  assert.ok(slugs.has('rebirth-of-noiz'));
  assert.ok(slugs.has('the-first-signal'));
  assert.ok(slugs.has('ascension-of-noiz'));
  assert.ok(slugs.has('where-noiz-was-born'));
});

test('reward pages expose complete route-specific metadata and reuse current data sources', () => {
  const global = renderRewardsPage({ variant: 'global' });
  const ansem = renderRewardsPage({ variant: 'ansem' });
  assertSocialPage(global, 'https://makenoiz.xyz/rewards');
  assertSocialPage(ansem, 'https://makenoiz.xyz/rewards/ansem');
  assert.match(global, /holder-rewards\/.+\/subscribe/);
  assert.match(global, /totalDistributedUi/);
  assert.match(global, /holder-rewards-social-card\.png/);
  assert.match(ansem, /\/data\/noiz-holder-rewards\.json/);
  assert.match(ansem, /data\.ansem\.ansemEarned/);
  assert.match(ansem, /ansem-rewards-social-card\.png/);
  assert.match(global, /COPY POST/);
  assert.match(ansem, /COPY POST/);
});

test('homepage contains native-upload controls for every film plus the amplify block', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const video of videoReleases) {
    const canonicalUrl = `https://makenoiz.xyz/video/${video.slug}`;
    assert.ok(html.includes(`data-copy-url="${canonicalUrl}"`));
    assert.ok(html.includes(`Watch the full transmission:&#10;${canonicalUrl}`));
  }
  assert.equal((html.match(/data-copy-post="/g) ?? []).length, videoReleases.length);
  assert.match(html, /DOWNLOAD VIDEO ↓/);
  assert.match(html, /AMPLIFY NOIZ/);
  assert.match(html, /MAKE NOIZ TRAVEL\./);
});

test('homepage reward posts use live and dataset values rather than hard-coded totals', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /NOIZ HOLDERS HAVE RECEIVED \$\{distributed\} ANSEM/);
  assert.match(html, /const earned=number\(ansem\.ansemEarned/);
  assert.match(html, /usd=money\(ansem\.ansemUsdValue\)/);
  assert.match(html, /data-copy-url="https:\/\/makenoiz\.xyz\/rewards"/);
  assert.match(html, /data-copy-url="https:\/\/makenoiz\.xyz\/rewards\/ansem"/);
});

test('homepage reward copy buttons bind before their dynamic post data arrives', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="ansem-copy-post" type="button" onclick="copyRaidText\(this\)"/);
  assert.match(html, /id="global-copy-post" type="button" onclick="copyRaidText\(this\)"/);
  assert.match(html, /querySelectorAll\('\[data-copy-url\],\[data-copy-post\]'\)\.forEach/);
  assert.match(html, /document\.querySelector\('#ansem-copy-post'\)\.dataset\.copyPost=post/);
  assert.match(html, /document\.querySelector\('#global-copy-post'\)\.dataset\.copyPost=post/);
  assert.match(html, /button\.textContent=copied\?'COPIED ✓':'COPY FAILED'/);
});

test('homepage reward actions have larger bounded hit targets', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /\.raid-actions a,\.raid-actions button\{[^}]*min-height:42px[^}]*border:1px solid #ffffff2b[^}]*padding:10px 14px[^}]*font:400 10px/);
});

test('reward post helpers preserve the requested copy structure', () => {
  assert.equal(globalRewardsPostText('1,234.56'), 'NOIZ HOLDERS HAVE RECEIVED 1,234.56 ANSEM.\n\n3% of every $NOIZ transaction buys $ANSEM and distributes it to NOIZ holders.\n\nHOLD NOIZ. EARN ANSEM.\n\nhttps://makenoiz.xyz/rewards');
  assert.equal(ansemRewardsPostText('25,703.56', '$3,606.21'), 'ANSEM IS EARNING ANSEM FROM HOLDING NOIZ.\n\n25,703.56 ANSEM earned\n$3,606.21 current value\n\nANSEM HOLDS NOIZ.\nNOIZ PAYS HIM ANSEM.\n\nHOLD NOIZ. EARN ANSEM.\n\nhttps://makenoiz.xyz/rewards/ansem');
});

test('homepage music listing renders all five actions for every release from shared configuration', async () => {
  const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const html = renderMusicListing(musicReleases);
  assert.match(template, /<div id="music-releases"><\/div>/);
  assert.doesNotMatch(template, /sound-section \.release'\)\.insertAdjacentHTML/);
  assert.equal((html.match(/class="release"/g) ?? []).length, 6);
  assert.equal((html.match(/LISTEN ON SPOTIFY ↗/g) ?? []).length, 6);
  assert.equal((html.match(/SHARE ON X ↗/g) ?? []).length, 6);
  assert.equal((html.match(/COPY POST/g) ?? []).length, 6);
  assert.equal((html.match(/COPY LINK/g) ?? []).length, 6);
  assert.equal((html.match(/DOWNLOAD MP3/g) ?? []).length, 6);
  for (const release of musicReleases) {
    const canonicalUrl = musicCanonicalUrl(release);
    const postText = musicPostText(release);
    assert.ok(html.includes(`data-copy-url="${canonicalUrl}"`));
    assert.ok(html.includes(`data-copy-post="${postText.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')}"`));
    assert.ok(html.includes(`href="https://x.com/intent/post?text=${encodeURIComponent(postText)}"`));
    assert.ok(html.includes(`href="${musicDownloadUrl(release)}" download`));
    assert.ok(html.includes(`href="${release.spotifyUrl}"`));
  }
});

test('music pages link each release to its dedicated lyric video page', () => {
  for (const release of musicReleases) {
    const html = renderMusicPage(release);
    assert.match(html, /WATCH LYRIC VIDEO →/);
    assert.ok(html.includes(`/video/${release.lyricVideoSlug}`));
    assert.doesNotMatch(html, /DOWNLOAD VIDEO ↓/);
  }
});

test('music pages render the approved narratives and downloadable MP3 actions without changing sharing metadata', () => {
  const expected = {
    'the-prophet': {
      narrative: ['Not about predicting the future. About seeing the signal before it becomes obvious.', 'The difference between crazy and early… is time.'],
      mp3Url: 'https://media.makenoiz.xyz/music/mp3/The%20Prophet.mp3',
      description: 'THE PROPHET — an official NOIZ music release.',
      coverUrl: 'https://media.makenoiz.xyz/music/the-prophet/social-card.jpeg',
    },
    'welcome-to-the-trenches': {
      narrative: ['Welcome to the place where narratives are born and conviction is tested.', 'Solana never sleeps. Neither do the trenches.'],
      mp3Url: 'https://media.makenoiz.xyz/music/mp3/Welcome%20to%20the%20Trenches.mp3',
      description: 'Welcome to the Trenches — an official NOIZ music release.',
      coverUrl: 'https://media.makenoiz.xyz/music/welcome-to-the-trenches/social-card.png',
    },
    conviction: {
      narrative: ['Conviction begins when everyone else needs confirmation.', 'A song about believing before the crowd does.'],
      mp3Url: 'https://media.makenoiz.xyz/music/mp3/Black%20Bull%20Conviction.mp3',
      description: 'CONVICTION - SAINT X ANSEM — an official NOIZ music release.',
      coverUrl: 'https://media.makenoiz.xyz/music/conviction/social-card.png',
    },
    'black-bull': {
      narrative: ['Hype dies. Conviction doesn’t.', 'A tribute to the Black Bull that kept moving through the red.'],
      mp3Url: 'https://media.makenoiz.xyz/music/mp3/BLACKBULL.mp3',
      description: 'Official NOIZ music release.',
      coverUrl: 'https://media.makenoiz.xyz/music/black-bull/social-card.png',
    },
    'turn-the-noiz-up': {
      narrative: ['A signal becomes a movement when enough people turn it up.', 'NOIZ is what happens when conviction gets loud.'],
      mp3Url: 'https://media.makenoiz.xyz/music/mp3/TURN%20THE%20NOIZ%20UP.mp3',
      description: 'Official NOIZ music release.',
      coverUrl: 'https://media.makenoiz.xyz/music/turn-the-noiz-up/social-card.png',
    },
    'inspector-nova': {
      narrative: ['In a world full of noise, the wallets tell the truth.', 'Follow the money. Find the signal.'],
      mp3Url: 'https://media.makenoiz.xyz/music/mp3/WALLET%20INSPECTOR%20NOVA.mp3',
      description: 'Official NOIZ music release.',
      coverUrl: 'https://media.makenoiz.xyz/music/inspector-nova/social-card.png',
    },
  };

  for (const release of musicReleases) {
    const canonicalUrl = `https://makenoiz.xyz/music/${release.slug}`;
    const postText = musicPostText(release);
    const shareUrl = `https://x.com/intent/post?text=${encodeURIComponent(postText)}`;
    const fileName = decodeURIComponent(new URL(expected[release.slug].mp3Url).pathname.split('/').at(-1));
    const html = renderMusicPage(release);
    assert.deepEqual(release.narrative, expected[release.slug].narrative);
    assert.equal(release.mp3Url, expected[release.slug].mp3Url);
    assert.equal(release.description, expected[release.slug].description);
    assert.equal(release.coverUrl, expected[release.slug].coverUrl);
    for (const line of release.narrative) assert.ok(html.includes(line));
    assert.ok(html.includes(`href="/api/music-download?track=${release.slug}" download="${fileName}"`));
    assert.ok(html.includes(`src="${release.spotifyEmbedUrl}"`));
    assert.ok(html.includes(`href="${release.spotifyUrl}"`));
    assert.ok(html.includes(`href="${shareUrl.replaceAll('&', '&amp;')}"`));
    assert.ok(html.includes(`data-copy-text="${postText.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')}"`));
    assert.ok(html.includes(`data-url="${canonicalUrl}"`));
    assert.ok(html.includes(`<meta property="og:image" content="${release.coverUrl}">`));
    assert.ok(html.includes(`<meta name="twitter:image" content="${release.coverUrl}">`));
    assert.ok(html.includes(`<meta property="og:description" content="${release.description}">`));
  }
});

test('music SHARE ON X and COPY POST use the same exact release-specific text while COPY LINK stays URL-only', () => {
  const expectedPosts = {
    'turn-the-noiz-up': 'TURN THE NOIZ UP — NOIZ\n\nA signal becomes a movement when enough people turn it up.\nNOIZ is what happens when conviction gets loud.\n\nhttps://makenoiz.xyz/music/turn-the-noiz-up',
    'black-bull': 'BLACK BULL — NOIZ\n\nHype dies. Conviction doesn’t.\nA tribute to the Black Bull that kept moving through the red.\n\nhttps://makenoiz.xyz/music/black-bull',
    'inspector-nova': 'WALLET INSPECTOR NOVA — NOIZ\n\nIn a world full of noise, the wallets tell the truth.\nFollow the money. Find the signal.\n\nhttps://makenoiz.xyz/music/inspector-nova',
    conviction: 'CONVICTION — SAINT X ANSEM — NOIZ\n\nConviction begins when everyone else needs confirmation.\nA song about believing before the crowd does.\n\nhttps://makenoiz.xyz/music/conviction',
    'welcome-to-the-trenches': 'WELCOME TO THE TRENCHES — NOIZ\n\nWelcome to the place where narratives are born and conviction is tested.\nSolana never sleeps. Neither do the trenches.\n\nhttps://makenoiz.xyz/music/welcome-to-the-trenches',
    'the-prophet': 'THE PROPHET — NOIZ\n\nNot about predicting the future. About seeing the signal before it becomes obvious.\nThe difference between crazy and early… is time.\n\nhttps://makenoiz.xyz/music/the-prophet',
  };

  for (const release of musicReleases) {
    const canonicalUrl = `https://makenoiz.xyz/music/${release.slug}`;
    const postText = musicPostText(release);
    const html = renderMusicPage(release);
    assert.equal(postText, expectedPosts[release.slug]);
    assert.ok(html.includes(`href="https://x.com/intent/post?text=${encodeURIComponent(postText)}"`));
    assert.ok(html.includes(`data-copy-text="${postText.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')}"`));
    assert.ok(html.includes(`data-url="${canonicalUrl}"`));
    assert.match(html, /COPY POST/);
    assert.match(html, /COPY LINK/);
  }
});

test('lyric video data stays separate and maps all six music releases to R2', () => {
  assert.equal(lyricVideos.length, 6);
  assert.equal(new Set(lyricVideos.map((video) => video.slug)).size, 6);
  assert.deepEqual(new Set(lyricVideos.map((video) => video.musicSlug)), new Set(musicReleases.map((release) => release.slug)));
  for (const video of lyricVideos) {
    assert.match(video.videoUrl, /^https:\/\/media\.makenoiz\.xyz\/music\/.+\/lyric-video\.mp4$/);
    assert.match(video.coverUrl, /^https:\/\/media\.makenoiz\.xyz\/music\/.+\/lyric-video-cover\.(png|jpeg)$/);
  }
});

test('each lyric video post reuses its music narrative, preserves spacing, and keeps Be water exclusive to The Prophet', () => {
  const expectedPosts = {
    'black-bull-lyrics': 'BLACK BULL — OFFICIAL LYRIC VIDEO\n\nHype dies. Conviction doesn’t.\nA tribute to the Black Bull that kept moving through the red.\n\nWatch the lyrics. Feel the NOIZ.\n\nhttps://makenoiz.xyz/video/black-bull-lyrics',
    'turn-the-noiz-up-lyrics': 'TURN THE NOIZ UP — OFFICIAL LYRIC VIDEO\n\nA signal becomes a movement when enough people turn it up.\nNOIZ is what happens when conviction gets loud.\n\nWatch the lyrics. Feel the NOIZ.\n\nhttps://makenoiz.xyz/video/turn-the-noiz-up-lyrics',
    'wallet-inspector-nova-lyrics': 'WALLET INSPECTOR NOVA — OFFICIAL LYRIC VIDEO\n\nIn a world full of noise, the wallets tell the truth.\nFollow the money. Find the signal.\n\nWatch the lyrics. Feel the NOIZ.\n\nhttps://makenoiz.xyz/video/wallet-inspector-nova-lyrics',
    'conviction-lyrics': 'CONVICTION — SAINT X ANSEM — OFFICIAL LYRIC VIDEO\n\nConviction begins when everyone else needs confirmation.\nA song about believing before the crowd does.\n\nWatch the lyrics. Feel the NOIZ.\n\nhttps://makenoiz.xyz/video/conviction-lyrics',
    'the-prophet-lyrics': 'THE PROPHET — OFFICIAL LYRIC VIDEO\n\nNot about predicting the future. About seeing the signal before it becomes obvious.\nThe difference between crazy and early… is time.\n\nBe water.\n\nWatch the lyrics. Feel the NOIZ.\n\nhttps://makenoiz.xyz/video/the-prophet-lyrics',
    'welcome-to-the-trenches-lyrics': 'WELCOME TO THE TRENCHES — OFFICIAL LYRIC VIDEO\n\nWelcome to the place where narratives are born and conviction is tested.\nSolana never sleeps. Neither do the trenches.\n\nWatch the lyrics. Feel the NOIZ.\n\nhttps://makenoiz.xyz/video/welcome-to-the-trenches-lyrics',
  };

  for (const video of lyricVideos) assert.equal(lyricVideoPostText(video), expectedPosts[video.slug]);
  assert.equal(lyricVideos.filter((video) => lyricVideoPostText(video).includes('Be water.')).length, 1);
});

test('lyric video pages expose artwork metadata, player, actions, and music backlink', () => {
  for (const video of lyricVideos) {
    const canonicalUrl = `https://makenoiz.xyz/video/${video.slug}`;
    const html = renderLyricVideoPage(video);
    assertSocialPage(html, canonicalUrl);
    assert.ok(html.includes(video.coverUrl));
    assert.ok(html.includes(video.videoUrl));
    assert.ok(html.includes(`/music/${video.musicSlug}`));
    assert.match(html, /OFFICIAL LYRIC VIDEO/);
    assert.match(html, /DOWNLOAD VIDEO ↓/);
    assert.match(html, /SHARE ON X ↗/);
    assert.match(html, /COPY POST/);
    assert.ok(html.includes(lyricVideoPostText(video).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')));
    assert.ok(html.includes(`href="https://x.com/intent/post?text=${encodeURIComponent(lyricVideoPostText(video))}"`));
    assert.ok(html.includes(`data-url="${canonicalUrl}"`));
  }
});

test('homepage lyric video collection includes every required action and exact post format', () => {
  const html = renderLyricVideosSection();
  assert.equal((html.match(/class="video-card lyric-video-card"/g) ?? []).length, 6);
  for (const video of lyricVideos) {
    assert.ok(html.includes(`/video/${video.slug}`));
    assert.ok(html.includes(video.coverUrl));
    assert.ok(html.includes(video.videoUrl));
    assert.ok(html.includes(lyricVideoPostText(video).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')));
  }
  assert.equal((html.match(/DOWNLOAD VIDEO ↓/g) ?? []).length, 6);
  assert.equal((html.match(/COPY POST/g) ?? []).length, 6);
  assert.equal((html.match(/COPY LINK/g) ?? []).length, 6);
});
