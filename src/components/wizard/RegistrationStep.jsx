import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function RegistrationStep({ data, set }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-2xl border border-border/60 p-4">
        <div>
          <div className="font-medium">Registration open</div>
          <div className="text-sm text-muted-foreground">Allow teams to register right away.</div>
        </div>
        <Switch checked={data.registration_open} onCheckedChange={(v) => set({ registration_open: v })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Minimum teams</Label>
          <Input type="number" className="mt-2 h-11" value={data.min_teams} onChange={(e) => set({ min_teams: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Maximum teams</Label>
          <Input type="number" className="mt-2 h-11" value={data.max_teams} onChange={(e) => set({ max_teams: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Registration deadline</Label>
          <Input type="date" className="mt-2 h-11" value={data.registration_deadline} onChange={(e) => set({ registration_deadline: e.target.value })} />
        </div>
        <div>
          <Label>Start date</Label>
          <Input type="date" className="mt-2 h-11" value={data.start_date} onChange={(e) => set({ start_date: e.target.value })} />
        </div>
      </div>
      <div>
        <Label>Entry fee (0 for free)</Label>
        <Input type="number" className="mt-2 h-11" value={data.entry_fee} onChange={(e) => set({ entry_fee: Number(e.target.value) })} />
      </div>
      <div>
        <Label>Venues (comma separated)</Label>
        <Input className="mt-2 h-11" value={data.venuesText} onChange={(e) => set({ venuesText: e.target.value })} placeholder="City Arena, North Ground" />
      </div>
    </div>
  );
}