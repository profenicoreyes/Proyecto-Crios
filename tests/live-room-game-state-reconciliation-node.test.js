const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = process.argv[2] || path.resolve(__dirname, '..');
const sourcePath = path.join(repo, 'js', 'live-room', 'live-room-game-state-reconciliation.js');
const source = fs.readFileSync(sourcePath, 'utf8');

let total = 0;
let failed = 0;
function check(condition, message) {
  total += 1;
  if (!condition) {
    failed += 1;
    console.error('FAIL ' + message);
  }
}
function equal(actual, expected, message) {
  check(actual === expected, `${message} expected=${expected} actual=${actual}`);
}

const windowStub = { setTimeout, clearTimeout };
const context = {window:windowStub,Date,Object,Array,String,Number,Boolean,JSON,Math,Map,Set,Promise,console};
windowStub.window = windowStub;
vm.createContext(context);
vm.runInContext(source, context, {filename:sourcePath});

const api = windowStub.CRIOS_LIVE_ROOM_GAME_STATE_RECONCILIATION;

function timers() {
  let nextId = 1;
  const scheduled = new Map();
  return {
    set(callback, ms) {
      const id = nextId++;
      scheduled.set(id, {id, callback, ms});
      return id;
    },
    clear(id) { scheduled.delete(id); },
    list() { return Array.from(scheduled.values()); },
    fire(id) {
      const item = scheduled.get(id);
      if (!item) return false;
      scheduled.delete(id);
      item.callback();
      return true;
    }
  };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve=>setImmediate(resolve));
}

