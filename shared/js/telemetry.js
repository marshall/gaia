/* global asyncStorage, BatchSettings, BatchAsyncStorage, uuid */
'use strict';

/**
 * Telemetry helpers for building JSON payloads and submitting to the FxOS
 * Mozilla telemetry server.
 *
 * https://github.com/mozilla/telemetry-server
 */
(function(exports) {
  function Telemetry(options) {
    this._callbacks = [];

    if (options) {
      if (options.reason) {
        this._reason = options.reason;
      }
      if (options.version) {
        this._version = options.version;
      }
    }

    var query = {};
    query[KEYS.PLATFORM_BUILD_ID] = DEFAULTS.UNKNOWN;
    query[KEYS.PLATFORM_VERSION] = DEFAULTS.UNKNOWN;
    query[KEYS.UPDATE_CHANNEL] = DEFAULTS.UNKNOWN;
    query[KEYS.DEVELOPER_MENU_ENABLED] = false;

    if (!options || !options.baseURL) {
      query[KEYS.TELEMETRY_BASE_URL] = DEFAULTS.BASE_URL;
    } else {
      this._baseURL = options.baseURL;
    }

    if (!options || !options.sendTimeout) {
      query[KEYS.TELEMETRY_SEND_TIMEOUT] = DEFAULTS.SEND_TIMEOUT;
    } else {
      this._sendTimeout = options.sendTimeout;
    }

    if (!options || !options.idMaxAge) {
      query[KEYS.TELEMETRY_ID_MAX_AGE] = DEFAULTS.ID_MAX_AGE;
    } else {
      this._idMaxAge = options.idMaxAge;
    }

    var batchSettings = new BatchSettings(query);
    batchSettings.getAll(this._onSettingsReady.bind(this));
  }

  const KEYS = Telemetry.KEYS = {
    DEVELOPER_MENU_ENABLED: 'developer.menu.enabled',
    TELEMETRY_BASE_URL: 'telemetry.baseURL',
    TELEMETRY_ENABLED: 'debug.performance_data.shared',
    TELEMETRY_ID_GENERATED: 'telemetry.id.value',
    TELEMETRY_ID_TIMESTAMP: 'telemetry.id.timestamp',
    TELEMETRY_ID_MAX_AGE: 'telemetry.id.maxAge',
    TELEMETRY_SEND_TIMEOUT: 'telemetry.sendTimeout',
    PLATFORM_BUILD_ID: 'deviceinfo.platform_build_id',
    PLATFORM_VERSION: 'deviceinfo.platform_version',
    UPDATE_CHANNEL: 'app.update.channel'
  };

  const DEFAULTS = Telemetry.DEFAULTS = {
    BASE_URL: 'https://fxos.telemetry.mozilla.org/submit/telemetry',
    SEND_TIMEOUT: 60 * 1000,
    ID_MAX_AGE: 24 * 60 * 60 * 1000,
    VERSION: 1,
    UNKNOWN: 'unknown'
  };

  Telemetry.prototype = {
    _baseURL: DEFAULTS.BASE_URL,
    _callbacks: null,
    _developerMenuEnabled: false,
    _isReady: false,
    _idBatch: null,
    _idMaxAge: DEFAULTS.ID_MAX_AGE,
    _platformVersion: DEFAULTS.UNKNOWN,
    _platformBuildID: DEFAULTS.UNKNOWN,
    _reason: DEFAULTS.UNKNOWN,
    _sendTimeout: DEFAULTS.SEND_TIMEOUT,
    _updateChannel: DEFAULTS.UNKNOWN,
    _version: DEFAULTS.VERSION,

    _onSettingsReady: function(settings) {
      this._platformVersion = settings[KEYS.PLATFORM_VERSION];
      this._platformBuildID = settings[KEYS.PLATFORM_BUILD_ID];
      this._updateChannel = settings[KEYS.UPDATE_CHANNEL];
      this._developerMenuEnabled = settings[KEYS.DEVELOPER_MENU_ENABLED];

      if (settings.hasOwnProperty(KEYS.TELEMETRY_BASE_URL)) {
        this._baseURL = settings[KEYS.TELEMETRY_BASE_URL];
      }

      if (settings.hasOwnProperty(KEYS.TELEMETRY_SEND_TIMEOUT)) {
        this._sendTimeout = settings[KEYS.TELEMETRY_SEND_TIMEOUT];
      }

      if (settings.hasOwnProperty(KEYS.TELEMETRY_ID_MAX_AGE)) {
        this._idMaxAge = settings[KEYS.TELEMETRY_ID_MAX_AGE];
      }

      this._isReady = true;
      this._callbacks.forEach(function(callback) {
        callback();
      });
      this._callbacks = null;
    },

    buildPayload: function(id, data) {
      var payload = {};
      if (data) {
        Object.keys(data).forEach(function(key) {
          if (key === 'info' && data.info) {
            payload.info = {};
            Object.keys(data.info).forEach(function(infoKey) {
              payload.info[infoKey] = data.info[infoKey];
            });
            return;
          }

          payload[key] = data[key];
        });
      }

      payload.ver = this._version;
      payload.screenHeight = window.screen.height;
      payload.screenWidth = window.screen.width;
      payload.devicePixelRatio = window.devicePixelRatio;
      payload.locale = window.navigator.language;
      payload.developerMenuEnabled = this._developerMenuEnabled;
      payload.pingID = id;

      if (!payload.info) {
        payload.info = {};
      }

      payload.info.reason = this._reason;
      payload.info.appUpdateChannel = this._updateChannel;
      payload.info.appBuildID = this._platformBuildID;
      payload.info.appVersion = this._platformVersion;
      payload.info.appName = 'FirefoxOS';
      return payload;
    },

    buildURL: function(id) {
      var self = this;
      var uriParts = [id, self._reason, 'FirefoxOS', self._platformVersion,
                      self._updateChannel, self._platformBuildID]
                     .map(encodeURIComponent);

      uriParts.unshift(self._baseURL);
      return uriParts.join('/');
    },

    queryID: function(callback) {
      var self = this;
      if (!this._idBatch) {
        var query = {};
        query[KEYS.TELEMETRY_ID_GENERATED] = null;
        query[KEYS.TELEMETRY_ID_TIMESTAMP] = 0;
        this._idBatch = new BatchAsyncStorage(query);
      }

      function generateID() {
        var id = uuid();
        asyncStorage.setItem(KEYS.TELEMETRY_ID_GENERATED, id);
        asyncStorage.setItem(KEYS.TELEMETRY_ID_TIMESTAMP, Date.now());
        return id;
      }

      this._idBatch.getAll(function(storage) {
        var id = storage[KEYS.TELEMETRY_ID_GENERATED];
        var timestamp = storage[KEYS.TELEMETRY_ID_TIMESTAMP];
        var age = Date.now() - timestamp;

        if (!id || age >= self._idMaxAge) {
          id = generateID();
        }

        if (callback) {
          callback(id);
        }
      });
    },

    onReady: function(callback) {
      if (!callback) {
        return;
      }

      if (this._isReady) {
        callback();
      } else {
        this._callbacks.push(callback);
      }
    },

    sendTelemetry: function(data, successCb, errorCb) {
      var self = this;
      this.onReady(function() {
        self.queryID(function(id) {
          var request = new TelemetryRequest(id, self.buildURL(id),
                                             self._sendTimeout);
          var payload = self.buildPayload(id, data);

          request.send(payload, successCb, errorCb);
        });
      });
    },

    get baseURL() {
      return this._baseURL;
    },

    get idMaxAge() {
      return this._idMaxAge;
    },

    get reason() {
      return this._reason;
    },

    get sendTimeout() {
      return this._sendTimeout;
    },

    get version() {
      return this._version;
    }
  };

  function TelemetryRequest(id, url, timeout) {
    this.id = id;
    this.url = url;
    this.timeout = timeout;
    this.data = null;
  }

  TelemetryRequest.prototype.send = function(data, successCb, errorCb) {

    var xhr = new XMLHttpRequest({ mozAnon: true, mozSystem: true });
    xhr.timeout = this.timeout;

    var self = this;
    xhr.onreadystatechange = function() {
      if (xhr.readyState !== 4) {
        return;
      }

      if (xhr.status === 200 || xhr.status === 0) {
        successCb(self);
      } else {
        errorCb(self, { type: 'InvalidStatusCode(' + xhr.status + ')' });
      }
    };

    xhr.onerror = xhr.onabort = xhr.ontimeout = function(e) {
      errorCb(self, e);
    };

    xhr.open('POST', this.url, true);
    xhr.setRequestHeader('Content-type', 'application/json');
    xhr.responseType = 'text';
    this.data = data;

    xhr.send(JSON.stringify(data));
  };

  exports.Telemetry = Telemetry;
  exports.TelemetryRequest = TelemetryRequest;
}(window));
