import esbuild from 'esbuild';
import { rm, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

await rm('.test-dist', { recursive: true, force: true });
await mkdir('.test-dist', { recursive: true });

await esbuild.build({
	entryPoints: ['tests/registry.test.ts'],
	bundle: true,
	platform: 'node',
	format: 'cjs',
	target: 'node18',
	outfile: '.test-dist/registry.test.cjs',
	logLevel: 'info',
});

const result = spawnSync(
	process.execPath,
	['--test', '.test-dist/registry.test.cjs'],
	{ stdio: 'inherit' }
);

process.exit(result.status ?? 1);
