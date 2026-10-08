import { cp, mkdir, writeFile } from 'node:fs/promises';
import { musicReleases } from './music-releases.mjs';
import { renderMusicPage } from './music-page.mjs';
import { videoReleases } from './video-releases.mjs';
import { renderRewardsPage, renderVideoPage } from './share-page.mjs';

await mkdir('dist', { recursive: true });
await cp('index.html', 'dist/index.html');
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

await mkdir('dist/rewards/ansem', { recursive: true });
await writeFile('dist/rewards/index.html', renderRewardsPage({ variant: 'global' }), 'utf8');
await writeFile('dist/rewards/ansem/index.html', renderRewardsPage({ variant: 'ansem' }), 'utf8');
