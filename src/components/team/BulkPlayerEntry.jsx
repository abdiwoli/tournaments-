const db = globalThis.__LOCAL_DB__;

import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Users } from "lucide-react";

export default function BulkPlayerEntry({ team, onDone }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const names = text.split("\n").map((n) => n.trim()).filter(Boolean);

  const submit = async () => {
    if (names.length === 0) return;
    setBusy(true);
    try {
      await db.entities.Player.bulkCreate(
        names.map((name) => ({ team_id: team.id, tournament_id: team.tournament_id, name }))
      );
      setText("");
      await onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">Bulk add players</span>
        <span className="text-xs text-muted-foreground">{names.length} player{names.length !== 1 ? "s" : ""}</span>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Paste names, one per line…\nMohamed Ali\nAhmed Hassan\nAbdi Nur"}
        rows={6}
        className="mb-3 resize-none"
      />
      <Button onClick={submit} disabled={busy || names.length === 0} className="w-full rounded-full">
        <Users className="w-4 h-4 mr-1" />{busy ? "Adding…" : `Add ${names.length || ""} player${names.length !== 1 ? "s" : ""}`}
      </Button>
    </div>
  );
}
