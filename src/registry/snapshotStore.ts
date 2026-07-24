import type { RegistrySnapshot } from './types';

export interface SnapshotAdapter {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	write(path: string, data: string): Promise<void>;
	mkdir(path: string): Promise<void>;
}

function normalizePath(path: string): string {
	return path
		.replace(/\\/g, '/')
		.replace(/^\/+/, '')
		.split('/')
		.filter((part) => part.length > 0 && part !== '.')
		.join('/');
}

function isRegistrySnapshot(value: unknown): value is RegistrySnapshot {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<RegistrySnapshot>;
	return (
		candidate.schemaVersion === 1 &&
		typeof candidate.generatedAt === 'string' &&
		Boolean(candidate.scope) &&
		Boolean(candidate.taskEntries) &&
		Array.isArray(candidate.items)
	);
}

export class RegistrySnapshotStore {
	private adapter: SnapshotAdapter;
	private path: string;

	constructor(adapter: SnapshotAdapter, path: string) {
		this.adapter = adapter;
		this.path = normalizePath(path);
	}

	getPath(): string {
		return this.path;
	}

	async load(): Promise<RegistrySnapshot | null> {
		if (!this.path || !(await this.adapter.exists(this.path))) {
			return null;
		}

		try {
			const parsed = JSON.parse(await this.adapter.read(this.path)) as unknown;
			return isRegistrySnapshot(parsed) ? parsed : null;
		} catch {
			return null;
		}
	}

	async save(snapshot: RegistrySnapshot): Promise<void> {
		if (!this.path) {
			throw new Error('Task registry snapshot path is empty');
		}

		await this.ensureParentFolders();
		await this.adapter.write(
			this.path,
			`${JSON.stringify(snapshot, null, 2)}\n`
		);
	}

	private async ensureParentFolders(): Promise<void> {
		const parts = this.path.split('/');
		parts.pop();
		let current = '';

		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!(await this.adapter.exists(current))) {
				await this.adapter.mkdir(current);
			}
		}
	}
}
