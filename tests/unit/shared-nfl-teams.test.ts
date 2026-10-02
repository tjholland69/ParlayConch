import { describe, expect, test } from "vitest";
import { abbreviationsForTeam, abbrevToShort } from "../../shared/nflTeams";

describe("shared/nflTeams", () => {
  test("abbrevToShort maps an abbreviation to the short name games use", () => {
    expect(abbrevToShort("IND")).toBe("Colts");
    expect(abbrevToShort("wsh")).toBe("Commanders");
    expect(abbrevToShort("XYZ")).toBe("XYZ");
  });

  test("abbreviationsForTeam accepts a short name, full name or abbreviation", () => {
    expect(abbreviationsForTeam("Colts")).toEqual(["IND"]);
    expect(abbreviationsForTeam("Indianapolis Colts")).toEqual(["IND"]);
    expect(abbreviationsForTeam("ind")).toEqual(["IND"]);
  });

  test("abbreviationsForTeam returns every spelling nflverse uses for a team", () => {
    expect(abbreviationsForTeam("Rams")).toEqual(["LA", "LAR"]);
    expect(abbreviationsForTeam("JAC")).toEqual(["JAX", "JAC"]);
    expect(abbreviationsForTeam("Commanders")).toEqual(["WAS", "WSH"]);
  });

  test("abbreviationsForTeam is empty for anything that isn't a team", () => {
    expect(abbreviationsForTeam("Lakers")).toEqual([]);
    expect(abbreviationsForTeam("")).toEqual([]);
    expect(abbreviationsForTeam(null)).toEqual([]);
  });
});
