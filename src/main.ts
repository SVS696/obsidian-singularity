import { Plugin, TFile, Notice } from 'obsidian';
import { SingularityPluginSettings, DEFAULT_SETTINGS } from './types';
import { SingularityAPI } from './api/singularity';
import { TaskCache } from './cache/taskCache';
import { SingularitySettingTab } from './settings';
import { registerMarkdownProcessor, registerPropertiesProcessor } from './renderer/processor';
import { registerLivePreview } from './renderer/livePreview';
import { ObsidianLinkSync } from './sync/obsidianLink';
import { TaskRegistryService } from './registry/service';
import {
	enabledRegistryProfiles,
	migrateRegistryProfiles,
} from './registry/profiles';
import {
	TASK_REGISTRY_VIEW_TYPE,
	TaskRegistryView,
} from './registry/view';

export default class SingularityPlugin extends Plugin {
	settings!: SingularityPluginSettings;
	api!: SingularityAPI;
	cache!: TaskCache;
	sync!: ObsidianLinkSync;
	registry!: TaskRegistryService;

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

		// Initialize the persistent task registry
		this.registry = new TaskRegistryService(this);
		this.registerView(
			TASK_REGISTRY_VIEW_TYPE,
			(leaf) => new TaskRegistryView(leaf, this)
		);

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
			this.app.vault.on('rename', (file) => {
				if (file instanceof TFile) {
					// Trigger sync immediately with the new path
					this.sync.onFileRenamed(file);
				}
			})
		);

		// Opening a linked note repairs missed background syncs. The normal
		// publication workflow still writes links immediately without this event.
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				this.sync.onFileOpened(file);
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
				void this.sync.syncCurrentFile();
			},
		});

		this.addCommand({
			id: 'open-task-registry',
			name: 'Open task registry',
			callback: () => {
				void this.activateTaskRegistry();
			},
		});

		this.addCommand({
			id: 'refresh-task-registry',
			name: 'Refresh task registry',
			callback: () => {
				void this.refreshTaskRegistry();
			},
		});

		if (
			this.settings.registryEnabled &&
			enabledRegistryProfiles(this.settings).length > 0
		) {
			this.addRibbonIcon(
				'list-checks',
				'Open Singularity task registry',
				() => {
					void this.activateTaskRegistry();
				}
			);
			void this.registry.loadAllSnapshots();
		}

		// Preload tags on startup
		if (this.settings.apiToken) {
			void this.cache.preloadTags();
		}
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(TASK_REGISTRY_VIEW_TYPE);
	}

	async activateTaskRegistry(): Promise<void> {
		const existing =
			this.app.workspace.getLeavesOfType(TASK_REGISTRY_VIEW_TYPE)[0];
		const leaf = existing ?? this.app.workspace.getLeaf(true);

		if (!existing) {
			await leaf.setViewState({
				type: TASK_REGISTRY_VIEW_TYPE,
				active: true,
			});
		}
		await this.app.workspace.revealLeaf(leaf);
	}

	private async refreshTaskRegistry(): Promise<void> {
		try {
			const views = this.app.workspace
				.getLeavesOfType(TASK_REGISTRY_VIEW_TYPE)
				.map((leaf) => leaf.view)
				.filter(
					(view): view is TaskRegistryView =>
						view instanceof TaskRegistryView
				);
			if (views.length > 0) {
				await Promise.all(views.map((view) => view.refresh()));
				return;
			}

			const profiles = this.registry.getProfiles();
			if (profiles.length === 0) {
				new Notice('No enabled task registry profiles');
				return;
			}

			let itemCount = 0;
			let savedSnapshots = 0;
			for (const profile of profiles) {
				const result = await this.registry.refresh(profile.id);
				itemCount += result.snapshot.items.length;
				if (result.source === 'snapshot') savedSnapshots += 1;
			}
			const suffix =
				savedSnapshots > 0
					? ` · ${savedSnapshots} saved snapshot(s)`
					: '';
			new Notice(
				`Task registries: ${profiles.length} profile(s), ${itemCount} notes${suffix}`
			);
		} catch (error) {
			new Notice(
				error instanceof Error
					? error.message
					: 'Task registry refresh failed'
			);
		}
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<SingularityPluginSettings> | null;
		const stored = data ?? {};
		const profiles = migrateRegistryProfiles(stored);
		this.settings = {
			...DEFAULT_SETTINGS,
			...stored,
			registryProfiles: profiles,
		};

		// Persist the lossless 1.2.x migration once so profile IDs stay stable.
		if (!Array.isArray(stored.registryProfiles) && profiles.length > 0) {
			await this.saveData(this.settings);
		}
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

	updateBadgeWidthCSSVar(): void {
		activeDocument.body.style.setProperty(
			'--singularity-badge-max-width',
			`${this.settings.badgeMaxWidth}px`
		);
	}
}
