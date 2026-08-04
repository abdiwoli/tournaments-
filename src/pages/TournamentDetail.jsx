const db = globalThis.__LOCAL_DB__;

import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Star, Users, Calendar, MapPin, Shield, Trash2 } from "lucide-react";
import { isFollowing, permsFor } from "@/lib/permissions";
import TeamsTab from "@/components/tournament/TeamsTab";
import FixturesTab from "@/components/tournament/FixturesTab";
import StandingsTab from "@/components/tournament/StandingsTab";
import StatsTab from "@/components/tournament/StatsTab";
import ManageTab from "@/components/tournament/ManageTab";

export default function TournamentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState(null);
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [players, setPlayers] = useState([]);
  const [goals, setGoals] = useState([]);
  const [appearances, setAppearances] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("Standings");

  const load = useCallback(async () => {
    const [t, tm, ms, ps, gls, apps, perms] = await Promise.all([
      db.entities.Tournament.get(id),
      db.entities.Team.filter({ tournament_id: id }, "created_date", 1000),
      db.entities.Match.filter({ tournament_id: id }, "round", 5000),
      db.entities.Player.filter({ tournament_id: id }, "-goals", 2000),
      db.entities.Goal.filter({ tournament_id: id }, "created_date", 5000),
      db.entities.Appearance.filter({ tournament_id: id }, "created_date", 10000),
      db.entities.TournamentPermission.filter({ tournament_id: id }, "created_date", 5000).catch(() => []),
    ]);
    setTournament(t); setTeams(tm); setMatches(ms); setPlayers(ps); setGoals(gls); setAppearances(apps); setPermissions(perms);
  }, [id]);

  useEffect(() => {
    load();
    db.auth.me().then(setUser).catch(() => setUser(null));
  }, [load]);

  if (!tournament) return <div className="py-24 text-center text-muted-foreground">Loading…</div>;

  const perms = permsFor(tournament, permissions, user);
  const following = isFollowing(permissions, user);

  const follow = async () => {
    if (!user) { db.auth.redirectToLogin(window.location.href); return; }
    await db.entities.TournamentPermission.create({
      tournament_id: tournament.id,
      tournament_owner_id: tournament.created_by_id,
      user_id: user.id,
      user_email: user.email,
      user_name: user.full_name,
      role: "follower",
    });
    await load();
  };

  const unfollow = async () => {
    const mine = permissions.find((p) => p.user_id === user.id);
    if (mine) { await db.entities.TournamentPermission.delete(mine.id); await load(); }
  };

  const claimOwnership = async () => {
    if (!user || tournament.created_by_id) return;
    await db.entities.Tournament.update(tournament.id, { created_by_id: user.id });
    await load();
  };

  const deleteLeague = async () => {
    if (!window.confirm(`Delete "${tournament.name}"? This permanently removes all teams, players, fixtures and results.`)) return;
    await Promise.all([
      db.entities.Goal.deleteMany({ tournament_id: id }).catch(() => {}),
      db.entities.Appearance.deleteMany({ tournament_id: id }).catch(() => {}),
      db.entities.Player.deleteMany({ tournament_id: id }).catch(() => {}),
      db.entities.Match.deleteMany({ tournament_id: id }).catch(() => {}),
      db.entities.Team.deleteMany({ tournament_id: id }).catch(() => {}),
      db.entities.TournamentPermission.deleteMany({ tournament_id: id }).catch(() => {}),
    ]);
    await db.entities.Tournament.delete(id);
    navigate("/");
  };

  const tabs = ["Standings", "Fixtures", "Teams", "Stats", ...(perms.manage ? ["Manage"] : [])];

  return (
    <div>
      <div className="rounded-3xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl sm:p-8">
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-foreground/90 to-foreground/60 text-xl font-semibold text-background">
            {tournament.name[0].toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{tournament.name}</h1>
            <p className="text-sm text-muted-foreground">{tournament.sport} · {tournament.format.replace("_", " ")} · {tournament.status}</p>
          </div>
          {user ? (
            <Button variant={following ? "secondary" : "outline"} className="rounded-full" onClick={following ? unfollow : follow}>
              <Star className={`w-4 h-4 mr-1 ${following ? "fill-current" : ""}`} />{following ? "Following" : "Follow"}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Link to="/login"><Button variant="outline" className="rounded-full"><Star className="w-4 h-4 mr-1" />Log in</Button></Link>
              <Link to="/register"><Button className="rounded-full">Sign up</Button></Link>
            </div>
          )}
          {perms.manage && (
            <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-destructive" onClick={deleteLeague} title="Delete league" aria-label="Delete league"><Trash2 className="w-4 h-4" /></Button>
          )}
          {user && !tournament.created_by_id && (
            <Button variant="outline" className="rounded-full" onClick={claimOwnership}><Shield className="w-4 h-4 mr-1" />Claim ownership</Button>
          )}
        </div>
        {tournament.description && <p className="mt-4 max-w-2xl text-sm text-muted-foreground">{tournament.description}</p>}
        <div className="mt-5 flex flex-wrap gap-3 sm:gap-5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />{teams.length}/{tournament.max_teams} teams</span>
          {tournament.start_date && <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{tournament.start_date}</span>}
          {tournament.venues?.length > 0 && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{tournament.venues.join(", ")}</span>}
          {perms.manage && <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" />Owner</span>}
        </div>
      </div>

      <div className="sticky top-16 z-30 -mx-5 my-6 flex gap-1 overflow-x-auto bg-background/80 px-5 py-2 backdrop-blur-xl">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors ${tab === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{t}</button>
        ))}
      </div>

      {tab === "Standings" && <StandingsTab teams={teams} matches={matches} tournament={tournament} />}
      {tab === "Fixtures" && <FixturesTab tournament={tournament} teams={teams} matches={matches} perms={perms} reload={load} />}
      {tab === "Teams" && <TeamsTab tournament={tournament} teams={teams} canManage={perms.teams} reload={load} />}
      {tab === "Stats" && <StatsTab teams={teams} players={players} matches={matches} goals={goals} appearances={appearances} tournament={tournament} />}
      {tab === "Manage" && perms.manage && <ManageTab tournament={tournament} permissions={permissions} reload={load} />}
    </div>
  );
}
