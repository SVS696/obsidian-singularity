import { TFile, debounce, Notice } from 'obsidian';
import type SingularityPlugin from '../main';
import { extractTaskId, buildObsidianUrl } from '../types';

type PathToken = { kind: 'key'; name: string } | { kind: 'index'; index: number };

function tokenizePath(path: string): PathToken[] {
	const tokens: PathToken[] = [];
	let i = 0;
	while (i < path.length) {
		const ch = path[i];
		if (ch === '.') {
			i++;
			continue;
		}
		if (ch === '[') {
			const end = path.indexOf(']', i);
			if (end === -1) break;
			const idx = parseInt(path.slice(i + 1, end), 10);
			if (!Number.isNaN(idx)) {
				tokens.push({ kind: 'index', index: idx });
			}
			i = end + 1;
			continue;
		}
		let j = i;
		while (j < path.length && path[j] !== '.' && path[j] !== '[') j++;
		tokens.push({ kind: 'key', name: path.slice(i, j) });
		i = j;
	}
	return tokens;
}

export class ObsidianLinkSync {
	private plugin: SingularityPlugin;
	private syncDebounced: (file: TFile) => void;

	constructor(plugin: SingularityPlugin) {
		this.plugin = plugin;

		// Debounce sync by 2 seconds
		this.syncDebounced = debounce(
			(file: TFile) => void this.syncFile(file),
			2000,
			true
		);
	}

	/**
	 * Handle file modification event
	 */
	onFileModified(file: TFile): void {
		if (!this.plugin.settings.autoSync) {
			return;
		}

		if (file.extension !== 'md') {
			return;
		}

		this.syncDebounced(file);
	}

	/**
	 * Handle file rename event - sync immediately without debounce
	 */
	onFileRenamed(file: TFile): void {
		if (!this.plugin.settings.autoSync) {
			return;
		}

		if (file.extension !== 'md') {
			return;
		}

		// Sync immediately without debounce for renames
		void this.syncFile(file);
	}

	/**
	 * Sync Obsidian URL to all Singularity tasks found in frontmatter
	 * Scans ALL frontmatter fields for singularityapp:// URLs
	 */
	async syncFile(file: TFile): Promise<void> {
		const frontmatter =
			this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;

		if (!frontmatter) {
			return;
		}

		// Find all singularityapp:// URLs in frontmatter
		const urls = this.findAllSingularityUrls(frontmatter);
		if (urls.length === 0) {
			return;
		}

		// Sync each task
		for (const { url, fieldName } of urls) {
			const taskId = extractTaskId(url);
			if (!taskId) continue;

			try {
				await this.syncObsidianUrl(taskId, file, fieldName);
			} catch (error) {
				console.error(`[Singularity] Failed to sync ${fieldName}:`, error);
			}
		}
	}

	/**
	 * Find all singularityapp:// URLs in frontmatter (any field)
	 */
	private findAllSingularityUrls(obj: Record<string, unknown>, prefix = ''): Array<{ url: string; fieldName: string }> {
		const results: Array<{ url: string; fieldName: string }> = [];

		for (const [key, value] of Object.entries(obj)) {
			const fieldName = prefix ? `${prefix}.${key}` : key;

			if (typeof value === 'string' && value.startsWith('singularityapp://')) {
				results.push({ url: value, fieldName });
			} else if (Array.isArray(value)) {
				value.forEach((item, idx) => {
					if (typeof item === 'string' && item.startsWith('singularityapp://')) {
						results.push({ url: item, fieldName: `${fieldName}[${idx}]` });
					}
				});
			} else if (value && typeof value === 'object') {
				results.push(...this.findAllSingularityUrls(value as Record<string, unknown>, fieldName));
			}
		}

		return results;
	}

