import { App, PluginSettingTab, Setting } from 'obsidian';
import type MusicPlayerPlugin from './main';
import { DEFAULT_SETTINGS, type MusicPlayerSettings } from './types';

export { DEFAULT_SETTINGS, type MusicPlayerSettings };

export class MusicPlayerSettingTab extends PluginSettingTab {
	plugin: MusicPlayerPlugin;

	constructor(app: App, plugin: MusicPlayerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Note: we use a plain text field rather than a vault folder picker
		// because the user's music library lives OUTSIDE the vault, and
		// Obsidian's FuzzySuggestModal / folder suggester can't reach beyond
		// the vault root.
		new Setting(containerEl)
			.setName('Music folder path')
			.setDesc('Absolute path to your local music library (outside the vault).')
			.addText((text) =>
				text
					.setPlaceholder('e.g. D:\\Music or /home/user/Music')
					.setValue(this.plugin.settings.musicFolderPath)
					.onChange(async (value) => {
						this.plugin.settings.musicFolderPath = value;
						await this.plugin.savePluginData();
					}),
			);

		new Setting(containerEl)
			.setName('Rescan library')
			.setDesc('Reload the track list from your music folder.')
			.addButton((btn) =>
				btn.setButtonText('Rescan').onClick(async () => {
					await this.plugin.rescanLibrary();
				}),
			);
	}
}
