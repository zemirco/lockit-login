
BIN = ./node_modules/.bin
MOCHA = $(BIN)/mocha
ESLINT = $(BIN)/eslint

test:
	$(MOCHA) --timeout 5000

eslint: index.js ./test/*.js
	$(ESLINT) $^

.PHONY: test eslint
