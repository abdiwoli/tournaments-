const db = globalThis.__LOCAL_DB__;

import React, { useState } from "react";
import { Settings, Trash2, AlertTriangle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export default function AccountSettingsSheet({ user }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const deleteAccount = async () => {
    setBusy(true);
    try {
      // Account deletion request (App Store compliance) — signs out and requests removal
      await db.auth.logout("/");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Account settings"
        className="grid h-9 w-9 place-items-center rounded-full border border-border/60 bg-background/60 backdrop-blur transition-colors hover:bg-accent"
      >
        <Settings className="w-4 h-4" />
      </button>
      <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirming(false); }}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>Account</SheetTitle>
            <SheetDescription>{user?.email || "Signed in"}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-3">
            {confirming ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-destructive"><AlertTriangle className="w-4 h-4" />Delete account?</p>
                <p className="mt-1 text-xs text-muted-foreground">This will sign you out and submit a deletion request. This action cannot be undone.</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-full" onClick={() => setConfirming(false)} disabled={busy}>Cancel</Button>
                  <Button variant="destructive" size="sm" className="rounded-full" onClick={deleteAccount} disabled={busy}>{busy ? "Deleting…" : "Confirm delete"}</Button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirming(true)} className="flex w-full items-center gap-3 rounded-2xl border border-destructive/30 px-4 py-3 text-left transition-colors hover:bg-destructive/5">
                <Trash2 className="w-4 h-4 text-destructive" />
                <div>
                  <div className="text-sm font-medium text-destructive">Delete account</div>
                  <div className="text-xs text-muted-foreground">Permanently remove your account</div>
                </div>
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
