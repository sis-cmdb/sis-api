test:
	for test in `ls test/test-*`; do mocha --timeout 6000 $$test; done

.PHONY: test