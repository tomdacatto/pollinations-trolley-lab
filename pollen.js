// Bring Your Own Pollen for a static page. The visitor signs in on
// enter.pollinations.ai and is sent back to this page. The key comes back in
// the URL fragment, which the browser never sends to a server. It is kept in
// sessionStorage for this tab only. Nothing here runs on a server.
// Flow reference: https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md
import { BUDGET, EXPIRY_DAYS, JEV_MODEL } from "./config.js";

const ENTER = "https://enter.pollinations.ai";
const SESSION = "pollen.session";
const PENDING = "pollen.pending";
const DAY_MS = 86_400_000;

export class PollenError extends Error {
    constructor(message, status = 0) {
        super(message);
        this.status = status;
    }
}

// The address the app is served from, without index.html, query or fragment.
export function spaceUrl(href = location.href) {
    return new URL("./", href).href;
}

export function buildAuthorizeUrl({ redirectUri, state }) {
    const params = new URLSearchParams({
        redirect_uri: redirectUri,
        state,
        budget: String(BUDGET),
        expiry: String(EXPIRY_DAYS),
    });
    return `${ENTER}/authorize?${params}`;
}

// Reads the legacy fragment: #api_key=sk_...&state=... or #error=access_denied.
// The state must match the one this page stored before it redirected.
export function readReturn(hash, expectedState) {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    if (params.has("error")) return { status: "denied" };
    if (!params.has("api_key")) return { status: "none" };
    if (!expectedState || params.get("state") !== expectedState) return { status: "bad-state" };
    const key = params.get("api_key");
    if (!/^sk_\S{8,}$/.test(key)) return { status: "bad-key" };
    return { status: "ok", key };
}

export function storageAvailable() {
    try {
        sessionStorage.setItem("pollen.probe", "1");
        sessionStorage.removeItem("pollen.probe");
        return true;
    } catch {
        return false;
    }
}

export function getSession() {
    try {
        const session = JSON.parse(sessionStorage.getItem(SESSION) || "null");
        if (session?.key && session.expiresAt > Date.now()) return session;
    } catch {}
    clearSession();
    return null;
}

export function clearSession() {
    try {
        sessionStorage.removeItem(SESSION);
    } catch {}
}

const randomState = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

// Top-level navigation only. Inside a framed page, sign-in must run in a full tab.
export function startSignIn() {
    const state = randomState();
    sessionStorage.setItem(PENDING, JSON.stringify({ state }));
    location.assign(buildAuthorizeUrl({ redirectUri: spaceUrl(), state }));
}

// Call once on page load. Returns "ok", "denied", "bad-state", "bad-key",
// "no-storage" or null when the page was not opened from a sign-in.
export function completeSignIn(hash = location.hash) {
    let pending = null;
    try {
        pending = JSON.parse(sessionStorage.getItem(PENDING) || "null");
    } catch {}
    const result = readReturn(hash, pending?.state);
    if (result.status === "none") return null;
    try {
        sessionStorage.removeItem(PENDING);
    } catch {}
    // Drop the fragment so the key is not left in the address bar. The query
    // (for example ?__theme=dark from Hugging Face) is kept.
    history.replaceState(null, "", location.pathname + location.search);
    if (result.status !== "ok") return result.status;
    try {
        sessionStorage.setItem(SESSION, JSON.stringify({ key: result.key, expiresAt: Date.now() + EXPIRY_DAYS * DAY_MS }));
    } catch {
        return "no-storage";
    }
    return "ok";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function failure(res) {
    const body = await res.json().catch(() => ({}));
    const detail = body.error?.message || body.message || `Request failed (${res.status})`;
    if (res.status === 401) {
        clearSession();
        return new PollenError("Your sign-in expired. Sign in again to continue.", 401);
    }
    if (res.status === 402 || res.status === 403) {
        return new PollenError(
            `Jev could not run for this sign-in: ${detail}. Jev is a paid-only model, so the account needs paid Pollen (enter.pollinations.ai).`,
            res.status,
        );
    }
    if (res.status === 429) return new PollenError("Too many requests. Wait a moment and try again.", 429);
    return new PollenError(detail, res.status);
}

// Sends the visitor's key. A 429 is retried once after a short pause.
export async function decide(request, { signal } = {}, retry = true) {
    const session = getSession();
    if (!session) throw new PollenError("Sign in with your Pollen to continue.", 401);
    const res = await fetch("https://gen.pollinations.ai/alpha/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.key}` },
        body: JSON.stringify({ model: JEV_MODEL, ...request }),
        signal,
    });
    if (res.status === 429 && retry) {
        await sleep(2500);
        return decide(request, { signal }, false);
    }
    if (!res.ok) throw await failure(res);
    return res.json();
}
