import { ItemView, Notice, setIcon, WorkspaceLeaf } from 'obsidian';
import type MusicPlayerPlugin from './main';
import {
	createArtworkUrlForFile,
	createObjectUrlForFile,
	MusicLibrary,
} from './library';
import type { Track } from './types';

export const VIEW_TYPE_MUSIC_PLAYER = 'music-player-view';

export class MusicPlayerView extends ItemView {
	private plugin: MusicPlayerPlugin;
	private library: MusicLibrary;

	/** The single hidden <audio> element that does the actual playback. */
	private audio: HTMLAudioElement;

	// ── DOM refs (assigned in onOpen) ──
	private artworkEl!: HTMLImageElement;
	private artworkPlaceholderEl!: HTMLElement;
	private nowPlayingTitleEl!: HTMLElement;
	private nowPlayingArtistEl!: HTMLElement;
	private playPauseBtn!: HTMLButtonElement;
	private trackListEl!: HTMLElement;

	// ── Playback state ──
	private tracks: Track[] = [];
	private currentIndex = -1;
	/** Object URL currently bound to <audio>.src; revoked on track change. */
	private currentAudioUrl: string | null = null;
	/** Object URL currently shown as artwork; revoked on track change. */
	private currentArtworkUrl: string | null = null;
	private isScanning = false;

	constructor(leaf: WorkspaceLeaf, plugin: MusicPlayerPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.library = new MusicLibrary(plugin.settings.musicFolderPath);
		this.audio = new Audio();
	}

	// ── Required ItemView overrides ──

	getViewType(): string {
		return VIEW_TYPE_MUSIC_PLAYER;
	}

	getDisplayText(): string {
		return 'Music Player';
	}

	getIcon(): string {
		return 'music';
	}

	async onOpen() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.classList.add('music-player-plugin');

		this.buildLayout();
		this.attachAudioEvents();

