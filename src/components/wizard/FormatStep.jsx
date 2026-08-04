import React from "react";
import { Label } from "@/components/ui/label";

const formats = [
  { id: "league", title: "League", desc: "Everyone plays home and away." },
  { id: "round_robin", title: "Round Robin", desc: "Everyone plays each other once." },
  { id: "knockout", title: "Knockout", desc: "Single elimination bracket." },
  { id: "double_elimination", title: "Double Elimination", desc: "Two lives per team." },
  { id: "swiss", title: "Swiss", desc: "Paired by results each round." },
];

const visibilities = [
  { id: "public", title: "Public" },
  { id: "private", title: "Private" },
  { id: "invite_only", title: "Invite only" },
];

export default function FormatStep({ data, set }) {
  return (
    <div className="space-y-6">
      <div>
        <Label>Tournament format</Label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {formats.map((f) => (
            <button key={f.id} type="button" onClick={() => set({ format: f.id })}
              className={`rounded-2xl border p-4 text-left transition-all ${data.format === f.id ? "border-foreground bg-accent/60" : "border-border/60 hover:bg-accent/30"}`}>
              <div className="font-medium">{f.title}</div>
              <div className="text-sm text-muted-foreground">{f.desc}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label>Participation</Label>
        <div className="mt-3 flex flex-wrap gap-2">
          {visibilities.map((v) => (
            <button key={v.id} type="button" onClick={() => set({ visibility: v.id })}
              className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${data.visibility === v.id ? "border-transparent bg-foreground text-background" : "border-border/60 text-muted-foreground hover:text-foreground"}`}>{v.title}</button>
          ))}
        </div>
      </div>
    </div>
  );
}