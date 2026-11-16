// test/write-queue.test.mjs
//
// The sheets edit document ARRAYS by read-modify-write: clone the array, change one row, send the
// whole array back. Foundry only changes local document data when the server answers, so two such
// edits started inside one round trip both read the same old array and the second overwrites the
// first — type a name, click ＋ without tabbing out, and the name is gone.
//
// createWriteQueue() is the fix's primitive: each job starts only once the one before it has
// landed, so its read is never stale. These tests pin that ordering and nothing else.
import { describe, it, expect } from "vitest";
import { createWriteQueue, afterQueuedWrites } from "../scripts/helpers/write-queue.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A document whose update() lands only after a round trip — the property the bug depends on. */
function makeDoc(list) {
  const doc = {
    list: [...list],
    async update(next) { await sleep(5); doc.list = [...next]; },
  };
  return doc;
}

describe("createWriteQueue", () => {
  it("runs a job only after the previous one has landed, so its read is not stale", async () => {
    const doc = makeDoc(["a"]);
    const q = createWriteQueue();
    q.run(async () => { const l = [...doc.list]; l[0] = "edited"; await doc.update(l); });
    q.run(async () => { const l = [...doc.list, "new"]; await doc.update(l); });
    await q.idle();
    expect(doc.list).toEqual(["edited", "new"]);
  });

  it("hands back the job's own result", async () => {
    const q = createWriteQueue();
    await expect(q.run(async () => 42)).resolves.toBe(42);
  });

  it("surfaces a job's rejection to its caller without stalling the jobs behind it", async () => {
    const q = createWriteQueue();
    const failed = q.run(async () => { throw new Error("validation"); });
    const after = q.run(async () => "ran");
    await expect(failed).rejects.toThrow("validation");
    await expect(after).resolves.toBe("ran");
  });

  // The queue adds one failure mode the sheets did not have before: if a request never comes back
  // (the connection drops mid-update), everything behind it would wait forever and the sheet would
  // ignore every later edit and click. A stalled job is therefore stepped over after `stallMs`.
  it("steps over a job that never settles, so later edits still run", async () => {
    const q = createWriteQueue({ stallMs: 20 });
    q.run(() => new Promise(() => {}));                 // a request that never returns
    const later = q.run(async () => "ran");
    await expect(later).resolves.toBe("ran");
  });

  // The stall clock must start when a job STARTS, not when it is queued — otherwise every job
  // waiting behind a stalled one runs out of time together and they all start at once, racing
  // each other exactly as they did before the queue existed.
  it("keeps the jobs behind a stalled one in order", async () => {
    const doc = makeDoc(["a"]);
    const q = createWriteQueue({ stallMs: 40 });
    q.run(() => new Promise(() => {}));                                   // stalls
    q.run(async () => { await doc.update([...doc.list, "second"]); });    // 5 ms round trip
    q.run(async () => { await doc.update([...doc.list, "third"]); });     // must read AFTER "second" landed
    await q.idle();
    expect(doc.list).toEqual(["a", "second", "third"]);
  });

  it("idle() settles even while a job is stalled", async () => {
    const q = createWriteQueue({ stallMs: 20 });
    q.run(() => new Promise(() => {}));
    await expect(q.idle()).resolves.toBeUndefined();
  });

  it("does not step over a job that is merely slow", async () => {
    const doc = makeDoc(["a"]);                          // 5 ms round trip, well inside stallMs
    const q = createWriteQueue({ stallMs: 500 });
    q.run(async () => { await doc.update(["edited"]); });
    q.run(async () => { await doc.update([...doc.list, "new"]); });
    await q.idle();
    expect(doc.list).toEqual(["edited", "new"]);
  });

  it("idle() never rejects, even when the last job did", async () => {
    const q = createWriteQueue();
    q.run(async () => { throw new Error("boom"); }).catch(() => {});
    await expect(q.idle()).resolves.toBeUndefined();
  });
});

describe("afterQueuedWrites", () => {
  /** A sheet-shaped object: `_writes` is where the sheets keep their queue. */
  const makeSheet = (doc) => ({ doc, _writes: createWriteQueue() });

  it("makes an action wait for an in-flight inline edit before it reads", async () => {
    const doc = makeDoc(["a"]);
    const sheet = makeSheet(doc);
    const actions = afterQueuedWrites({
      add: async function () { await this.doc.update([...this.doc.list, "new"]); },
    });
    // The inline edit (blur → change) is queued, then the click arrives in the same round trip.
    sheet._writes.run(async () => { const l = [...doc.list]; l[0] = "edited"; await doc.update(l); });
    await actions.add.call(sheet, {}, {});
    expect(doc.list).toEqual(["edited", "new"]);
  });

  it("passes `this`, the event, the target and the return value straight through", async () => {
    const sheet = makeSheet(makeDoc([]));
    const seen = {};
    const actions = afterQueuedWrites({
      act: function (event, target) { seen.self = this; seen.event = event; seen.target = target; return "result"; },
    });
    const event = { type: "click" }, target = { dataset: { index: "2" } };
    await expect(actions.act.call(sheet, event, target)).resolves.toBe("result");
    expect(seen).toEqual({ self: sheet, event, target });
  });

  it("wraps the handler of the { handler, buttons } action form and keeps its buttons", async () => {
    const doc = makeDoc(["a"]);
    const sheet = makeSheet(doc);
    const actions = afterQueuedWrites({
      add: { buttons: [0, 2], handler: async function () { await this.doc.update([...this.doc.list, "new"]); } },
    });
    expect(actions.add.buttons).toEqual([0, 2]);
    sheet._writes.run(async () => { await doc.update(["edited"]); });
    await actions.add.handler.call(sheet, {}, {});
    expect(doc.list).toEqual(["edited", "new"]);
  });

  it("still runs the action on a sheet that has no queue", async () => {
    const actions = afterQueuedWrites({ act: () => "ok" });
    await expect(actions.act.call({}, {}, {})).resolves.toBe("ok");
  });
});
