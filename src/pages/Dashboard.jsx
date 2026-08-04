const db = globalThis.__LOCAL_DB__;

import React, { useEffect, useState } from "react";

import TournamentCard from "@/components/TournamentCard";
import { Trophy, Star } from "lucide-react";
import AccountSettingsSheet from "@/components/AccountSettingsSheet";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [memberships, setMemberships] = useState([]);

  useEffect(() => {
    (async () => {
      const me = await db.auth.me();
      setUser(me);
      const [ts, ps] = await Promise.all([
        db.entities.Tournament.list("-created_date", 200),
        db.entities.TournamentPermission.filter({ user_id: me.id }, "created_date", 200),
      ]);
      setTournaments(ts);
      setMemberships(ps);
    })();
  }, []);

  const mine = tournaments.filter((t) => t.created_by_id === user?.id);
  const followedIds = new Set(memberships.map((p) => p.tournament_id));
  const followed = tournaments.filter((t) => followedIds.has(t.id) && t.created_by_id !== user?.id);

  const Section = ({ icon: Icon, title, items, empty }) => (
    <section className="mb-10">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold tracking-tight"><Icon className="w-4 h-4" />{title}</h2>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
        <div className="grid gap-4 sm:grid-cols-2">{items.map((t) => <TournamentCard key={t.id} tournament={t} />)}</div>
      )}
    </section>
  );

  return (
    <div>
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">
          {user?.full_name ? `Welcome back, ${user.full_name.split(" ")[0]}` : "Your dashboard"}
        </h1>
        <AccountSettingsSheet user={user} />
      </div>

      <Section icon={Trophy} title="Tournaments you organize" items={mine} empty="You haven't created a tournament yet." />
      <Section icon={Star} title="Following" items={followed} empty="Follow a tournament to see it here." />
    </div>
  );
}
