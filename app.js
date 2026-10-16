import { CONCURRENCY } from "./config.js";
import { describeTipping, runSweep, tippingPoint } from "./jev.js";
import * as pollen from "./pollen.js";
import { keyOf, SCENARIOS } from "./scenarios.js";

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
};
const svg = (tag, attrs = {}, text) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    if (text !== undefined) node.textContent = text;
    return node;
};
const percent = (p) => `${Math.round(p * 100)}%`;
const NEVER = "never";

let current = SCENARIOS[0];
// scenario id -> number | "never" (numeric) or Set of ids (choice). Kept for this
// tab so a guess survives the trip to the sign-in page and back.
const GUESS_KEY = "tipping.guesses";
const guesses = new Map();
try {
    for (const [id, value] of JSON.parse(sessionStorage.getItem(GUESS_KEY) ?? "[]")) {
        guesses.set(id, Array.isArray(value) ? new Set(value) : value);
    }
} catch {}
const rememberGuesses = () => {
    try {
        sessionStorage.setItem(GUESS_KEY, JSON.stringify([...guesses].map(([id, v]) => [id, v instanceof Set ? [...v] : v])));
    } catch {}
};
const answers = new Map(); // scenario id -> Map(setting key -> { act, confidence, permissible })
let running = null; // { scenario, total } while a sweep is in progress
let controller = null;

function showNotice(message, kind = "info") {
    const box = $("notice");
    box.hidden = !message;
    box.className = `notice ${kind}`;
    box.textContent = message ?? "";
}

function renderSession() {
    const signedIn = pollen.getSession() !== null;
    $("sign-in").hidden = signedIn;
    $("sign-out").hidden = !signedIn;
    $("whoami").hidden = !signedIn;
}

function renderTabs() {
    $("tabs").replaceChildren(
        ...SCENARIOS.map((scenario) => {
            const tab = el("button", { className: "tab", type: "button", textContent: scenario.title });
            tab.setAttribute("aria-current", String(scenario === current));
            tab.addEventListener("click", () => {
                current = scenario;
                showNotice(null);
                renderTabs();
                renderStage();
            });
            return tab;
        }),
    );
}

const exampleSetting = (scenario) => (scenario.kind === "number" ? 5 : scenario.values[0]);

function renderGuess(scenario) {
    const box = el("div", { className: "guess" });
    if (scenario.kind === "number") {
        const select = el("select", { id: "guess" });
        select.append(el("option", { value: "", textContent: "choose…", disabled: true, selected: !guesses.has(scenario.id) }));
        for (const n of scenario.values) {
            select.append(el("option", { value: String(n), textContent: String(n), selected: guesses.get(scenario.id) === n }));
        }
        select.append(el("option", { value: NEVER, textContent: "never", selected: guesses.get(scenario.id) === NEVER }));
        select.addEventListener("change", () => {
            guesses.set(scenario.id, select.value === NEVER ? NEVER : Number(select.value));
            rememberGuesses();
            renderStage();
        });
        box.append(
            el("label", { htmlFor: "guess", textContent: `${scenario.action} once there are at least this many:` }),
            select,
        );
        return box;
    }
    const picked = guesses.get(scenario.id) ?? new Set();
    box.append(el("strong", { textContent: `${scenario.action} if the person on the side track is…` }));
    const checks = el("div", { className: "checks" });
    for (const option of scenario.values) {
        const input = el("input", { type: "checkbox", checked: picked.has(option.id) });
        input.addEventListener("change", () => {
            const next = new Set(guesses.get(scenario.id) ?? []);
            if (input.checked) next.add(option.id);
            else next.delete(option.id);
            guesses.set(scenario.id, next);
            rememberGuesses();
            renderStage();
        });
        checks.append(el("label", {}, input, option.label));
    }
    box.append(checks);
    return box;
}

const guessMade = (scenario) => scenario.kind === "choice" || guesses.has(scenario.id);

function pointsOf(scenario) {
    const results = answers.get(scenario.id) ?? new Map();
    return scenario.values.filter((v) => results.has(keyOf(v))).map((v) => ({ x: v, p: results.get(v).act }));
}

