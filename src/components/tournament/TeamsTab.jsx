const db = globalThis.__LOCAL_DB__;

import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, ChevronRight, Search, Upload, X } from "lucide-react";
import { KNOWN_TEAMS } from "@/lib/knownTeams";
import TeamAvatar from "@/components/team/TeamAvatar";

export default function TeamsTab({ tournament, teams, canManage, reload }) {
  const [mode, setMode] = useState("known");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customLogo, setCustomLogo] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  const existing = useMemo(() => new Set(teams.map((t) => t.name.toLowerCase())), [teams]);
  const filtered = KNOWN_TEAMS.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));

  const addKnown = async (t) => {
    if (existing.has(t.name.toLowerCase())) return;
    setBusy(true);
    await db.entities.Team.create({ tournament_id: tournament.id, name: t.name, logo_url: t.logo, color: t.color });
    await reload();
    setBusy(false);
  };

  const onLogo = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const { file_url } = await db.integrations.Core.UploadFile({ file: f });
      setCustomLogo(file_url);
    } finally {
      setBusy(false);
    }
  };

  const addCustom = async () => {
    if (!customName.trim()) return;
    setBusy(true);
    await db.entities.Team.create({ tournament_id: tournament.id, name: customName.trim(), logo_url: customLogo || undefined });
    setCustomName("");
    setCustomLogo("");
    await reload();
    setBusy(false);
  };

  const removeTeam = async (id) => {
    await db.entities.Team.delete(id);
    await reload();
  };

  return (
    <div>
      {/* Enrolled teams — primary view */}
      {teams.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No teams registered yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {teams.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl">
              <TeamAvatar team={t} size={40} />
              <Link to={`/team/${t.id}`} className="min-w-0 flex-1">
                <div className="truncate font-medium">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.city || "Squad & stats"}</div>
              </Link>
              {canManage && (
                <button onClick={() => removeTeam(t.id)} aria-label="Remove team" className="text-muted-foreground transition-colors hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          ))}
        </div>
      )}

      {/* Add teams — collapsible, managers only */}
      {canManage && (
        !showPicker ? (
          <button onClick={() => setShowPicker(true)} className="mt-4 flex w-full items-center justify-center gap-1 rounded-2xl border border-dashed border-border/60 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <Plus className="w-4 h-4" /> Add teams
          </button>
        ) : (
          <div className="mt-4 rounded-3xl border border-border/60 bg-card/60 p-3 backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-sm font-medium">Add teams</span>
              <button onClick={() => setShowPicker(false)} className="text-xs text-muted-foreground hover:text-foreground">Done</button>
            </div>
            <div className="mb-3 inline-flex rounded-full border border-border/60 bg-background p-1 text-sm">
              <button onClick={() => setMode("known")} className={`rounded-full px-4 py-1.5 transition-colors ${mode === "known" ? "bg-foreground text-background" : "text-muted-foreground"}`}>Known teams</button>
              <button onClick={() => setMode("custom")} className={`rounded-full px-4 py-1.5 transition-colors ${mode === "custom" ? "bg-foreground text-background" : "text-muted-foreground"}`}>Custom</button>
            </div>

            {mode === "known" ? (
              <>
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clubs…" className="h-10 rounded-full pl-9" />
                </div>
                <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                  {filtered.map((t) => {
                    const added = existing.has(t.name.toLowerCase());
                    return (
                      <button key={t.name} disabled={added || busy} onClick={() => addKnown(t)} className={`flex items-center gap-2 rounded-2xl border p-2 text-left transition-colors ${added ? "border-border/40 bg-muted/40 opacity-50" : "border-border/60 hover:bg-accent"}`}>
                        <TeamAvatar team={t} size={32} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">{t.name}</span>
                          <span className="block truncate text-[10px] text-muted-foreground">{t.league}</span>
                        </span>
                        {added ? <span className="text-[10px] text-muted-foreground">Added</span> : <Plus className="w-3.5 h-3.5 text-muted-foreground" />}
                      </button>
                    );
                  })}
                  {filtered.length === 0 && <p className="col-span-full py-6 text-center text-xs text-muted-foreground">No clubs match “{q}”.</p>}
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Input value={customName} onChange={(e) => setCustomName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCustom()} placeholder="Team name" className="h-11 rounded-full" />
                  <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-input bg-transparent px-4 text-sm hover:bg-accent">
                    <Upload className="w-4 h-4" />{customLogo ? "Change logo" : "Upload logo"}
                    <input type="file" accept="image/*" className="hidden" onChange={onLogo} />
                  </label>
                  <Button onClick={addCustom} disabled={busy || !customName.trim()} className="h-11 rounded-full px-5"><Plus className="w-4 h-4 mr-1" />Add</Button>
                </div>
                {customLogo && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <TeamAvatar team={{ name: customName || "?", logo_url: customLogo, color: "#6366f1" }} size={28} />
                    Logo ready
                    <button onClick={() => setCustomLogo("")} className="text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </>
            )}
          </div>
        )
      )}
    </div>
  );
}
