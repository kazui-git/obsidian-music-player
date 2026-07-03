import { Notice, Plugin } from 'obsidian';
import { MusicPlayerSettingTab } from './settings';
import { DEFAULT_SETTINGS, type MusicPlayerSettings } from './types';
import { MusicPlayerView, VIEW_TYPE_MUSIC_PLAYER } from './view';

interface PluginData {
	settings?: Partial<MusicPlayerSettings>;
}

export default class MusicPlayerPlugin extends Plugin {
	settings!: MusicPlayerSettings;

	async onload() {
		// 1. Load persisted settings
		const data = (await this.loadData()) as PluginData | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings);

		// 2. Register our sidebar view type with Obsidian
		this.registerView(
			VIEW_TYPE_MUSIC_PLAYER,
			(leaf) => new MusicPlayerView(leaf, this),
		);

		// 3. Ribbon icon (left strip) → opens the player in the right sidebar
		this.addRibbonIcon('music', 'Open Music Player', () => {
			this.activateView();
		});

		// 4. Command palette entry
		this.addCommand({
			id: 'open-music-player',
			name: 'Open Music Player',
			callback: () => {
				this.activateView();
			},
		});

		// 5. Settings tab
		this.addSettingTab(new MusicPlayerSettingTab(this.app, this));

		console.log('Music Player plugin loaded');
	}

	onunload() {
		console.log('Music Player plugin unloaded');
	}

	async savePluginData(): Promise<void> {
		const data: PluginData = { settings: this.settings };
		await this.saveData(data);
	}

	/**
	 * Opens (or activates) the player view in the right sidebar. Creates the
	 * leaf on first open, and reuses it thereafter so we don't stack duplicates.
	 */
	async activateView(): Promise<void> {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE_MUSIC_PLAYER)[0];

		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (!rightLeaf) {
				new Notice('Could not open Music Player panel.');
				return;
			}
			leaf = rightLeaf;
		}

		await leaf.setViewState({
			type: VIEW_TYPE_MUSIC_PLAYER,
			active: true,
		});

		workspace.revealLeaf(leaf);
	}

	/**
	 * Trigger a library rescan from any active player view (e.g. from the
	 * settings tab's "Rescan" button). If no view is open, the next open will
	 * scan fresh anyway.
	 */
	async rescanLibrary(): Promise<void> {
		const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_MUSIC_PLAYER)[0];
		if (leaf && leaf.view instanceof MusicPlayerView) {
			await leaf.view.rescanLibrary();
		} else {
			new Notice('Open the Music Player panel first to rescan.');
		}
	}
}
