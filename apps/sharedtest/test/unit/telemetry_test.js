'use strict';

require('/shared/test/unit/mocks/mock_navigator_moz_settings.js');
requireApp('/system/test/unit/mock_asyncStorage.js');

require('/shared/js/uuid.js');
require('/shared/js/batch_utils.js');
require('/shared/js/telemetry.js');

/* global MockasyncStorage, MockNavigatorSettings, Telemetry */

suite('Telemetry', function() {
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

  function useTestSettings() {
    MockNavigatorSettings.mSettings['deviceinfo.platform_build_id'] =
      'build id';
    MockNavigatorSettings.mSettings['deviceinfo.platform_version'] = 'version';
    MockNavigatorSettings.mSettings['app.update.channel'] = 'update_channel';
    MockNavigatorSettings.mSettings['telemetry.baseURL'] = 'base_url';
    MockNavigatorSettings.mSettings['telemetry.id.maxAge'] = 100;
  }

  function assertInfo(payload, reason) {
    assert.ok(payload.info);
    assert.equal(payload.info.reason, reason);
    assert.equal(payload.info.appUpdateChannel, 'update_channel');
    assert.equal(payload.info.appBuildID, 'build id');
    assert.equal(payload.info.appVersion, 'version');
  }

  test('options', function() {
    var helper = new Telemetry({
      baseURL: 'abc',
      sendTimeout: 123,
      idMaxAge: 456,
      reason: 'because',
      version: '1.2.3'
    });

    assert.equal(helper.baseURL, 'abc');
    assert.equal(helper.sendTimeout, 123);
    assert.equal(helper.idMaxAge, 456);
    assert.equal(helper.reason, 'because');
    assert.equal(helper.version, '1.2.3');

    helper = new Telemetry({
      baseURL: 'def'
    });

    assert.equal(helper.baseURL, 'def');
    assert.equal(helper.sendTimeout, Telemetry.DEFAULTS.SEND_TIMEOUT);
    assert.equal(helper.idMaxAge, Telemetry.DEFAULTS.ID_MAX_AGE);
    assert.equal(helper.reason, Telemetry.DEFAULTS.UNKNOWN);
    assert.equal(helper.version, 1);
  });

  test('buildPayload', function(done) {
    useTestSettings();
    var helper = new Telemetry({
      reason: 'a reason',
      version: 2
    });

    helper.onReady(function() {
      var payload = helper.buildPayload();
      assert.equal(payload.ver, 2);
      assertInfo(payload, 'a reason');
      done();
    });
  });

  test('queryID', function(done) {
    var helper = new Telemetry();
    helper.queryID(function(id) {
      assert.ok(id);
      helper = new Telemetry({ idMaxAge: 1 });
      setTimeout(function() {
        helper.queryID(function(newID) {
          assert.notEqual(newID, id);
          done();
        });
      }, 2);
    });
  });

  test('buildURL', function(done) {
    useTestSettings();
    var helper = new Telemetry({
      reason: 'testreason'
    });

    helper.onReady(function() {
      var url = helper.buildURL('test_id');
      var parts = url.split('/');
      assert.equal(parts[0], 'base_url');
      assert.equal(parts[1], 'test_id');
      assert.equal(parts[2], 'testreason');
      assert.equal(parts[3], 'FirefoxOS');
      assert.equal(parts[4], 'version');
      assert.equal(parts[5], 'update_channel');
      assert.equal(parts[6], 'build%20id');
      done();
    });
  });

  suite('sendTelemetry', function() {
    var xhr, requests;

    var requestCallback = function(request) {
      request.respond(200, 'OK');
    };

    function invalidSuccessCb() {
      assert.ok(false, 'should not call successCb');
    }

    function validErrorCb(done) {
      assert.ok(true);
      done();
    }

    setup(function() {
      requests = [];
      xhr = sinon.useFakeXMLHttpRequest();
      xhr.onCreate = function(request) {
        requests.push(request);
        setTimeout(function() {
          requestCallback(request);
        }, 0);
      };
    });

    teardown(function() {
      xhr.restore();
    });

    test('adds payload info', function(done) {
      useTestSettings();

      var helper = new Telemetry({ reason: 'yo' });
      var data = { hello: 'world' };

      helper.sendTelemetry(data, function() {
        assert.equal(requests.length, 1);

        var jsonData = JSON.parse(requests[0].requestBody);
        assert.equal(jsonData.ver, 1);
        assert.equal(jsonData.hello, 'world');
        assertInfo(jsonData, 'yo');
        done();
      });
    });

    function assertSendTelemetryError(done) {
      var helper = new Telemetry();
      helper.sendTelemetry({}, invalidSuccessCb, validErrorCb.bind(null, done));
    }

    test('error from 404 status', function(done) {
      requestCallback = function(request) { request.respond(404, 'ERROR'); };
      assertSendTelemetryError(done);
    });

    test('error from ontimeout', function(done) {
      requestCallback = function(request) { request.ontimeout(); };
      assertSendTelemetryError(done);
    });

    test('error from onabort', function(done) {
      requestCallback = function(request) { request.onabort(); };
      assertSendTelemetryError(done);
    });

    test('error from onerror', function(done) {
      requestCallback = function(request) { request.onerror(); };
      assertSendTelemetryError(done);
    });
  });
});
