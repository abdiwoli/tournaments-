import test from "node:test";
import assert from "node:assert/strict";
import { extractTeamScoresFromText, resolveFixture, resolveTeamAlias } from "../src/lib/fixtureResolver.js";
import { parseWhatsAppReport } from "../src/lib/whatsappParser.js";

const teams = [
  { id: "psg_id", name: "PSG" },
  { id: "arsenal_id", name: "Arsenal" },
  { id: "manchester_united_id", name: "Manchester United" },
];
const matches = [
  { id: "round1", round: 1, home_team_id: "psg_id", away_team_id: "arsenal_id", status: "completed" },
  { id: "round5", round: 5, home_team_id: "psg_id", away_team_id: "manchester_united_id", status: "scheduled" },
];
const report = `PSG

Sibaal 1g
Quule

Man united

Titanic 1g
Sonia 1 g
Falis 1 g

PSG 1; man united 3:`;

test("resolves the current round's open fixture by both normalized team IDs", () => {
  const result = resolveFixture({ text: report, teams, matches, currentRound: 5 });
  assert.equal(resolveTeamAlias("Man united", teams)?.id, "manchester_united_id");
  assert.equal(result.fixture?.id, "round5");
  assert.notEqual(result.fixture?.id, "round1");
  assert.deepEqual([...extractTeamScoresFromText(report, teams)], [["psg_id", 1], ["manchester_united_id", 3]]);
});

test("never automatically returns the completed fixture", () => {
  const completedPair = [{ id: "round1-completed-pair", round: 1, home_team_id: "psg_id", away_team_id: "manchester_united_id", status: "completed" }];
  const result = resolveFixture({ text: report, teams, matches: completedPair, currentRound: 5 });
  assert.equal(result.fixture, null);
  assert.equal(result.completedFixture?.id, "round1-completed-pair");
});

test("uses blank-delimited team player blocks and keeps later statistics out of lineups", () => {
  const structuredReport = `Legends cup Round 5

PSG


Sibaal 1g
Quule
Queen Abdi
Se


Man united

Titanic 1g
Sonia 1 g
Falis 1 g
Maleg


PSG 1:3 man united

Woman of the match Sonia`;
  const parsed = parseWhatsAppReport(structuredReport, teams);
  assert.equal(parsed.round, 5);
  assert.deepEqual(parsed.detectedTeams, ["PSG", "Manchester United"]);
  assert.deepEqual(parsed.players.map((player) => [player.team, player.name, player.goals]), [
    ["PSG", "Sibaal", 1], ["PSG", "Quule", 0], ["PSG", "Queen Abdi", 0], ["PSG", "Se", 0],
    ["Manchester United", "Titanic", 1], ["Manchester United", "Sonia", 1], ["Manchester United", "Falis", 1], ["Manchester United", "Maleg", 0],
  ]);
  assert.equal(parsed.homeScore, 1);
  assert.equal(parsed.awayScore, 3);
  assert.equal(parsed.awardType, "Woman of the Match");
  assert.equal(parsed.manOfTheMatch, "Sonia");
  assert.equal(parsed.awardTeam, "Manchester United");
  assert.deepEqual(parsed.playerOfMatch, { name: "Sonia", team: "Manchester United", awardType: "Woman of the Match" });
});
