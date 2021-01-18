default: build

TARGET ?= chromium

PACKAGES := node_modules/.packages.build
BUILD := build.json
MANIFEST := manifest.json

NPATH := $(shell pwd)/node_modules/.bin
TOOLPATH := $(shell pwd)/tools/bin
SRC := $(shell find src scss pages templates images -type f 2>/dev/null)


########################################################
# Building & cleaning targets
########################################################

$(PACKAGES): package.json
	npm install
	touch $@

$(BUILD): $(SRC) $(MANIFEST) $(PACKAGES) Makefile .git/index
	$(MAKE) sass
	echo '{"git_commit": "$(or $(SOURCE_VERSION),$(shell git rev-parse HEAD))"}' > $@

sass:
	$(TOOLPATH)/sassrender
	cp -a scss/site/fonts css/site/

clean:
	rm -rf $(PACKAGES) builds css

realclean: clean
	rm -rf node_modules

build: $(BUILD)

lint:
	$(NPATH)/eslint src
	$(NPATH)/eslint --config .eslintrc.modules.json --ext .mjs src

translate:
	$(TOOLPATH)/translate

$(MANIFEST): manifest_base.json manifest_$(TARGET).json Makefile
	$(MAKE) manifest

manifest:
	$(TOOLPATH)/mergejson manifest_base.json manifest_$(TARGET).json > manifest.json

package:
	$(TOOLPATH)/package $(TARGET)

packages:
	$(TOOLPATH)/package gecko
	$(TOOLPATH)/package chromium

alpha-packages:
	$(TOOLPATH)/package gecko_alpha

########################################################
# Runtime-only targets
########################################################
sass-watch:
	$(TOOLPATH)/sassrender --watch


lint-watch:
	$(TOOLPATH)/lintwatch


.PHONY: lint sass clean realclean package packages manifest build
