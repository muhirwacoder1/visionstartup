import { build } from 'esbuild';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

const local = process.env.NIXTIO_HOSTED_BUILD === '1' ? {} : await readFile('.env.local', 'utf8').then(parseEnv, () => ({}));
const config = {
  convexUrl: process.env.PUBLIC_CONVEX_URL || local.PUBLIC_CONVEX_URL || local.CONVEX_URL || '',
  clerkKey: process.env.PUBLIC_CLERK_PUBLISHABLE_KEY || local.PUBLIC_CLERK_PUBLISHABLE_KEY || '',
};
if (config.convexUrl && !/^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(config.convexUrl)) throw Error('Use the HTTPS URL of your Convex deployment.');
if (config.clerkKey && !/^pk_(test|live)_/.test(config.clerkKey)) throw Error('Use a Clerk publishable key.');
await build({
  entryPoints: ['cms/admin.jsx'], outfile: 'dist/admin/studio.js',
  bundle: true, minify: true, target: 'es2022', define: {'process.env.NODE_ENV':'"production"'},
});
await Promise.all([
  copyFile('cms/admin.css','dist/admin/studio.css'),
  copyFile('cms/public.js','dist/cms-public.js'),
  writeFile('dist/cms-config.js','window.NIXTIO_CONFIG = Object.freeze('+JSON.stringify(config)+');\n'),
]);
