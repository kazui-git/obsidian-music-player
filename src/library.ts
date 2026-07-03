import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseBuffer } from 'music-metadata';
import type { Track } from './types';

/**
 * Audio file extensions we recognise. Case-insensitive on disk via the
 * lowercase check below.
 */
const SUPPORTED_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a', '.ogg', '.wav', '.opus', '.aac']);

export class MusicLibrary {
	private folderPath: string;

	constructor(folderPath: string) {
		this.folderPath = folderPath;
	}

	setFolderPath(folderPath: string): void {
		this.folderPath = folderPath;
	}

	/**
	 * Scan the configured folder (recursively) for audio files and return them
	 * as Track objects with metadata parsed. Files whose tags we can't read are
	 * still included, falling back to the filename as the title.
	 *
	 * @param onProgress optional callback fired after each file is processed,
	 *   so the caller can surface a "scanning N tracks…" indicator.
	 */
	async scan(onProgress?: (scanned: number) => void): Promise<Track[]> {
		if (!this.folderPath) return [];
		if (!fs.existsSync(this.folderPath) || !fs.statSync(this.folderPath).isDirectory()) {
			throw new Error(`Music folder not found or not a directory: ${this.folderPath}`);
		}

		const files = this.collectAudioFiles(this.folderPath);
		const tracks: Track[] = [];

		for (const file of files) {
			const track = await this.buildTrack(file);
			tracks.push(track);
			onProgress?.(tracks.length);
		}

		// Sort by title for a predictable list. Filename uniqueness keeps the
		// sort stable when titles collide.
		tracks.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
		return tracks;
	}

	/**
	 * Recursively gather every audio file under `dir`. Symlinks are not
	 * followed, which keeps the scan bounded and predictable.
	 */
	private collectAudioFiles(dir: string): string[] {
		const results: string[] = [];
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return results;
		}
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				results.push(...this.collectAudioFiles(fullPath));
			} else if (entry.isFile()) {
				const ext = path.extname(entry.name).toLowerCase();
				if (SUPPORTED_EXTENSIONS.has(ext)) {
					results.push(fullPath);
				}
			}
		}
		return results;
	}

	/**
	 * Parse a single file's tags into a Track. Never throws — a corrupted
	 * tag read shouldn't sink the whole library scan.
	 */
	private async buildTrack(filePath: string): Promise<Track> {
		const fileName = path.basename(filePath);
		const fallbackTitle = fileName.replace(/\.[^.]+$/, '');
		try {
			const buffer = fs.readFileSync(filePath);
			const metadata = await parseBuffer(buffer);
			const title = metadata.common.title?.trim() || fallbackTitle;
			return {
				filePath,
				title,
				artist: metadata.common.artist?.trim() || null,
				album: metadata.common.album?.trim() || null,
				duration: metadata.format.duration ?? null,
				artworkSrc: null,
			};
		} catch {
			// Unreadable tags (corrupt file, weird codec) → still playable by URL.
			return {
				filePath,
				title: fallbackTitle,
				artist: null,
				album: null,
				duration: null,
				artworkSrc: null,
			};
		}
	}
}

/**
 * Read a music file from disk and turn it into a playable object URL for an
 * `<audio>` element. The caller owns the returned URL and must revoke it when
 * done (use `URL.revokeObjectURL`) to avoid leaking memory on track change.
 *
 * Returns null if the file can't be read (deleted, permissions, etc.).
 */
export function createObjectUrlForFile(filePath: string): string | null {
	try {
		const buffer = fs.readFileSync(filePath);
		// `audio/*` is fine for all our supported formats — the browser sniffs
		// the actual codec from the bytes.
		const blob = new Blob([buffer], { type: 'audio/*' });
		return URL.createObjectURL(blob);
	} catch {
		return null;
	}
}

/**
 * Parse embedded cover art for a track into an object URL. Returns null when
 * the file has no picture tag or can't be read.
 */
export async function createArtworkUrlForFile(filePath: string): Promise<string | null> {
	try {
		const buffer = fs.readFileSync(filePath);
		const metadata = await parseBuffer(buffer);
		const picture = metadata.common.picture?.[0];
		if (!picture) return null;
		// Copy into a fresh Uint8Array backed by a real ArrayBuffer so the
		// Blob constructor accepts it (music-metadata returns ArrayBufferLike).
		const bytes = new Uint8Array(picture.data.byteLength);
		bytes.set(picture.data);
		const blob = new Blob([bytes], { type: picture.format || 'image/jpeg' });
		return URL.createObjectURL(blob);
	} catch {
		return null;
	}
}
