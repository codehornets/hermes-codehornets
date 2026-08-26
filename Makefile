HERMES_HOME ?= $(HOME)/.hermes
HERMES_VENV ?= $(HERMES_HOME)/venvs/hermes-dev
HERMES_INSTALLED ?= $(HOME)/.local/bin/hermes
ARGS ?=

# Relative exclude-newer values require uv 0.9.17 or newer. Ignore project
# config only while the older system uv bootstraps a current uv through uvx,
# then restore config discovery for the project operation itself.
UV := env UV_NO_CONFIG=1 uvx --from "uv>=0.9.17,<1" env -u UV_NO_CONFIG uv

.PHONY: setup help which dev installed shell-dev shell-installed run

help:
	@printf '%s\n' \
		'make setup             Build this checkout into the development venv' \
		'make which             Show which Hermes the shell, dev venv, and managed install use' \
		'make dev [ARGS="..."]  Run Hermes from this checkout' \
		'make installed [ARGS="..."]  Run the separately installed Hermes' \
		'make shell-dev         Open a temporary shell where hermes uses this checkout' \
		'make shell-installed   Open a temporary shell where hermes uses the installed copy' \
		'make run               Alias for make dev'

setup:
	# Keep the development venv outside the source tree.
	$(UV) venv "$(HERMES_VENV)" --python 3.11 --allow-existing
	# Point uv at the venv explicitly: each Make recipe line uses a new shell.
	$(UV) pip install --python "$(HERMES_VENV)/bin/python" -e ".[all,dev,messaging]"
	# Install the repository's npm workspaces from the committed lockfile.
	npm ci
	mkdir -p "$(HERMES_HOME)/cron" "$(HERMES_HOME)/sessions" \
		"$(HERMES_HOME)/logs" "$(HERMES_HOME)/memories" "$(HERMES_HOME)/skills"
	test -e "$(HERMES_HOME)/config.yaml" || cp cli-config.yaml.example "$(HERMES_HOME)/config.yaml"
	touch "$(HERMES_HOME)/.env"

which:
	@printf '%s\n' '=== Current shell resolution ==='; \
	current="$$(command -v hermes 2>/dev/null || true)"; \
	if [ -n "$$current" ]; then \
		printf 'executable: %s\n' "$$current"; \
		"$$current" --version; \
	else \
		printf '%s\n' 'hermes is not on PATH'; \
	fi
	@printf '\n%s\n' '=== Development checkout ==='; \
	printf 'executable: %s\n' '$(HERMES_VENV)/bin/hermes'; \
	if [ -x "$(HERMES_VENV)/bin/hermes" ]; then \
		"$(HERMES_VENV)/bin/hermes" --version; \
	else \
		printf '%s\n' 'not built; run make setup'; \
	fi
	@printf '\n%s\n' '=== Separately installed copy ==='; \
	printf 'executable: %s\n' '$(HERMES_INSTALLED)'; \
	if [ -x "$(HERMES_INSTALLED)" ]; then \
		"$(HERMES_INSTALLED)" --version; \
	else \
		printf '%s\n' 'not found; override HERMES_INSTALLED=/path/to/hermes if needed'; \
	fi

dev:
	@test -x "$(HERMES_VENV)/bin/hermes" || { \
		printf '%s\n' 'Development Hermes is missing; run make setup first.' >&2; \
		exit 1; \
	}
	@exec "$(HERMES_VENV)/bin/hermes" $(ARGS)

installed:
	@test -x "$(HERMES_INSTALLED)" || { \
		printf 'Installed Hermes was not found at %s\n' "$(HERMES_INSTALLED)" >&2; \
		printf '%s\n' 'Override it with HERMES_INSTALLED=/path/to/hermes.' >&2; \
		exit 1; \
	}
	@exec "$(HERMES_INSTALLED)" $(ARGS)

shell-dev:
	@test -x "$(HERMES_VENV)/bin/hermes" || { \
		printf '%s\n' 'Development Hermes is missing; run make setup first.' >&2; \
		exit 1; \
	}
	@printf '%s\n' 'Entering a development-Hermes shell. Run exit to return.'
	@VIRTUAL_ENV="$(HERMES_VENV)" PATH="$(HERMES_VENV)/bin:$$PATH" \
		exec "$${SHELL:-/bin/sh}" -i

shell-installed:
	@test -x "$(HERMES_INSTALLED)" || { \
		printf 'Installed Hermes was not found at %s\n' "$(HERMES_INSTALLED)" >&2; \
		exit 1; \
	}
	@printf '%s\n' 'Entering an installed-Hermes shell. Run exit to return.'
	@clean_path="$$(printf '%s\n' "$$PATH" | awk -v RS=: -v ORS=: \
		-v skip="$(HERMES_VENV)/bin" '$$0 != skip { print }' | sed 's/:$$//')"; \
	unset VIRTUAL_ENV; \
	PATH="$$clean_path"; export PATH; \
	exec "$${SHELL:-/bin/sh}" -i

run: dev
