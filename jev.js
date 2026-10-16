// The pure parts: what is asked of Jev, how its answer is read, and where a
// curve crosses 50%. Nothing here touches the network or the page.
import { keyOf } from "./scenarios.js";

export function buildRequest(scenario, setting) {
    return {
        state: scenario.state(setting),
        questions: {
            decision: {
                type: "choice",
                instructions: "What should the person do?",
                criteria: scenario.criteria,
            },
            permissible: {
                type: "noul",
                instructions: scenario.permissible,
                criteria: {
                    true: "Yes, it is morally permissible",
                    false: "No, it is not morally permissible",
                },
            },
        },
    };
}

// Jev answers each question on its own. `probabilities.act` is how likely it is
// to choose the action; `confidence` is how sure it is of its top choice.
export function readAnswers(response) {
    const decision = response?.answers?.decision;
    const permissible = response?.answers?.permissible;
    const act = decision?.probabilities?.act;
    if (typeof act !== "number" || typeof permissible?.noul !== "number") {
        throw new Error("Jev sent an answer in a shape this page does not read.");
    }
    return { act, confidence: decision.confidence, permissible: permissible.noul };
}

// Where the curve first crosses 50%, going left to right, found by straight-line
// interpolation between the two settings it falls between. `direction` is "up"
// when Jev starts to act as the setting grows and "down" when it stops acting.
// `above` / `below` mean it never crosses: at least / under 50% at every setting.
export function tippingPoint(points, level = 0.5) {
    const sorted = [...points].sort((a, b) => a.x - b.x);
    if (sorted.length === 0) return null;
    for (let i = 1; i < sorted.length; i++) {
        const [a, b] = [sorted[i - 1], sorted[i]];
        if (a.p < level !== b.p < level) {
            return {
                kind: "crosses",
                direction: b.p > a.p ? "up" : "down",
                x: a.x + ((level - a.p) * (b.x - a.x)) / (b.p - a.p),
            };
        }
    }
    return { kind: sorted[0].p >= level ? "above" : "below" };
}

// Asks about every setting, `concurrency` at a time, and reports each answer as
// it arrives. A failure stops the sweep and is thrown after the answers so far
// have been reported.
export async function runSweep(scenario, ask, { concurrency = 4, onResult = () => {}, signal } = {}) {
    const queue = scenario.values.map((setting) => ({ setting, request: buildRequest(scenario, setting) }));
    let failure = null;
    const worker = async () => {
        while (queue.length > 0 && !failure && !signal?.aborted) {
            const { setting, request } = queue.shift();
            try {
                onResult(keyOf(setting), readAnswers(await ask(request, { signal })));
            } catch (error) {
                failure ??= error;
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
    if (failure) throw failure;
}

const round = (x) => Math.round(x * 10) / 10;

export function describeTipping(tip, action = "acts") {
    if (!tip) return "no answer yet";
    if (tip.kind === "above") return `${action} at every setting tested`;
    if (tip.kind === "below") return `never reaches 50% at any setting tested`;
    return tip.direction === "up" ? `starts to act around ${round(tip.x)}` : `stops acting around ${round(tip.x)}`;
}
