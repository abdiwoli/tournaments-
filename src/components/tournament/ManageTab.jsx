const db = globalThis.__LOCAL_DB__;

import React from "react";

import { ROLES } from "@/lib/permissions";
import { Star, Trash2, Shield } from "lucide-react";
import RolePicker from "@/components/tournament/RolePicker";

export default function ManageTab({ tournament, permissions, reload }) {
  const followers = permissions.filter((p) => p.role === "follower");
  const staff = permissions.filter((p) => p.role !== "follower");

  const setRole = async (perm, role) => {
    await db.entities.TournamentPermission.update(perm.id, { role, granted_by_id: tournament.created_by_id });
    await reload();
  };

  const revoke = async (perm) => {
    await db.entities.TournamentPermission.delete(perm.id);
    await reload();
  };

  const Row = ({ p }) => (
    <div className="flex flex-wrap items-center gap-3 px-5 py-4">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-xs font-semibold">
        {(p.user_name || p.user_email || "?")[0].toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{p.user_name || "User"}</div>
        <div className="truncate text-xs text-muted-foreground">{p.user_email}</div>
      </div>
      <RolePicker value={p.role} onChange={(role) => setRole(p, role)} />
      <button onClick={() => revoke(p)} aria-label="Revoke" className="text-muted-foreground hover:text-destructive">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border/60 bg-card/60 p-5 backdrop-blur-xl">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-medium"><Shield className="w-4 h-4" />Permission roles</h3>
        <p className="mb-4 text-xs text-muted-foreground">Grant a follower a role to let them help manage this tournament. Full admin can do everything.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r.value} className="flex items-center gap-3 rounded-2xl border border-border/40 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{r.label}</div>
                <div className="text-xs text-muted-foreground">{r.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Star className="w-3.5 h-3.5" />Followers ({followers.length})
        </h3>
        <div className="divide-y divide-border/40 overflow-hidden rounded-3xl border border-border/60 bg-card/60 backdrop-blur-xl">
          {followers.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No followers yet.</p>
          ) : followers.map((p) => <Row key={p.id} p={p} />)}
        </div>
      </div>

      {staff.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Staff ({staff.length})</h3>
          <div className="divide-y divide-border/40 overflow-hidden rounded-3xl border border-border/60 bg-card/60 backdrop-blur-xl">
            {staff.map((p) => <Row key={p.id} p={p} />)}
          </div>
        </div>
      )}
    </div>
  );
}
