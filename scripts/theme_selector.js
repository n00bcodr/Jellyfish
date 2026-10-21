(function() {
    'use strict';

    console.log('[🪼🎨Jellyfish Theme Selector] Script loaded');

    const themes = {
        'Default': '',
        'Aurora': '@import url("https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfish/colors/aurora.css");',
        'Banana': '@import url("https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfish/colors/banana.css");',
        'Coal': '@import url("https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfish/colors/coal.css");',
        'Coral': '@import url("https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfish/colors/coral.css");',
        'Forest': '@import url("https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfish/colors/forest.css");',
        'Grass': '@import url("https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfish/colors/grass.css");',
        'Jellyblue': '@import url("https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfish/colors/jellyblue.css");',
        'Jellyflix': '@import url("https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfish/colors/jellyflix.css");',
        'Jellypurple': '@import url("https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfish/colors/jellypurple.css");',
        'Lavender': '@import url("https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfish/colors/lavender.css");',
        'Liquid Glass': '@import url("https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfish/colors/liquidglass.css");',
        'Midnight': '@import url("https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfish/colors/midnight.css");',
        'Mint': '@import url("https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfish/colors/mint.css");',
        'Ocean': '@import url("https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfish/colors/ocean.css");',
        'Peach': '@import url("https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfish/colors/peach.css");',
        'Watermelon': '@import url("https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfish/colors/watermelon.css");'
    };

    // Set to true to have random themes ON by default, false to have it OFF.
    const RANDOM_THEME_DEFAULT = false;

    // ---Helper functions for Random Daily Theme ---
    const isRandomThemeEnabled = (userId) => {
        const setting = localStorage.getItem(`${userId}-randomThemeEnabled`);
        // If the setting is not found in localStorage, return the default value.
        if (setting === null) {
            return RANDOM_THEME_DEFAULT;
        }
        // Otherwise, return the stored setting.
        return setting === 'true';
    };

    const setRandomThemeEnabled = (userId, isEnabled) => localStorage.setItem(`${userId}-randomThemeEnabled`, isEnabled);
    const getLastRandomDate = (userId) => localStorage.getItem(`${userId}-lastRandomThemeDate`);
    const setLastRandomDate = (userId, date) => localStorage.setItem(`${userId}-lastRandomThemeDate`, date);

    // Inject custom CSS for proper styling
    const injectCustomCss = () => {
        if (!document.getElementById('jellyfin-theme-selector-css')) {
            const style = document.createElement('style');
            style.id = 'jellyfin-theme-selector-css';
            style.innerHTML = `
                #theme-selector-body {
                    display: flex !important;
                    align-items: center;
                    justify-content: flex-start;
                    flex-direction: row;
                    flex-wrap: wrap;
                    gap: 1em;
                    padding: .4em .75em;
                }
                #theme-selector-select {
                    max-width: 200px !important;
                    min-width: 150px !important;
                }
                #random-theme-button {
                    padding: 0.5em 0.5em !important;
                    height: auto !important;
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    background-color: transparent;
                    border-radius: 10px;
                }
                #random-theme-button.active {
                    background-color: #4CAF50;
                    color: white;
                }
            `;
            document.head.appendChild(style);
            console.log('[🪼🎨Jellyfish Theme Selector] Custom CSS injected');
        }
    };

    // Extract user ID from the ApiClient
    const extractUserId = () => {
        try {
            const userId = window.ApiClient?.getCurrentUserId?.();
            if (userId) return userId;
        } catch (e) {
            console.error('[🪼🎨Jellyfish Theme Selector] Error extracting user ID:', e);
        }
        console.error('[🪼🎨Jellyfish Theme Selector] Could not extract user ID');
        return null;
    };

    // Get/Set theme in localStorage
    const getCurrentTheme = (userId) => localStorage.getItem(`${userId}-customCss`) || '';
    const setTheme = (userId, themeValue, themeName = 'Default') => {
        const key = `${userId}-customCss`;
        if (themeValue) {
            localStorage.setItem(key, themeValue);
            console.log(`[🪼🎨Jellyfish Theme Selector] Theme set to: ${themeName}`);
        } else {
            localStorage.removeItem(key);
            console.log('[🪼🎨Jellyfish Theme Selector] Theme cleared (default)');
        }
    };

    // Show notification using Jellyfin's built-in system
    const showNotification = (message) => {
        try {
            if (window.Dashboard?.alert) {
                window.Dashboard.alert(message);
            } else if (window.require) {
                window.require(['toast'], (toast) => toast(message));
            } else {
                console.log(`[🪼🎨Jellyfish Theme Selector] Notification: ${message}`);
            }
        } catch (e) {
            console.error('[🪼🎨Jellyfish Theme Selector] Failed to show notification:', e);
        }
    };

    // Check for a pending notification after a page refresh
    const checkPostRefreshNotification = () => {
        const pendingNotification = sessionStorage.getItem('jellyfin-theme-applied');
        if (pendingNotification) {
            sessionStorage.removeItem('jellyfin-theme-applied');
            setTimeout(() => showNotification(`Theme applied: ${pendingNotification}`), 1000);
        }
    };

    // --- apply random theme if needed ---
    const applyRandomThemeIfNeeded = () => {
        const userId = extractUserId();
        if (!userId || !isRandomThemeEnabled(userId)) return;

        const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
        const lastDate = getLastRandomDate(userId);

        if (today !== lastDate) {
            console.log('[🪼🎨Jellyfish Theme Selector] New day detected! Applying a random theme.');
            const availableThemes = Object.keys(themes).filter(name => name !== 'Default');
            const randomThemeName = availableThemes[Math.floor(Math.random() * availableThemes.length)];
            const randomThemeValue = themes[randomThemeName];

            setTheme(userId, randomThemeValue, randomThemeName);
            setLastRandomDate(userId, today);

            sessionStorage.setItem('jellyfin-theme-applied', `Random Daily (${randomThemeName})`);
            window.location.reload();
        } else {
            console.log('[🪼🎨Jellyfish Theme Selector] Random theme already applied for today.');
        }
    };


    // Create the theme selector element
    const createThemeSelector = (userId) => {
        const container = document.createElement('div');
        container.className = 'theme-selector-container listItem-border';
        container.id = 'jellyfin-theme-selector';

        const listItem = document.createElement('div');
        listItem.className = 'listItem';
        listItem.id = 'theme-selector-item';

        const icon = document.createElement('span');
        icon.className = 'material-icons listItemIcon listItemIcon-transparent';
        icon.id = 'theme-selector-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = 'palette';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'listItemBody';
        contentDiv.id = 'theme-selector-body';

        const textLabel = document.createElement('div');
        textLabel.className = 'listItemBodyText';
        textLabel.id = 'theme-selector-label';
        textLabel.textContent = 'Theme';

        const select = document.createElement('select');
        select.setAttribute('is', 'emby-select');
        select.className = 'emby-select-withcolor emby-select';
        select.id = 'theme-selector-select';
        select.removeAttribute('label');

        const currentThemeValue = getCurrentTheme(userId);
        let selectedThemeName = 'Default';
        for (const [name, value] of Object.entries(themes)) {
            if (value === currentThemeValue) {
                selectedThemeName = name;
                break;
            }
        }

        Object.keys(themes).forEach(themeName => {
            const option = document.createElement('option');
            option.value = themeName;
            option.textContent = themeName;
            if (themeName === selectedThemeName) option.selected = true;
            select.appendChild(option);
        });

        // Manual theme change event
        select.addEventListener('change', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const newThemeName = e.target.value;
            setTheme(userId, themes[newThemeName], newThemeName);

            // // Disable random daily theme if a manual selection is made
            // if (isRandomThemeEnabled(userId)) {
            //      setRandomThemeEnabled(userId, false);
            //      console.log('[🪼🎨Jellyfish Theme Selector] Manual theme selected, disabling random daily theme.');
            //      showNotification('Random daily theme disabled.');
            // }
            sessionStorage.setItem('jellyfin-theme-applied', newThemeName);
            setTimeout(() => window.location.reload(), 500);
        });

        const randomButton = document.createElement('button');
        randomButton.setAttribute('is', 'emby-button');
        randomButton.className = 'emby-button';
        randomButton.id = 'random-theme-button';

        const randomIcon = document.createElement('span');
        randomIcon.className = 'material-icons';
        randomIcon.textContent = 'shuffle';
        randomIcon.setAttribute('aria-hidden', 'true');

        const randomText = document.createElement('span');

        const updateButtonState = () => {
            if (isRandomThemeEnabled(userId)) {
                randomButton.classList.add('active');
            } else {
                randomButton.classList.remove('active');
            }
        };

        randomButton.appendChild(randomIcon);
        randomButton.appendChild(randomText);
        updateButtonState(); // Set initial state

        randomButton.addEventListener('click', () => {
            const newState = !isRandomThemeEnabled(userId);
            setRandomThemeEnabled(userId, newState);
            showNotification(`Random daily theme turned ${newState ? 'ON' : 'OFF'}.`);
            console.log(`[🪼🎨Jellyfish Theme Selector] Random daily theme set to: ${newState}`);
            updateButtonState();

            // If just turned on, apply a theme immediately if it's a new day
            if (newState) {
                applyRandomThemeIfNeeded();
            }
        });

        // Append all elements
        contentDiv.appendChild(textLabel);
        contentDiv.appendChild(randomButton);
        contentDiv.appendChild(select);
        listItem.appendChild(icon);
        listItem.appendChild(contentDiv);
        container.appendChild(listItem);

        return container;
    };


    /**
     * Finds the correct DOM location and injects the theme selector.
     */
    const injectThemeSelector = () => {
        const targetDiv = document.querySelector('.verticalSection .headerUsername');
        if (!targetDiv) return false;

        const parentSection = targetDiv.closest('.verticalSection');
        if (!parentSection) return false;

        const userId = extractUserId();
        if (!userId) return false;

        console.log('[🪼🎨Jellyfish Theme Selector] Creating theme selector element...');
        const themeSelector = createThemeSelector(userId);
        parentSection.appendChild(themeSelector);
        console.log('[🪼🎨Jellyfish Theme Selector] Successfully injected!');
        return true;
    };

    /**
     * Main function to initialize the script.
     */
    const initialize = () => {
        if (typeof ApiClient === 'undefined' || typeof ApiClient.getCurrentUserId !== 'function') {
            console.log('[🪼🎨Jellyfish Theme Selector] Waiting for ApiClient...');
            setTimeout(initialize, 250);
            return;
        }

        console.log('[🪼🎨Jellyfish Theme Selector] ApiClient is available. Starting persistent element monitoring.');
        applyRandomThemeIfNeeded(); // Check for random theme on every page load
        injectCustomCss();
        checkPostRefreshNotification();

        const observer = new MutationObserver(() => {
            const onPreferencesPage = document.querySelector('.headerUsername') && document.querySelector('.lnkUserProfile');
            const selectorExists = document.getElementById('jellyfin-theme-selector');

            //If we are on the preferences page and the selector is not there, inject it.
            if (onPreferencesPage && !selectorExists) {
                console.log('[🪼🎨Jellyfish Theme Selector] Preferences page detected and selector is missing. Injecting...');
                injectThemeSelector();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        console.log('[🪼🎨Jellyfish Theme Selector] Observer is now active and will monitor for navigation.');
    };

    // Start the script once the DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
