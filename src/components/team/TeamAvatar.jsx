import React, { useState } from "react";

export default function TeamAvatar({ team, size = 40, rounded = "rounded-xl", className = "" }) {
  const [logoErr, setLogoErr] = useState(false);
  const logo = team?.logo_url && !logoErr ? team.logo_url : null;
  const color = team?.color || "#6366f1";
  const initial = team?.name?.[0]?.toUpperCase() || "?";
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden ${rounded} font-semibold text-background ${className}`}
      style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}
    >
      <span>{initial}</span>
      {logo && (
        <img
          src={logo}
          alt={team?.name || ""}
          onError={() => setLogoErr(true)}
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}
    </span>
  );
}