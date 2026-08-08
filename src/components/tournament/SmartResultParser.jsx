const db = globalThis.__LOCAL_DB__;

import React, { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Check, AlertTriangle, Sparkles, UserPlus, Trophy, UserCheck } from "lucide-react";
import TeamAvatar from "@/components/team/TeamAvatar";
import { parseWhatsAppReport, suggestClosest } from "@/lib/whatsappParser";
import { isCompletedFixture, resolveFixture } from "@/lib/fixtureResolver";

const extractError = (e) => e?.response?.data?.error || e?.message || "Unknown error";
const teamByIdSafe = (teams, id) => teams.find((team) => team.id === id)?.name || "TBD";
const norm = (s) => (s || "").toLowerCase().trim().replace(/\s+/g, " ");
const nameMatch = (a, b) => {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
};

const StatBadges = ({ s }) => {
  const parts = [];
  if (s.goals > 0) parts.push(<span key="g" className="text-green-600">{s.goals} goal{s.goals !== 1 ? "s" : ""}</span>);
  if (s.assists > 0) parts.push(<span key="a" className="text-blue-600">{s.assists} assist{s.assists !== 1 ? "s" : ""}</span>);
  if (s.yellow_cards > 0) parts.push(<span key="y" className="text-yellow-600">{s.yellow_cards} yellow</span>);
  if (s.red_cards > 0) parts.push(<span key="r" className="text-red-600">{s.red_cards} red</span>);
  if (parts.length === 0) return <span className="text-sm text-muted-foreground">Played (no stats)</span>;
  return <span className="text-sm">{parts.reduce((acc, p, i) => i === 0 ? [p] : [...acc, <span key={`sep${i}`} className="mx-1 text-muted-foreground">·</span>, p], [])}</span>;
};

