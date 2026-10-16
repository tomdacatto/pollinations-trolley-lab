// The dilemmas and the one thing each sweep changes. Jev is asked the same two
// questions at every setting, so any change in its answer comes from the setting.

const people = (n) => (n === 1 ? "1 person" : `${n} people`);

const COUNTS = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20];

export const SCENARIOS = [
    {
        id: "switch",
        title: "The switch",
        blurb: "Pull a lever to send the trolley onto a side track.",
        kind: "number",
        label: "People on the main track",
        values: COUNTS,
        action: "Pull the lever",
        criteria: {
            act: "Pull the lever, sending the trolley onto the side track",
            stay: "Do nothing and let the trolley stay on the main track",
        },
        permissible: "Is it morally permissible to pull the lever?",
        state: (n) =>
            `A runaway trolley is heading down a track toward ${people(n)} who cannot get away and will be killed. ` +
            "You are standing next to a lever. If you pull it, the trolley is sent onto a side track where it will kill 1 person who also cannot get away. " +
            "Nothing else can stop the trolley.",
    },
    {
        id: "bridge",
        title: "The footbridge",
        blurb: "Push a stranger off a bridge to stop the trolley.",
        kind: "number",
        label: "People on the track",
        values: COUNTS,
        action: "Push the stranger",
        criteria: {
            act: "Push the stranger off the footbridge onto the track",
            stay: "Do nothing and let the trolley continue",
        },
        permissible: "Is it morally permissible to push the stranger?",
        state: (n) =>
            `A runaway trolley is heading down a track toward ${people(n)} who cannot get away and will be killed. ` +
            "You are on a footbridge over the track next to a stranger of large build. " +
            `If you push the stranger onto the track, his body will stop the trolley: he will die and the ${n === 1 ? "person" : "people"} on the track will live. ` +
            "Nothing else can stop the trolley.",
    },
    {
        id: "who",
        title: "Who is on the side track",
        blurb: "Five people on the main track. Who is the one on the side track?",
        kind: "choice",
        label: "The person on the side track",
        values: [
            { id: "stranger", label: "A stranger", text: "a stranger" },
            { id: "child", label: "A child", text: "a child" },
            { id: "senior", label: "An 85-year-old", text: "an 85-year-old stranger" },
            { id: "doctor", label: "A doctor", text: "a doctor who treats many patients" },
            { id: "sibling", label: "Your sibling", text: "your sibling" },
            { id: "convict", label: "A convicted murderer", text: "a person convicted of murder who has served their sentence" },
        ],
        action: "Pull the lever",
        criteria: {
            act: "Pull the lever, sending the trolley onto the side track",
            stay: "Do nothing and let the trolley stay on the main track",
        },
        permissible: "Is it morally permissible to pull the lever?",
        state: (option) =>
            "A runaway trolley is heading down a track toward 5 people who cannot get away and will be killed. " +
            "You are standing next to a lever. If you pull it, the trolley is sent onto a side track where it will kill " +
            `${option.text}, who also cannot get away. Nothing else can stop the trolley.`,
    },
];

export const settingsOf = (scenario) => scenario.values;
export const keyOf = (setting) => (typeof setting === "number" ? setting : setting.id);
