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

// Where the curve first reaches 50% going left to right, found by straight-line
// interpolation between the two settings it falls between. `x` is the setting's
// position; `always` means it is already at or above 50% at the first setting,
// `never` means it never gets there.
export function tippingPoint(points, level = 0.5) {
    const sorted = [...points].sort((a, b) => a.x - b.x);
    if (sorted.length === 0) return null;
    if (sorted[0].p >= level) return { kind: "always", x: sorted[0].x };
    for (let i = 1; i < sorted.length; i++) {
        const [a, b] = [sorted[i - 1], sorted[i]];
        if (b.p >= level) {
            return { kind: "crosses", x: a.x + ((level - a.p) * (b.x - a.x)) / (b.p - a.p) };
        }
    }
    return { kind: "never", x: sorted.at(-1).x };
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

export function describeTipping(tip) {
    if (!tip) return "no answer yet";
    if (tip.kind === "never") return `never, even at ${tip.x}`;
    if (tip.kind === "always") return `already at ${tip.x}`;
    return `around ${Math.round(tip.x * 10) / 10}`;
}