export default function SmartResultParser({ open, onClose, tournament, teams, matches, currentRound, reload }) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [matchId, setMatchId] = useState("");
  const [homePlayers, setHomePlayers] = useState([]);
  const [awayPlayers, setAwayPlayers] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [motm, setMotm] = useState({ name: "", playerId: "", action: "none", awardType: "", team: "" });
  const [aIsHome, setAIsHome] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [editingCompleted, setEditingCompleted] = useState(false);

  const reset = () => {
    setText(""); setParsed(null); setHomeTeamId(""); setAwayTeamId("");
    setMatchId(""); setHomePlayers([]); setAwayPlayers([]); setParticipants([]); setEditingCompleted(false);
    setMotm({ name: "", playerId: "", action: "none", awardType: "", team: "" }); setAIsHome(true); setError(""); setWarnings([]);
  };

  const close = () => { reset(); onClose(); };

  const parse = async () => {
    if (!text.trim()) return;
    setParsing(true); setError("");
    try {
      const parsed = parseWhatsAppReport(text, teams);
      const result = {
        team_a: parsed.homeTeam,
        team_b: parsed.awayTeam,
        team_a_score: parsed.homeScore,
        team_b_score: parsed.awayScore,
        team_a_participants: parsed.players
          .filter((p) => p.team === parsed.homeTeam)
          .map((p) => ({ name: p.name, goals: p.goals, assists: p.assists, yellow_cards: 0, red_cards: 0 })),
        team_b_participants: parsed.players
          .filter((p) => p.team === parsed.awayTeam)
          .map((p) => ({ name: p.name, goals: p.goals, assists: p.assists, yellow_cards: 0, red_cards: 0 })),
        motm: parsed.manOfTheMatch,
        awardType: parsed.awardType,
        awardTeam: parsed.awardTeam,
      };
      setWarnings(parsed.warnings || []);
      setParsed(result);

      const resolution = resolveFixture({ text, teams, matches, currentRound });
      const [teamA, teamB] = resolution.detectedTeams;

      if (!teamA || !teamB) {
        setError(`Could not resolve two report teams to registered tournament teams. Found: "${result.team_a}" and "${result.team_b}". Please check the team names.`);
        setParsing(false); return;
      }

      let fixture = resolution.fixture;
      if (!fixture && resolution.completedFixture) {
        const completed = resolution.completedFixture;
        const label = `${teamByIdSafe(teams, completed.home_team_id)} vs ${teamByIdSafe(teams, completed.away_team_id)}`;
        if (window.confirm(`This match appears to be already completed.\n\n${label}\n${completed.round_label || `Round ${completed.round}`}\n\nDo you want to edit the completed match?`)) {
          fixture = completed;
          setEditingCompleted(true);
        } else {
          setError("This report was not imported. Completed fixtures are protected; use Edit completed match to change one.");
          setParsing(false); return;
        }
      }

      if (!fixture) {
        setError(`No fixture found between "${teamA.name}" and "${teamB.name}". Create the fixture first.`);
        setParsing(false); return;
      }

      const aIsHome = fixture.home_team_id === teamA.id;
      setAIsHome(aIsHome);
      const homeTeam = aIsHome ? teamA : teamB;
      const awayTeam = aIsHome ? teamB : teamA;
      setHomeTeamId(homeTeam.id);
      setAwayTeamId(awayTeam.id);
      setMatchId(fixture.id);

      const hp = await db.entities.Player.filter({ team_id: homeTeam.id }, "number", 200);
      const ap = await db.entities.Player.filter({ team_id: awayTeam.id }, "number", 200);
      setHomePlayers(hp);
      setAwayPlayers(ap);

      const matchParticipant = (p, players, side) => {
        const found = players.find((pl) => nameMatch(pl.name, p.name));
        const participant = {
          name: p.name,
          goals: p.goals || 0,
          assists: p.assists || 0,
          yellow_cards: p.yellow_cards || 0,
          red_cards: p.red_cards || 0,
          side,
          playerId: found?.id || "",
          action: found ? "matched" : "unmatched",
        };
        if (!found) {
          try {
            const suggestion = suggestClosest(p.name, players);
            if (suggestion) {
              participant.suggestion = suggestion.name;
              participant.suggestionId = suggestion.id;
            }
          } catch (matchingError) {
            // A fuzzy-match problem must never remove a parsed participant.
            console.error("[PlayerMatcher] suggestion failed", { player: p.name, error: matchingError });
          }
        }
        return participant;
      };
      const aParts = (result.team_a_participants || []).map((p) => matchParticipant(p, aIsHome ? hp : ap, aIsHome ? "home" : "away"));
      const bParts = (result.team_b_participants || []).map((p) => matchParticipant(p, aIsHome ? ap : hp, aIsHome ? "away" : "home"));
      setParticipants([...aParts, ...bParts]);
      console.debug("[Parser] Players detected:", aParts.length + bParts.length);

      if (result.motm) {
        const mp = [...hp, ...ap].find((p) => nameMatch(p.name, result.motm));
        setMotm({ name: result.motm, playerId: mp?.id || "", action: mp ? "matched" : "unmatched", awardType: result.awardType, team: result.awardTeam });
      } else {
        setMotm({ name: "", playerId: "", action: "none", awardType: "", team: "" });
      }
    } catch (e) {
      setError(extractError(e));
    } finally {
      setParsing(false);
    }
  };

  useEffect(() => {
    if (!parsed) return;
    (async () => {
      const hp = homeTeamId ? await db.entities.Player.filter({ team_id: homeTeamId }, "number", 200) : [];
      const ap = awayTeamId ? await db.entities.Player.filter({ team_id: awayTeamId }, "number", 200) : [];
      setHomePlayers(hp);
      setAwayPlayers(ap);
    })();
  }, [homeTeamId, awayTeamId]);

  const updateParticipant = (idx, updates) => setParticipants((prev) => prev.map((s, i) => (i === idx ? { ...s, ...updates } : s)));

  const allPlayers = [...homePlayers, ...awayPlayers];
  const teamById = Object.fromEntries(teams.map((t) => [t.id, t]));

  const parsedHomeScore = parsed?.team_a_score !== undefined ? (aIsHome ? parsed.team_a_score : parsed.team_b_score) : undefined;
  const parsedAwayScore = parsed?.team_b_score !== undefined ? (aIsHome ? parsed.team_b_score : parsed.team_a_score) : undefined;
  const computedHomeScore = parsedHomeScore ?? participants.filter((s) => s.side === "home").reduce((sum, s) => sum + s.goals, 0);
  const computedAwayScore = parsedAwayScore ?? participants.filter((s) => s.side === "away").reduce((sum, s) => sum + s.goals, 0);

  const save = async () => {
    const unresolved = participants.filter((s) => !s.playerId && s.action !== "register");
    if (unresolved.length > 0) { setError("Please resolve all unmatched players first (match or register each one)."); return; }
    if (!matchId) { setError("Please select a fixture to save to."); return; }

    setSaving(true); setError("");
    try {
      const match = matches.find((m) => m.id === matchId);
      if (isCompletedFixture(match) && !editingCompleted) {
        setError("Completed fixtures are protected. Explicitly choose Edit completed match first.");
        return;
      }
      const playerMap = [...allPlayers];

      // Register new players
      const resolvedParticipants = [];
      for (const p of participants) {
        let playerId = p.playerId;
        if (p.action === "register") {
          const teamId = p.side === "home" ? homeTeamId : awayTeamId;
          const newPlayer = await db.entities.Player.create({ team_id: teamId, tournament_id: tournament.id, name: p.name });
          playerId = newPlayer.id;
          playerMap.push(newPlayer);
        }
        resolvedParticipants.push({ ...p, playerId });
      }

      // Resolve MOTM
      let motmPlayerId = null, motmPlayerName = null;
      if (motm.playerId && motm.action !== "none") {
        motmPlayerId = motm.playerId;
        motmPlayerName = playerMap.find((p) => p.id === motm.playerId)?.name || motm.name;
      }

      // Replace all event + appearance records for this match
      await db.entities.Goal.deleteMany({ match_id: match.id }).catch(() => {});
      await db.entities.Appearance.deleteMany({ match_id: match.id }).catch(() => {});

      // Create an Appearance record for EVERY listed participant (even zero-stat ones)
      const appearanceRecords = resolvedParticipants.map((p) => ({
        match_id: match.id,
        tournament_id: tournament.id,
        team_id: p.side === "home" ? homeTeamId : awayTeamId,
        player_id: p.playerId,
        player_name: playerMap.find((pl) => pl.id === p.playerId)?.name || p.name,
        goals: p.goals || 0,
        assists: p.assists || 0,
        yellow_cards: p.yellow_cards || 0,
        red_cards: p.red_cards || 0,
        motm: motmPlayerId === p.playerId,
      }));
      if (appearanceRecords.length) await db.entities.Appearance.bulkCreate(appearanceRecords);

      // Update match — closed status, score, MOTM
      await db.entities.Match.update(match.id, {
        home_score: computedHomeScore,
        away_score: computedAwayScore,
        status: "closed",
        motm_player_id: motmPlayerId,
        motm_player_name: motmPlayerName,
      });

      await reload();
      close();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setSaving(false);
    }
  };

  const sortedMatches = [...matches].sort((a, b) => (a.round || 0) - (b.round || 0));
  const matchedCount = participants.filter((p) => p.action === "matched").length;
  const registerCount = participants.filter((p) => p.action === "register").length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5" />Paste match result</DialogTitle>
        </DialogHeader>

        {!parsed ? (
          <div className="space-y-3 py-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Paste a WhatsApp-style match report here…\n\nLEGENDS CUP🏆\nROUND 3\n\nLIVERPOOL ❤️🤍\n\n1: Nasteexo\n2: Haila hadlin\n3: Isku\n4: Hayatt\n\nINTER MILAN 🖤💙\n\n1: Carlito (1A)\n2: Iidle (2G)\n3: Caano (2G)\n4: Wadani (2G)\n\nWINNER INTER MILAN 6:0\n\nMAN OF THE MATCH WADANI"}
              rows={8}
              className="resize-none"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={parse} disabled={parsing || !text.trim()} className="w-full rounded-full">
              {parsing ? "Parsing…" : "Parse report"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {error && <p className="text-sm text-destructive">{error}</p>}
            {warnings.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-center gap-1.5 text-sm font-medium text-amber-700">
                  <AlertTriangle className="w-4 h-4" />Please review before saving
                </div>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-amber-700">
                  {warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            {/* Match selector */}
            <div className="space-y-2">
              <Label>Detected match — confirm before saving</Label>
              <Select value={matchId} onValueChange={setMatchId}>
                <SelectTrigger><SelectValue placeholder="Select a match" /></SelectTrigger>
                <SelectContent>
                  {sortedMatches.filter((m) =>
                    ((m.home_team_id === homeTeamId && m.away_team_id === awayTeamId) || (m.home_team_id === awayTeamId && m.away_team_id === homeTeamId)) &&
                    (!isCompletedFixture(m) || (editingCompleted && m.id === matchId))
                  ).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.round_label || `Round ${m.round}`}: {teamById[m.home_team_id]?.name || "TBD"} vs {teamById[m.away_team_id]?.name || "TBD"}
                      {m.status === "closed" ? " ✓" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Teams & score */}
            <div className="flex items-center justify-center gap-4 rounded-2xl border border-border/60 bg-card/60 p-4">
              <div className="flex flex-1 flex-col items-center gap-1">
                <TeamAvatar team={teamById[homeTeamId]} size={32} />
                <Select value={homeTeamId} onValueChange={setHomeTeamId}>
                  <SelectTrigger className="h-8 w-auto min-w-0 border-0 px-1 text-center text-sm font-medium"><SelectValue placeholder="Team" /></SelectTrigger>
                  <SelectContent>{teams.map((t) => <SelectItem key={t.id} value={t.id} disabled={t.id === awayTeamId}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="text-2xl font-bold tabular-nums">{computedHomeScore} – {computedAwayScore}</div>
              <div className="flex flex-1 flex-col items-center gap-1">
                <TeamAvatar team={teamById[awayTeamId]} size={32} />
                <Select value={awayTeamId} onValueChange={setAwayTeamId}>
                  <SelectTrigger className="h-8 w-auto min-w-0 border-0 px-1 text-center text-sm font-medium"><SelectValue placeholder="Team" /></SelectTrigger>
                  <SelectContent>{teams.map((t) => <SelectItem key={t.id} value={t.id} disabled={t.id === homeTeamId}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Participants — every listed player gets an appearance */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" />Participants ({participants.length})</Label>
                <span className="text-xs text-muted-foreground">{matchedCount} matched · {registerCount} to register · {participants.filter(p => p.action === "unmatched").length} unresolved</span>
              </div>
              {participants.length === 0 ? (
                <p className="text-sm text-muted-foreground">No participants detected.</p>
              ) : participants.map((s, idx) => {
                const playerList = s.side === "home" ? homePlayers : awayPlayers;
                const teamName = s.side === "home" ? teamById[homeTeamId]?.name : teamById[awayTeamId]?.name;
                return (
                  <div key={idx} className={`rounded-xl border p-3 ${s.action === "matched" ? "border-green-500/30 bg-green-500/5" : s.action === "register" ? "border-blue-500/30 bg-blue-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      {s.action === "matched" ? <Check className="w-4 h-4 text-green-600" /> : s.action === "register" ? <UserPlus className="w-4 h-4 text-blue-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                      <span className="font-medium">{s.name}</span>
                      <StatBadges s={s} />
                      <span className="ml-auto text-xs text-muted-foreground">{teamName || "—"}</span>
                    </div>
                    {s.action === "unmatched" && (
                      <div className="mt-2">
                        {s.suggestion && (
                          <p className="mb-1.5 text-xs text-amber-700">
                            Did you mean{" "}
                            <button
                              type="button"
                              onClick={() => updateParticipant(idx, { playerId: s.suggestionId, action: "matched" })}
                              className="font-medium underline"
                            >
                              {s.suggestion}
                            </button>
                            ?
                          </p>
                        )}
                        <Select value={s.playerId} onValueChange={(v) => v === "__register__" ? updateParticipant(idx, { action: "register", playerId: "" }) : updateParticipant(idx, { playerId: v, action: "matched" })}>
                          <SelectTrigger className="h-8"><SelectValue placeholder={`Select player or register "${s.name}"`} /></SelectTrigger>
                          <SelectContent>
                            {playerList.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                            <SelectItem value="__register__">➕ Register "{s.name}" as new player</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {s.action === "register" && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-sm text-blue-600">Will be registered as a new player in {teamName}</span>
                        <button onClick={() => updateParticipant(idx, { action: "unmatched", playerId: "" })} className="text-xs text-muted-foreground underline">cancel</button>
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">Every listed player will receive one appearance, even with 0 goals/assists/cards.</p>
            </div>

            {/* MOTM */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1"><Trophy className="w-3.5 h-3.5 text-amber-500" />{motm.awardType || "Player of the match"}</Label>
              {motm.action === "none" ? (
                <p className="text-sm text-muted-foreground">Not detected in report.</p>
              ) : (
                <>
                  <Select value={motm.playerId} onValueChange={(v) => setMotm((prev) => ({ ...prev, playerId: v, action: "matched" }))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder={`Select player (detected: ${motm.name})`} /></SelectTrigger>
                    <SelectContent>
                      {allPlayers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {motm.team && <p className="text-xs text-muted-foreground">{motm.team}</p>}
                </>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={saving}>Cancel</Button>
          {parsed && <Button onClick={save} disabled={saving}>{saving ? "Closing match…" : "Close match & save"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
