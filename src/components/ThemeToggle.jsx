import React, { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("tp-theme");
    if (stored !== null) return stored === "dark";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });
  const [manual, setManual] = useState(() => localStorage.getItem("tp-theme") !== null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    if (manual) localStorage.setItem("tp-theme", dark ? "dark" : "light");
  }, [dark, manual]);

  // Auto-sync with system preference when no manual choice is stored
  useEffect(() => {
    if (manual) return;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const handler = (e) => setDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [manual]);

  return (
    <button
      onClick={() => { setManual(true); setDark((d) => !d); }}
      aria-label="Toggle theme"
      className="h-9 w-9 grid place-items-center rounded-full border border-border/60 bg-background/60 backdrop-blur transition-colors hover:bg-accent"
    >
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}