	/**
	 * Generate UUID v4
	 */
	private generateUUID(): string {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
			const r = (Math.random() * 16) | 0;
			const v = c === 'x' ? r : (r & 0x3) | 0x8;
			return v.toString(16);
		});
	}

	/**
	 * Extract sid from singularity URL (from #sid=xxx fragment)
	 */
	private extractSidFromUrl(url: string): string | null {
		const match = url.match(/#sid=([a-f0-9-]+)/i);
		return match ? match[1] : null;
	}

	/**
	 * Get value from frontmatter by field path (supports nested and arrays)
	 */
	private getFieldValue(obj: Record<string, unknown> | undefined, fieldName: string): unknown {
		if (!obj) return undefined;

		const tokens = tokenizePath(fieldName);
		if (tokens.length === 0) return undefined;

		let current: unknown = obj;
		for (const token of tokens) {
			if (current === undefined || current === null) return undefined;
			if (token.kind === 'index') {
				if (!Array.isArray(current)) return undefined;
				current = current[token.index];
			} else {
				if (typeof current !== 'object' || Array.isArray(current)) return undefined;
				current = (current as Record<string, unknown>)[token.name];
			}
		}

		return current;
	}

	async getOrCreateSingularityId(file: TFile, url: string, fieldName: string): Promise<string> {
		const existingSid = this.extractSidFromUrl(url);
		if (existingSid) {
			return existingSid;
		}

		const newId = this.generateUUID();
		await this.addSidToFieldUrl(file, fieldName, newId);
		return newId;
	}

	private async addSidToFieldUrl(file: TFile, fieldName: string, sid: string): Promise<void> {
		await this.plugin.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			const tokens = tokenizePath(fieldName);
			if (tokens.length === 0) return;

			let parent: Record<string, unknown> | unknown[] = fm;
			for (let i = 0; i < tokens.length - 1; i++) {
				const token = tokens[i];
				let next: unknown;
				if (token.kind === 'index') {
					if (!Array.isArray(parent)) return;
					next = parent[token.index];
				} else {
					if (Array.isArray(parent)) return;
					next = parent[token.name];
				}
				if (next === undefined || next === null) return;
				if (typeof next !== 'object') return;
				parent = next as Record<string, unknown> | unknown[];
			}

			const last = tokens[tokens.length - 1];
			if (last.kind === 'index') {
				if (!Array.isArray(parent)) return;
				const current = parent[last.index];
				if (typeof current === 'string' && !current.includes('#sid=')) {
					parent[last.index] = `${current}#sid=${sid}`;
				}
			} else {
				if (Array.isArray(parent)) return;
				const current = parent[last.name];
				if (typeof current === 'string' && !current.includes('#sid=')) {
					parent[last.name] = `${current}#sid=${sid}`;
				}
			}
		});
	}

	/**
	 * Sync Obsidian URL to Singularity task notes
	 */
	async syncObsidianUrl(taskId: string, file: TFile, fieldName: string): Promise<void> {
		const api = this.plugin.api;
		const vaultName = this.getVaultName();
		const obsidianUrl = buildObsidianUrl(vaultName, file.path);
		const noteTitle = file.basename;

		// Get the current URL from frontmatter to extract/generate sid
		const frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		const currentUrl = this.getFieldValue(frontmatter, fieldName) as string;

		// Get or create singularity_id
		const singularityId = await this.getOrCreateSingularityId(file, currentUrl, fieldName);

		// Get current task
		const task = await api.getTask(taskId);

		let deltaOps;

		if (task.note) {
			const note = await api.getNote(task.note);
			const currentOps = api.parseNoteContent(note.content);

			const existingById = api.findObsidianLinkById(currentOps, singularityId);
			if (existingById) {
				const existingBaseUrl = this.extractBaseUrl(existingById.op);
				if (existingBaseUrl === obsidianUrl) {
					return;
				}
				deltaOps = api.updateObsidianLinkById(currentOps, noteTitle, obsidianUrl, singularityId);
			} else {
				const legacyLink = api.findAnyObsidianLink(currentOps);
				if (legacyLink) {
					deltaOps = api.addSidToLink(currentOps, legacyLink.index, singularityId);
				} else {
					deltaOps = api.updateObsidianLinkById(currentOps, noteTitle, obsidianUrl, singularityId);
				}
			}
		} else {
			deltaOps = api.createInitialDelta(noteTitle, obsidianUrl, singularityId);
		}

		await api.updateTaskNote(taskId, deltaOps);
		this.plugin.cache.invalidateTask(taskId);
	}

	/**
	 * Extract base URL (without sid fragment) from a link op
	 */
	private extractBaseUrl(op: { attributes?: { link?: string } }): string | null {
		const url = op.attributes?.link;
		if (!url?.startsWith('obsidian://')) return null;
		// Remove #sid=... fragment if present
		const hashIndex = url.indexOf('#sid=');
		return hashIndex > 0 ? url.substring(0, hashIndex) : url;
	}

	/**
	 * Manual sync for current file (command)
	 */
	async syncCurrentFile(): Promise<void> {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file) {
			new Notice('No active file');
			return;
		}

		const frontmatter =
			this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;

		if (!frontmatter) {
			new Notice('No frontmatter in this file');
			return;
		}

		const urls = this.findAllSingularityUrls(frontmatter);
		if (urls.length === 0) {
			new Notice('No task links in frontmatter');
			return;
		}

		let synced = 0;
		for (const { url, fieldName } of urls) {
			const taskId = extractTaskId(url);
			if (!taskId) continue;

			try {
				await this.syncObsidianUrl(taskId, file, fieldName);
				synced++;
			} catch (error) {
				console.error(`[Singularity] Failed to sync ${fieldName}:`, error);
			}
		}

		new Notice(`Synced ${synced} task(s) to Singularity`);
	}

	/**
	 * Get vault name from settings or auto-detect
	 */
	private getVaultName(): string {
		return (
			this.plugin.settings.vaultName || this.plugin.app.vault.getName()
		);
	}
}
