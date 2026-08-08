const db = globalThis.__LOCAL_DB__;

import React, { useMemo, useState } from "react";

import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Shuffle, Trash2, Plus, Pencil, Zap, ClipboardPaste, RotateCcw } from "lucide-react";
import { generateFixtures } from "@/lib/fixtures";
import MatchRow from "@/components/tournament/MatchRow";
import FixtureForm from "@/components/tournament/FixtureForm";
import SmartResultParser from "@/components/tournament/SmartResultParser";

export default function FixturesTab({ tournament, teams, matches, perms, reload }) {
  const canManage = perms?.fixtures;
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("automatic");
  const [genRound, setGenRound] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showParser, setShowParser] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null);
  const [activeRound, setActiveRound] = useState(null);
  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);

  const generate = async (maxRound) => {
    setBusy(true);
    try {
      if (maxRound) {
        const ids = matches.filter((m) => (m.round || 1) <= maxRound).map((m) => m.id);
        if (ids.length) {
          await db.entities.Goal.deleteMany({ match_id: { $in: ids } }).catch(() => {});
          await db.entities.Appearance.deleteMany({ match_id: { $in: ids } }).catch(() => {});
        }
        await db.entities.Match.deleteMany({ tournament_id: tournament.id, round: { $lte: maxRound } });
      } else {
        await db.entities.Goal.deleteMany({ tournament_id: tournament.id }).catch(() => {});
        await db.entities.Appearance.deleteMany({ tournament_id: tournament.id }).catch(() => {});
        await db.entities.Match.deleteMany({ tournament_id: tournament.id });
      }
      const fixtures = generateFixtures({
        format: tournament.format, teams, tournamentId: tournament.id, venues: tournament.venues || [], maxRound,
      });
      if (fixtures.length) await db.entities.Match.bulkCreate(fixtures);
      await db.entities.Tournament.update(tournament.id, { status: "ongoing" });
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await db.entities.Goal.deleteMany({ tournament_id: tournament.id }).catch(() => {});
      await db.entities.Appearance.deleteMany({ tournament_id: tournament.id }).catch(() => {});
      await db.entities.Match.deleteMany({ tournament_id: tournament.id });
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const deleteMatch = async (id) => {
    await db.entities.Goal.deleteMany({ match_id: id }).catch(() => {});
    await db.entities.Appearance.deleteMany({ match_id: id }).catch(() => {});
    await db.entities.Match.delete(id);
    await reload();
  };

  const resetResult = async (m) => {
    if (!window.confirm("Reset this match result? The fixture will be kept but all scores and player stats will be cleared.")) return;
    setBusy(true);
    try {
      await db.entities.Goal.deleteMany({ match_id: m.id }).catch(() => {});
      await db.entities.Appearance.deleteMany({ match_id: m.id }).catch(() => {});
      await db.entities.Match.update(m.id, { home_score: null, away_score: null, status: "scheduled", motm_player_id: null, motm_player_name: null });
      await reload();
    } finally { setBusy(false); }
  };

  const saveFixture = async (data) => {
    // Backend validation: enforce one match per team per round
    try {
      const res = await db.functions.invoke("validateFixture", {
        tournament_id: tournament.id,
        round: data.round,
        home_team_id: data.home_team_id,
        away_team_id: data.away_team_id,
        match_id: editingMatch?.id,
      });
      if (res.data?.error) {
        toast({ title: "Cannot create fixture", description: res.data.error, variant: "destructive" });
        return;
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "Validation failed";
      toast({ title: "Cannot create fixture", description: msg, variant: "destructive" });
      return;
    }

    if (editingMatch) {
      await db.entities.Match.update(editingMatch.id, data);
    } else {
      await db.entities.Match.create({ tournament_id: tournament.id, status: "scheduled", ...data });
    }
    setShowForm(false);
    setEditingMatch(null);
    await reload();
  };

  const roundNumbers = useMemo(() => {
    const set = new Set(matches.map((m) => m.round || 1));
    return [...set].sort((a, b) => a - b);
  }, [matches]);

  const currentRound = activeRound ?? roundNumbers[0] ?? null;

  const rounds = useMemo(() => {
    const map = {};
    matches.filter((m) => (m.round || 1) === currentRound).forEach((m) => { (map[m.round_label || `Round ${m.round}`] ||= []).push(m); });
    return Object.entries(map);
  }, [matches, currentRound]);

  return (
    <div>
      {canManage && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button onClick={() => setShowParser(true)} variant="outline" className="rounded-full"><ClipboardPaste className="w-4 h-4 mr-1" />Paste result</Button>
            <div className="inline-flex rounded-full border border-border/60 bg-card/60 p-1 text-sm">
              <button onClick={() => setMode("automatic")} className={`rounded-full px-4 py-1.5 transition-colors ${mode === "automatic" ? "bg-foreground text-background" : "text-muted-foreground"}`}>
                <Zap className="mr-1 inline w-3.5 h-3.5" />Automatic
              </button>
              <button onClick={() => setMode("manual")} className={`rounded-full px-4 py-1.5 transition-colors ${mode === "manual" ? "bg-foreground text-background" : "text-muted-foreground"}`}>
                <Pencil className="mr-1 inline w-3.5 h-3.5" />Manual
              </button>
            </div>
          </div>

          {mode === "automatic" ? (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <Button onClick={() => generate(genRound ? Number(genRound) : undefined)} disabled={busy || teams.length < 2} className="rounded-full">
                <Shuffle className="w-4 h-4 mr-1" />{genRound ? `Generate to round ${genRound}` : "Generate all fixtures"}
              </Button>
              <div className="flex items-center gap-2 rounded-full border border-border/60 px-3 py-1.5 text-sm">
                <span className="text-muted-foreground">Up to round</span>
                <input type="number" min={1} value={genRound} onChange={(e) => setGenRound(e.target.value)} placeholder="All" className="w-16 bg-transparent text-center outline-none" />
              </div>
              {matches.length > 0 && <Button variant="ghost" onClick={clear} disabled={busy} className="rounded-full"><Trash2 className="w-4 h-4 mr-1" />Clear all</Button>}
            </div>
          ) : (
            <div className="mb-5">
              <Button onClick={() => { setEditingMatch(null); setShowForm(true); }} disabled={busy || teams.length < 2} className="rounded-full">
                <Plus className="w-4 h-4 mr-1" />Add fixture
              </Button>
            </div>
          )}
        </>
      )}

      {matches.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {teams.length < 2 ? "Register at least 2 teams to create a schedule." : "No fixtures yet."}
        </p>
      ) : (
        <div>
          {roundNumbers.length > 1 && (
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {roundNumbers.map((r) => (
                <button key={r} onClick={() => setActiveRound(r)} className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors ${currentRound === r ? "bg-foreground text-background" : "border border-border/60 text-muted-foreground hover:text-foreground"}`}>Round {r}</button>
              ))}
            </div>
          )}
          <div className="space-y-6">
          {rounds.map(([label, ms]) => (
            <div key={label}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</h3>
              <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/60 backdrop-blur-xl">
                {ms.map((m, i) => (
                  <div key={m.id} className={`relative ${i < ms.length - 1 ? "border-b border-border/40" : ""}`}>
                    {canManage && (
                      <div className="absolute right-3 top-3 z-10 flex gap-1">
                        {(m.status === "completed" || m.status === "closed") && <button onClick={() => resetResult(m)} disabled={busy} className="text-muted-foreground transition-colors hover:text-foreground" title="Reset result"><RotateCcw className="w-3.5 h-3.5" /></button>}
                        <button onClick={() => { setEditingMatch(m); setShowForm(true); }} className="text-muted-foreground transition-colors hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteMatch(m.id)} className="text-muted-foreground transition-colors hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                    <MatchRow match={m} teamsById={teamsById} canEdit={perms?.results} reload={reload} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          </div>
        </div>
      )}

      <FixtureForm open={showForm} onClose={() => { setShowForm(false); setEditingMatch(null); }} onSave={saveFixture} tournament={tournament} teams={teams} existingMatches={matches} match={editingMatch} />
      {showParser && <SmartResultParser open={showParser} onClose={() => setShowParser(false)} tournament={tournament} teams={teams} matches={matches} currentRound={currentRound} reload={reload} />}
    </div>
  );
}
