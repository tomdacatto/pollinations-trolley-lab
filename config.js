// Everything you are likely to change lives in this file.

// What a visitor's key may spend and for how long. Pollen is per visitor.
// A full sweep is about a dozen Jev calls and costs a few thousandths of a Pollen.
export const BUDGET = 0.1;
export const EXPIRY_DAYS = 1;

// Jev answers with a choice, a score or a probability instead of text. It is a
// paid-only model, so a visitor needs paid Pollen in the account that signs in.
export const JEV_MODEL = "typesafe/jev-1.13";

// How many Jev requests run at the same time.
export const CONCURRENCY = 4;
