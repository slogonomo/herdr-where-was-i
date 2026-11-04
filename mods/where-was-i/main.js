// A pane's header, for layouts that frame their panes:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "where-was-i" } } } }
// Shows the program's icon (the app's program table), the agent's name or
// the terminal's title, the folder, and the agent's status; buttons split, zoom and close
// this pane. When a pane recovers as a shell after a reboot/crash (or after an agent exits),
// shows what agent was previously running in this terminal and lets you click to resume it.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, terminals, props, run, hc, theme, home } from "herdr";

const RESUME_CMDS = {
  claude: "claude --continue",
  "claude-code": "claude --continue",
  codex: "codex resume",
  antigravity: "agy",
  agy: "agy",
  opencode: "opencode --continue",
  hermes: "hermes --continue",
  gemini: "gemini",
  pi: "pi",
  cursor: "cursor-agent",
  aider: "aider",
};

const AGENT_ICONS = {
  claude: { icon: "icons/claude.svg", tint: false },
  "claude-code": { icon: "icons/claude.svg", tint: false },
  codex: { icon: "icons/codex.svg", tint: false },
  antigravity: { icon: "icons/antigravity.svg", tint: false },
  agy: { icon: "icons/antigravity.svg", tint: false },
  amp: { icon: "icons/amp.svg", tint: false },
  crush: { icon: "icons/crush.svg", tint: false },
  kimi: { icon: "icons/kimi.svg", tint: false },
  kiro: { icon: "icons/kiro.svg", tint: false },
  pig: { icon: "icons/pig.svg", tint: false },
  opencode: { icon: "icons/opencode.svg", tint: true },
  gemini: { icon: "icons/gemini.svg", tint: true },
  pi: { icon: "icons/pi.svg", tint: true },
  cursor: { icon: "icons/cursor.svg", tint: true },
  grok: { icon: "icons/grok.svg", tint: true },
  hermes: { icon: "icons/hermes.svg", tint: true },
  copilot: { icon: "icons/copilot.svg", tint: true },
  qoder: { icon: "icons/qoder.svg", tint: true },
};

const SHELL_NAMES = new Set(["bash", "zsh", "fish", "sh", "dash", "ksh", "nu", "xonsh", "tcsh", "csh"]);

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  if (cwd === h) return "~";
  if (cwd.startsWith(h + "/")) return "~" + cwd.slice(h.length);
  const m = cwd.match(/^\/(?:home|Users)\/[^/]+(\/.*)?$/);
  if (m) return "~" + (m[1] || "");
  return cwd;
}

function resumeCommandFor(lastName, lastKey) {
  const k = (lastKey || "").toLowerCase();
  if (RESUME_CMDS[k]) return RESUME_CMDS[k];
  const n = (lastName || "").toLowerCase();
  for (const [key, cmd] of Object.entries(RESUME_CMDS)) {
    if (n.includes(key)) return cmd;
  }
  return k || null;
}

function textToHcKeys(cmd) {
  const out = [];
  for (const ch of cmd) {
    if (ch === " ") out.push("space");
    else out.push(ch);
  }
  out.push("enter");
  return out;
}

function lastAgentIconSpec(labels, lastKey, lastName) {
  if (labels["herdr.last_icon"]) {
    return {
      icon: labels["herdr.last_icon"],
      tint: labels["herdr.last_tint"] !== "0",
    };
  }
  const k = (lastKey || "").toLowerCase();
  if (AGENT_ICONS[k]) return AGENT_ICONS[k];
  const n = (lastName || "").toLowerCase();
  for (const [key, spec] of Object.entries(AGENT_ICONS)) {
    if (n.includes(key)) return spec;
  }
  return { icon: "icons/agent.svg", tint: true };
}

function isAtPlainShell(p, term) {
  if (p?.program?.shell) return true;
  // When an OSC 7501 agent exits back to a shell without clearing `app` or `state`,
  // `term.foreground.name` returns to the shell (`bash`, `zsh`, etc.).
  const fgName = (term?.foreground?.name || "").replace(/^-/, "").toLowerCase();
  if (fgName && SHELL_NAMES.has(fgName)) return true;
  return false;
}

export default class Pane extends View {
  init() {
    this.hovered = false;
    this.lastSavedKey = null;
  }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  term(address) {
    if (!address) return null;
    return terminals().find((t) => t.address === address);
  }

