import React from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Trophy, Compass, LayoutDashboard, Plus, ArrowLeft } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";

const nav = [
  { to: "/", label: "Discover", icon: Compass },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

export default function Layout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const showBack = pathname !== "/";
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(60rem_40rem_at_110%_-10%,hsl(var(--primary)/0.10),transparent),radial-gradient(50rem_30rem_at_-10%_0%,hsl(var(--chart-2)/0.12),transparent)]" />
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/70 backdrop-blur-xl" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-5">
          {showBack && (
            <button onClick={() => navigate(-1)} aria-label="Back" className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-foreground text-background"><Trophy className="w-4 h-4" /></span>
            <span className="font-semibold tracking-tight">Tournament<span className="opacity-50">Pro</span></span>
          </Link>
          <nav className="ml-auto hidden items-center gap-1 sm:flex">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} className={`rounded-full px-4 py-2 text-sm transition-colors ${pathname === n.to ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            <ThemeToggle />
            {isAuthenticated ? (
              <Link to="/create"><Button size="sm" className="rounded-full"><Plus className="w-4 h-4 mr-1" />Create</Button></Link>
            ) : (
              <>
                <Link to="/login"><Button size="sm" variant="ghost" className="rounded-full">Log in</Button></Link>
                <Link to="/register"><Button size="sm" className="rounded-full">Sign up</Button></Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-28 pt-8 sm:pb-16">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      <nav className="fixed bottom-0 z-40 flex w-full border-t border-border/50 bg-background/85 backdrop-blur-xl sm:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {nav.map((n) => (
          <Link key={n.to} to={n.to} className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs ${pathname === n.to ? "text-foreground" : "text-muted-foreground"}`}>
            <n.icon className="w-5 h-5" />{n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
