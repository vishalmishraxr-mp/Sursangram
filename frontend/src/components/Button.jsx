import React from "react";

const variants = {
  primary:
    "bg-gradient-to-r from-neon-pink to-neon-violet text-white shadow-glow hover:brightness-110",
  secondary:
    "bg-white/5 border border-white/15 text-white hover:bg-white/10",
  ghost: "text-white/70 hover:text-white",
};

export default function Button({
  children,
  variant = "primary",
  className = "",
  disabled = false,
  ...props
}) {
  return (
    <button
      disabled={disabled}
      className={`px-6 py-3 rounded-xl font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
