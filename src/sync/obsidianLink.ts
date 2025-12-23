import { TFile, debounce, Notice } from 'obsidian';
import type SingularityPlugin from '../main';
import { extractTaskId, buildObsidianUrl } from '../types';

export class ObsidianLinkSync {
	private plugin: SingularityPlugin;
	private syncDebounced: (file: TFile) => void;

	constructor(plugin: SingularityPlugin) {
		this.plugin = plugin;

		// Debounce sync by 2 seconds
		this.syncDebounced = debounce(
			(file: TFile) => this.syncFile(file),
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
		this.syncFile(file);
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

		const parts = fieldName.match(/([^.\[\]]+)|\[(\d+)\]/g);
		if (!parts) return undefined;

		let current: unknown = obj;
		for (const part of parts) {
			if (current === undefined || current === null) return undefined;

			const arrayMatch = part.match(/\[(\d+)\]/);
			if (arrayMatch) {
				current = (current as unknown[])[parseInt(arrayMatch[1])];
			} else {
				current = (current as Record<string, unknown>)[part];
			}
		}

		return current;
	}

	/**
	 * Get or generate singularity_id for a specific URL in frontmatter
	 * ID is stored in the URL fragment: singularityapp://...#sid=uuid
	 */
	async getOrCreateSingularityId(file: TFile, url: string, fieldName: string): Promise<string> {
		// First check if sid is already in the URL
		const existingSid = this.extractSidFromUrl(url);
		if (existingSid) {
			return existingSid;
		}

		// Generate new ID and add to URL
		const newId = this.generateUUID();
		await this.addSidToFieldUrl(file, fieldName, newId);

		console.log(`[Singularity] Generated sid for ${file.basename}.${fieldName}: ${newId}`);
		return newId;
	}

	/**
	 * Add sid fragment to a specific URL field in frontmatter
	 */
	private async addSidToFieldUrl(file: TFile, fieldName: string, sid: string): Promise<void> {
		await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
			// Handle nested fields and arrays
			const parts = fieldName.match(/([^.\[\]]+)|\[(\d+)\]/g);
			if (!parts) return;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let obj: any = fm;
			for (let i = 0; i < parts.length - 1; i++) {
				const part = parts[i];
				const arrayMatch = part.match(/\[(\d+)\]/);
				if (arrayMatch) {
					obj = obj[parseInt(arrayMatch[1])];
				} else {
					obj = obj[part];
				}
			}

			const lastPart = parts[parts.length - 1];
			const arrayMatch = lastPart.match(/\[(\d+)\]/);

			if (arrayMatch) {
				const idx = parseInt(arrayMatch[1]);
				if (obj[idx] && !obj[idx].includes('#sid=')) {
					obj[idx] = `${obj[idx]}#sid=${sid}`;
				}
			} else {
				const currentValue = obj[lastPart];
				if (typeof currentValue === 'string' && !currentValue.includes('#sid=')) {
					obj[lastPart] = `${currentValue}#sid=${sid}`;
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
			// Task has existing notes - get and update
			const note = await api.getNote(task.note);
			const currentOps = api.parseNoteContent(note.content);

			// Check if this note is already synced (has our singularity_id in URL)
			const existingById = api.findObsidianLinkById(currentOps, singularityId);
			if (existingById) {
				// Check if base URL is the same (ignoring sid fragment)
				const existingBaseUrl = this.extractBaseUrl(existingById.op);
				if (existingBaseUrl === obsidianUrl) {
					// Already synced with correct URL, skip
					console.log(`[Singularity] Already synced: ${noteTitle}`);
					return;
				}
				// URL changed (rename) - update the link
				console.log(`[Singularity] Updating URL for ${noteTitle}`);
				deltaOps = api.updateObsidianLinkById(currentOps, noteTitle, obsidianUrl, singularityId);
			} else {
				// No link with our ID - check for any legacy obsidian:// link
				const legacyLink = api.findAnyObsidianLink(currentOps);
				if (legacyLink) {
					// Found legacy link - add sid to its URL
					console.log(`[Singularity] Adding sid to legacy link for ${noteTitle}`);
					deltaOps = api.addSidToLink(currentOps, legacyLink.index, singularityId);
				} else {
					// No obsidian links at all - add new one
					console.log(`[Singularity] Adding new link for ${noteTitle}`);
					deltaOps = api.updateObsidianLinkById(currentOps, noteTitle, obsidianUrl, singularityId);
				}
			}
		} else {
			// No existing notes - create new
			deltaOps = api.createInitialDelta(noteTitle, obsidianUrl, singularityId);
		}

		// Update task
		await api.updateTaskNote(taskId, deltaOps);
		console.log(`[Singularity] Synced ${noteTitle} to task ${taskId}`);

		// Invalidate cache
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
			new Notice('No Singularity links in frontmatter');
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