async function main() {
  check(Boolean(api), 'reconciliation API exported');
  equal(api.version, '1.0.0', 'reconciliation API version');
  check(Object.isFrozen(api) && Object.isFrozen(api.defaultPolicy), 'API and default policy frozen');
  equal(api.defaultPolicy.signalDebounceMs, 300, 'signal debounce fixed');
  equal(api.defaultPolicy.signalJitterWindowMs, 29700, 'signal jitter fills thirty second window');
  equal(api.defaultPolicy.minRefreshIntervalMs, 30000, 'per-client refresh cooldown fixed');
  equal(api.defaultPolicy.periodicBaseMs, 90000, 'periodic fallback base fixed');
  equal(api.defaultPolicy.periodicJitterMs, 30000, 'periodic fallback jitter fixed');
  equal(api.backoffDelay(api.defaultPolicy, 1), 30000, 'first backoff bounded');
  equal(api.backoffDelay(api.defaultPolicy, 5), 300000, 'backoff caps at maximum');
  equal(api.signalDelay(api.defaultPolicy, 0), 300, 'signal minimum delay');
  equal(api.signalDelay(api.defaultPolicy, 0.999999), 30000, 'signal maximum delay');
  equal(api.periodicDelay(api.defaultPolicy, 0), 60000, 'periodic minimum delay');
  equal(api.periodicDelay(api.defaultPolicy, 0.999999), 119999, 'periodic maximum delay');

  let invalidPolicy = null;
  try { api.normalizePolicy({unknown:1}); } catch (error) { invalidPolicy = error; }
  check(Boolean(invalidPolicy), 'unknown policy field rejected');
  try { api.normalizePolicy({backoffBaseMs:40000,backoffMaxMs:30000}); invalidPolicy = null; } catch (error) { invalidPolicy = error; }
  check(Boolean(invalidPolicy), 'invalid backoff range rejected');

  {
    let clock = 1000;
    const queue = timers();
    const scheduler = api.createScheduler({
      refresh:async()=>({success:true}),
      now:()=>clock,
      random:()=>0.5,
      setTimeoutImpl:queue.set,
      clearTimeoutImpl:queue.clear
    });
    check(scheduler.available(), 'valid scheduler available');
    scheduler.start();
    equal(queue.list().length, 1, 'start schedules one periodic fallback');
    equal(queue.list()[0].ms, 90000, 'periodic fallback uses centered jitter');
    scheduler.request(api.reasons.SIGNAL);
    equal(queue.list().length, 1, 'signal replaces later periodic timer');
    equal(queue.list()[0].ms, 15150, 'signal uses debounce plus deterministic jitter');
    for (let index = 0; index < 100; index += 1) scheduler.request(api.reasons.SIGNAL);
    equal(queue.list().length, 1, 'signal flood remains coalesced to one timer');
    check(!scheduler.request('unknown'), 'unknown trigger rejected');
    scheduler.stop();
    equal(queue.list().length, 0, 'stop clears timer');
    equal(scheduler.getState().status, 'STOPPED', 'stop is terminal for scheduler');
  }

  {
    let clock = 0;
    let resolveRefresh;
    let calls = 0;
    const queue = timers();
    const scheduler = api.createScheduler({
      refresh:()=>{ calls += 1; return new Promise(resolve=>{ resolveRefresh = resolve; }); },
      now:()=>clock,
      random:()=>0,
      setTimeoutImpl:queue.set,
      clearTimeoutImpl:queue.clear
    });
    scheduler.request(api.reasons.MANUAL);
    const first = queue.list()[0];
    queue.fire(first.id);
    equal(calls, 1, 'first requested refresh starts once');
    check(scheduler.getState().inFlight, 'refresh marked in flight');
    for (let index = 0; index < 20; index += 1) scheduler.request(api.reasons.SIGNAL);
    equal(queue.list().length, 0, 'in-flight triggers do not start concurrent timer');
    resolveRefresh({success:true});
    await settle();
    equal(queue.list().length, 1, 'in-flight trigger becomes one trailing timer');
    equal(queue.list()[0].ms, 30000, 'trailing refresh respects minimum interval');
    scheduler.stop();
  }

  {
    let clock = 5000;
    const queue = timers();
    let calls = 0;
    const scheduler = api.createScheduler({
      refresh:async()=>{ calls += 1; return {success:false,retryable:true}; },
      now:()=>clock,
      random:()=>0,
      setTimeoutImpl:queue.set,
      clearTimeoutImpl:queue.clear
    });
    scheduler.start();
    scheduler.request(api.reasons.MANUAL);
    queue.fire(queue.list()[0].id);
    await settle();
    equal(calls, 1, 'failed refresh attempted once');
    equal(scheduler.getState().failureCount, 1, 'retryable failure counted');
    equal(queue.list().length, 1, 'retryable failure schedules one retry/fallback');
    equal(queue.list()[0].ms, 60000, 'periodic minimum remains beyond first backoff');
    scheduler.request(api.reasons.SIGNAL);
    equal(queue.list()[0].ms, 30000, 'signal during degraded state cannot bypass backoff');
    scheduler.stop();
  }

  {
    let clock = 0;
    const queue = timers();
    const scheduler = api.createScheduler({
      refresh:async()=>({success:false,retryable:false,terminal:true}),
      now:()=>clock,
      setTimeoutImpl:queue.set,
      clearTimeoutImpl:queue.clear
    });
    scheduler.request(api.reasons.MANUAL);
    queue.fire(queue.list()[0].id);
    await settle();
    equal(scheduler.getState().status, 'STOPPED', 'terminal result stops scheduler');
    equal(queue.list().length, 0, 'terminal result leaves no timer');
    check(!scheduler.request(api.reasons.SIGNAL), 'terminal scheduler rejects later signals');
  }
  {
    let clock = 0;
    let calls = 0;
    const queue = timers();
    const scheduler = api.createScheduler({
      refresh:async()=>{ calls += 1; return {success:false,retryable:false,terminal:false}; },
      now:()=>clock,
      setTimeoutImpl:queue.set,
      clearTimeoutImpl:queue.clear
    });
    scheduler.request(api.reasons.MANUAL);
    queue.fire(queue.list()[0].id);
    await settle();
    equal(calls, 1, 'non-retryable refresh is attempted once');
    equal(scheduler.getState().status, 'STOPPED', 'non-retryable result stops scheduler');
    equal(queue.list().length, 0, 'non-retryable result leaves no fallback timer');
    check(!scheduler.request(api.reasons.SIGNAL), 'non-retryable scheduler rejects later signals');
  }


  {
    const queue = timers();
    const scheduler = api.createScheduler({
      refresh:async()=>({success:true}),
      visible:false,
      now:()=>0,
      setTimeoutImpl:queue.set,
      clearTimeoutImpl:queue.clear
    });
    scheduler.start();
    equal(queue.list().length, 0, 'hidden scheduler does not poll');
    scheduler.request(api.reasons.SIGNAL);
    equal(queue.list().length, 0, 'hidden signal does not read');
    scheduler.setVisible(true);
    equal(queue.list().length, 1, 'visibility recovery schedules one read');
    equal(queue.list()[0].ms, 0, 'first visibility recovery is immediate');
    scheduler.setVisible(false);
    equal(queue.list().length, 0, 'hiding cancels scheduled read');
    scheduler.stop();
  }

  {
    const delays = [];
    for (let index = 0; index < 64; index += 1) {
      const queue = timers();
      const fraction = (index + 0.5) / 64;
      const scheduler = api.createScheduler({
        refresh:async()=>({success:true}),
        now:()=>0,
        random:()=>fraction,
        setTimeoutImpl:queue.set,
        clearTimeoutImpl:queue.clear
      });
      scheduler.request(api.reasons.SIGNAL);
      equal(queue.list().length, 1, 'one timer per simulated presence ' + index);
      delays.push(queue.list()[0].ms);
    }
    check(Math.min(...delays) >= 300, '64-presence fanout respects minimum debounce');
    check(Math.max(...delays) <= 30000, '64-presence fanout stays inside bounded window');
    const buckets = new Array(6).fill(0);
    delays.forEach(delay=>{ buckets[Math.min(5, Math.floor(delay / 5000))] += 1; });
    check(Math.max(...buckets) <= 12, '64-presence fanout is distributed across five-second buckets');
    equal(delays.length, 64, 'load model covers contractual maximum presences');
  }

  {
    const unavailable = api.createScheduler({refresh:null});
    check(!unavailable.available(), 'missing refresh dependency fails closed');
    equal(unavailable.getState().status, 'UNAVAILABLE', 'missing dependency state is unavailable');
    check(!unavailable.request(api.reasons.SIGNAL), 'unavailable scheduler performs no work');
  }

  check(!source.includes('capabilityToken'), 'scheduler never handles capability');
  check(!source.includes('participantId'), 'scheduler never handles participant identity');
  check(!source.includes('missionId'), 'scheduler never handles mission identity');
  check(!source.includes('sessionData'), 'scheduler never handles personal session data');
}

main().then(()=>{
  console.log('LIVE_ROOM_GAME_STATE_RECONCILIATION_TEST_TOTAL=' + total);
  console.log('LIVE_ROOM_GAME_STATE_RECONCILIATION_TEST_FAILED=' + failed);
  console.log('LIVE_ROOM_GAME_STATE_RECONCILIATION_TEST_STATUS=' + (failed === 0 ? 'PASS' : 'FAIL'));
  process.exitCode = failed === 0 ? 0 : 1;
}).catch(error=>{
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
