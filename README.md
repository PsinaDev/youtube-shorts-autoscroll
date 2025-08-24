# YouTube Shorts Auto Scroll

Automatically scrolls to the next YouTube Short after the current one ends. Lightweight, no extra permissions required.

## Installation

1. Install a userscript manager:

   * [Tampermonkey](https://www.tampermonkey.net/)
   * [Violentmonkey](https://violentmonkey.github.io/)
2. Open the raw script and confirm installation:
   [Install Script](https://github.com/PsinaDev/youtube-shorts-autoscroll/raw/refs/heads/main/YouTube%20Shorts%20Auto%20Scroll-2.1.0.user.js)

> Updates are applied automatically (see `@updateURL` in the script header).

## Usage

1. Open any Shorts video: `https://www.youtube.com/shorts/...`
2. Watch until the end — the script will automatically go to the next video.

## Compatibility

* All variations of the domain `youtube.com/shorts/*`
* Works with major browsers: Chrome, Firefox, Edge, Opera

## Troubleshooting

If auto-scroll does not work:

* Refresh the page and make sure the video is a **Shorts** format
* Check that the script is **enabled** in your userscript manager
* Open DevTools → Console to see if there are errors (ad blockers, etc.)

## Contributing

PRs/issues are welcome:
**Issues** → [https://github.com/PsinaDev/youtube-shorts-autoscroll/issues](https://github.com/PsinaDev/youtube-shorts-autoscroll/issues)

## License

MIT

---

**Meta**

* **@name:** YouTube Shorts Auto Scroll
* **Version:** 2.1.0
* **Author:** PsinaDev
* **Grant:** none (no extra permissions)
