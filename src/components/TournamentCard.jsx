import React from "react";
import { Link } from "react-router-dom";
import { Calendar, MapPin, Users } from "lucide-react";

const formatLabels = {
  league: "League", knockout: "Knockout", round_robin: "Round Robin",
  swiss: "Swiss", double_elimination: "Double Elimination",
};

export default function TournamentCard({ tournament, teamCount }) {
  const t = tournament;
  return (
    <Link
      to={`/tournament/${t.id}`}
      className="group relative overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/5"
    >
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-foreground/90 to-foreground/60 text-lg font-semibold text-background">
          {t.name?.[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <h3 className="truncate font-semibold tracking-tight">{t.name}</h3>
          <p className="text-sm text-muted-foreground">{t.sport} · {formatLabels[t.format] || t.format}</p>
        </div>
        <span className="ml-auto rounded-full border border-border/60 px-2.5 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
          {t.status}
        </span>
      </div>
      {t.description && <p className="mt-4 line-clamp-2 text-sm text-muted-foreground">{t.description}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />{teamCount ?? 0}/{t.max_teams} teams</span>
        {t.start_date && <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{t.start_date}</span>}
        {t.venues?.[0] && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{t.venues[0]}</span>}
      </div>
    </Link>
  );
}