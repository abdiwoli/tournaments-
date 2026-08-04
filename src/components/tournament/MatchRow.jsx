const db = globalThis.__LOCAL_DB__;

import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import { Minus, Plus, Check, Star } from "lucide-react";
import TeamAvatar from "@/components/team/TeamAvatar";

export default function MatchRow({ match, teamsById, canEdit, reload }) {
  const [editing, setEditing] = useState(false);
  const [homePlayers, setHomePlayers] = useState([]);
  const [awayPlayers, setAwayPlayers] = useState([]);
  const [counts, setCounts] = useState({});     // playerId -> goals
  const [assists, setAssists] = useState({});    // playerId -> assists
  const [yellows, setYellows] = useState({});    // playerId -> yellow cards
  const [reds, setReds] = useState({});          // playerId -> red cards
  const [played, setPlayed] = useState({});      // playerId -> bool
  const [motmId, setMotmId] = useState("");      // playerId
  const [busy, setBusy] = useState(false);

  const name = (id) => teamsById[id]?.name || "TBD";
  const finalized = match.status === "completed" || match.status === "closed";
  const homeTeam = teamsById[match.home_team_id];
  const awayTeam = teamsById[match.away_team_id];

  const homeGoals = homePlayers.filter((p) => played[p.id]).reduce((s, p) => s + (counts[p.id] || 0), 0);
  const awayGoals = awayPlayers.filter((p) => played[p.id]).reduce((s, p) => s + (counts[p.id] || 0), 0);

  const enterEdit = async () => {
    setEditing(true);
    // For closed matches, load the official participants from Appearance records.
    // For open matches, load the full squad (current behavior).
    if (match.status === "closed") {
      const [appearances] = await Promise.all([
        db.entities.Appearance.filter({ match_id: match.id }, "created_date", 500),
      ]);
      const hp = appearances.filter((a) => a.team_id === match.home_team_id);
      const ap = appearances.filter((a) => a.team_id === match.away_team_id);
      // Build lightweight player objects from appearance records
      const toPlayer = (a) => ({ id: a.player_id, name: a.player_name, team_id: a.team_id, number: null });
      const homeP = hp.map(toPlayer);
      const awayP = ap.map(toPlayer);
      setHomePlayers(homeP);
      setAwayPlayers(awayP);
      const c = {}, as = {}, y = {}, r = {}, pl = {};
      appearances.forEach((a) => {
        c[a.player_id] = a.goals || 0;
        as[a.player_id] = a.assists || 0;
        y[a.player_id] = a.yellow_cards || 0;
        r[a.player_id] = a.red_cards || 0;
        pl[a.player_id] = true; // all appearances are "played"
      });
      setCounts(c); setAssists(as); setYellows(y); setReds(r); setPlayed(pl);
      setMotmId(match.motm_player_id || "");
    } else {
      const [hp, ap, goals] = await Promise.all([
        db.entities.Player.filter({ team_id: match.home_team_id }, "number", 100),
        db.entities.Player.filter({ team_id: match.away_team_id }, "number", 100),
        db.entities.Goal.filter({ match_id: match.id }, "created_date", 500),
      ]);
      setHomePlayers(hp);
      setAwayPlayers(ap);
      // Default everyone as played (admin unchecks those who didn't play)
      const pl = {};
      [...hp, ...ap].forEach((p) => { pl[p.id] = true; });
      setPlayed(pl);
      const c = {}, a = {}, y = {}, r = {};
      goals.forEach((g) => {
        c[g.player_id] = (c[g.player_id] || 0) + (g.count ?? 1);
        a[g.player_id] = (a[g.player_id] || 0) + (g.assists || 0);
        y[g.player_id] = (y[g.player_id] || 0) + (g.yellow_cards || 0);
        r[g.player_id] = (r[g.player_id] || 0) + (g.red_cards || 0);
      });
      setCounts(c); setAssists(a); setYellows(y); setReds(r);
      setMotmId(match.motm_player_id || "");
    }
  };

  const bump = (pid, delta) => setCounts((c) => ({ ...c, [pid]: Math.max(0, (c[pid] || 0) + delta) }));
  const bumpAssist = (pid, delta) => setAssists((a) => ({ ...a, [pid]: Math.max(0, (a[pid] || 0) + delta) }));
  const bumpYellow = (pid, delta) => setYellows((y) => ({ ...y, [pid]: Math.max(0, (y[pid] || 0) + delta) }));
  const bumpRed = (pid, delta) => setReds((r) => ({ ...r, [pid]: Math.max(0, (r[pid] || 0) + delta) }));
  const togglePlayed = (pid) => setPlayed((p) => ({ ...p, [pid]: !p[pid] }));

  const save = async () => {
    setBusy(true);
    try {
      const allPlayers = [...homePlayers, ...awayPlayers];
      const playedPlayers = allPlayers.filter((p) => played[p.id]);

      // Replace all event + appearance records for this match
      await db.entities.Goal.deleteMany({ match_id: match.id }).catch(() => {});
      await db.entities.Appearance.deleteMany({ match_id: match.id }).catch(() => {});

      // Create an Appearance record for every played participant (even zero-stat ones)
      const motmPlayer = playedPlayers.find((p) => p.id === motmId);
      const appearanceRecords = playedPlayers.map((p) => ({
        match_id: match.id,
        tournament_id: match.tournament_id,
        team_id: p.team_id,
        player_id: p.id,
        player_name: p.name,
        goals: counts[p.id] || 0,
        assists: assists[p.id] || 0,
        yellow_cards: yellows[p.id] || 0,
        red_cards: reds[p.id] || 0,
        motm: motmId === p.id,
      }));
      if (appearanceRecords.length) await db.entities.Appearance.bulkCreate(appearanceRecords);

      // Match score derived from played players' goals; status closed
      await db.entities.Match.update(match.id, {
        home_score: homeGoals,
        away_score: awayGoals,
        status: "closed",
        motm_player_id: motmId || null,
        motm_player_name: motmPlayer?.name || null,
      });

      setEditing(false);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const Counter = ({ pid, label, value, bumpFn, colorClass }) => (
    <div className="flex items-center gap-0.5 sm:gap-1">
      <span className={`hidden text-[10px] font-medium sm:inline ${colorClass || "text-muted-foreground"}`}>{label}</span>
      <button onClick={() => bumpFn(pid, -1)} disabled={value === 0} className="grid h-5 w-5 place-items-center rounded-full border border-border/60 text-muted-foreground hover:text-foreground disabled:opacity-30 sm:h-6 sm:w-6"><Minus className="w-3 h-3" /></button>
      <span className="w-3 text-center text-sm font-semibold tabular-nums sm:w-4">{value}</span>
      <button onClick={() => bumpFn(pid, 1)} className="grid h-5 w-5 place-items-center rounded-full border border-border/60 text-muted-foreground hover:text-foreground sm:h-6 sm:w-6"><Plus className="w-3 h-3" /></button>
    </div>
  );

  const ScorerList = ({ players, team, sideGoals }) => (
    <div className="flex-1">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TeamAvatar team={team} size={20} />
          <span className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{team?.name || "TBD"}</span>
        </div>
        <span className="text-lg font-semibold tabular-nums">{sideGoals}</span>
      </div>
      {players.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">No players in this squad.</p>
      ) : (
        <div className="space-y-1">
          {players.map((p) => {
            const c = counts[p.id] || 0;
            const a = assists[p.id] || 0;
            const y = yellows[p.id] || 0;
            const r = reds[p.id] || 0;
            const isPlayed = !!played[p.id];
            const isMotm = motmId === p.id;
            return (
              <div key={p.id} className={`flex items-center gap-1 rounded-xl px-2 py-1.5 hover:bg-accent/50 ${!isPlayed ? "opacity-40" : ""}`}>
                <button
                  onClick={() => togglePlayed(p.id)}
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${isPlayed ? "border-green-500 bg-green-500 text-white" : "border-border/60 text-transparent"}`}
                  title={isPlayed ? "Played — click to remove" : "Did not play — click to mark played"}
                >
                  <Check className="w-3 h-3" />
                </button>
                <span className="w-5 text-center text-xs text-muted-foreground">{p.number ?? ""}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                {isPlayed && isMotm && <Star className="w-3.5 h-3.5 shrink-0 fill-amber-400 text-amber-400" />}
                {isPlayed && (
                  <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
                    <Counter pid={p.id} label="G" value={c} bumpFn={bump} colorClass="text-green-600" />
                    <Counter pid={p.id} label="A" value={a} bumpFn={bumpAssist} colorClass="text-blue-600" />
                    <Counter pid={p.id} label="Y" value={y} bumpFn={bumpYellow} colorClass="text-yellow-600" />
                    <Counter pid={p.id} label="R" value={r} bumpFn={bumpRed} colorClass="text-red-600" />
                    <button
                      onClick={() => setMotmId((prev) => (prev === p.id ? "" : p.id))}
                      className={`grid h-5 w-5 place-items-center rounded-full border ${isMotm ? "border-amber-400 bg-amber-400/20" : "border-border/60 text-muted-foreground hover:text-amber-500"}`}
                      title={isMotm ? "Player of the match" : "Set as player of the match"}
                    >
                      <Star className={`w-3 h-3 ${isMotm ? "fill-amber-400 text-amber-400" : ""}`} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="px-4 py-3 text-sm sm:px-5 sm:py-4">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex-1 truncate text-right">{name(match.home_team_id)}</div>
        {editing ? (
          <span className="min-w-[50px] rounded-full bg-accent px-2 py-1 text-center font-semibold tabular-nums sm:min-w-[60px] sm:px-3">{homeGoals} – {awayGoals}</span>
        ) : (
          <button
            disabled={!canEdit}
            onClick={enterEdit}
            className={`min-w-[60px] rounded-full border px-2 py-1 text-center font-semibold tabular-nums sm:min-w-[74px] sm:px-3 ${finalized ? "border-transparent bg-accent" : "border-border/60 text-muted-foreground"} ${canEdit ? "hover:border-foreground" : ""}`}
          >
            {finalized ? `${match.home_score} – ${match.away_score}` : "vs"}
          </button>
        )}
        <div className="flex-1 truncate">{name(match.away_team_id)}</div>
        {match.venue && <span className="hidden w-32 truncate text-right text-xs text-muted-foreground sm:block">{match.venue}</span>}
      </div>

      {editing && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Check className="w-3.5 h-3.5 text-green-500" />
            <span>Tick the players who actually played. Only ticked players get an appearance when the match is closed.</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ScorerList players={homePlayers} team={homeTeam} sideGoals={homeGoals} />
            <ScorerList players={awayPlayers} team={awayTeam} sideGoals={awayGoals} />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="rounded-full" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" className="rounded-full" disabled={busy} onClick={save}>{busy ? "Saving…" : "Close match"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
