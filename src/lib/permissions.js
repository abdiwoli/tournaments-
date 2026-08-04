export const ROLES = [
  { value: "follower", label: "Follower", desc: "View only" },
  { value: "results", label: "Match results", desc: "Edit scores" },
  { value: "goals", label: "Player stats", desc: "Goals, assists, cards" },
  { value: "teams", label: "Teams", desc: "Add/remove teams" },
  { value: "fixtures", label: "Fixtures", desc: "Generate schedule" },
  { value: "admin", label: "Full admin", desc: "All permissions" },
];

export function isOwner(tournament, user) {
  return !!user && tournament.created_by_id === user.id;
}

export function isFollowing(permissions, user) {
  return !!user && permissions.some((p) => p.user_id === user.id);
}

// action: 'results' | 'goals' | 'teams' | 'fixtures' | 'admin'
export function can(tournament, permissions, user, action) {
  if (!user) return false;
  if (tournament.created_by_id === user.id) return true;
  if (user.role === "admin") return true;
  const p = permissions.find((perm) => perm.user_id === user.id);
  if (!p) return false;
  if (p.role === "admin") return true;
  return p.role === action;
}

export function permsFor(tournament, permissions, user) {
  return {
    results: can(tournament, permissions, user, "results"),
    goals: can(tournament, permissions, user, "goals"),
    teams: can(tournament, permissions, user, "teams"),
    fixtures: can(tournament, permissions, user, "fixtures"),
    manage: isOwner(tournament, user) || user?.role === "admin",
  };
}