  syncAgentMemory(p, term, atShell) {
    if (!p?.terminal || !term || atShell) return;
    if (p.program?.agent) {
      const agentName = p.program.name || p.app || "Agent";
      const agentKey = p.program.key || p.app || "";
      const agentIcon = p.program.icon || "";
      const agentTint = p.program.tint ? "1" : "0";
      const agentCwd = term.foreground?.cwd || p.cwd || term.cwd || "";
      const sig = `${p.terminal}|${agentName}|${agentKey}|${agentIcon}|${agentTint}|${agentCwd}`;
      if (this.lastSavedKey !== sig) {
        this.lastSavedKey = sig;
        hc([
          "label",
          p.terminal,
          `herdr.last_agent=${agentName}`,
          `herdr.last_key=${agentKey}`,
          `herdr.last_icon=${agentIcon}`,
          `herdr.last_tint=${agentTint}`,
          `herdr.last_cwd=${agentCwd}`,
          "herdr.last_topic=",
        ]).catch(() => {});
      }
    }
  }

  button(t, id, iconName, command, args) {
    return div()
      .id(id)
      .p(3)
      .rounded(4)
      .text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/where-was-i/${iconName}.svg`).size(14));
  }

  render(cx) {
    const t = theme();
    const p = this.me();
    if (!p) return div();
    const term = this.term(p.terminal);
    const atShell = isAtPlainShell(p, term);
    this.syncAgentMemory(p, term, atShell);

    const fgShellName = atShell ? (term?.foreground?.name || p.program?.name || "shell").replace(/^-/, "") : null;
    const name = atShell
      ? fgShellName
      : (((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell");
    const pic = atShell ? svg("icons/shell.svg").size(14).flex_none().text_color(t.dim) : icon(p.program, 14, t.dim);
    const st = atShell ? null : p.status;
    const pane = p.pane;

    const labels = term?.labels || {};
    const lastAgent = atShell ? labels["herdr.last_agent"] : null;
    const lastKey = atShell ? labels["herdr.last_key"] : null;
    const lastCwd = atShell ? folder(labels["herdr.last_cwd"] || "") : "";
    const resumeCmd = lastAgent ? resumeCommandFor(lastAgent, lastKey) : null;
    const lastIcon = lastAgent ? icon(lastAgentIconSpec(labels, lastKey, lastAgent), 12, t.muted) : null;

    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .px(10)
      .gap(8)
      .items_center()
      .bg(t.background)
      .border_b(1)
      .border_color(t.border)
      .text_size(12)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(260).font_medium().text_color(t.foreground).child(name))
      .child(div().flex_1().truncate().text_color(t.dim).child(folder(p.cwd)))
      .when(Boolean(lastAgent), (el) =>
        el.child(
          h_flex()
            .id(`ph-resume-wrap-${pane}`)
            .gap(4)
            .items_center()
            .flex_none()
            .child(
              h_flex()
                .id(`ph-resume-${pane}`)
                .px(6)
                .h(20)
                .gap(5)
                .items_center()
                .rounded(5)
                .bg(t.surface)
                .border(1)
                .border_color(t.border)
                .text_size(11)
                .text_color(t.muted)
                .hover((s) => s.bg(t.hover).text_color(t.foreground).border_color(t.accent))
                .on_click((_e, cx) => {
                  cx.stop_propagation();
                  if (resumeCmd && p.terminal) {
                    run("pane.focus", { pane });
                    hc(["keys", p.terminal, ...textToHcKeys(resumeCmd)]).catch(() => {});
                  }
                })
                .child(div().text_color(t.dim).child("Was:"))
                .when(Boolean(lastIcon), (b) => b.child(lastIcon))
                .child(
                  div()
                    .truncate()
                    .max_w(180)
                    .child(`${lastAgent}${resumeCmd ? " ↻" : ""}`)
                )
                .when(Boolean(lastCwd), (b) =>
                  b.child(div().truncate().max_w(160).text_color(t.dim).child(lastCwd))
                )
            )
            .child(
              div()
                .id(`ph-clear-mem-${pane}`)
                .px(4)
                .h(20)
                .flex()
                .items_center()
                .rounded(4)
                .text_size(11)
                .text_color(t.dim)
                .hover((s) => s.bg(t.hover).text_color(t.foreground))
                .on_click((_e, cx) => {
                  cx.stop_propagation();
                  if (p.terminal) {
                    hc([
                      "label",
                      p.terminal,
                      "herdr.last_agent=",
                      "herdr.last_key=",
                      "herdr.last_icon=",
                      "herdr.last_tint=",
                      "herdr.last_cwd=",
                      "herdr.last_topic=",
                    ]).catch(() => {});
                  }
                })
                .child("×")
            )
        )
      )
      .when(st === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
      .when(st === "blocked", el => el.child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).child("Needs you")))
      .when(st === "done", el => el.child(div().size(7).flex_none().rounded(4).bg(t.done)))
      .when(this.hovered, el => el
        .child(this.button(t, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(t, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane })));
  }
}