function renderCurve(scenario, results) {
    const W = 640;
    const H = 300;
    const m = { l: 44, r: 16, t: 16, b: 42 };
    const xs = scenario.values;
    const [x0, x1] = [xs[0], xs.at(-1)];
    const sx = (x) => m.l + ((x - x0) / (x1 - x0)) * (W - m.l - m.r);
    const sy = (p) => m.t + (1 - p) * (H - m.t - m.b);
    const chart = svg("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img" });
    chart.setAttribute("aria-label", `Probability that Jev would ${scenario.action.toLowerCase()}, by ${scenario.label.toLowerCase()}.`);

    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
        chart.append(svg("line", { class: p === 0.5 ? "half" : "axis", x1: m.l, x2: W - m.r, y1: sy(p), y2: sy(p) }));
        chart.append(svg("text", { x: m.l - 6, y: sy(p) + 4, "text-anchor": "end" }, percent(p)));
    }
    for (const x of xs) chart.append(svg("text", { x: sx(x), y: H - 22, "text-anchor": "middle" }, String(x)));
    chart.append(svg("text", { x: (m.l + W - m.r) / 2, y: H - 4, "text-anchor": "middle" }, scenario.label));

    const points = pointsOf(scenario);
    const guess = guesses.get(scenario.id);
    if (typeof guess === "number") {
        chart.append(svg("line", { class: "mark-you", x1: sx(guess), x2: sx(guess), y1: m.t, y2: H - m.b }));
        chart.append(svg("text", { class: "label-you", x: sx(guess) + 4, y: m.t + 12 }, "you"));
    }
    if (points.length > 1) {
        chart.append(svg("polyline", { class: "curve", points: points.map((pt) => `${sx(pt.x)},${sy(pt.p)}`).join(" ") }));
    }
    for (const pt of points) {
        const dot = svg("circle", { class: "dot", cx: sx(pt.x), cy: sy(pt.p), r: 4 });
        dot.append(svg("title", {}, `${pt.x}: ${percent(pt.p)} act`));
        chart.append(dot);
    }
    const tip = tippingPoint(points);
    if (tip?.kind === "crosses") {
        chart.append(svg("line", { class: "mark-jev", x1: sx(tip.x), x2: sx(tip.x), y1: m.t, y2: H - m.b }));
        chart.append(svg("text", { class: "label-jev", x: sx(tip.x) + 4, y: m.t + 28 }, "Jev"));
    }
    return chart;
}

function renderBars(scenario, results) {
    const picked = guesses.get(scenario.id) ?? new Set();
    return el(
        "ul",
        { className: "bars" },
        ...scenario.values.map((option) => {
            const row = results.get(option.id);
            const fill = el("span");
            fill.style.width = row ? percent(row.act) : "0%";
            const bar = el("div", { className: "bar" }, fill);
            bar.setAttribute("role", "img");
            bar.setAttribute("aria-label", row ? `Jev would pull ${percent(row.act)}` : "waiting");
            return el(
                "li",
                {},
                el("span", { textContent: option.label }),
                bar,
                el("span", { className: "you", textContent: `${row ? `Jev ${percent(row.act)} · ` : ""}you: ${picked.has(option.id) ? "pull" : "stay"}` }),
            );
        }),
    );
}

function verdictFor(scenario, results) {
    const done = scenario.values.filter((v) => results.has(keyOf(v)));
    if (done.length < scenario.values.length) return null;
    const guess = guesses.get(scenario.id);
    if (scenario.kind === "choice") {
        const picked = guess ?? new Set();
        const same = scenario.values.filter((o) => (results.get(o.id).act >= 0.5) === picked.has(o.id)).length;
        return `You and Jev agree on ${same} of ${scenario.values.length} people on the side track.`;
    }
    const tip = tippingPoint(pointsOf(scenario));
    const jev = describeTipping(tip);
    const you = guess === NEVER ? "never" : `at ${guess}`;
    if (tip.kind !== "crosses" || guess === NEVER) return `Jev: ${jev}. You: ${you}.`;
    const gap = Math.round((tip.x - guess) * 10) / 10;
    if (Math.abs(gap) < 0.5) return `Jev tips ${jev}; you tip ${you}. Practically the same place.`;
    return `Jev tips ${jev}; you tip ${you}. Jev needs ${Math.abs(gap)} ${gap > 0 ? "more" : "fewer"} than you.`;
}

