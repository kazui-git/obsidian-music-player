# Music Player for Obsidian

A simple music player that lives in Obsidian's sidebar. Play your local music
library while you work on your notes.

## Features (v1)

- **Sidebar player** — opens as a right sidebar panel via a ribbon icon.
- **Local library** — plays MP3 / FLAC / M4A / OGG / WAV / Opus / AAC files
  from any folder on your machine (outside the vault).
- **Now-playing** — album artwork, title, and artist for the current track.
- **Controls** — previous / play-pause / next. Auto-advances at track end.
- **Tag-based titles** — reads title / artist / album from file metadata,
  falling back to the filename when tags are missing.

Not in v1 (planned for later): seek bar, volume, shuffle/repeat, playlists,
status-bar mini-control.

## Setup

### 1. Configure your music folder

After enabling the plugin, open **Settings → Music Player** and set
**Music folder path** to the absolute path of your local music library, e.g.

- Windows: `D:\Music`
- macOS / Linux: `/home/user/Music`

The folder must live **outside** the vault — Obsidian's folder picker can't
reach beyond the vault, so a plain text field is used.

### 2. Open the player

Click the **music-note icon** in the left ribbon, or run the
**Open Music Player** command from the command palette.

### 3. Play

Click any track in the list to start playback. Use the rescan button next to
"Songs" to reload the library after adding new files.

## Development

```bash
npm install        # install dependencies
npm run dev        # watch mode — builds straight into your vault's plugin folder
npm run build      # type-check + production bundle
```

Dev hot-reload writes to `<vault>/.obsidian/plugins/music-player/`, configured
via `dev-config.json` (gitignored; copy from `dev-config.example.json`).

## License

MIT
