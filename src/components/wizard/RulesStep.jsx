import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function RulesStep({ data, set }) {
  return (
    <div className="space-y-5">
      <div>
        <Label>Points system</Label>
        <div className="mt-2 grid grid-cols-3 gap-4">
          <div>
            <span className="text-xs text-muted-foreground">Win</span>
            <Input type="number" className="mt-1 h-11" value={data.points_win} onChange={(e) => set({ points_win: Number(e.target.value) })} />
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Draw</span>
            <Input type="number" className="mt-1 h-11" value={data.points_draw} onChange={(e) => set({ points_draw: Number(e.target.value) })} />
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Loss</span>
            <Input type="number" className="mt-1 h-11" value={data.points_loss} onChange={(e) => set({ points_loss: Number(e.target.value) })} />
          </div>
        </div>
      </div>
      <div>
        <Label>Rules &amp; tie breakers</Label>
        <Textarea className="mt-2" rows={5} value={data.rules} onChange={(e) => set({ rules: e.target.value })} placeholder="Extra time, penalty shootouts, tie breaker order…" />
      </div>
    </div>
  );
}