function tableOf(scenario, results) {
    const body = scenario.values
        .filter((v) => results.has(keyOf(v)))
        .map((v) => {
            const row = results.get(keyOf(v));
            return el(
                "tr",
                {},
                el("td", { textContent: scenario.kind === "number" ? String(v) : v.label }),
                el("td", { textContent: percent(row.act) }),
                el("td", { textContent: percent(row.confidence) }),
                el("td", { textContent: percent(row.permissible) }),
            );
        });
    return el(
        "details",
        {},
        el("summary", { textContent: "The numbers" }),
        el(
            "table",
            {},
            el("thead", {}, el("tr", {}, ...["Setting", "Chance it acts", "How sure it is", "Chance it is permissible"].map((h) => el("th", { textContent: h })))),
            el("tbody", {}, ...body),
        ),
    );
}

function renderStage() {
    const scenario = current;
    const results = answers.get(scenario.id) ?? new Map();
    const stage = $("stage");
    const busy = running?.scenario === scenario;
    const signedIn = pollen.getSession() !== null;

    const ask = el("button", { className: "button primary", type: "button", textContent: results.size ? "Ask Jev again" : "Ask Jev" });
    ask.disabled = !!running || !guessMade(scenario);
    ask.addEventListener("click", () => sweep(scenario));
    const actions = el("div", { className: "actions" }, ask);
    if (!signedIn) ask.title = "You will be asked to sign in with your Pollen first.";
    if (busy) {
        const stop = el("button", { className: "button", type: "button", textContent: "Stop" });
        stop.addEventListener("click", () => controller?.abort());
        actions.append(stop);
    }

    const verdict = verdictFor(scenario, results);
    const share = verdict ? el("button", { className: "button", type: "button", textContent: "Copy result" }) : null;
    if (share) {
        share.addEventListener("click", async () => {
            const text = `${scenario.title}: ${verdict} ${location.href.split("#")[0]}`;
            try {
                await navigator.clipboard.writeText(text);
                share.textContent = "Copied";
            } catch {
                showNotice(text);
            }
        });
        actions.append(share);
    }

    stage.replaceChildren(
        el("h2", { textContent: scenario.title }),
        el("p", { textContent: scenario.blurb }),
        el("p", { className: "setup", textContent: scenario.state(exampleSetting(scenario)) }),
        renderGuess(scenario),
        actions,
        ...(busy ? [el("p", { className: "progress", textContent: `Asked Jev ${results.size} of ${running.total}…` })] : []),
        ...(results.size
            ? [
                  scenario.kind === "number" ? renderCurve(scenario, results) : renderBars(scenario, results),
                  el(
                      "div",
                      { className: "legend" },
                      el("span", { className: "jev", textContent: "● Jev: chance it acts" }),
                      ...(scenario.kind === "number" ? [el("span", { className: "you", textContent: "┆ you" })] : []),
                      el("span", { textContent: "dashed line: 50%" }),
                  ),
                  ...(verdict ? [el("p", { className: "verdict", textContent: verdict })] : []),
                  tableOf(scenario, results),
              ]
            : []),
    );
}

async function sweep(scenario) {
    if (!pollen.getSession()) {
        pollen.startSignIn();
        return;
    }
    answers.set(scenario.id, new Map());
    running = { scenario, total: scenario.values.length };
    controller = new AbortController();
    showNotice(null);
    renderStage();
    try {
        await runSweep(scenario, pollen.decide, {
            concurrency: CONCURRENCY,
            signal: controller.signal,
            onResult: (key, row) => {
                answers.get(scenario.id).set(key, row);
                renderStage();
            },
        });
    } catch (error) {
        if (error.name !== "AbortError") showNotice(error.message, "error");
    } finally {
        running = null;
        controller = null;
        renderSession();
        renderStage();
    }
}

$("sign-in").addEventListener("click", () => {
    if (!pollen.storageAvailable()) {
        showNotice("This browser blocks session storage, so sign-in cannot be kept. Allow site data for this page and try again.", "error");
        return;
    }
    pollen.startSignIn();
});
$("sign-out").addEventListener("click", () => {
    pollen.clearSession();
    renderSession();
    renderStage();
});

const returned = pollen.completeSignIn();
if (returned === "denied") showNotice("Sign-in was cancelled. Nothing was spent.");
else if (returned && returned !== "ok") showNotice("That sign-in could not be verified. Please try again.", "error");

renderSession();
renderTabs();
renderStage();
