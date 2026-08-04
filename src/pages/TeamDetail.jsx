const db = globalThis.__LOCAL_DB__;

import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Upload } from "lucide-react";
import PlayerRow from "@/components/team/PlayerRow";
import BulkPlayerEntry from "@/components/team/BulkPlayerEntry";
import TeamAvatar from "@/components/team/TeamAvatar";
import { computePlayerStats } from "@/lib/playerStats";

export default function TeamDetail() {
  const { id } = useParams();
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [tournament, setTournament] = useState(null);
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({ name: "", number: "", position: "" });
  const [playerMode, setPlayerMode] = useState("single");
  const [hasGoalsPerm, setHasGoalsPerm] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);

  const uploadLogo = async (e) => {
    const f = e.target.files?.[0];
    if (!f || !team) return;
    setLogoBusy(true);
    try {
      const { file_url } = await db.integrations.Core.UploadFile({ file: f });
      await db.entities.Team.update(team.id, { logo_url: file_url });
      await load();
    } finally {
      setLogoBusy(false);
    }
  };

  const load = useCallback(async () => {
    const t = await db.entities.Team.get(id);
    setTeam(t);
    const [ps, tour, goals, matches] = await Promise.all([
      db.entities.Player.filter({ team_id: id }, "number", 200),
      t.tournament_id ? db.entities.Tournament.get(t.tournament_id) : null,
      t.tournament_id ? db.entities.Goal.filter({ tournament_id: t.tournament_id }, "created_date", 5000) : [],
      t.tournament_id ? db.entities.Match.filter({ tournament_id: t.tournament_id }, "round", 5000) : [],
    ]);
    setPlayers(computePlayerStats(ps, goals, matches));
    setTournament(tour);
  }, [id]);

  useEffect(() => { load(); db.auth.me().then(setUser).catch(() => {}); }, [load]);

  useEffect(() => {
    if (!tournament || !user) return;
    db.entities.TournamentPermission.filter({ tournament_id: tournament.id, user_id: user.id }, "created_date", 5)
      .then((perms) => setHasGoalsPerm(perms.some((p) => p.role === "admin" || p.role === "goals")))
      .catch(() => {});
  }, [tournament, user]);

  if (!team) return <div className="py-24 text-center text-muted-foreground">Loading…</div>;

  const canManage = user && (tournament?.created_by_id === user.id || hasGoalsPerm || user.role === "admin");

  const addPlayer = async () => {
    if (!form.name.trim()) return;
    await db.entities.Player.create({
      team_id: team.id, tournament_id: team.tournament_id, name: form.name.trim(),
      number: form.number ? Number(form.number) : undefined, position: form.position,
    });
    setForm({ name: "", number: "", position: "" });
    await load();
  };

  return (
    <div>
      {tournament && (
        <Link to={`/tournament/${tournament.id}`} className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />{tournament.name}
        </Link>
      )}
      <div className="flex items-center gap-4">
        <div className="relative">
          <TeamAvatar team={team} size={56} rounded="rounded-2xl" />
          {canManage && (
            <label className="absolute -bottom-1 -right-1 grid h-6 w-6 cursor-pointer place-items-center rounded-full border border-border bg-background shadow" title="Upload logo">
              <Upload className={`w-3 h-3 ${logoBusy ? "animate-spin" : ""}`} />
              <input type="file" accept="image/*" className="hidden" onChange={uploadLogo} />
            </label>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{team.name}</h1>
          <p className="text-sm text-muted-foreground">{players.length} players{team.coach ? ` · Coach ${team.coach}` : ""}</p>
        </div>
      </div>

      {canManage && (
        <div className="mt-6">
          <div className="mb-3 inline-flex rounded-full border border-border/60 bg-card/60 p-1 text-sm">
            <button onClick={() => setPlayerMode("single")} className={`rounded-full px-4 py-1.5 transition-colors ${playerMode === "single" ? "bg-foreground text-background" : "text-muted-foreground"}`}>Single</button>
            <button onClick={() => setPlayerMode("bulk")} className={`rounded-full px-4 py-1.5 transition-colors ${playerMode === "bulk" ? "bg-foreground text-background" : "text-muted-foreground"}`}>Bulk</button>
          </div>
          {playerMode === "single" ? (
            <div className="flex flex-wrap gap-2">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Player name" className="h-11 flex-1 rounded-full" />
              <Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="#" type="number" className="h-11 w-20 rounded-full" />
              <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Position" className="h-11 w-36 rounded-full" />
              <Button onClick={addPlayer} className="h-11 rounded-full px-5"><Plus className="w-4 h-4 mr-1" />Add</Button>
            </div>
          ) : (
            <BulkPlayerEntry team={team} onDone={load} />
          )}
        </div>
      )}

      <div className="mt-6 divide-y divide-border/40 overflow-hidden rounded-3xl border border-border/60 bg-card/60 backdrop-blur-xl">
        {players.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No players in this squad yet.</p>
        ) : players.map((p) => <PlayerRow key={p.id} player={p} canEdit={canManage} reload={load} />)}
      </div>
    </div>
  );
}
