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
				'Name of your vault for generating URLs, leave empty to auto-detect'
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
						// Update CSS variable
						document.body.style.setProperty(
							'--singularity-badge-max-width',
							`${value}px`
						);
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
			text: 'Singularity: Refresh cache - invalidate all cached data',
		});
		commandList.createEl('li', {
			text: 'Singularity: Sync current note - sync URL to linked task',
		});
	}

	/**
	 * Get effective vault name (from settings or auto-detect)
	 */
	getVaultName(settings: SingularityPluginSettings): string {
		return settings.vaultName || this.app.vault.getName();
	}
}
