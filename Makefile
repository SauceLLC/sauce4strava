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
	$(MAKE) mods
	echo '{"git_commit": "$(shell git rev-parse HEAD 2>/dev/null || echo 0)"}' > $@

# Needed when mozilla store QA runs a build in a zip bundle
.git/index:

sass:
	$(TOOLPATH)/sassrender
	cp -a scss/site/fonts css/site/

mods:
	rm -rf src/common/jscoop src/common/jsfit
	cp -r $(MODS)/jscoop/src src/common/jscoop
	cp -r $(MODS)/jsfit/src src/common/jsfit
	cp $(MODS)/fflate/esm/browser.js src/common/fflate.mjs
	cp $(MODS)/sauce-chartjs/dist/Chart.pretty.js src/site/chartjs/Chart.js

clean:
	rm -rf $(PACKAGES) builds css

realclean: clean
	rm -rf node_modules

build: $(BUILD)

build-gecko:
	TARGET=gecko $(MAKE) manifest build

build-safari:
	TARGET=safari $(MAKE) manifest build

build-safari-release:
	TARGET=safari $(MAKE) manifest-release build

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

manifest-release:
	$(TOOLPATH)/mergejson manifest_base.json manifest_$(TARGET).json > manifest.json

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


.PHONY: lint sass clean realclean packages manifest build mods
