import { cp, mkdir, writeFile } from 'node:fs/promises';
import { musicReleases } from './music-releases.mjs';
import { renderMusicPage } from './music-page.mjs';

await mkdir('dist', { recursive: true });
await cp('index.html', 'dist/index.html');
await cp('public', 'dist', { recursive: true });

for (const release of musicReleases) {
  const releaseDirectory = `dist/music/${release.slug}`;
  await mkdir(releaseDirectory, { recursive: true });
  await writeFile(`${releaseDirectory}/index.html`, renderMusicPage(release), 'utf8');
}
