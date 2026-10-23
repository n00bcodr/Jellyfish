# About the files in this folder

**Jellyfin web client.** `jellyfin-desktop.css`, `jellyfin-mobile.css`, `assets/` and the
`home-*.html` / `item-*.html` pages are captured from the official Jellyfin web client
(<https://github.com/jellyfin/jellyfin-web>), released under the **GNU GPL v2.0 or later**. They hold
Jellyfin's own markup, stylesheets and icons so the Theme Builder's preview shows the real interface.

**Slideshow plugins.** `plugin-enhanced.css` and `ss-enhanced.json` come from Media Bar Enhanced
(<https://github.com/CodeDevMLH/jellyfin-plugin-media-bar-enhanced>, **GPL-3.0**); `plugin-pure.css` and
the other `ss-*.json` files from Media Bar (<https://github.com/IAmParadox27/jellyfin-plugin-media-bar>,
**DON'T BE A DICK Public License**).

**Titles and artwork.** The sample library is the public **Jellyfin demo server**
(<https://demo.jellyfin.org>), which holds public-domain and openly licensed films (for example Night of
the Living Dead, Pioneer One and the Blender Foundation's Caminandes shorts). Posters, backdrops, logos
album covers and cast photos in `art/` were downloaded from it at reduced size. They belong to their
respective rights holders and are shown here only to illustrate the theme. The user avatar is a generated
placeholder, and the server and user names are replaced. If you are a rights holder and
want something removed, please open an issue.

Everything is produced by `../tools/capture-preview.mjs`. Jellyfin is a trademark of its respective
owners; this project is not affiliated with Jellyfin.
