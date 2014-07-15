'use strict';

require('/shared/test/unit/mocks/mock_navigator_moz_settings.js');
requireApp('/system/test/unit/mock_asyncStorage.js');

require('/shared/js/batch_utils.js');

/* global BatchAsyncStorage, BatchSettings, MockasyncStorage,
          MockNavigatorSettings */

if (!window.MockNavigatorSettings) {
  window.MockNavigatorSettings = null;
}

suite('BatchUtils', function() {
  var realSettings, realAsyncStorage;

  suiteSetup(function() {
    realSettings = window.navigator.mozSettings;
    realAsyncStorage = window.asyncStorage;
    window.navigator.mozSettings = MockNavigatorSettings;
    window.asyncStorage = MockasyncStorage;
  });

  suiteTeardown(function() {
    window.navigator.mozSettings = realSettings;
    window.asyncStorage = realAsyncStorage;
  });

  teardown(function() {
    MockNavigatorSettings.mTeardown();
    MockasyncStorage.mTeardown();
  });

  suite('BatchSettings', function() {
    test('addKey', function(done) {
      assert.ok(BatchSettings);

      MockNavigatorSettings.mSettings.bar = 100;
      var batch = new BatchSettings();
      batch.addKey('foo', 3);
      batch.addKey('bar');
      batch.addKey('baz');

      batch.getAll(function(settings) {
        assert.equal(settings.foo, 3);
        assert.equal(settings.bar, 100);
        assert.equal(settings.baz, undefined);
        done();
      });
    });

    test('default values', function(done) {
      var batch = new BatchSettings({ 'foo': 1, 'bar': 2 });
      batch.getAll(function(settings) {
        assert.equal(settings.foo, 1);
        assert.equal(settings.bar, 2);
        assert.equal(batch.getResults(), settings);
        assert.ok(batch.isFinished());
        done();
      });
      assert.ok(!batch.isFinished());
    });

    test('actual values override defaults', function(done) {
      MockNavigatorSettings.mSettings.foo = 100;
      MockNavigatorSettings.mSettings.baz = 101;

      var batch = new BatchSettings({ 'foo': 1, 'bar': 2 });
      batch.addKey('baz', 3);

      assert.ok(batch);
      batch.getAll(function(settings) {
        assert.equal(settings.foo, 100);
        assert.equal(settings.bar, 2);
        assert.equal(settings.baz, 101);
        done();
      });
    });
  });

  suite('BatchAsyncStorage', function() {
    test('exists', function() {
      assert.ok(BatchAsyncStorage);
    });

    test('default values', function(done) {
      var batch = new BatchAsyncStorage({ 'foo': 1, 'bar': 2 });
      batch.getAll(function(storage) {
        assert.equal(storage.foo, 1);
        assert.equal(storage.bar, 2);
        assert.equal(batch.getResults(), storage);
        assert.ok(batch.isFinished());
        done();
      });
    });

    test('actual values override defaults', function(done) {
      MockasyncStorage.mItems.foo = 100;
      var batch = new BatchAsyncStorage({ 'foo': 1, 'bar': 2 });
      batch.getAll(function(storage) {
        assert.equal(storage.foo, 100);
        assert.equal(storage.bar, 2);
        done();
      });
    });
  });
});
