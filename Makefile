default: build

TARGET ?= chromium

PACKAGES := node_modules/.packages.build
BUILD := build.json
MANIFEST := manifest.json

NODE_MODULES := $(shell pwd)/node_modules
NPATH := $(NODE_MODULES)/.bin
TOOLPATH := $(shell pwd)/tools/bin
SRC := $(shell find src scss pages templates images -type f 2>/dev/null)


########################################################
# Building & cleaning targets
########################################################

$(PACKAGES): package.json
	npm install
	$(MAKE) -C $(NODE_MODULES)/sauce-chartjs
	touch $@

$(BUILD): $(SRC) $(MANIFEST) $(PACKAGES) Makefile .git/index
	$(MAKE) sass
	$(MAKE) deps
	echo '{"git_commit": "$(shell git rev-parse HEAD 2>/dev/null || echo 0)"}' > $@

# Needed when mozilla store QA runs a build in a zip bundle
.git/index:

sass:
	$(TOOLPATH)/sassrender
	cp -a scss/fonts css/

deps:
	rm -rf src/common/jscoop src/common/jsfit src/site/saucecharts css/saucecharts
	cp -r $(NODE_MODULES)/jscoop/src src/common/jscoop
	cp -r $(NODE_MODULES)/jsfit/src src/common/jsfit
	cp -r $(NODE_MODULES)/saucecharts/src src/site/saucecharts
	cp -r $(NODE_MODULES)/saucecharts/css css/saucecharts
	cp $(NODE_MODULES)/fflate/esm/browser.js src/common/fflate.mjs
	cp $(NODE_MODULES)/sauce-chartjs/dist/Chart.pretty.js src/site/chartjs/Chart.js

deps-crossdev:
	rm -rf src/site/saucecharts css/saucecharts
	mkdir -p src/site/saucecharts css/saucecharts
	for x in ../saucecharts/src/*; do \
		ln $$x src/site/saucecharts/ ; \
	done
	for x in ../saucecharts/css/*; do \
		ln $$x css/saucecharts/ ; \
	done

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
	rm src/site/base.js
	cp src/common/base.js src/site/base.js  # HACK must be undone

unbuild-safari-release:
	TARGET=safari $(MAKE) manifest build
	rm src/site/base.js
	ln -s ../common/base.js src/site/base.js

lint:
	$(NPATH)/eslint src

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
	$(TOOLPATH)/package gecko_alpha
	$(TOOLPATH)/package chromium_alpha

########################################################
# Runtime-only targets
########################################################
sass-watch:
	$(TOOLPATH)/sassrender --watch


lint-watch:
	$(TOOLPATH)/lintwatch


.PHONY: lint sass clean realclean packages manifest build deps
