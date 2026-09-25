import React from "react";
import { ArrowUpRight, Github, Instagram, Linkedin, Mail, Sparkles, Heart } from "lucide-react";

const socials = [
  {
    label: "Email",
    href: "mailto:vishalmishraxr@gmail.com",
    icon: Mail,
    iconClass: "text-amber-300",
  },
  {
    label: "GitHub",
    href: "https://github.com/vishalmishraxr-mp",
    icon: Github,
    iconClass: "text-white",
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/vishal_mishra6663/",
    icon: Instagram,
    iconClass: "text-pink-400",
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/vishal-mishra-a49638385/",
    icon: Linkedin,
    iconClass: "text-sky-400",
  },
];

export default function Footer() {
  return (
    <footer className="relative mt-20 overflow-hidden border-t border-white/10 bg-[#080713]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_8%,rgba(236,72,153,0.14),transparent_26%),radial-gradient(circle_at_92%_18%,rgba(34,211,238,0.12),transparent_25%),radial-gradient(circle_at_50%_100%,rgba(124,58,237,0.12),transparent_32%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-400/50 to-transparent" />

      <div className="relative mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_1.35fr_0.8fr] lg:items-start">
          <div className="pt-1">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-fuchsia-300/20 bg-gradient-to-br from-fuchsia-500/20 to-cyan-400/10">
                <Sparkles className="h-5 w-5 text-cyan-300" />
              </div>
              <div>
                <div className="font-display text-xl font-black tracking-tight">
                  Sur<span className="bg-gradient-to-r from-fuchsia-400 via-pink-300 to-cyan-300 bg-clip-text text-transparent">sangram</span>
                </div>
                <p className="text-xs text-white/40">An AI Antakshri</p>
              </div>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-6 text-white/50">
              Sing the line. Find the song. Follow the letter. Let the Sursangram begin.
            </p>
          </div>

          <div className="rounded-[28px] border border-fuchsia-300/15 bg-gradient-to-br from-fuchsia-500/[0.08] via-white/[0.035] to-cyan-400/[0.06] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/55">About Sursangram</h2>
              <Sparkles className="h-3.5 w-3.5 text-fuchsia-300" />
            </div>
            <p className="mt-4 text-base font-semibold leading-7 text-white/85">
              A random night thought that turned into a real full project.
            </p>
            <p className="mt-3 text-sm leading-6 text-white/55">
              Sursangram is a full-stack AI Antakshri built around voice input, lyric-aware song discovery, multiplayer rooms, scoring, song previews, AI opponents, roast moments, and live celebrations.
            </p>
          </div>

          <div className="pt-1">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/55">Connect</h2>
            <div className="mt-5 space-y-1">
              {socials.map(({ label, href, icon: Icon, iconClass }) => (
                <a
                  key={label}
                  href={href}
                  target={label === "Email" ? undefined : "_blank"}
                  rel={label === "Email" ? undefined : "noreferrer"}
                  className="group flex items-center gap-3 border-b border-white/[0.07] py-3 text-sm text-white/55 transition hover:text-white"
                  aria-label={`Connect on ${label}`}
                >
                  <Icon className={`h-5 w-5 shrink-0 ${iconClass}`} />
                  <span>{label}</span>
                  <ArrowUpRight className="ml-auto h-4 w-4 text-white/20 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white/70" />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-center text-xs text-white/35 sm:flex-row sm:text-left">
          <p>© {new Date().getFullYear()} Sursangram. All rights reserved.</p>
          <p className="inline-flex items-center gap-1.5">
            Made with <Heart className="h-3.5 w-3.5 fill-current text-pink-300" /> by <span className="font-semibold text-white/70">Vishal Mishra</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
