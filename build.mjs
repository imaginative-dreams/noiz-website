import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { lyricVideos, renderLyricVideosSection } from './lyric-videos.mjs';
import { musicReleases } from './music-releases.mjs';
import { renderMusicPage } from './music-page.mjs';
import { videoReleases } from './video-releases.mjs';
import { renderLyricVideoPage, renderRewardsPage, renderVideoPage } from './share-page.mjs';

await mkdir('dist', { recursive: true });
const homepageTemplate = await readFile('index.html', 'utf8');
const homepage = homepageTemplate
  .replace('<section id="archive">', `${renderLyricVideosSection()}\n  <section id="archive">`)
  .replace('04 / VIDEO ARCHIVE', '05 / VIDEO ARCHIVE');
await writeFile('dist/index.html', homepage, 'utf8');
await cp('public', 'dist', { recursive: true });

for (const release of musicReleases) {
  const releaseDirectory = `dist/music/${release.slug}`;
  await mkdir(releaseDirectory, { recursive: true });
  await writeFile(`${releaseDirectory}/index.html`, renderMusicPage(release), 'utf8');
}

for (const video of videoReleases) {
  const videoDirectory = `dist/video/${video.slug}`;
  await mkdir(videoDirectory, { recursive: true });
  await writeFile(`${videoDirectory}/index.html`, renderVideoPage(video), 'utf8');
}

for (const video of lyricVideos) {
  const videoDirectory = `dist/video/${video.slug}`;
  await mkdir(videoDirectory, { recursive: true });
  await writeFile(`${videoDirectory}/index.html`, renderLyricVideoPage(video), 'utf8');
}

await mkdir('dist/rewards/ansem', { recursive: true });
await writeFile('dist/rewards/index.html', renderRewardsPage({ variant: 'global' }), 'utf8');
await writeFile('dist/rewards/ansem/index.html', renderRewardsPage({ variant: 'ansem' }), 'utf8');
