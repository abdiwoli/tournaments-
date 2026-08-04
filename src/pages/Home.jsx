const db = globalThis.__LOCAL_DB__;

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import TournamentCard from "@/components/TournamentCard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";

const sports = ["All", "Football", "Basketball", "Volleyball", "Cricket", "Tennis", "EA FC", "Free Fire", "PUBG", "Chess"];

export default function Home() {
  const { isAuthenticated } = useAuth();
  const [tournaments, setTournaments] = useState([]);
  const [teams, setTeams] = useState([]);
  const [q, setQ] = useState("");
  const [sport, setSport] = useState("All");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [ts, tm] = await Promise.all([
        db.entities.Tournament.list("-created_date", 100),
        db.entities.Team.list("-created_date", 500),
      ]);
      setTournaments(ts);
      setTeams(tm);
      setLoading(false);
    })();
  }, []);

  const counts = useMemo(() => teams.reduce((a, t) => ({ ...a, [t.tournament_id]: (a[t.tournament_id] || 0) + 1 }), {}), [teams]);

  const filtered = tournaments.filter((t) =>
    (sport === "All" || t.sport === sport) &&
    [t.name, t.sport, t.description].join(" ").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div>
      <section className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Run tournaments that run themselves.
        </h1>
        {!isAuthenticated && (
          <div className="mt-5 flex gap-3">
            <Link to="/login"><Button className="rounded-full">Log in</Button></Link>
            <Link to="/register"><Button variant="outline" className="rounded-full">Create account</Button></Link>
          </div>
        )}
      </section>

      <div className="sticky top-16 z-30 -mx-5 mb-6 bg-background/80 px-5 py-3 backdrop-blur-xl">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tournaments, sports, organizers" className="h-12 rounded-full border-border/60 bg-card/60 pl-11 backdrop-blur" />
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {sports.map((s) => (
            <button key={s} onClick={() => setSport(s)} className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm transition-colors ${sport === s ? "border-transparent bg-foreground text-background" : "border-border/60 text-muted-foreground hover:text-foreground"}`}>{s}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-3xl bg-muted/60" />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-20 text-center text-muted-foreground">No tournaments found.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((t) => <TournamentCard key={t.id} tournament={t} teamCount={counts[t.id]} />)}
        </div>
      )}
    </div>
  );
}
