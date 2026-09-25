import React from "react";

export default function GlassCard({ children, className = "" }) {
  return (
    <div className={`glass-card rounded-2xl p-6 ${className}`}>{children}</div>
  );
}
