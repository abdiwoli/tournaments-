import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function FixtureForm({ open, onClose, onSave, tournament, teams, existingMatches = [], match }) {
  const [form, setForm] = useState({
    home_team_id: "", away_team_id: "", round: 1, round_label: "", venue: "", scheduled_at: "",
  });

  useEffect(() => {
    if (match) {
      setForm({
        home_team_id: match.home_team_id || "",
        away_team_id: match.away_team_id || "",
        round: match.round || 1,
        round_label: match.round_label || "",
        venue: match.venue || "",
        scheduled_at: match.scheduled_at ? match.scheduled_at.slice(0, 16) : "",
      });
    } else {
      setForm({ home_team_id: "", away_team_id: "", round: 1, round_label: "", venue: "", scheduled_at: "" });
    }
  }, [match, open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const canSave = form.home_team_id && form.away_team_id && form.home_team_id !== form.away_team_id;

  const selectedRound = Number(form.round) || 1;
  const existingInRound = existingMatches.filter((m) => m.round === selectedRound && (!match || m.id !== match.id));

  // A team is busy in this round if it appears in ANY existing fixture (either side)
  const teamBusyInRound = (teamId) => teamId && existingInRound.some((m) => m.home_team_id === teamId || m.away_team_id === teamId);

  // Same pairing already exists
  const isDuplicate = (homeId, awayId) => homeId && awayId && existingInRound.some((m) => (m.home_team_id === homeId && m.away_team_id === awayId) || (m.home_team_id === awayId && m.away_team_id === homeId));

  const homeBusy = teamBusyInRound(form.home_team_id);
  const awayBusy = teamBusyInRound(form.away_team_id);
  const duplicateError = isDuplicate(form.home_team_id, form.away_team_id);

  const teamName = (id) => teams.find((t) => t.id === id)?.name || "This team";
  const scheduleError = homeBusy ? `${teamName(form.home_team_id)} already has a match in Round ${selectedRound}. A team can only play once per round.`
    : awayBusy ? `${teamName(form.away_team_id)} already has a match in Round ${selectedRound}. A team can only play once per round.`
    : null;

  const hasError = !!scheduleError || duplicateError;

  const save = () => {
    if (!canSave || hasError) return;
    onSave({
      home_team_id: form.home_team_id,
      away_team_id: form.away_team_id,
      round: Number(form.round) || 1,
      round_label: form.round_label.trim() || `Round ${Number(form.round) || 1}`,
      venue: form.venue || undefined,
      scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{match ? "Edit fixture" : "Add fixture"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Home team</Label>
            <Select value={form.home_team_id} onValueChange={(v) => set("home_team_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
              <SelectContent>
                {teams.map((t) => { const dup = isDuplicate(t.id, form.away_team_id); const busy = teamBusyInRound(t.id); return <SelectItem key={t.id} value={t.id} disabled={t.id === form.away_team_id || dup || busy}>{t.name}{busy ? " (already in round)" : dup ? " (already in round)" : ""}</SelectItem>; })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Away team</Label>
            <Select value={form.away_team_id} onValueChange={(v) => set("away_team_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
              <SelectContent>
                {teams.map((t) => { const dup = isDuplicate(form.home_team_id, t.id); const busy = teamBusyInRound(t.id); return <SelectItem key={t.id} value={t.id} disabled={t.id === form.home_team_id || dup || busy}>{t.name}{busy ? " (already in round)" : dup ? " (already in round)" : ""}</SelectItem>; })}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Round</Label>
              <Input type="number" min={1} value={form.round} onChange={(e) => set("round", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Round label</Label>
              <Input value={form.round_label} onChange={(e) => set("round_label", e.target.value)} placeholder="e.g. Matchday 1" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Venue</Label>
            <Input value={form.venue} onChange={(e) => set("venue", e.target.value)} placeholder="Stadium" list="fixture-venues" />
            <datalist id="fixture-venues">
              {(tournament?.venues || []).map((v) => <option key={v} value={v} />)}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label>Scheduled date & time</Label>
            <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => set("scheduled_at", e.target.value)} />
          </div>
        </div>
        {scheduleError && <p className="text-sm text-destructive">{scheduleError}</p>}
        {duplicateError && <p className="text-sm text-destructive">These teams already have a fixture in this round.</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!canSave || hasError}>{match ? "Save changes" : "Create fixture"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}