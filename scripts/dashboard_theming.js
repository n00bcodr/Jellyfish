// USE AT YOUR OWN RISK!!

// This is an extremely "hacky" way to inject theming in to Jellyfin Dashboard.
// Jellyfin for good reason removed the ability to add custom CSS in the dashboard in version 10.11. -- https://github.com/jellyfin/jellyfin-web/issues/7220#issuecomment-3427290912

// PREREQUISITES:
// ============
// - File Transformation Plugin - https://github.com/IAmParadox27/jellyfin-plugin-file-transformation/ (Not a must if you have the right permissions on index.html, but recommended)
// - JavaScript Injector plugin https://github.com/n00bcodr/Jellyfin-JavaScript-Injector (this is to inject this script, you can use any other method you want)

// How to: If you really need a how to for this, I'd advice you not to do this. :)

(() => {
  // --- Add Themes here ---
  // theme.css is mandatory - it now contains everything (including the
  // dashboard-only rules that used to live in 10.11_fixes.css/12_fixes.css).
  // You can add a color scheme file here too - anything added in the CSS
  // section in branding will override these.
  // The default color scheme (jellyblue) will be used if no color scheme is specified
  const themeUrls = [
    "https://cdn.jsdelivr.net/gh/n00bcodr/jellyfish@main/theme.css"
  ];
  // ------------------------


  const cssGray = document.createElement("style");
  cssGray.textContent = `div#jellyfish-theme-list { filter: grayscale(1); } #jellyfish-theme-list .textarea-mono {cursor: no-drop;}`;
  document.head.appendChild(cssGray);

  const STYLE_ID = 'data-jellyfish-theme';
  const BUTTON_ID = 'theme-refresh-button';
  const PANEL_ID = 'jellyfish-theme-list';

  function removeOldTheme() {
    const oldStyle = document.querySelector(`style[${STYLE_ID}]`);
    if (oldStyle) oldStyle.remove();
  }

  function applyNewTheme() {
    removeOldTheme();
    const s = document.createElement('style');
    s.setAttribute(STYLE_ID, 'true');
    // I dont think JS deliver supports cache busting using timestamp, adding it anyway
    const cacheBuster = `${Date.now()}`;
    s.textContent = themeUrls
      .map(url => `${url}${url.includes('?') ? '&' : '?'}v=${cacheBuster}`)
      .map(url => `@import url("${url}");`)
      .join("\n");
    document.head.appendChild(s);
  }

  function isDashboardPage() {
    const hash = window.location.hash;
    return hash === '#/dashboard' || hash === '#/dashboard/';
  }

  // Creates a theme refresh button on the dashboard page
  function createRefreshButton() {
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.className =
      "MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium MuiButton-colorPrimary css-t0qa2a";
    btn.innerHTML = `
      <span class="MuiButton-icon MuiButton-startIcon MuiButton-iconSizeMedium css-1ygddt1">
        <svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-iguwhy" focusable="false" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6m6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26"></path>
        </svg>
      </span>
      Refresh Theme`;
    btn.onclick = () => {
      console.log("Jellyfin Theme Refreshed");
      applyNewTheme();
      window.location.reload();
    };
    return btn;
  }

  function handleButtonVisibility() {
    const isOnDashboard = isDashboardPage();
    const buttonExists = document.getElementById(BUTTON_ID);
    const container = document.querySelector('.MuiStack-root.css-11r6nok');

    if (isOnDashboard && container && !buttonExists) {
      const refreshButton = createRefreshButton();
      container.children[2]?.after(refreshButton);
    } else if (!isOnDashboard && buttonExists) {
      buttonExists.remove();
    }
  }

  // Add the existing list of themes being imported using the script to branding page for reference.
  function isBrandingPage() {
    return window.location.hash === "#/dashboard/branding";
  }

  function injectThemeListPanel() {
    if (!isBrandingPage()) return;
    if (document.getElementById(PANEL_ID)) return;

    const loginDisclaimer = document.querySelector('textarea[name="LoginDisclaimer"]');
    const parentBlock = loginDisclaimer?.closest(".MuiFormControl-root");
    if (!parentBlock) return;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.className = "MuiFormControl-root MuiFormControl-fullWidth MuiTextField-root css-1vbfw84";
    panel.innerHTML = `
      <label class="MuiFormLabel-root MuiInputLabel-root MuiInputLabel-shrink MuiInputLabel-sizeMedium MuiInputLabel-filled MuiFormLabel-colorPrimary MuiFormLabel-filled css-5191sg" >
        Injected theme CSS (read-only)
      </label>
      <div class="MuiInputBase-root MuiFilledInput-root MuiFilledInput-underline MuiFilledInput-multiline MuiInputBase-colorPrimary MuiInputBase-fullWidth MuiInputBase-formControl MuiInputBase-multiline textarea-mono css-46ocr5">
        <textarea readonly class="MuiInputBase-input MuiFilledInput-input MuiInputBase-inputMultiline css-5qflwq" style="height: 120px; opacity: 0.5; pointer-events: none;">${
          themeUrls.join("\n")
        }</textarea>
      </div>
      <p class="MuiFormHelperText-root MuiFormHelperText-sizeMedium MuiFormHelperText-contained css-8w5vg2">
        These URLs are injected by the userscript.
      </p>
    `;
    parentBlock.after(panel);
  }

  function setupObserver() {
    window.addEventListener("hashchange", () => {
      handleButtonVisibility();
      injectThemeListPanel();
    });

    const observer = new MutationObserver(() => {
      handleButtonVisibility();
      injectThemeListPanel();
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Execute
  applyNewTheme();
  setupObserver();
  handleButtonVisibility();
  injectThemeListPanel();
})();
