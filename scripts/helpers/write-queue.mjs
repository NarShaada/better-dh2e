// scripts/helpers/write-queue.mjs — PURE. Serialises a sheet's read-modify-write document updates.
//
// The sheets edit document ARRAYS (specialties, injuries, afflictions, crew, conditions, ammo …) by
// cloning the array, changing one row and sending the whole array back, because Foundry replaces an
// array wholesale. Local document data only changes when the server ANSWERS, so two such edits that
// start inside one round trip both clone the same old array and the later write erases the earlier:
// type a specialty name, click ＋ without tabbing out, and the name is gone (blur fires `change`,
// then the click handler reads the not-yet-updated array).
//
// The cure is ordering, not merging: run each edit only after the one before it has landed.

/** How long the queue waits on one job before stepping over it. A document update normally comes
 *  back in well under a second; this only matters when one never does. */
const STALL_MS = 5000;

/** A FIFO of async jobs. A job starts once every job queued before it has settled, so whatever it
 *  reads from the document already includes their writes.
 *
 *  `stallMs` bounds that wait. Before the queue, each sheet write stood alone; chained, one request
 *  that never returns (the connection dropping mid-update) would leave everything behind it waiting
 *  forever — the sheet would silently ignore every later edit and click until a reload. So a job
 *  that has not settled `stallMs` after it STARTED is stepped over and the next one runs. The clock
 *  is per job and starts with the job: started at queueing instead, every job waiting behind a
 *  stalled one would time out together and they would all begin at once, racing each other. The
 *  stalled job is not cancelled and keeps its own outcome. */
export function createWriteQueue({ stallMs = STALL_MS } = {}) {
  let tail = Promise.resolve();
  return {
    /** Queue `job`. Resolves or rejects with the job's own outcome; a rejection is the caller's to
     *  handle and never stalls the jobs behind it. */
    run(job) {
      const outcome = tail.then(job);
      // Chained on the same `tail` as the job, so this runs in the tick the job starts.
      tail = tail.then(() => {
        const settled = outcome.then(() => {}, () => {});
        let timer;
        const stalled = new Promise((resolve) => { timer = setTimeout(resolve, stallMs); });
        settled.then(() => clearTimeout(timer));   // the usual case: no timer left running
        return Promise.race([settled, stalled]);
      });
      return outcome;
    },
    /** Settles (never rejects) once everything queued so far has finished or been stepped over. */
    idle() {
      return tail;
    },
  };
}

/** Wrap an ApplicationV2 `actions` map so every action first waits for the sheet's queued writes
 *  (`this._writes`). Inline edits go through the queue; with this, a click that arrives while one
 *  is still in flight reads the array AFTER it landed instead of racing it. Both action forms are
 *  handled: a bare function and `{ handler, buttons }`. */
export function afterQueuedWrites(actions) {
  const wrap = (handler) => async function (event, target) {
    await this?._writes?.idle();
    return handler.call(this, event, target);
  };
  const out = {};
  for (const [name, action] of Object.entries(actions ?? {})) {
    if (typeof action === "function") out[name] = wrap(action);
    else if (action && typeof action.handler === "function") out[name] = { ...action, handler: wrap(action.handler) };
    else out[name] = action;
  }
  return out;
}
