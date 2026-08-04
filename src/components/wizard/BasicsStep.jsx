import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const sports = ["Football", "Basketball", "Volleyball", "Cricket", "Tennis", "EA FC", "Free Fire", "PUBG", "Chess"];

export default function BasicsStep({ data, set }) {
  return (
    <div className="space-y-5">
      <div>
        <Label>Tournament name</Label>
        <Input className="mt-2 h-11" value={data.name} onChange={(e) => set({ name: e.target.value })} placeholder="Summer Champions Cup" />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea className="mt-2" rows={3} value={data.description} onChange={(e) => set({ description: e.target.value })} placeholder="What is this tournament about?" />
      </div>
      <div>
        <Label>Sport</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {sports.map((s) => (
            <button key={s} type="button" onClick={() => set({ sport: s })} className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${data.sport === s ? "border-transparent bg-foreground text-background" : "border-border/60 text-muted-foreground hover:text-foreground"}`}>{s}</button>
          ))}
        </div>
        <Input className="mt-3 h-11" value={data.sport} onChange={(e) => set({ sport: e.target.value })} placeholder="Or type a custom sport" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Season</Label>
          <Input className="mt-2 h-11" value={data.season} onChange={(e) => set({ season: e.target.value })} placeholder="2026" />
        </div>
        <div>
          <Label>Age category</Label>
          <Input className="mt-2 h-11" value={data.age_category} onChange={(e) => set({ age_category: e.target.value })} placeholder="Open / U18" />
        </div>
      </div>
      <div>
        <Label>Gender</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {["open", "men", "women", "mixed"].map((g) => (
            <button key={g} type="button" onClick={() => set({ gender: g })} className={`rounded-full border px-4 py-1.5 text-sm capitalize transition-colors ${data.gender === g ? "border-transparent bg-foreground text-background" : "border-border/60 text-muted-foreground hover:text-foreground"}`}>{g}</button>
          ))}
        </div>
      </div>
    </div>
  );
}