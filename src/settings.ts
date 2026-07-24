import { App, PluginSettingTab, Setting } from 'obsidian';
import type SingularityPlugin from './main';
import type { SingularityPluginSettings } from './types';

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

		new Setting(containerEl)
			.setName('Task registry')
			.setHeading();

		new Setting(containerEl)
			.setName('Enable task registry')
			.setDesc('Show the task registry ribbon button and load its saved snapshot')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.registryEnabled)
					.onChange(async (value) => {
						this.plugin.settings.registryEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Registry title')
			.setDesc('Title shown at the top of the registry view')
			.addText((text) =>
				text
					.setPlaceholder('Task registry')
					.setValue(this.plugin.settings.registryTitle)
					.onChange(async (value) => {
						this.plugin.settings.registryTitle = value || 'Task registry';
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Registry folders')
			.setDesc(
				'Comma-separated or newline-separated vault folders. Leave empty to scan all Markdown files.'
			)
			.addTextArea((text) =>
				text
					.setPlaceholder('Projects/Specifications')
					.setValue(this.plugin.settings.registryFolders)
					.onChange(async (value) => {
						this.plugin.settings.registryFolders = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Source project')
			.setDesc(
				'Singularity project used while a document is being prepared'
			)
			.addText((text) =>
				text
					.setPlaceholder('Documentation')
					.setValue(this.plugin.settings.registrySourceProject)
					.onChange(async (value) => {
						this.plugin.settings.registrySourceProject = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Delivery projects')
			.setDesc(
				'Comma-separated Singularity projects used after publication or hand-off'
			)
			.addText((text) =>
				text
					.setPlaceholder('Development, Delivery')
					.setValue(this.plugin.settings.registryDeliveryProjects)
					.onChange(async (value) => {
						this.plugin.settings.registryDeliveryProjects = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('External link fields')
			.setDesc(
				'Frontmatter fields that confirm publication, for example redmine or jira'
			)
			.addText((text) =>
				text
					.setPlaceholder('redmine, jira')
					.setValue(this.plugin.settings.registryExternalLinkFields)
					.onChange(async (value) => {
						this.plugin.settings.registryExternalLinkFields = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Waiting tags')
			.setDesc(
				'Comma-separated Singularity tag names that put an item into Waiting'
			)
			.addText((text) =>
				text
					.setPlaceholder('waiting, wait')
					.setValue(this.plugin.settings.registryWaitingTags)
					.onChange(async (value) => {
						this.plugin.settings.registryWaitingTags = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Snapshot path')
			.setDesc(
				'Vault-relative JSON path for the AI-readable offline snapshot'
			)
			.addText((text) =>
				text
					.setPlaceholder('.singularity/task-registry.json')
					.setValue(this.plugin.settings.registrySnapshotPath)
					.onChange(async (value) => {
						this.plugin.settings.registrySnapshotPath = value;
						await this.plugin.saveSettings();
					})
			);

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

	/**
	 * Get effective vault name (from settings or auto-detect)
	 */
	getVaultName(settings: SingularityPluginSettings): string {
		return settings.vaultName || this.app.vault.getName();
	}
}
