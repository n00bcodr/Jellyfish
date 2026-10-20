// USE AT YOUR OWN RISK!!

// This is an extremely "hacky" way to inject theming in to Jellyfin Dashboard.
// Jellyfin for good reason removed the ability to add custom CSS in the dashboard in version 10.11. -- https://github.com/jellyfin/jellyfin-web/issues/7220#issuecomment-3427290912

// PREREQUISITES:
// ============
// - File Transformation Plugin - https://github.com/IAmParadox27/jellyfin-plugin-file-transformation/ (Not a must if you have the right permissions on index.html, but recommended)
// - JavaScript Injector plugin https://github.com/n00bcodr/Jellyfin-JavaScript-Injector (this is to inject this script, you can use any other method you want)

// What it does:
// - Loads theme.css (and anything else in DEFAULT_THEME_URLS) when you open the dashboard.
// - Adds a "Refresh Theme" button to the dashboard (re-fetches the theme without cache).
// - Adds an editable "Dashboard Theme CSS URLs" box on Dashboard > Branding (saved per browser).

(() => {
  const STYLE_ID = 'data-jellyfish-theme';
  const BUTTON_ID = 'theme-refresh-button';
  const PANEL_ID = 'jellyfish-theme-list';
  const STORAGE_KEY = 'jellyfish-custom-theme-urls';

  // Where the theme files are loaded from. Use a branch or tag ref (e.g. "jellyfish@some-branch")
  // to try a development version; this is the only line to change.
  const THEME_BASE = "https://cdn.jsdelivr.net/gh/n00bcodr/jellyfish/";

  // Default theme URLs. You can also edit this list from Dashboard > Branding (see below).
  const DEFAULT_THEME_URLS = [
    THEME_BASE + "theme.css"
    // Optional: a color palette (the default Jelly Blue is built into theme.css), e.g.
    // , THEME_BASE + "colors/liquidglass.css"
    // Optional: only if you use the Jellyfin Enhanced plugin (its header icons / "More" menu
    // also show on the dashboard)
    // , THEME_BASE + "jellyfin-enhanced.css"
  ];

  // Extra CSS injected alongside the imported theme(s).
  // (The old `.MuiStack-root.css-1kuiulr { align-self: center }` rule moved into theme.css,
  //  where it is matched by structure instead of a generated class name that breaks on
  //  every Jellyfin rebuild. Put any personal overrides here.)
  const EXTRA_CSS = ``;

  // Show notification using Jellyfin's built-in system
  function showNotification(message) {
    try {
      if (window.Dashboard?.alert) {
        window.Dashboard.alert(message);
      } else if (window.require) {
        window.require(['toast'], (toast) => toast(message));
      } else {
        console.log(`[Jellyfish Theme] ${message}`);
      }
    } catch (e) {
      console.error('[Jellyfish Theme] Failed to show notification:', e);
    }
  }

  // Get theme URLs from localStorage or defaults
  function getThemeUrls() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const urls = JSON.parse(stored);
        return Array.isArray(urls) && urls.length > 0 ? urls : DEFAULT_THEME_URLS;
      } catch (e) {
        console.error('Failed to parse stored theme URLs:', e);
      }
    }
    return DEFAULT_THEME_URLS;
  }

  // Save theme URLs to localStorage. A list identical to the defaults is NOT stored:
  // a stored list always wins over DEFAULT_THEME_URLS, so storing the defaults would pin
  // this browser to today's URLs and later changes to THEME_BASE would never apply.
  function saveThemeUrls(urls) {
    try {
      if (JSON.stringify(urls) === JSON.stringify(DEFAULT_THEME_URLS)) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(urls));
      }
      console.log('Theme URLs saved:', urls);
    } catch (e) {
      console.error('Failed to save theme URLs:', e);
    }
  }

  function removeOldTheme() {
    document.querySelector(`style[${STYLE_ID}]`)?.remove();
  }

  function applyNewTheme() {
    removeOldTheme();

    const style = document.createElement('style');
    style.setAttribute(STYLE_ID, 'true');

    const cacheBuster = Date.now();
    const themeUrls = getThemeUrls();

    const importRules = themeUrls
      .map(url => `${url}${url.includes('?') ? '&' : '?'}v=${cacheBuster}`)
      .map(url => `@import url("${url}");`)
      .join("\n");

    style.textContent = `${importRules}\n${EXTRA_CSS}`;

    document.head.appendChild(style);
  }

  function isDashboardDocument() {
    return document.body.classList.contains('dashboardDocument');
  }

  function isBrandingPage() {
    return window.location.hash === "#/dashboard/branding";
  }

  function isMainDashboardPage() {
    return window.location.hash === "#/dashboard";
  }

  // Creates a theme refresh button on the dashboard page.
  // It copies the class names of the native "Scan All Libraries" button (and its icon), so it
  // always looks like its neighbours even after Jellyfin regenerates its MUI class names.
  // The hard-coded classes are only a fallback if that button can't be found.
  function createRefreshButton(scanBtn) {
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.className = scanBtn?.className ||
      "MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium MuiButton-colorPrimary";
    const iconClass = scanBtn?.querySelector('.MuiButton-startIcon')?.className ||
      "MuiButton-icon MuiButton-startIcon MuiButton-iconSizeMedium";
    const svgClass = scanBtn?.querySelector('svg')?.getAttribute('class') ||
      "MuiSvgIcon-root MuiSvgIcon-fontSizeMedium";
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.innerHTML = `
      <span class="${iconClass}">
        <svg class="${svgClass}" focusable="false" aria-hidden="true" viewBox="0 0 24 24">
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
    const isMainDashboard = isMainDashboardPage();
    const buttonExists = document.getElementById(BUTTON_ID);
    const scanBtn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Scan All Libraries');
    const container = scanBtn ? scanBtn.parentElement : null;

    if (isMainDashboard && container && !buttonExists) {
      container.appendChild(createRefreshButton(scanBtn));
    } else if (!isMainDashboard && buttonExists) {
      buttonExists.remove();
    }
  }

  // Create a styled Jellyfin button
  function createJellyfinButton(text, isPrimary = true, iconPath = null) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('is', 'emby-button');

    if (isPrimary) {
      button.className = 'raised button-submit emby-button';
    } else {
      button.className = 'raised emby-button';
    }

    if (iconPath) {
      button.innerHTML = `
        <span class="material-icons button-icon button-icon-left" aria-hidden="true">${iconPath}</span>
        <span>${text}</span>
      `;
    } else {
      button.textContent = text;
    }

    return button;
  }

  // Add editable theme list panel to branding page
  function injectThemeListPanel() {
    if (!isBrandingPage() || document.getElementById(PANEL_ID)) return;

    const loginDisclaimer = document.querySelector('textarea[name="LoginDisclaimer"]');
    const parentBlock = loginDisclaimer?.closest(".MuiFormControl-root");
    if (!parentBlock) return;

    const themeUrls = getThemeUrls();

    // Reuse the classes of the existing Login Disclaimer field (label, input box, textarea,
    // helper text) so the panel matches it without hard-coding generated class names.
    // The panel always has text in it, so its label must be the small "shrunk" one even if the
    // Login Disclaimer field it is copied from is empty (otherwise the label overlaps the text).
    const labelClass = (parentBlock.querySelector('label')?.className ||
      "MuiFormLabel-root MuiInputLabel-root MuiInputLabel-shrink MuiInputLabel-sizeMedium MuiInputLabel-filled MuiFormLabel-colorPrimary MuiFormLabel-filled") + " MuiInputLabel-shrink MuiFormLabel-filled";
    const boxClass = loginDisclaimer.closest('.MuiInputBase-root')?.className ||
      "MuiInputBase-root MuiFilledInput-root MuiFilledInput-underline MuiFilledInput-multiline MuiInputBase-colorPrimary MuiInputBase-fullWidth MuiInputBase-formControl MuiInputBase-multiline";
    const textareaClass = loginDisclaimer.className;
    const helperClass = parentBlock.querySelector('.MuiFormHelperText-root')?.className ||
      "MuiFormHelperText-root MuiFormHelperText-sizeMedium MuiFormHelperText-contained";

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.className = parentBlock.className;
    panel.innerHTML = `
      <label class="${labelClass}" data-shrink="true" style="transform: translate(12px, 7px) scale(0.75); transform-origin: top left;">
        Dashboard Theme CSS URLs (one per line)
      </label>
      <div class="${boxClass}">
        <textarea id="theme-urls-textarea" class="${textareaClass}" style="height: 120px;">${themeUrls.join("\n")}</textarea>
      </div>
      <p class="${helperClass}">
        Edit the dashboard theme CSS URLs above (one per line) and click "Save & Apply" to use your custom themes. Only applicable for dashboard pages.
      </p>
    `;

    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'margin-top: 1em; display: flex; gap: 0.5em; flex-wrap: wrap;';

    // Create save button with icon
    const saveButton = createJellyfinButton('Save & Apply', true, 'save');
    saveButton.onclick = () => {
      const textarea = document.getElementById('theme-urls-textarea');
      const urls = textarea.value
        .split('\n')
        .map(url => url.trim())
        .filter(url => url.length > 0);

      if (urls.length === 0) {
        showNotification('Please enter at least one theme URL.');
        return;
      }

      saveThemeUrls(urls);
      showNotification('Themes saved! Refreshing page...');
      setTimeout(() => window.location.reload(), 500);
    };

    // Create reset button with icon
    const resetButton = createJellyfinButton('Reset to Defaults', false, 'refresh');
    resetButton.onclick = () => {
      if (window.confirm('Reset to default theme URLs?')) {
        localStorage.removeItem(STORAGE_KEY); // forget the saved list so the defaults apply again
        showNotification('Reset to defaults! Refreshing page...');
        setTimeout(() => window.location.reload(), 500);
      }
    };

    buttonContainer.appendChild(saveButton);
    buttonContainer.appendChild(resetButton);
    panel.appendChild(buttonContainer);

    parentBlock.after(panel);
  }

  // Handle theme application based on dashboardDocument class
  function handleThemeVisibility() {
    // Only inject once - if the theme style tag already exists, leave it alone, instead of
    // removing and re-fetching it from jsDelivr on every visit to the dashboard.
    if (isDashboardDocument() && !document.querySelector(`style[${STYLE_ID}]`)) {
      applyNewTheme();
    }
  }

  function setupObserver() {
    let lastDashboardState = isDashboardDocument();
    let debounceTimer;

    // Debounced handler for DOM changes
    const debouncedDOMHandler = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        handleButtonVisibility();
        injectThemeListPanel();
      }, 100);
    };

    // Handle hash changes
    window.addEventListener("hashchange", () => {
      const currentState = isDashboardDocument();
      if (currentState !== lastDashboardState) {
        handleThemeVisibility();
        lastDashboardState = currentState;
      }
      handleButtonVisibility();
      injectThemeListPanel();
    });

    // Observe body class changes
    const bodyObserver = new MutationObserver(() => {
      const currentState = isDashboardDocument();
      if (currentState !== lastDashboardState) {
        handleThemeVisibility();
        lastDashboardState = currentState;
      }
      handleButtonVisibility();
    });

    bodyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    // Observe DOM changes with debouncing
    const domObserver = new MutationObserver(debouncedDOMHandler);
    domObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Execute
  handleThemeVisibility();
  setupObserver();
  handleButtonVisibility();
  injectThemeListPanel();
})();