		// Kick off the initial scan if a folder is configured.
		await this.rescanLibrary();
	}

	async onClose() {
		// Stop playback and release the object URLs so we don't leak memory.
		this.audio.pause();
		this.audio.removeAttribute('src');
		this.audio.load();
		this.revokeUrls();
	}

	// ── Layout ──

	private buildLayout(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Now-playing block
		const nowPlaying = containerEl.createDiv({ cls: 'music-player-now-playing' });

		const artworkWrap = nowPlaying.createDiv({ cls: 'music-player-artwork' });
		this.artworkPlaceholderEl = artworkWrap.createDiv({ cls: 'music-player-artwork-placeholder' });
		setIcon(this.artworkPlaceholderEl, 'music');
		this.artworkEl = artworkWrap.createEl('img', { cls: 'music-player-artwork-img' });
		this.artworkEl.style.display = 'none';
		this.artworkEl.alt = 'Album artwork';
		// Square aspect is enforced via CSS; this stops the alt text from
		// showing as a broken-image icon before the first track loads.

		const meta = nowPlaying.createDiv({ cls: 'music-player-meta' });
		this.nowPlayingTitleEl = meta.createDiv({ cls: 'music-player-title' });
		this.nowPlayingTitleEl.setText('Nothing playing');
		this.nowPlayingArtistEl = meta.createDiv({ cls: 'music-player-artist' });
		this.nowPlayingArtistEl.setText('\u00A0'); // nbsp keeps layout height stable

		// Controls
		const controls = containerEl.createDiv({ cls: 'music-player-controls' });

		const prevBtn = controls.createEl('button', {
			cls: 'music-player-btn music-player-btn-skip',
			attr: { 'aria-label': 'Previous track', title: 'Previous track' },
		});
		setIcon(prevBtn, 'skip-back');
		prevBtn.addEventListener('click', () => this.previous());

		this.playPauseBtn = controls.createEl('button', {
			cls: 'music-player-btn music-player-btn-play',
			attr: { 'aria-label': 'Play / pause', title: 'Play / pause' },
		});
		setIcon(this.playPauseBtn, 'play');
		this.playPauseBtn.addEventListener('click', () => this.togglePlay());

		const nextBtn = controls.createEl('button', {
			cls: 'music-player-btn music-player-btn-skip',
			attr: { 'aria-label': 'Next track', title: 'Next track' },
		});
		setIcon(nextBtn, 'skip-forward');
		nextBtn.addEventListener('click', () => this.next());

		// Track list
		const listHeader = containerEl.createDiv({ cls: 'music-player-list-header' });
		listHeader.createSpan({ cls: 'music-player-list-title', text: 'Songs' });
		const rescanBtn = listHeader.createEl('button', {
			cls: 'music-player-rescan-btn',
			attr: { 'aria-label': 'Rescan library', title: 'Rescan library' },
		});
		setIcon(rescanBtn, 'refresh-cw');
		rescanBtn.addEventListener('click', () => this.rescanLibrary());

		this.trackListEl = containerEl.createDiv({ cls: 'music-player-list' });
	}

	private attachAudioEvents(): void {
		// Keep the play/pause icon in sync with the element's actual state —
		// covers auto-advance, programmatic play, and the ended event.
		this.audio.addEventListener('play', () => this.updatePlayPauseIcon());
		this.audio.addEventListener('pause', () => this.updatePlayPauseIcon());
		this.audio.addEventListener('ended', () => this.next());
	}

	// ── Library ──

	async rescanLibrary(): Promise<void> {
		const folderPath = this.plugin.settings.musicFolderPath;
		this.library.setFolderPath(folderPath);

		if (!folderPath) {
			this.showEmptyState('No music folder set', 'Add your library path in Settings → Music Player.');
			return;
		}

		this.isScanning = true;
		this.trackListEl.empty();
		this.trackListEl.createDiv({ cls: 'music-player-list-status', text: 'Scanning…' });

		try {
			this.tracks = await this.library.scan();
		} catch (err) {
			this.tracks = [];
			const msg = err instanceof Error ? err.message : 'Failed to scan music folder.';
			this.showEmptyState('Scan failed', msg);
			this.isScanning = false;
			return;
		}

		this.isScanning = false;
		if (this.tracks.length === 0) {
			this.showEmptyState('No songs found', 'No supported audio files in the configured folder.');
			return;
		}
		this.renderTrackList();
	}

	private renderTrackList(): void {
		// Rebuild the full layout to recover from an empty-state swap.
		this.buildLayout();

		for (let i = 0; i < this.tracks.length; i++) {
			const track = this.tracks[i];
			if (!track) continue;
			const row = this.trackListEl.createDiv({
				cls: 'music-player-track',
				attr: { 'data-index': String(i) },
			});
			row.createDiv({ cls: 'music-player-track-title', text: track.title });
			if (track.artist) {
				row.createDiv({ cls: 'music-player-track-artist', text: track.artist });
			}
			row.addEventListener('click', () => this.playTrack(i));
		}

		this.highlightCurrent();
	}

	private showEmptyState(title: string, desc: string): void {
		const { containerEl } = this;
		containerEl.empty();
		const empty = containerEl.createDiv({ cls: 'music-player-empty' });
		const iconEl = empty.createDiv({ cls: 'music-player-empty-icon' });
		setIcon(iconEl, 'music');
		empty.createDiv({ cls: 'music-player-empty-title', text: title });
		empty.createDiv({ cls: 'music-player-empty-desc', text: desc });
	}

	// ── Playback ──

	private async playTrack(index: number): Promise<void> {
		if (index < 0 || index >= this.tracks.length) return;
		const track = this.tracks[index];
		if (!track) return;

		this.currentIndex = index;

		// Swap out the previous track's object URLs.
		this.revokeUrls();
		const url = createObjectUrlForFile(track.filePath);
		if (!url) {
			new Notice(`Could not read file: ${track.title}`);
			return;
		}
		this.currentAudioUrl = url;
		this.audio.src = url;
		await this.audio.play().catch(() => {
			// play() rejects if interrupted (e.g. rapid track skipping) — harmless.
		});

		this.updateNowPlaying(track);
		this.highlightCurrent();

		// Load artwork lazily so a big library doesn't decode every cover up front.
		this.loadArtwork(track);
	}

	private togglePlay(): void {
		if (this.currentIndex < 0 && this.tracks.length > 0) {
			// Nothing selected yet → start the first track.
			void this.playTrack(0);
			return;
		}
		if (this.audio.paused) {
			void this.audio.play().catch(() => {});
		} else {
			this.audio.pause();
		}
	}

	private next(): void {
		if (this.tracks.length === 0) return;
		// Wrap around at the end so "next" on the last track restarts the list.
		const nextIndex = (this.currentIndex + 1) % this.tracks.length;
		void this.playTrack(nextIndex);
	}

	private previous(): void {
		if (this.tracks.length === 0) return;
		// If we're >3s into a track, "previous" restarts it (standard UX);
		// otherwise jump to the prior track.
		if (this.audio.currentTime > 3) {
			this.audio.currentTime = 0;
			return;
		}
		const prevIndex = (this.currentIndex - 1 + this.tracks.length) % this.tracks.length;
		void this.playTrack(prevIndex);
	}

	private async loadArtwork(track: Track): Promise<void> {
		const url = await createArtworkUrlForFile(track.filePath);
		// Guard: the user may have switched tracks while we were reading art.
		if (this.tracks[this.currentIndex] !== track) {
			if (url) URL.revokeObjectURL(url);
			return;
		}
		this.currentArtworkUrl = url;
		if (url) {
			this.artworkEl.src = url;
			this.artworkEl.style.display = '';
			this.artworkPlaceholderEl.style.display = 'none';
		} else {
			this.artworkEl.style.display = 'none';
			this.artworkPlaceholderEl.style.display = '';
		}
	}

	private updateNowPlaying(track: Track): void {
		this.nowPlayingTitleEl.setText(track.title);
		this.nowPlayingArtistEl.setText(track.artist || track.album || '\u00A0');
	}

	private updatePlayPauseIcon(): void {
		setIcon(this.playPauseBtn, this.audio.paused ? 'play' : 'pause');
	}

	private highlightCurrent(): void {
		const rows = this.trackListEl.querySelectorAll('.music-player-track');
		rows.forEach((row) => {
			const idx = Number((row as HTMLElement).dataset.index);
			row.classList.toggle('music-player-track-active', idx === this.currentIndex);
		});
	}

	private revokeUrls(): void {
		if (this.currentAudioUrl) {
			URL.revokeObjectURL(this.currentAudioUrl);
			this.currentAudioUrl = null;
		}
		if (this.currentArtworkUrl) {
			URL.revokeObjectURL(this.currentArtworkUrl);
			this.currentArtworkUrl = null;
		}
	}
}
