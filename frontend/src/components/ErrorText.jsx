import React from "react";

export default function ErrorText({ children }) {
  if (!children) return null;
  return <p className="text-sm text-red-400 mt-2">{children}</p>;
}
