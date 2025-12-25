import { Plugin, TFile, Notice } from 'obsidian';
import { SingularityPluginSettings, DEFAULT_SETTINGS } from './types';
import { SingularityAPI } from './api/singularity';
import { TaskCache } from './cache/taskCache';
import { SingularitySettingTab } from './settings';
import { registerMarkdownProcessor, registerPropertiesProcessor } from './renderer/processor';
import { registerLivePreview } from './renderer/livePreview';
import { ObsidianLinkSync } from './sync/obsidianLink';

export default class SingularityPlugin extends Plugin {
	settings!: SingularityPluginSettings;
	api!: SingularityAPI;
	cache!: TaskCache;
	sync!: ObsidianLinkSync;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Initialize CSS variable for badge width
		this.updateBadgeWidthCSSVar();

		// Initialize API client
		this.api = new SingularityAPI(this.settings.apiToken);

		// Initialize cache
		this.cache = new TaskCache(this.api, this.settings.cacheTTL, this.settings.language);

		// Initialize sync
		this.sync = new ObsidianLinkSync(this);

		// Add settings tab
		this.addSettingTab(new SingularitySettingTab(this.app, this));

		// Register markdown processor for Reading View
		registerMarkdownProcessor(this);

		// Register properties processor for frontmatter
		registerPropertiesProcessor(this);

		// Register Live Preview extension
		registerLivePreview(this);

		// Register file modification event for auto-sync
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile) {
					this.sync.onFileModified(file);
				}
			})
		);

		// Register file rename event for auto-sync
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile) {
					console.debug(`[Singularity] File renamed: ${oldPath} -> ${file.path}`);
					// Trigger sync immediately with the new path
					this.sync.onFileRenamed(file);
				}
			})
		);

		// Add commands
		this.addCommand({
			id: 'refresh-cache',
			name: 'Refresh cache',
			callback: () => {
				this.cache.invalidateAll();
				new Notice('Singularity cache cleared');
			},
		});

		this.addCommand({
			id: 'sync-current-note',
			name: 'Sync current note',
			callback: () => {
				this.sync.syncCurrentFile();
			},
		});

		// Preload tags on startup
		if (this.settings.apiToken) {
			this.cache.preloadTags();
		}

		console.debug('Singularity plugin loaded');
	}

	onunload(): void {
		console.debug('Singularity plugin unloaded');
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);

		// Update API token
		this.api.setToken(this.settings.apiToken);

		// Update cache TTL
		this.cache.setCacheTTL(this.settings.cacheTTL);

		// Update language
		this.cache.setLanguage(this.settings.language);

		// Update badge width CSS variable
		this.updateBadgeWidthCSSVar();
	}

	/**
	 * Update CSS variable for badge max width
	 */
	updateBadgeWidthCSSVar(): void {
		document.body.style.setProperty(
			'--singularity-badge-max-width',
			`${this.settings.badgeMaxWidth}px`
		);
	}
}
