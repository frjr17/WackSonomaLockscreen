# GNOME Shell extension quick installer

SHELL := /bin/sh
UUID  := wack-lockscreen-clock@rinzler69-wastaken.github.com
DEST  := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
EXCLUDES := --exclude '.git' --exclude '.gitignore' --exclude '.codex' --exclude '.sixth' --exclude 'Makefile'

.PHONY: install enable pack compile-po

compile-po: ## Compile all .po files to .mo binaries in locale/
	@python3 po/generate.py

install: compile-po ## Copy the extension into the correct UUID directory
	@mkdir -p "$(DEST)"
	@rsync -a --delete $(EXCLUDES) ./ "$(DEST)/"
	@sed -i -e "s|font-family: 'SF Pro Display';|/* font-family: 'SF Pro Display'; */|g" -e "s|font-family: '\.SF Soft Numeric';|/* font-family: '.SF Soft Numeric'; */|g" "$(DEST)/stylesheet.css"
	@if [ -d "$(DEST)/schemas" ]; then glib-compile-schemas "$(DEST)/schemas"; fi
	@printf 'Installed to %s\n' "$(DEST)"
	@printf 'Reload GNOME Shell (Alt+F2 → r on Xorg, relogin on Wayland) then run: gnome-extensions enable %s\n' "$(UUID)"

enable: install ## Install then enable the extension
	@gnome-extensions enable "$(UUID)"

pack: compile-po ## Create a ZIP package for Extensions.gnome.org
	@printf 'Packaging extension...\n'
	@rm -f $(UUID).zip
	@glib-compile-schemas schemas
	@cp stylesheet.css stylesheet.css.bak
	@sed -i -e "s|font-family: 'SF Pro Display';|/* font-family: 'SF Pro Display'; */|g" -e "s|font-family: '\.SF Soft Numeric';|/* font-family: '.SF Soft Numeric'; */|g" stylesheet.css
	@zip -qr $(UUID).zip *.js metadata.json stylesheet.css LICENSE schemas locale -x "schemas/gschemas.compiled" -x "po/generate.py"
	@mv stylesheet.css.bak stylesheet.css
	@printf 'Created package: %s\n' "$(UUID).zip"
