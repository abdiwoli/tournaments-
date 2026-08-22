import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStandings, isPowerOfTwo, knockoutRoundLabel, roundRobinRounds, validateGroupConfiguration } from '../server/competition.js';

test('four independent groups of four generate only intra-group fixtures', () => {
  const groups = Array.from({ length: 4 }, (_, groupIndex) => Array.from({ length: 4 }, (_, teamIndex) => `g${groupIndex + 1}-t${teamIndex + 1}`));
  const fixtures = groups.flatMap((teamIds) => roundRobinRounds(teamIds).flat());
  assert.equal(fixtures.length, 24); // 4 groups × 6 fixtures
  for (const [home, away] of fixtures) assert.equal(home.slice(0, 2), away.slice(0, 2));
});

test('group standings use the established points, goal difference, goals-for, and name tie-breakers', () => {
  const teams = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }, { id: 'c', name: 'Charlie' }, { id: 'd', name: 'Delta' }];
  const matches = [
    { home_team_id: 'a', away_team_id: 'b', home_score: 2, away_score: 0, status: 'closed' },
    { home_team_id: 'c', away_team_id: 'd', home_score: 1, away_score: 0, status: 'closed' },
  ];
  assert.deepEqual(buildStandings(teams, matches, { points_win: 3, points_draw: 1, points_loss: 0 }).map((row) => row.team.id), ['a', 'c', 'd', 'b']);
});

test('four groups with two qualifiers produces an eight-team knockout bracket', () => {
  assert.equal(validateGroupConfiguration({ groupCount: 4, qualifiersPerGroup: 2, teamCount: 16 }), 8);
  assert.equal(knockoutRoundLabel(8), 'Quarter-final');
  assert.equal(isPowerOfTwo(8), true);
});

test('invalid qualification structures are rejected', () => {
  assert.throws(() => validateGroupConfiguration({ groupCount: 4, qualifiersPerGroup: 3, teamCount: 16 }), /power of two/);
  assert.throws(() => validateGroupConfiguration({ groupCount: 17, qualifiersPerGroup: 1, teamCount: 16 }), /cannot exceed/);
});
