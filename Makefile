default: build

TARGET ?= chromium

PACKAGES := node_modules/.packages.build
BUILD := build.json
MANIFEST := manifest.json

MODS := $(shell pwd)/node_modules
NPATH := $(MODS)/.bin
TOOLPATH := $(shell pwd)/tools/bin
SRC := $(shell find src scss pages templates images -type f 2>/dev/null)


########################################################
# Building & cleaning targets
########################################################

$(PACKAGES): package.json
	npm install
	$(MAKE) -C $(MODS)/sauce-chartjs
	touch $@

$(BUILD): $(SRC) $(MANIFEST) $(PACKAGES) Makefile .git/index
	$(MAKE) sass
	$(MAKE) lib
	echo '{"git_commit": "$(or $(SOURCE_VERSION),$(shell git rev-parse HEAD))"}' > $@

sass:
	$(TOOLPATH)/sassrender
	cp -a scss/site/fonts css/site/

lib:
	mkdir -p lib/jscoop lib/jsfit
	$(TOOLPATH)/tersify $(MODS)/jscoop/src/coop.mjs lib/jscoop/coop.mjs
	$(TOOLPATH)/tersify $(MODS)/jscoop/src/futures.mjs lib/jscoop/futures.mjs
	$(TOOLPATH)/tersify $(MODS)/jscoop/src/jobs.mjs lib/jscoop/jobs.mjs
	$(TOOLPATH)/tersify $(MODS)/jscoop/src/locks.mjs lib/jscoop/locks.mjs
	$(TOOLPATH)/tersify $(MODS)/jscoop/src/queues.mjs lib/jscoop/queues.mjs
	$(TOOLPATH)/tersify $(MODS)/sauce-chartjs/dist/Chart.terser.js lib/Chart.js
	$(TOOLPATH)/tersify $(MODS)/fflate/esm/browser.js lib/fflate.mjs
	$(TOOLPATH)/tersify $(MODS)/jsfit/src/fit.mjs lib/jsfit/fit.mjs
	$(TOOLPATH)/tersify $(MODS)/jsfit/src/binary.mjs lib/jsfit/binary.mjs
	$(TOOLPATH)/tersify $(MODS)/jsfit/src/parser.mjs lib/jsfit/parser.mjs
	du -sk lib

clean:
	rm -rf $(PACKAGES) builds css

realclean: clean
	rm -rf node_modules

build: $(BUILD)

build-gecko:
	TARGET=gecko $(MAKE) manifest build

build-safari:
	TARGET=safari $(MAKE) manifest build

lint:
	$(NPATH)/eslint src
	$(NPATH)/eslint --config .eslintrc.modules.json --ext .mjs src

translate:
	$(TOOLPATH)/translate

$(MANIFEST): manifest_base.json manifest_$(TARGET).json Makefile
	$(MAKE) manifest

manifest:
	$(TOOLPATH)/mergejson manifest_base.json manifest_$(TARGET).json > manifest.json.tmp
	$(TOOLPATH)/mergejson manifest.json.tmp manifest_dev.json > manifest.json
	rm -f manifest.json.tmp

packages:
	$(TOOLPATH)/package gecko
	$(TOOLPATH)/package chromium

alpha-packages:
	$(TOOLPATH)/package chromium_alpha

########################################################
# Runtime-only targets
########################################################
sass-watch:
	$(TOOLPATH)/sassrender --watch


lint-watch:
	$(TOOLPATH)/lintwatch


.PHONY: lint sass clean realclean packages manifest build lib
