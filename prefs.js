import GLib from 'gi://GLib';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { CLOCK_ANIMATION_OPTIONS, PROMPT_ANIMATION_OPTIONS } from './anims.js';

export default class WackLockscreenClockPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        // Collect settings signal IDs so they can all be disconnected when the
        // prefs window is destroyed, preventing stale closures from keeping
        // widget objects alive beyond the window lifetime (M5).
        const settingsSignalIds = [];

        // Increase default window size (width, height)
        window.set_default_size(700, 800);

        // -- Home page -------------------------------------------------------
        const homePage = new Adw.PreferencesPage({
            title: 'Home',
            icon_name: 'go-home-symbolic',
        });

        const homeGroup = new Adw.PreferencesGroup();
        const homeBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            valign: Gtk.Align.CENTER,
            spacing: 8,
            margin_top: 32,
            margin_bottom: 32,
            margin_start: 24,
            margin_end: 24,
        });

        const icon = new Gtk.Image({
            icon_name: 'preferences-desktop-screensaver-symbolic',
            pixel_size: 128,
            halign: Gtk.Align.CENTER,
        });
        homeBox.append(icon);

        const titleLabel = new Gtk.Label({
            label: this.metadata.name,
            css_classes: ['title-1'],
            justify: Gtk.Justification.CENTER,
            halign: Gtk.Align.CENTER,
            wrap: true,
            hexpand: true,
        });
        homeBox.append(titleLabel);

        const descriptionLabel = new Gtk.Label({
            label: this.metadata.description,
            css_classes: ['dim-label'],
            justify: Gtk.Justification.CENTER,
            halign: Gtk.Align.CENTER,
            wrap: true,
            max_width_chars: 60,
            hexpand: true,
        });
        homeBox.append(descriptionLabel);

        let versionName = this.metadata['version-name'] || this.metadata.version || '';
        if (!versionName && this.dir) {
            try {
                const file = this.dir.get_child('metadata.json');
                const [, contents] = file.load_contents(null);
                const decoder = new TextDecoder('utf-8');
                const parsedMetadata = JSON.parse(decoder.decode(contents));
                versionName = parsedMetadata['version-name'] || parsedMetadata.version || '';
            } catch (e) {
                console.error('Failed to parse metadata.json:', e);
            }
        }

        versionName = String(versionName);

        const versionLabel = versionName
            ? (versionName.startsWith('v') ? versionName : `v${versionName}`)
            : 'v1.1.0';

        const versionButton = new Gtk.Button({
            label: versionLabel,
            css_classes: ['app-version', 'text-button', 'pill'],
            halign: Gtk.Align.CENTER,
            margin_top: 24,
        });
        homeBox.append(versionButton);


        homeGroup.add(homeBox);
        homePage.add(homeGroup);

        const resourcesGroup = new Adw.PreferencesGroup({ title: 'Resources' });

        const repoRow = new Adw.ActionRow({
            title: 'Extension Repo',
            subtitle: 'github.com/rinzler69-wastaken/wack-sonoma-lockscreen',
        });

        const githubIcon = new Gtk.Image({
            icon_name: 'system-software-install-symbolic',
            pixel_size: 32,
            valign: Gtk.Align.CENTER,
        });
        repoRow.add_prefix(githubIcon);

        const openBtn = new Gtk.Button({
            icon_name: 'adw-external-link-symbolic',
            tooltip_text: 'Open on GitHub',
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER,
        });
        openBtn.connect('clicked', () => {
            Gtk.show_uri(window, this.metadata.url, GLib.CURRENT_TIME);
        });
        repoRow.add_suffix(openBtn);

        resourcesGroup.add(repoRow);

        const supportGroup = new Adw.PreferencesGroup({
            title: 'Enjoying this extension?',
            description: 'Consider supporting its development!',
        });

        let donations = this.metadata.donations;
        if (!donations && this.dir) {
            try {
                const file = this.dir.get_child('metadata.json');
                const [, contents] = file.load_contents(null);
                const decoder = new TextDecoder('utf-8');
                donations = JSON.parse(decoder.decode(contents)).donations;
            } catch (e) {
                console.error('Failed to parse metadata.json:', e);
            }
        }
        donations = donations || {
            kofi: 'mikerinzler69',
            custom: 'https://saweria.co/rinzler69'
        };

        const kofiRow = new Adw.ActionRow({
            title: 'Ko-fi',
            subtitle: `ko-fi.com/${donations.kofi}`,
        });

        const kofiIcon = new Gtk.Image({
            icon_name: 'emblem-favorite-symbolic',
            pixel_size: 32,
            valign: Gtk.Align.CENTER,
        });
        kofiRow.add_prefix(kofiIcon);

        const kofiBtn = new Gtk.Button({
            icon_name: 'adw-external-link-symbolic',
            tooltip_text: 'Open Ko-fi',
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER,
        });
        kofiBtn.connect('clicked', () => {
            Gtk.show_uri(window, `https://ko-fi.com/${donations.kofi}`, GLib.CURRENT_TIME);
        });
        kofiRow.add_suffix(kofiBtn);

        supportGroup.add(kofiRow);

        const saweriaRow = new Adw.ActionRow({
            title: 'Saweria',
            subtitle: donations.custom.replace('https://', ''),
        });

        const saweriaIcon = new Gtk.Image({
            icon_name: 'emblem-favorite-symbolic',
            pixel_size: 32,
            valign: Gtk.Align.CENTER,
        });
        saweriaRow.add_prefix(saweriaIcon);

        const saweriaBtn = new Gtk.Button({
            icon_name: 'adw-external-link-symbolic',
            tooltip_text: 'Open Saweria',
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER,
        });
        saweriaBtn.connect('clicked', () => {
            Gtk.show_uri(window, donations.custom, GLib.CURRENT_TIME);
        });
        saweriaRow.add_suffix(saweriaBtn);

        supportGroup.add(saweriaRow);
        homePage.add(supportGroup);
        homePage.add(resourcesGroup);

        window.add(homePage);

        // -- Configuration page ----------------------------------------------
        const animPage = new Adw.PreferencesPage({
            title: 'Configuration',
            icon_name: 'system-lock-screen-symbolic',
        });

        // -- Mode selector --------------------------------------------------
        const modeGroup = new Adw.PreferencesGroup({
            title: 'Lockscreen Mode',
            description: 'Choose Legacy for the classic, GNOME-compliant layout. Choose Cupertino for a macOS Sonoma-inspired look (Click user-icon to switch users in Cupertino Mode).',
        });

        const modeOptions = [
            ['wack', 'Legacy'],
            ['cupertino', 'Cupertino']
        ];

        const modeRow = this._buildComboRow(
            settings,
            'lockscreen-mode',
            'Mode',
            'Choose between Legacy and Cupertino styles',
            modeOptions
        );
        modeGroup.add(modeRow);

        // -- Cupertino options ----------------------------------------------
        const alwaysShowUserRow = new Adw.ActionRow({
            title: 'Always Show User Widget (Cupertino)',
            subtitle: 'Always shows user widget, hides notifications by default. Press Shift+N to show notifications.',
        });
        const alwaysShowUserSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: settings.get_boolean('cupertino-always-show-user'),
        });
        alwaysShowUserSwitch.connect('notify::active', () => {
            settings.set_boolean('cupertino-always-show-user', alwaysShowUserSwitch.active);
        });
        settingsSignalIds.push(settings.connect('changed::cupertino-always-show-user', () => {
            alwaysShowUserSwitch.active = settings.get_boolean('cupertino-always-show-user');
        }));
        alwaysShowUserRow.add_suffix(alwaysShowUserSwitch);
        alwaysShowUserRow.activatable_widget = alwaysShowUserSwitch;
        alwaysShowUserRow.sensitive = settings.get_string('lockscreen-mode') === 'cupertino';

        modeGroup.add(alwaysShowUserRow);

        animPage.add(modeGroup);

        // -- Animation options (greyed out in Cupertino mode) ---------------
        const animationGroup = new Adw.PreferencesGroup({
            title: 'Animations',
            description: 'Choose how the lock screen clock leaves and how the password prompt enters.',
        });
        animationGroup.sensitive = settings.get_string('lockscreen-mode') !== 'cupertino';

        settingsSignalIds.push(settings.connect('changed::lockscreen-mode', () => {
            const isCup = settings.get_string('lockscreen-mode') === 'cupertino';
            alwaysShowUserRow.sensitive = isCup;
            animationGroup.sensitive = !isCup;
        }));

        animationGroup.add(this._buildComboRow(
            settings,
            'clock-animation',
            'Clock Animation',
            'Applied to the date and time while opening the password prompt',
            CLOCK_ANIMATION_OPTIONS));

        animationGroup.add(this._buildComboRow(
            settings,
            'prompt-animation',
            'Prompt Animation',
            'Applied to the authentication prompt while it appears',
            PROMPT_ANIMATION_OPTIONS));

        const resetRow = new Adw.ActionRow({
            title: 'Reset Animations',
            subtitle: 'Restore defaults',
        });
        const resetButton = new Gtk.Button({
            icon_name: 'view-refresh-symbolic',
            tooltip_text: 'Reset animations',
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER,
        });
        resetButton.connect('clicked', () => {
            settings.reset('clock-animation');
            settings.reset('prompt-animation');
        });
        resetRow.add_suffix(resetButton);
        resetRow.activatable_widget = resetButton;
        animationGroup.add(resetRow);

        animPage.add(animationGroup);

        // -- Screen Timeout options -----------------------------------------
        const timeoutGroup = new Adw.PreferencesGroup({
            title: 'Screen Timeout',
            description: 'Control when the screen turns off or blanks on the lock screen.',
        });

        const enableUnblankRow = new Adw.ActionRow({
            title: 'Keep Screen On',
            subtitle: 'Prevent the screen from blanking or turning off when locked',
        });
        const enableUnblankSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: settings.get_boolean('enable-unblank'),
        });
        enableUnblankSwitch.connect('notify::active', () => {
            settings.set_boolean('enable-unblank', enableUnblankSwitch.active);
        });
        settingsSignalIds.push(settings.connect('changed::enable-unblank', () => {
            enableUnblankSwitch.active = settings.get_boolean('enable-unblank');
        }));
        enableUnblankRow.add_suffix(enableUnblankSwitch);
        enableUnblankRow.activatable_widget = enableUnblankSwitch;
        timeoutGroup.add(enableUnblankRow);

        const unblankOnAcOnlyRow = new Adw.ActionRow({
            title: 'Only on AC Power',
            subtitle: 'Only keep the screen on if the system is plugged in',
        });
        const unblankOnAcOnlySwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: settings.get_boolean('unblank-on-ac-only'),
        });
        unblankOnAcOnlySwitch.connect('notify::active', () => {
            settings.set_boolean('unblank-on-ac-only', unblankOnAcOnlySwitch.active);
        });
        settingsSignalIds.push(settings.connect('changed::unblank-on-ac-only', () => {
            unblankOnAcOnlySwitch.active = settings.get_boolean('unblank-on-ac-only');
        }));
        unblankOnAcOnlyRow.add_suffix(unblankOnAcOnlySwitch);
        unblankOnAcOnlyRow.activatable_widget = unblankOnAcOnlySwitch;
        timeoutGroup.add(unblankOnAcOnlyRow);

        const timeoutOptions = [
            [0, 'Never'],
            [60, '1 minute'],
            [300, '5 minutes'],
            [600, '10 minutes'],
            [900, '15 minutes'],
            [1800, '30 minutes'],
            [3600, '60 minutes'],
            [7200, '2 hours'],
        ];
        const timeoutModel = new Gtk.StringList();
        for (const [, label] of timeoutOptions) {
            timeoutModel.append(label);
        }
        const timeoutRow = new Adw.ComboRow({
            title: 'Blank Timeout',
            subtitle: 'Time to wait before turning off the screen',
            model: timeoutModel,
        });
        const syncTimeoutFromSettings = () => {
            const current = settings.get_int('unblank-timeout');
            const selected = Math.max(0, timeoutOptions.findIndex(([value]) => value === current));
            timeoutRow.selected = selected;
        };
        syncTimeoutFromSettings();
        timeoutRow.connect('notify::selected', () => {
            const [value] = timeoutOptions[timeoutRow.selected] ?? timeoutOptions[0];
            if (settings.get_int('unblank-timeout') !== value) {
                settings.set_int('unblank-timeout', value);
            }
        });
        const sigId = settings.connect('changed::unblank-timeout', syncTimeoutFromSettings);
        timeoutRow.connect('destroy', () => settings.disconnect(sigId));
        timeoutGroup.add(timeoutRow);

        const syncSensitivity = () => {
            const enabled = settings.get_boolean('enable-unblank');
            unblankOnAcOnlyRow.sensitive = enabled;
            timeoutRow.sensitive = enabled;
        };
        syncSensitivity();
        settingsSignalIds.push(settings.connect('changed::enable-unblank', syncSensitivity));

        animPage.add(timeoutGroup);
        window.add(animPage);

        // Disconnect all settings signals when the window is destroyed so stale
        // closures don't hold refs to destroyed widget objects.
        window.connect('destroy', () => {
            for (const id of settingsSignalIds)
                settings.disconnect(id);
            settingsSignalIds.length = 0;
        });
    }

    _buildComboRow(settings, key, title, subtitle, options) {
        const model = new Gtk.StringList();
        for (const [, label] of options)
            model.append(label);

        const row = new Adw.ComboRow({
            title,
            subtitle,
            model,
        });

        const syncFromSettings = () => {
            const current = settings.get_string(key);
            const selected = Math.max(0, options.findIndex(([value]) => value === current));
            row.selected = selected;
        };

        syncFromSettings();
        row.connect('notify::selected', () => {
            const [value] = options[row.selected] ?? options[0];
            if (settings.get_string(key) !== value)
                settings.set_string(key, value);
        });
        const sigId = settings.connect(`changed::${key}`, syncFromSettings);
        row.connect('destroy', () => settings.disconnect(sigId));

        return row;
    }
}