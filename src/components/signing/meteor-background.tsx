"use client";

import React from "react";

interface MeteorBackgroundProps {
  meteorCount?: number;
  className?: string;
}

export function MeteorBackground({ meteorCount = 20, className = "" }: MeteorBackgroundProps) {
  return (
    <div className={`fixed inset-0 overflow-hidden pointer-events-none ${className}`}>
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950" />

      <div className="absolute inset-0">
        <div className="absolute top-[10%] left-[20%] w-1 h-1 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: '0s', animationDuration: '3s' }} />
        <div className="absolute top-[15%] left-[70%] w-0.5 h-0.5 rounded-full bg-white/20 animate-pulse" style={{ animationDelay: '1s', animationDuration: '4s' }} />
        <div className="absolute top-[25%] left-[40%] w-1 h-1 rounded-full bg-white/25 animate-pulse" style={{ animationDelay: '2s', animationDuration: '5s' }} />
        <div className="absolute top-[5%] left-[85%] w-0.5 h-0.5 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: '0.5s', animationDuration: '3.5s' }} />
        <div className="absolute top-[35%] left-[10%] w-1 h-1 rounded-full bg-white/15 animate-pulse" style={{ animationDelay: '1.5s', animationDuration: '4.5s' }} />
        <div className="absolute top-[8%] left-[55%] w-0.5 h-0.5 rounded-full bg-white/20 animate-pulse" style={{ animationDelay: '3s', animationDuration: '3s' }} />
        <div className="absolute top-[45%] left-[30%] w-1 h-1 rounded-full bg-blue-300/20 animate-pulse" style={{ animationDelay: '2.5s', animationDuration: '6s' }} />
        <div className="absolute top-[20%] left-[90%] w-0.5 h-0.5 rounded-full bg-blue-200/15 animate-pulse" style={{ animationDelay: '4s', animationDuration: '3s' }} />
        <div className="absolute top-[55%] left-[75%] w-1 h-1 rounded-full bg-white/20 animate-pulse" style={{ animationDelay: '1.2s', animationDuration: '5s' }} />
        <div className="absolute top-[40%] left-[60%] w-0.5 h-0.5 rounded-full bg-white/25 animate-pulse" style={{ animationDelay: '0.8s', animationDuration: '4s' }} />
      </div>

      {Array.from({ length: meteorCount }).map((_, i) => (
        <div
          key={i}
          className="meteor"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 40 - 10}%`,
            animationDelay: `${Math.random() * 8 + i * 0.4}s`,
            animationDuration: `${Math.random() * 2 + 1.5}s`,
          }}
        />
      ))}

      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60" />
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-slate-950 to-transparent" />
    </div>
  );
}

export function GlowOrb({ color = "blue", size = "lg", className = "", style }: { color?: string; size?: string; className?: string; style?: React.CSSProperties }) {
  const sizeClasses = {
    sm: "w-32 h-32",
    md: "w-64 h-64",
    lg: "w-96 h-96",
  }[size] || "w-96 h-96";

  const colorClasses = {
    blue: "bg-blue-500/10",
    purple: "bg-purple-500/8",
    cyan: "bg-cyan-500/8",
  }[color] || "bg-blue-500/10";

  return (
    <div className={`absolute rounded-full blur-3xl ${sizeClasses} ${colorClasses} ${className}`} style={style} />
  );
}
