import { isFinalized } from "./playerStats";

export function buildStandings(teams, matches, tournament) {
  const pw = tournament?.points_win ?? 3;
  const pd = tournament?.points_draw ?? 1;
  const pl = tournament?.points_loss ?? 0;

  const rows = teams.map((t) => ({
    team: t, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0, form: [],
  }));
  const byId = Object.fromEntries(rows.map((r) => [r.team.id, r]));

  matches
    .filter((m) => isFinalized(m) && m.home_score != null && m.away_score != null)
    .forEach((m) => {
      const h = byId[m.home_team_id];
      const a = byId[m.away_team_id];
      if (!h || !a) return;
      h.played++; a.played++;
      h.gf += m.home_score; h.ga += m.away_score;
      a.gf += m.away_score; a.ga += m.home_score;
      if (m.home_score > m.away_score) {
        h.wins++; a.losses++; h.points += pw; a.points += pl; h.form.push("W"); a.form.push("L");
      } else if (m.home_score < m.away_score) {
        a.wins++; h.losses++; a.points += pw; h.points += pl; a.form.push("W"); h.form.push("L");
      } else {
        h.draws++; a.draws++; h.points += pd; a.points += pd; h.form.push("D"); a.form.push("D");
      }
    });

  return rows
    .map((r) => ({ ...r, gd: r.gf - r.ga, form: r.form.slice(-5) }))
    .sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || x.team.name.localeCompare(y.team.name));
}