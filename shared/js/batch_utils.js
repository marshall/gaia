/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

(function(exports) {

  function BatchQuery(keysAndDefaults) {
    if (keysAndDefaults) {
      this._keysAndDefaults = keysAndDefaults;
    }
  }

  BatchQuery.prototype = {
    _callback: null,
    _keysAndDefaults: {},
    _pendingQueries: 0,
    _results: null,

    addKey: function(key, defaultValue) {
      this._keysAndDefaults[key] = defaultValue;
    },

    getAll: function(callback) {
      var keys = Object.keys(this._keysAndDefaults);
      this._pendingQueries = keys.length;
      this._results = {};
      this._callback = callback;

      this._startBatch();
      keys.forEach(this._startQuery, this);
    },

    getResults: function() {
      return this._results;
    },

    isFinished: function() {
      return this._pendingQueries === 0;
    },

    _handleResult: function(key, value) {
      if (value === undefined || value === null) {
        value = this._keysAndDefaults[key];
      }

      this._results[key] = value;
      this._pendingQueries--;
      if (this.isFinished()) {
        if (this._callback) {
          this._callback(this._results);
        }
        this._finishBatch();
        this._callback = null;
      }
    },

    _finishBatch: function() {
    },

    _startBatch: function() {
    },

    _startQuery: function(key) {
    }
  };

  function BatchSettings(keysAndDefaults) {
    return BatchQuery.call(this, keysAndDefaults);
  }
  BatchSettings.prototype = Object.create(BatchQuery.prototype);
  BatchSettings.prototype.constructor = BatchSettings;

  BatchSettings.prototype._startBatch = function() {
    this._lock = window.navigator.mozSettings.createLock();
  };

  BatchSettings.prototype._finishBatch = function() {
    this._lock = null;
  };

  BatchSettings.prototype._startQuery = function(key) {
    var request = this._lock.get(key);
    request.onsuccess = (function() {
      this._handleResult(key, request.result[key]);
    }).bind(this);
  };

  BatchSettings.prototype.observeAll = function(observer) {
    var keys = Object.keys(this._keysAndDefaults);
    keys.forEach(function(key) {
      window.navigator.mozSettings.addObserver(key, observer);
    });
  };

  function BatchAsyncStorage(keysAndDefaults) {
    return BatchQuery.call(this, keysAndDefaults);
  }
  BatchAsyncStorage.prototype = Object.create(BatchQuery.prototype);
  BatchAsyncStorage.prototype.constructor = BatchAsyncStorage;

  BatchAsyncStorage.prototype._startQuery = function(key) {
    window.asyncStorage.getItem(key, this._handleResult.bind(this, key));
  };

  exports.BatchQuery = BatchQuery;
  exports.BatchSettings = BatchSettings;
  exports.BatchAsyncStorage = BatchAsyncStorage;
}(window));
