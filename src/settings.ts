import { App, PluginSettingTab, Setting } from 'obsidian';
import type SingularityPlugin from './main';
import type {
	RegistryProfileSettings,
	SingularityPluginSettings,
} from './types';
import { createRegistryProfile } from './registry/profiles';

export class SingularitySettingTab extends PluginSettingTab {
	plugin: SingularityPlugin;

	constructor(app: App, plugin: SingularityPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('API token')
			.setDesc('Your API token from me.singularity-app.com')
			.addText((text) =>
				text
					.setPlaceholder('Enter your API token')
					.setValue(this.plugin.settings.apiToken)
					.onChange(async (value) => {
						this.plugin.settings.apiToken = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Language')
			.setDesc('Language for task status labels and tooltips')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('en', 'English')
					.addOption('ru', 'Русский')
					.setValue(this.plugin.settings.language)
					.onChange(async (value) => {
						this.plugin.settings.language = value as 'en' | 'ru';
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Vault name')
			.setDesc(
				'Vault name for generating links, leave empty to auto-detect'
			)
			.addText((text) =>
				text
					.setPlaceholder(this.app.vault.getName())
					.setValue(this.plugin.settings.vaultName)
					.onChange(async (value) => {
						this.plugin.settings.vaultName = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Auto-sync')
			.setDesc(
				'Automatically sync note URL to task when file is modified'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoSync)
					.onChange(async (value) => {
						this.plugin.settings.autoSync = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Cache duration (minutes)')
			.setDesc('How long to cache task data before refreshing')
			.addSlider((slider) =>
				slider
					.setLimits(1, 60, 1)
					.setValue(this.plugin.settings.cacheTTL)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.cacheTTL = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Badge max width (px)')
			.setDesc('Maximum width of task badge title before truncation')
			.addSlider((slider) =>
				slider
					.setLimits(100, 600, 10)
					.setValue(this.plugin.settings.badgeMaxWidth)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.badgeMaxWidth = value;
						await this.plugin.saveSettings();
						activeDocument.body.style.setProperty(
							'--singularity-badge-max-width',
							`${value}px`
						);
					})
			);

		this.renderRegistrySettings(containerEl);

		new Setting(containerEl)
			.setName('Commands')
			.setHeading();

		containerEl.createEl('p', {
			text: 'Use the command palette (Ctrl/Cmd + P) to access:',
		});

		const commandList = containerEl.createEl('ul');
		commandList.createEl('li', {
			text: 'Singularity: refresh cache - invalidate all cached data',
		});
		commandList.createEl('li', {
			text: 'Singularity: sync current note - sync link to task',
		});
		commandList.createEl('li', {
			text: 'Singularity: open task registry - open the registry view',
		});
		commandList.createEl('li', {
			text: 'Singularity: refresh task registry - refresh the persistent snapshot',
		});
	}

	private renderRegistrySettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('Task registries')
			.setHeading();

		new Setting(containerEl)
			.setName('Enable task registries')
			.setDesc(
				'Enable the registry ribbon and independent workflow profiles. Reload Obsidian after changing this switch.'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.registryEnabled)
					.onChange(async (value) => {
						this.plugin.settings.registryEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		if (this.plugin.settings.registryProfiles.length === 0) {
			containerEl.createEl('p', {
				cls: 'setting-item-description',
				text: 'No registry profiles yet. Add one for each independent folder workflow in this vault.',
			});
		}

		for (const profile of this.plugin.settings.registryProfiles) {
			this.renderRegistryProfile(containerEl, profile);
		}

		new Setting(containerEl)
			.setName('Add registry profile')
			.setDesc(
				'Create another independent dashboard with its own folders, workflow mapping, and snapshot.'
			)
			.addButton((button) =>
				button
					.setButtonText('Add profile')
					.setCta()
					.onClick(async () => {
						const profiles = this.plugin.settings.registryProfiles;
						const profile = createRegistryProfile(
							{ name: `Task registry ${profiles.length + 1}` },
							profiles.map((item) => item.id)
						);
						profiles.push(profile);
						this.plugin.settings.registryEnabled = true;
						await this.plugin.saveSettings();
						this.display();
					})
			);
	}

	private renderRegistryProfile(
		containerEl: HTMLElement,
		profile: RegistryProfileSettings
	): void {
		const card = containerEl.createDiv({
			cls: 'singularity-registry-profile-settings',
		});
		card.createEl('h4', { text: profile.name });

		new Setting(card)
			.setName('Profile name')
			.setDesc('Shown in the registry profile switcher')
			.addText((text) =>
				text
					.setPlaceholder('Project specifications')
					.setValue(profile.name)
					.onChange(async (value) => {
						profile.name = value.trim() || 'Task registry';
						await this.plugin.saveSettings();
					})
			);

		new Setting(card)
			.setName('Enabled')
			.setDesc('Include this profile in the registry switcher')
			.addToggle((toggle) =>
				toggle.setValue(profile.enabled).onChange(async (value) => {
					profile.enabled = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(card)
			.setName('Folders')
			.setDesc(
				'Comma-separated or newline-separated vault folders. Empty scans all Markdown files for this profile.'
			)
			.addTextArea((text) =>
				text
					.setPlaceholder('projects/My Project/Specifications')
					.setValue(profile.folders)
					.onChange(async (value) => {
						profile.folders = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(card)
			.setName('Source project')
			.setDesc(
				'Singularity project used while a document is being prepared'
			)
			.addText((text) =>
				text
					.setPlaceholder('Documentation')
					.setValue(profile.sourceProject)
					.onChange(async (value) => {
						profile.sourceProject = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(card)
			.setName('Delivery projects')
			.setDesc(
				'Comma-separated Singularity projects used after publication or hand-off'
			)
			.addText((text) =>
				text
					.setPlaceholder('Development, Delivery')
					.setValue(profile.deliveryProjects)
					.onChange(async (value) => {
						profile.deliveryProjects = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(card)
			.setName('External link fields')
			.setDesc(
				'Frontmatter fields that confirm publication, for example redmine or jira'
			)
			.addText((text) =>
				text
					.setPlaceholder('redmine, jira')
					.setValue(profile.externalLinkFields)
					.onChange(async (value) => {
						profile.externalLinkFields = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(card)
			.setName('Waiting tags')
			.setDesc(
				'Comma-separated Singularity tag names that put an item into Waiting'
			)
			.addText((text) =>
				text
					.setPlaceholder('waiting, wait')
					.setValue(profile.waitingTags)
					.onChange(async (value) => {
						profile.waitingTags = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(card)
			.setName('Related note prefixes')
			.setDesc(
				'Comma-separated filename prefixes for supplementary notes. These notes appear as sublinks instead of separate documents.'
			)
			.addText((text) =>
				text
					.setPlaceholder('questions, appendix')
					.setValue(profile.companionPrefixes)
					.onChange(async (value) => {
						profile.companionPrefixes = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(card)
			.setName('Related note suffixes')
			.setDesc(
				'Comma-separated filename suffixes for supplementary notes. Separators such as spaces, dashes, and underscores are optional.'
			)
			.addText((text) =>
				text
					.setPlaceholder('questions, appendix')
					.setValue(profile.companionSuffixes)
					.onChange(async (value) => {
						profile.companionSuffixes = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(card)
			.setName('Old item threshold (days)')
			.setDesc(
				'Unlinked notes older than this move to Triage old in this profile'
			)
			.addSlider((slider) =>
				slider
					.setLimits(30, 365, 5)
					.setValue(profile.triageAfterDays)
					.setDynamicTooltip()
					.onChange(async (value) => {
						profile.triageAfterDays = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(card)
			.setName('Snapshot path')
			.setDesc(
				'Vault-relative JSON path unique to this profile'
			)
			.addText((text) =>
				text
					.setPlaceholder(
						`.singularity/task-registry-${profile.id}.json`
					)
					.setValue(profile.snapshotPath)
					.onChange(async (value) => {
						profile.snapshotPath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(card)
			.setName('Remove profile')
			.setDesc(
				'Remove this configuration only. Existing snapshot files are not deleted.'
			)
			.addButton((button) =>
				button
					.setButtonText('Remove')
					.setWarning()
					.onClick(async () => {
						if (
							!window.confirm(
								`Remove registry profile "${profile.name}"?`
							)
						) {
							return;
						}
						this.plugin.settings.registryProfiles =
							this.plugin.settings.registryProfiles.filter(
								(item) => item.id !== profile.id
							);
						await this.plugin.saveSettings();
						this.display();
					})
			);
	}

	/**
	 * Get effective vault name (from settings or auto-detect)
	 */
	getVaultName(settings: SingularityPluginSettings): string {
		return settings.vaultName || this.app.vault.getName();
	}
}
