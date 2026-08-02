// Interchangeable, informal ways to say a parlay is being "built".
// Picked deterministically from a seed so a given league/context always
// shows the same term during a session, while different leagues vary.
const BUILDING_VERBS = ["Brewing", "Cooking", "Dialing Up"] as const;

export type BuildingVerb = (typeof BUILDING_VERBS)[number];

function hashSeed(seed: string | number): number {
  const str = String(seed);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getBuildingVerb(seed: string | number): BuildingVerb {
  return BUILDING_VERBS[hashSeed(seed) % BUILDING_VERBS.length];
}

export function getBuildingGerundPhrase(seed: string | number): string {
  return `${getBuildingVerb(seed)} a parlay`;
}