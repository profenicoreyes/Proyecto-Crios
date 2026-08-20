/* CRIOS LiveRoom Game State — bounded reconciliation scheduler */
(function(){
  'use strict';

  var VERSION = '1.0.0';
  var REASONS = Object.freeze({
    SIGNAL: 'signal',
    VISIBILITY: 'visibility',
    MANUAL: 'manual',
    PERIODIC: 'periodic',
    RETRY: 'retry'
  });
  var REASON_SET = Object.freeze({signal:true,visibility:true,manual:true,periodic:true,retry:true});
  var DEFAULT_POLICY = Object.freeze({
    signalDebounceMs: 300,
    signalJitterWindowMs: 29700,
    minRefreshIntervalMs: 30000,
    periodicBaseMs: 90000,
    periodicJitterMs: 30000,
    backoffBaseMs: 30000,
    backoffMaxMs: 300000
  });

  function clone(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clone);
    var copy = {};
    Object.keys(value).forEach(function(key){ copy[key] = clone(value[key]); });
    return copy;
  }

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function(key){ freeze(value[key]); });
    return Object.freeze(value);
  }

  function frozenCopy(value) { return freeze(clone(value)); }

  function finiteInteger(value, name, minimum) {
    var number = Number(value);
    if (!Number.isFinite(number) || Math.floor(number) !== number || number < minimum) {
      throw new Error('LiveRoom game-state reconciliation ' + name + ' is invalid.');
    }
    return number;
  }

  function normalizePolicy(input) {
    var source = input && typeof input === 'object' ? input : {};
    var policy = {};
    Object.keys(source).forEach(function(key){
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_POLICY, key)) {
        throw new Error('LiveRoom game-state reconciliation policy contains an unsupported field.');
      }
    });
    Object.keys(DEFAULT_POLICY).forEach(function(key){
      policy[key] = finiteInteger(
        Object.prototype.hasOwnProperty.call(source, key) ? source[key] : DEFAULT_POLICY[key],
        key,
        key === 'signalDebounceMs' || key === 'signalJitterWindowMs' || key === 'periodicJitterMs' ? 0 : 1
      );
    });
    if (policy.backoffMaxMs < policy.backoffBaseMs) {
      throw new Error('LiveRoom game-state reconciliation backoff range is invalid.');
    }
    if (policy.periodicJitterMs > policy.periodicBaseMs) {
      throw new Error('LiveRoom game-state reconciliation periodic jitter is invalid.');
    }
    return frozenCopy(policy);
  }

  function boundedRandom(random) {
    var value = 0.5;
    try { value = Number(random()); } catch (ignoreRandom) { value = 0.5; }
    if (!Number.isFinite(value)) value = 0.5;
    return Math.max(0, Math.min(0.999999999, value));
  }

  function signalDelay(policy, randomValue) {
    return policy.signalDebounceMs + Math.floor(randomValue * (policy.signalJitterWindowMs + 1));
  }

  function periodicDelay(policy, randomValue) {
    var offset = Math.floor((randomValue * 2 - 1) * policy.periodicJitterMs);
    return Math.max(1, policy.periodicBaseMs + offset);
  }

  function backoffDelay(policy, failureCount) {
    var exponent = Math.max(0, finiteInteger(failureCount, 'failureCount', 1) - 1);
    return Math.min(policy.backoffMaxMs, policy.backoffBaseMs * Math.pow(2, Math.min(exponent, 30)));
  }

  function normalizedOutcome(value) {
    var source = value && typeof value === 'object' ? value : {};
    return Object.freeze({
      success: source.success === true,
      terminal: source.terminal === true,
      retryable: source.retryable !== false
    });
  }

  function createScheduler(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var refresh = typeof opts.refresh === 'function' ? opts.refresh : null;
    var setTimeoutImpl = typeof opts.setTimeoutImpl === 'function' ? opts.setTimeoutImpl : window.setTimeout.bind(window);
    var clearTimeoutImpl = typeof opts.clearTimeoutImpl === 'function' ? opts.clearTimeoutImpl : window.clearTimeout.bind(window);
    var nowImpl = typeof opts.now === 'function' ? opts.now : function(){ return Date.now(); };
    var random = typeof opts.random === 'function' ? opts.random : Math.random;
    var onStateChange = typeof opts.onStateChange === 'function' ? opts.onStateChange : function(){};
    var policy;
    var configurationError = null;
    try { policy = normalizePolicy(opts.policy); }
    catch (errorPolicy) { configurationError = String(errorPolicy && errorPolicy.message || errorPolicy); policy = DEFAULT_POLICY; }

    var started = false;
    var stopped = false;
    var visible = opts.visible !== false;
    var inFlight = false;
    var timer = null;
    var scheduledFor = null;
    var scheduledReason = '';
    var pendingFor = null;
    var pendingReason = '';
    var lastNow = 0;
    var lastAttemptAt = null;
    var lastSuccessAt = null;
    var backoffUntil = 0;
    var failureCount = 0;
    var attemptCount = 0;
    var lastReason = '';
    var lastOutcome = configurationError ? 'UNAVAILABLE' : 'IDLE';

    function clock() {
      var value;
      try { value = Number(nowImpl()); } catch (ignoreNow) { value = lastNow; }
      if (!Number.isFinite(value)) value = lastNow;
      value = Math.floor(value);
      if (value < lastNow) value = lastNow;
      lastNow = value;
      return value;
    }

    function snapshot() {
      return frozenCopy({
        status: stopped ? 'STOPPED' : (configurationError || !refresh ? 'UNAVAILABLE' : (inFlight ? 'REFRESHING' : lastOutcome)),
        visible: visible,
        inFlight: inFlight,
        scheduled: timer !== null,
        scheduledFor: scheduledFor,
        scheduledReason: scheduledReason || null,
        failureCount: failureCount,
        attemptCount: attemptCount,
        lastAttemptAt: lastAttemptAt,
        lastSuccessAt: lastSuccessAt,
        lastReason: lastReason || null,
        configurationError: configurationError
      });
    }

    function emit() {
      var state = snapshot();
      try { onStateChange(state); } catch (ignoreStateChange) {}
      return state;
    }

    function available() {
      return Boolean(!configurationError && refresh && setTimeoutImpl && clearTimeoutImpl && !stopped);
    }

    function clearTimer() {
      if (timer !== null) {
        try { clearTimeoutImpl(timer); } catch (ignoreClear) {}
      }
      timer = null;
      scheduledFor = null;
      scheduledReason = '';
    }

    function rememberPending(reason, dueAt) {
      if (pendingFor === null || dueAt < pendingFor) {
        pendingFor = dueAt;
        pendingReason = reason;
      }
    }

    function arm(reason, requestedFor) {
      if (!available()) return false;
      var current = clock();
      var minimum = lastAttemptAt === null ? current : lastAttemptAt + policy.minRefreshIntervalMs;
      var dueAt = Math.max(current, Math.floor(requestedFor), minimum, backoffUntil);
      if (!visible || inFlight) {
        rememberPending(reason, dueAt);
        return true;
      }
      if (timer !== null && scheduledFor !== null && scheduledFor <= dueAt) return true;
      clearTimer();
      scheduledFor = dueAt;
      scheduledReason = reason;
      timer = setTimeoutImpl(function(){
        var runReason = scheduledReason;
        timer = null;
        scheduledFor = null;
        scheduledReason = '';
        runRefresh(runReason);
      }, Math.max(0, dueAt - current));
      emit();
      return true;
    }

    function schedulePeriodic() {
      if (!started || !visible || !available()) return false;
      var current = clock();
      return arm(REASONS.PERIODIC, current + periodicDelay(policy, boundedRandom(random)));
    }

    function scheduleAfterRun() {
      if (!available() || !visible) return;
      if (pendingFor !== null) {
        var dueAt = pendingFor;
        var reason = pendingReason || REASONS.MANUAL;
        pendingFor = null;
        pendingReason = '';
        arm(reason, dueAt);
        return;
      }
      schedulePeriodic();
    }

    async function runRefresh(reason) {
      if (!available() || !visible || inFlight) return;
      inFlight = true;
      attemptCount += 1;
      lastAttemptAt = clock();
      lastReason = reason;
      lastOutcome = 'REFRESHING';
      emit();
      var raw;
      try { raw = await refresh(frozenCopy({reason:reason,attempt:attemptCount,requestedAt:lastAttemptAt})); }
      catch (ignoreRefresh) { raw = {success:false,retryable:true,terminal:false}; }
      if (stopped) return;
      var outcome = normalizedOutcome(raw);
      inFlight = false;
      if (outcome.terminal || !outcome.retryable) {
        lastOutcome = 'TERMINAL';
        stopped = true;
        pendingFor = null;
        pendingReason = '';
        clearTimer();
        emit();
        return;
      }
      if (outcome.success) {
        failureCount = 0;
        backoffUntil = 0;
        lastSuccessAt = clock();
        lastOutcome = 'READY';
      } else {
        failureCount += 1;
        backoffUntil = clock() + backoffDelay(policy, failureCount);
        lastOutcome = outcome.retryable ? 'DEGRADED' : 'FAILED';
      }
      emit();
      scheduleAfterRun();
    }

    function request(reason) {
      var normalizedReason = typeof reason === 'string' ? reason : '';
      if (!available() || !REASON_SET[normalizedReason]) return false;
      var current = clock();
      var delay = normalizedReason === REASONS.SIGNAL
        ? signalDelay(policy, boundedRandom(random))
        : 0;
      return arm(normalizedReason, current + delay);
    }

    function start() {
      if (!available()) return emit();
      if (started) return snapshot();
      started = true;
      lastOutcome = 'READY';
      schedulePeriodic();
      return snapshot();
    }

    function setVisible(nextVisible) {
      var next = nextVisible === true;
      if (visible === next) return snapshot();
      visible = next;
      if (!visible) {
        clearTimer();
        pendingFor = null;
        pendingReason = '';
        emit();
        return snapshot();
      }
      request(REASONS.VISIBILITY);
      return snapshot();
    }

    function stop() {
      if (stopped) return snapshot();
      stopped = true;
      pendingFor = null;
      pendingReason = '';
      clearTimer();
      return emit();
    }

    return Object.freeze({
      version: VERSION,
      available: available,
      start: start,
      request: request,
      setVisible: setVisible,
      stop: stop,
      getState: snapshot
    });
  }

  window.CRIOS_LIVE_ROOM_GAME_STATE_RECONCILIATION = Object.freeze({
    version: VERSION,
    reasons: REASONS,
    defaultPolicy: DEFAULT_POLICY,
    normalizePolicy: normalizePolicy,
    signalDelay: signalDelay,
    periodicDelay: periodicDelay,
    backoffDelay: backoffDelay,
    createScheduler: createScheduler
  });
})();
