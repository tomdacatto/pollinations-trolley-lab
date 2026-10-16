import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRequest, describeTipping, readAnswers, runSweep, tippingPoint } from "./jev.js";
import { keyOf, SCENARIOS } from "./scenarios.js";

const [swtch, bridge, who] = SCENARIOS;

test("buildRequest asks the same two questions at every setting and changes only the state", () => {
    const a = buildRequest(swtch, 2);
    const b = buildRequest(swtch, 12);
    assert.deepEqual(a.questions, b.questions);
    assert.notEqual(a.state, b.state);
    assert.match(a.state, /toward 2 people/);
    assert.match(b.state, /toward 12 people/);
    assert.equal(a.questions.decision.type, "choice");
    assert.deepEqual(Object.keys(a.questions.decision.criteria), ["act", "stay"]);
    assert.equal(a.questions.permissible.type, "noul");
});

test("a single person is not 'people'", () => {
    assert.match(buildRequest(swtch, 1).state, /toward 1 person who/);
    assert.match(buildRequest(bridge, 1).state, /the person on the track will live/);
    assert.match(buildRequest(bridge, 5).state, /the people on the track will live/);
});

test("the side-track sweep keeps five on the main track and names who is on the side track", () => {
    for (const option of who.values) {
        const { state } = buildRequest(who, option);
        assert.match(state, /toward 5 people/);
        assert.ok(state.includes(option.text), option.id);
    }
    assert.equal(new Set(who.values.map((o) => o.id)).size, who.values.length);
});

test("readAnswers reads the chance of acting, the confidence and permissibility", () => {
    const response = {
        answers: {
            decision: { type: "choice", choice: "act", confidence: 0.8, probabilities: { act: 0.9, stay: 0.1 } },
            permissible: { type: "noul", noul: 0.7 },
        },
    };
    assert.deepEqual(readAnswers(response), { act: 0.9, confidence: 0.8, permissible: 0.7 });
});

test("readAnswers refuses an answer it cannot read instead of drawing a wrong point", () => {
    assert.throws(() => readAnswers({}), /shape this page does not read/);
    assert.throws(() => readAnswers({ answers: { decision: { probabilities: { stay: 1 } }, permissible: { noul: 0.5 } } }), /shape/);
    assert.throws(() => readAnswers({ answers: { decision: { probabilities: { act: 0.4 } }, permissible: {} } }), /shape/);
});

test("tippingPoint interpolates between the two settings that straddle 50%", () => {
    const tip = tippingPoint([
        { x: 1, p: 0.1 },
        { x: 3, p: 0.3 },
        { x: 5, p: 0.7 },
        { x: 10, p: 0.9 },
    ]);
    assert.equal(tip.kind, "crosses");
    assert.equal(tip.x, 4);
});

test("tippingPoint is exact when a setting lands on 50%, and sorts its input", () => {
    const tip = tippingPoint([
        { x: 6, p: 0.9 },
        { x: 2, p: 0.2 },
        { x: 4, p: 0.5 },
    ]);
    assert.deepEqual(tip, { kind: "crosses", x: 4 });
});

test("tippingPoint reports a curve that never starts low or never gets there", () => {
    assert.deepEqual(tippingPoint([{ x: 1, p: 0.8 }, { x: 5, p: 0.95 }]), { kind: "always", x: 1 });
    assert.deepEqual(tippingPoint([{ x: 1, p: 0.1 }, { x: 5, p: 0.45 }]), { kind: "never", x: 5 });
    assert.equal(tippingPoint([]), null);
});

test("describeTipping puts each outcome in words", () => {
    assert.equal(describeTipping({ kind: "crosses", x: 3.04 }), "around 3");
    assert.equal(describeTipping({ kind: "always", x: 1 }), "already at 1");
    assert.equal(describeTipping({ kind: "never", x: 20 }), "never, even at 20");
    assert.equal(describeTipping(null), "no answer yet");
});

test("runSweep asks every setting once, never more than `concurrency` at a time, and reports each answer", async () => {
    let inFlight = 0;
    let peak = 0;
    const asked = [];
    const ask = async (request) => {
        asked.push(request.state);
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        return { answers: { decision: { confidence: 0.5, probabilities: { act: 0.5 } }, permissible: { noul: 0.5 } } };
    };
    const seen = [];
    await runSweep(swtch, ask, { concurrency: 3, onResult: (key) => seen.push(key) });
    assert.equal(asked.length, swtch.values.length);
    assert.equal(new Set(asked).size, swtch.values.length);
    assert.ok(peak <= 3 && peak > 1, `peak ${peak}`);
    assert.deepEqual([...seen].sort((a, b) => a - b), swtch.values);
});

test("runSweep stops asking after a failure and throws it once the answers so far are reported", async () => {
    let calls = 0;
    const ask = async () => {
        calls++;
        if (calls === 2) throw new Error("out of Pollen");
        return { answers: { decision: { confidence: 1, probabilities: { act: 1 } }, permissible: { noul: 1 } } };
    };
    const seen = [];
    await assert.rejects(runSweep(swtch, ask, { concurrency: 1, onResult: (key) => seen.push(key) }), /out of Pollen/);
    assert.equal(calls, 2);
    assert.deepEqual(seen, [swtch.values[0].valueOf()]);
});

test("runSweep honours an aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    await runSweep(swtch, async () => calls++, { signal: controller.signal });
    assert.equal(calls, 0);
});

test("keyOf works for numbers and options", () => {
    assert.equal(keyOf(4), 4);
    assert.equal(keyOf(who.values[1]), "child");
});
