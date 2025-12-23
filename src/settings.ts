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

		containerEl.createEl('h2', { text: 'Singularity App Integration' });

		new Setting(containerEl)
			.setName('API Token')
			.setDesc('Your Singularity API token. Get it from me.singularity-app.com')
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
			.setName('Vault Name')
			.setDesc(
				'Name of your Obsidian vault for generating obsidian:// URLs. ' +
					'Leave empty to auto-detect.'
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
				'Automatically sync Obsidian note URL to Singularity task when file is modified'
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
			.setName('Cache TTL (minutes)')
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

		containerEl.createEl('h3', { text: 'Commands' });

		containerEl.createEl('p', {
			text: 'Use the command palette (Ctrl/Cmd + P) to access:',
		});

		const commandList = containerEl.createEl('ul');
		commandList.createEl('li', {
			text: 'Singularity: Refresh cache - Invalidate all cached data',
		});
		commandList.createEl('li', {
			text: 'Singularity: Sync current note - Sync Obsidian URL to linked task',
		});
	}

	/**
	 * Get effective vault name (from settings or auto-detect)
	 */
	getVaultName(settings: SingularityPluginSettings): string {
		return settings.vaultName || this.app.vault.getName();
	}
}
