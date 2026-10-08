import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { musicReleases } from '../music-releases.mjs';
import { renderMusicPage } from '../music-page.mjs';
import {
  ansemRewardsPostText,
  globalRewardsPostText,
  renderRewardsPage,
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

test('reward post helpers preserve the requested copy structure', () => {
  assert.equal(globalRewardsPostText('1,234.56'), 'NOIZ HOLDERS HAVE RECEIVED 1,234.56 ANSEM.\n\n3% of every $NOIZ transaction buys $ANSEM and distributes it to NOIZ holders.\n\nHOLD NOIZ. EARN ANSEM.\n\nhttps://makenoiz.xyz/rewards');
  assert.equal(ansemRewardsPostText('25,703.56', '$3,606.21'), 'ANSEM IS EARNING ANSEM FROM HOLDING NOIZ.\n\n25,703.56 ANSEM earned\n$3,606.21 current value\n\nANSEM HOLDS NOIZ.\nNOIZ PAYS HIM ANSEM.\n\nHOLD NOIZ. EARN ANSEM.\n\nhttps://makenoiz.xyz/rewards/ansem');
});

test('existing music releases and their canonical share controls remain present', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const release of musicReleases) {
    const canonicalUrl = `https://makenoiz.xyz/music/${release.slug}`;
    assert.ok(html.includes(`data-copy-url="${canonicalUrl}"`));
    assert.ok(html.includes(encodeURIComponent(canonicalUrl)));
  }
});

test('music pages expose video actions only when a downloadable video is configured', () => {
  const release = { ...musicReleases[0], videoUrl: 'https://media.makenoiz.xyz/music/the-prophet/the-prophet-lyric-video.mp4' };
  const html = renderMusicPage(release);
  assert.match(html, /WATCH VIDEO ↗/);
  assert.match(html, /DOWNLOAD VIDEO ↓/);
  assert.ok(html.includes(release.videoUrl));
  assert.doesNotMatch(renderMusicPage(musicReleases[0]), /WATCH VIDEO ↗/);
});
