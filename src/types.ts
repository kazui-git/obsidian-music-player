/**
 * A single playable music file in the library.
 *
 * `artworkSrc` is populated lazily: it's `null` until the track is loaded
 * for playback (or selected), because converting embedded cover art into an
 * object URL is relatively expensive to do for every track up front.
 */
export interface Track {
	/** Absolute, OS-native path to the file on disk. */
	filePath: string;
	/** Display title — falls back to the filename if tags lack one. */
	title: string;
	/** Artist, if the file's tags contain one. */
	artist: string | null;
	/** Album, if the file's tags contain one. */
	album: string | null;
	/** Duration in seconds, if known from the tags. */
	duration: number | null;
	/** Cover-art object URL (set lazily; revoked when the track is unloaded). */
	artworkSrc: string | null;
}

/**
 * Settings persisted to Obsidian's plugin data store (`data.json`).
 * For v1 we keep exactly one user-facing setting: the music folder path.
 */
export interface MusicPlayerSettings {
	/**
	 * Absolute path to the user's local music library. Must live outside the
	 * vault by design (we scan it with Node's `fs`, not the vault adapter).
	 */
	musicFolderPath: string;
}

export const DEFAULT_SETTINGS: MusicPlayerSettings = {
	musicFolderPath: '',
};
