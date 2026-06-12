import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import GDesktopEnums from 'gi://GDesktopEnums';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { WackClock } from './wackClock.js';
import {
    GDM_USER_STACK_VERTICAL_FRACTION,
    GDM_CROSSFADE_DURATION,
    GDM_DATETIME_TOP_FRACTION,
    DATE_LABEL_HEIGHT,
} from './constants.js';

// Vertical fraction for the auth prompt (avatar + password field) in GDM
const GDM_AUTH_PROMPT_VERTICAL_FRACTION = 0.8235;

export class GdmManager {
    constructor(extension) {
        this._extension = extension;
        this._active = false;
        this._dialog = null;
        this._dialogParent = null;
        this._gdmClock = null;
        this._gdmClockWrapper = null;
        this._findDialogTimeoutId = null;
        this._origOnUserListActivated = null;
        this._origOnReset = null;
        this._allocationHandlers = [];
        this._opacityId = null;
        this._timeLabel = null;
    }

    enable() {
        console.log('[WACK/GdmManager] enable() called, mode=' + Main.sessionMode.currentMode);
        if (this._active) return;
        if (Main.sessionMode.currentMode !== 'gdm') return;
        this._active = true;

        // Try to find the LoginDialog and SystemBackground
        let attempts = 0;
        const findDialog = () => {
            if (!this._active)
                return GLib.SOURCE_REMOVE;

            const dialog = this._findLoginDialog();
            const systemBgActor = Main.layoutManager?._systemBackground;

            if (dialog && systemBgActor && systemBgActor.content?.background) {
                this._dialog = dialog;
                this._setup();
                this._applyWallpaper();
                this._findDialogTimeoutId = null;
                return GLib.SOURCE_REMOVE;
            }

            attempts++;
            if (attempts > 50) {
                console.log('[WACK/GdmManager] Could not find LoginDialog or SystemBackground after 50 attempts');
                this._findDialogTimeoutId = null;
                return GLib.SOURCE_REMOVE;
            }

            return GLib.SOURCE_CONTINUE;
        };

        this._findDialogTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, findDialog);
    }

    disable() {
        if (!this._active) return;
        this._active = false;
        if (this._findDialogTimeoutId) {
            GLib.source_remove(this._findDialogTimeoutId);
            this._findDialogTimeoutId = null;
        }
        this._teardown();
    }

    // ── Discovery ────────────────────────────────────────────────────────────

    _findLoginDialog() {
        try {
            return this._searchActorTree(Main.layoutManager.uiGroup, 0);
        } catch (e) {
            console.error('[WACK/GdmManager] _findLoginDialog error:', e);
        }
        return null;
    }

    _searchActorTree(actor, depth) {
        if (depth > 6) return null;
        const n = actor.get_n_children();
        for (let i = 0; i < n; i++) {
            const child = actor.get_child_at_index(i);
            if (!child) continue;
            if (child.style_class?.includes('login-dialog') || child.constructor?.name === 'LoginDialog') {
                console.log('[WACK/GdmManager] FOUND at depth', depth, child.constructor?.name);
                return child;
            }
            const found = this._searchActorTree(child, depth + 1);
            if (found) return found;
        }
        return null;
    }

    // ── Setup ─────────────────────────────────────────────────────────────────

    _setup() {
        const dialog = this._dialog;
        this._dialogParent = dialog.get_parent();

        // 1. Clock wrapper setup to decouple date/time and enforce DATE_LABEL_HEIGHT spacing
        this._gdmClock = new WackClock();
        const dateLabel = this._gdmClock._dateOutput;
        const timeLabel = this._gdmClock._time;
        this._gdmClock.remove_child(dateLabel);
        this._gdmClock.remove_child(timeLabel);

        this._gdmClockWrapper = new Clutter.Actor();
        this._gdmClockWrapper.set_pivot_point(0.5, 0.5);
        this._gdmClockWrapper.add_child(dateLabel);
        this._gdmClockWrapper.add_child(timeLabel);

        this._dialogParent.add_child(this._gdmClockWrapper);
        this._dialogParent.set_child_above_sibling(this._gdmClockWrapper, null);

        this._timeLabel = timeLabel;
        this._connectAllocation(dialog, () => this._positionClock());
        this._connectAllocation(this._gdmClockWrapper, () => this._positionClock());
        this._connectAllocation(dateLabel, () => this._centerClockLabel(dateLabel));
        this._connectAllocation(timeLabel, () => this._centerClockLabel(timeLabel));

        this._timeLabel.connectObject('notify::text', () => this._positionClock(), this);

        this._positionClock();

        // 2. Shift user selection list down
        this._connectAllocation(dialog._userSelectionBox, () => this._positionUserList());
        this._positionUserList();

        // 3. Distro logo opacity override
        if (dialog._logoBin) {
            dialog._logoBin.opacity = 0;
        }

        // 4. Disable dateMenu panel button
        if (Main.panel?.statusArea?.dateMenu) {
            Main.panel.statusArea.dateMenu.hide();
        }

        this._gdmClockWrapper.opacity = 255;

        let hasBeenFullyVisible = false;
        this._opacityId = dialog.connect('notify::opacity', () => {
            const op = dialog.opacity;
            if (op === 255) {
                hasBeenFullyVisible = true;
                this._gdmClockWrapper.opacity = 255;
            } else if (hasBeenFullyVisible) {
                this._gdmClockWrapper.opacity = op;
            }
        });

        // 5. On user selection: reposition native _authPrompt and show its avatar
        this._origOnUserListActivated = dialog._onUserListActivated.bind(dialog);
        dialog._onUserListActivated = (activatedItem) => {
            this._origOnUserListActivated(activatedItem);
            this._onUserSelected();
        };

        // 6. On reset: restore _authPrompt position and avatar
        this._origOnReset = dialog._onReset.bind(dialog);
        dialog._onReset = () => {
            this._origOnReset();
            this._onReset();
        };
    }

    // ── Teardown ──────────────────────────────────────────────────────────────

    _teardown() {
        const dialog = this._dialog;

        if (this._opacityId && dialog) {
            dialog.disconnect(this._opacityId);
            this._opacityId = null;
        }

        for (const { actor, id } of this._allocationHandlers)
            actor.disconnect(id);
        this._allocationHandlers = [];

        if (this._origOnUserListActivated && dialog) {
            dialog._onUserListActivated = this._origOnUserListActivated;
            this._origOnUserListActivated = null;
        }
        if (this._origOnReset && dialog) {
            dialog._onReset = this._origOnReset;
            this._origOnReset = null;
        }

        if (this._timeLabel) {
            this._timeLabel.disconnectObject(this);
            this._timeLabel = null;
        }

        if (this._gdmClockWrapper) {
            this._gdmClockWrapper.destroy();
            this._gdmClockWrapper = null;
        }

        if (this._gdmClock) {
            this._gdmClock.destroy();
            this._gdmClock = null;
        }

        // Restore distro logo opacity
        if (dialog?._logoBin) {
            dialog._logoBin.opacity = 255;
        }

        // Restore dateMenu panel button
        if (Main.panel?.statusArea?.dateMenu) {
            Main.panel.statusArea.dateMenu.show();
        }

        // Restore _authPrompt position
        if (dialog?._authPrompt) {
            dialog._authPrompt.translation_y = 0;
            dialog._authPrompt.remove_style_class_name('wack-cupertino-prompt');
        }

        // Restore userSelectionBox position
        if (dialog?._userSelectionBox) {
            dialog._userSelectionBox.translation_x = 0;
            dialog._userSelectionBox.translation_y = 0;
        }

        // Restore default background color (#282828)
        const systemBgActor = Main.layoutManager?._systemBackground;
        if (systemBgActor && systemBgActor.content?.background) {
            const bg = systemBgActor.content.background;
            bg.set_file(null, 0);
            let [res, color] = Cogl.Color.from_string('#282828');
            if (res) {
                bg.set_color(color);
            }
        }

        this._dialogParent = null;
        this._dialog = null;
    }

    // ── Positioning ───────────────────────────────────────────────────────────

    _connectAllocation(actor, fn) {
        const id = actor.connect('notify::allocation', fn);
        this._allocationHandlers.push({ actor, id });
    }

    _dialogSize() {
        const alloc = this._dialog.get_allocation_box();
        return { w: alloc.x2 - alloc.x1, h: alloc.y2 - alloc.y1 };
    }

    _centerClockLabel(label) {
        if (!label || !this._gdmClockWrapper) return;
        const wrapperW = this._gdmClockWrapper.width;
        if (wrapperW === 0) return; // not allocated yet, wait for next pass
        const [, natW] = label.get_preferred_width(-1);
        if (natW === 0) return; // label not measured yet
        label.set_x(Math.floor(wrapperW / 2 - natW / 2));
    }

    _positionClock() {
        if (!this._gdmClock || !this._gdmClockWrapper || !this._dialog) return;
        const alloc = this._dialog.get_allocation_box();
        const w = alloc.x2 - alloc.x1;
        const h = alloc.y2 - alloc.y1;

        const topY = Math.floor(h * GDM_DATETIME_TOP_FRACTION);
        this._gdmClockWrapper.set_size(w, h);
        this._gdmClockWrapper.set_position(alloc.x1, topY);

        this._gdmClock._dateOutput.set_y(0);
        this._gdmClock._time.set_y(DATE_LABEL_HEIGHT);

        this._centerClockLabel(this._gdmClock._dateOutput);
        this._centerClockLabel(this._gdmClock._time);
    }

    _positionUserList() {
        if (!this._dialog?._userSelectionBox) return;
        const box = this._dialog._userSelectionBox;
        if (!box.visible) return;
        const { w, h } = this._dialogSize();
        const [, , natW, natH] = box.get_preferred_size();
        box.translation_x = Math.floor(w / 2 - natW / 2) - (box.x || 0);
        box.translation_y = Math.floor(h * GDM_USER_STACK_VERTICAL_FRACTION - natH / 2) - (box.y || 0);
    }

    _positionAuthPrompt() {
        const authPrompt = this._dialog?._authPrompt;
        if (!authPrompt) return;
        const { h } = this._dialogSize();
        const [, , , promptH] = authPrompt.get_preferred_size();
        const targetY = Math.floor(h * GDM_AUTH_PROMPT_VERTICAL_FRACTION);
        const currentY = authPrompt.get_allocation_box().y1;
        authPrompt.translation_y = targetY - currentY;
        console.log('[WACK/GdmManager] positionAuthPrompt currentY:', currentY, 'targetY:', targetY, 'translation_y:', authPrompt.translation_y);
    }

    // ── Wallpaper application ────────────────────────────────────────────────

    _applyWallpaper() {
        try {
            const metaFile = Gio.File.new_for_path('/tmp/wack-shared-wallpaper.json');
            if (!metaFile.query_exists(null))
                return;

            const [success, contents] = metaFile.load_contents(null);
            if (!success)
                return;

            const metadata = JSON.parse(new TextDecoder().decode(contents));
            if (!metadata)
                return;

            const systemBgActor = Main.layoutManager?._systemBackground;
            if (!systemBgActor || !systemBgActor.content)
                return;

            const bg = systemBgActor.content.background;
            if (!bg)
                return;

            if (metadata.is_color) {
                let [res, color] = Cogl.Color.from_string(metadata.primary_color);
                if (res) {
                    if (metadata.shading_type === 0) { // SOLID
                        bg.set_color(color);
                    } else {
                        let [res2, secondColor] = Cogl.Color.from_string(metadata.secondary_color);
                        if (res2) {
                            bg.set_gradient(metadata.shading_type, color, secondColor);
                        }
                    }
                }
            } else {
                const file = Gio.File.new_for_uri(metadata.uri);
                bg.set_file(file, metadata.style);
            }
        } catch (e) {
            console.log('[WACK/GdmManager] Failed to apply wallpaper: ' + e);
        }
    }

    // ── User selection ────────────────────────────────────────────────────────

    _onUserSelected() {
        const authPrompt = this._dialog?._authPrompt;
        if (!authPrompt) return;

        // Style as Cupertino prompt (hides password field chrome, etc.)
        authPrompt.add_style_class_name('wack-cupertino-prompt');

        // Make native avatar visible — don't suppress it
        const avatar = authPrompt._userWell?.get_child()?._avatar;
        if (avatar) avatar.opacity = 255;

        // Reposition prompt to lower third on allocation
        this._connectAllocation(authPrompt, () => this._positionAuthPrompt());
        this._positionAuthPrompt();
    }

    _onReset() {
        const authPrompt = this._dialog?._authPrompt;
        if (!authPrompt) return;

        authPrompt.translation_y = 0;
        authPrompt.remove_style_class_name('wack-cupertino-prompt');

        // Disconnect the auth prompt allocation handler
        this._allocationHandlers = this._allocationHandlers.filter(({ actor, id }) => {
            if (actor === authPrompt) {
                actor.disconnect(id);
                return false;
            }
            return true;
        });
    }
}