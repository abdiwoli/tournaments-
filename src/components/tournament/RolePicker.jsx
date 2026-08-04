import React, { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { ROLES } from "@/lib/permissions";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

export default function RolePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const current = ROLES.find((r) => r.value === value);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-1 rounded-full border border-border/60 bg-background px-3 text-sm transition-colors hover:bg-accent"
      >
        {current?.label}
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Choose role</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {ROLES.map((r) => (
              <button
                key={r.value}
                onClick={() => { onChange(r.value); setOpen(false); }}
                className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-colors hover:bg-accent"
              >
                <div>
                  <div className="text-sm font-medium">{r.label}</div>
                  <div className="text-xs text-muted-foreground">{r.desc}</div>
                </div>
                {r.value === value && <Check className="w-4 h-4 text-primary" />}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}