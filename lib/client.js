/**
 * dsh-view-manager, browser half.
 *
 * Manages the session-header view tabs (对话 / 轨迹 / …) contributed through
 * the `conversation.view` slot: enable/disable (hide), reorder, and rename
 * labels. The official host renders every `conversation.view` registration as
 * a tab and exposes no filtering/reordering extension point, so this plugin
 * applies its stored configuration over the rendered `[role="tablist"]`
 * buttons (kept aligned with `slots.entries("conversation.view")` order),
 * guarded by a MutationObserver so React re-renders cannot undo it.
 *
 * Hand-written ModuleLoader bundle (no build step). Locale-aware copy follows
 * the DSH UI language via the `locale` service (zh / en).
 */

window.__ModuleLoader__.load({
  id: "dsh-view-manager",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var React = require("react");

    var NS = "viewManager";
    var STORAGE_KEY = "dsh.viewManager.config";
    var STORAGE_VERSION = 1;

    var CSS = `
.vm-root { position: relative; display: inline-flex; }
.vm-trigger { display: inline-flex; align-items: center; gap: 4px; min-height: 28px; padding: 3px 8px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); background: transparent; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; cursor: pointer; white-space: nowrap; }
.vm-trigger:hover, .vm-trigger:focus-visible { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); }
.vm-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.vm-modal { background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; padding: 14px 16px; max-width: 560px; width: calc(100% - 40px); display: flex; flex-direction: column; gap: 10px; }
.vm-title { font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.vm-sub { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.vm-list { display: flex; flex-direction: column; gap: 8px; max-height: 46vh; overflow: auto; }
.vm-row { display: flex; align-items: center; gap: 8px; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 8px 10px; }
.vm-row[data-enabled="false"] { opacity: 0.6; }
.vm-id { font-size: 11px; color: var(--dsw-alias-label-tertiary); font-family: var(--dsw-font-mono, monospace); flex: none; min-width: 84px; }
.vm-orig { font-size: 12px; color: var(--dsw-alias-label-secondary); flex: none; white-space: nowrap; }
.vm-input { flex: 1; min-width: 0; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 5px 8px; font-size: 12px; }
.vm-input:focus { border-color: var(--dsw-alias-brand-primary); outline: none; }
.vm-btn { background: transparent; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 3px 8px; font-size: 12px; cursor: pointer; flex: none; }
.vm-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.vm-btn:disabled { opacity: 0.4; cursor: default; }
.vm-btn.primary { background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-label-primary)); color: var(--dsw-alias-label-primary-foreground, var(--dsw-alias-bg-layer-3)); border: none; }
.vm-toggle { appearance: none; width: 30px; height: 16px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); position: relative; cursor: pointer; flex: none; margin: 0; }
.vm-toggle-wrap { display: inline-flex; align-items: center; flex: none; cursor: pointer; }
.vm-toggle:checked { background: var(--dsw-alias-state-business-primary); border-color: var(--dsw-alias-state-business-primary); }
.vm-toggle::after { content: ""; position: absolute; top: 1px; left: 1px; width: 12px; height: 12px; border-radius: 50%; background: var(--dsw-alias-label-primary-foreground, var(--dsw-alias-bg-base)); transition: left 0.12s; }
.vm-toggle:checked::after { left: 15px; }
.vm-footer { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
`;

    /* ----------------------------- locale ----------------------------- */

    var zh = {
      button: "逃咪-视图管理",
      title: "视图标签管理",
      sub: "管理会话页头显示的视图标签（对话 / 轨迹 等）。停用仅隐藏标签，视图功能不受影响；所有配置保存在本浏览器（localStorage）。",
      enabled: "启用",
      rename: "重命名",
      renamePlaceholder: "自定义显示名称，留空恢复默认",
      moveUp: "上移",
      moveDown: "下移",
      reset: "恢复默认",
      close: "关闭",
      defaultLabel: "默认",
      original: "原名",
      empty: "暂无可管理的视图。",
      saved: "已保存",
    };

    var en = {
      button: "Runcat-Views",
      title: "View Tab Manager",
      sub: "Manage the view tabs shown in the session header (Chat / Trajectory / …). Disabling only hides the tab; the view itself is unaffected. All settings are stored in this browser (localStorage).",
      enabled: "Enabled",
      rename: "Rename",
      renamePlaceholder: "Custom display name, empty = default",
      moveUp: "Up",
      moveDown: "Down",
      reset: "Reset",
      close: "Close",
      defaultLabel: "Default",
      original: "Original",
      empty: "No manageable views.",
      saved: "Saved",
    };

    /* --------------------------- config store --------------------------- */

    function defaultConfig() {
      return { version: STORAGE_VERSION, views: {} };
    }

    function loadConfig() {
      try {
        var raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultConfig();
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || parsed.version !== STORAGE_VERSION) return defaultConfig();
        return parsed;
      } catch (err) {
        return defaultConfig();
      }
    }

    function saveConfig(cfg) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
      } catch (err) { /* storage unavailable: keep in-memory behavior */ }
    }

    function entryConfig(cfg, id) {
      if (!cfg.views[id]) cfg.views[id] = { enabled: true, label: "", order: null };
      return cfg.views[id];
    }

    /* ---------------------------- view source ---------------------------- */

    /** Resolve a possibly-thunked slot label (mirrors resolveSlotLabel). */
    function resolveLabel(label) {
      if (typeof label === "function") {
        try { return label(); } catch (err) { return undefined; }
      }
      return label;
    }

    /** Collect conversation.view registrations in ledger (order) sequence. */
    function collectViews(slots) {
      var out = [];
      var entries = slots.entries("conversation.view");
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        if (!e || !e.options || e.options.id === undefined) continue;
        out.push({
          id: String(e.options.id),
          label: resolveLabel(e.options.label) || String(e.options.id),
        });
      }
      return out;
    }

    /* ------------------------- DOM application -------------------------- */

    function applyDom(slots, cfg) {
      if (typeof document === "undefined") return;
      var views = collectViews(slots);
      if (views.length === 0) return;
      var tablists = document.querySelectorAll('[role="tablist"]');
      for (var t = 0; t < tablists.length; t++) {
        var tl = tablists[t];
        var btns = Array.prototype.slice.call(tl.querySelectorAll('[role="tab"]'));
        if (btns.length !== views.length) continue;
        // Guard: only act on a tablist whose button texts plausibly match the
        // conversation view labels (avoid touching unrelated tablists, e.g.
        // settings sections) — allow a match against original or renamed text.
        var matched = 0;
        for (var b = 0; b < btns.length; b++) {
          var text = (btns[b].textContent || "").trim();
          var v = views[b];
          var ec = cfg.views[v.id];
          var renamed = ec && ec.label;
          if (text === v.label || (renamed && text === renamed)) matched++;
        }
        if (matched < Math.min(2, views.length)) continue;
        for (var k = 0; k < btns.length; k++) {
          var btn = btns[k];
          var view = views[k];
          var vc = cfg.views[view.id];
          if (!vc) vc = entryConfig(cfg, view.id);
          btn.style.display = vc.enabled === false ? "none" : "";
          btn.style.order = (typeof vc.order === "number" ? vc.order : k) + "";
          var want = vc.label ? vc.label : view.label;
          if ((btn.textContent || "") !== want) btn.textContent = want;
        }
      }
    }

    /* --------------------------- DOM watcher ---------------------------- */

    function startWatcher(slots) {
      if (typeof document === "undefined" || typeof MutationObserver === "undefined") return null;
      var timer = null;
      var mo = new MutationObserver(function () {
        if (timer !== null) window.clearTimeout(timer);
        timer = window.setTimeout(function () {
          timer = null;
          applyDom(slots, loadConfig());
        }, 40);
      });
      mo.observe(document.body, { childList: true, subtree: true, characterData: true });
      return mo;
    }

    /* ---------------------------- management UI --------------------------- */

    function el(type, props) {
      var rest = Array.prototype.slice.call(arguments, 2);
      return React.createElement.apply(React, [type, props].concat(rest));
    }

    function ManagerPanel({ t, slots }) {
      var cfgRef = React.useRef(null);
      if (cfgRef.current === null) cfgRef.current = loadConfig();
      var cfg = cfgRef.current;
      var views = React.useMemo(function () { return collectViews(slots); }, []);
      var [tick, setTick] = React.useState(0);

      // ordered entries: user order when set, else ledger order
      var rows = React.useMemo(function () {
        return views
          .map(function (v, i) {
            var vc = entryConfig(cfg, v.id);
            if (typeof vc.order !== "number") vc.order = i;
            return { view: v, vc: vc };
          })
          .sort(function (a, b) { return a.vc.order - b.vc.order; });
      }, [views, tick]);

      function persist() {
        saveConfig(cfg);
        setTick(function (x) { return x + 1; });
        applyDom(slots, cfg);
      }

      function toggle(id) {
        var vc = entryConfig(cfg, id);
        vc.enabled = vc.enabled === false;
        persist();
      }

      function rename(id, value) {
        var vc = entryConfig(cfg, id);
        vc.label = value;
        persist();
      }

      function move(id, dir) {
        var sorted = rows.slice();
        var idx = -1;
        for (var i = 0; i < sorted.length; i++) if (sorted[i].view.id === id) { idx = i; break; }
        var target = idx + dir;
        if (idx < 0 || target < 0 || target >= sorted.length) return;
        var a = sorted[idx], b = sorted[target];
        var tmp = a.vc.order;
        a.vc.order = b.vc.order;
        b.vc.order = tmp;
        persist();
      }

      function resetAll() {
        cfgRef.current = defaultConfig();
        saveConfig(cfgRef.current);
        applyDom(slots, cfgRef.current);
        setTick(function (x) { return x + 1; });
      }

      return el("div", { className: "vm-modal" },
        el("div", { className: "vm-title" }, t("title")),
        el("div", { className: "vm-sub" }, t("sub")),
        rows.length === 0
          ? el("div", { className: "vm-sub" }, t("empty"))
          : el("div", { className: "vm-list" },
              rows.map(function (row) {
                var v = row.view, vc = row.vc;
                return el("div", { className: "vm-row", key: v.id, "data-enabled": vc.enabled === false ? "false" : "true" },
                  el("label", { className: "vm-toggle-wrap", title: t("enabled") },
                    el("input", {
                      type: "checkbox",
                      className: "vm-toggle",
                      checked: vc.enabled !== false,
                      onChange: function () { toggle(v.id); },
                    }),
                  ),
                  el("span", { className: "vm-id", title: v.id }, v.id),
                  el("span", { className: "vm-orig", title: t("original") }, v.label),
                  el("input", {
                    className: "vm-input",
                    placeholder: t("renamePlaceholder"),
                    value: vc.label || "",
                    onChange: function (ev) { rename(v.id, ev.target.value); },
                  }),
                  el("button", {
                    className: "vm-btn",
                    disabled: rows[0] && rows[0].view.id === v.id,
                    onClick: function () { move(v.id, -1); },
                    title: t("moveUp"),
                  }, "↑"),
                  el("button", {
                    className: "vm-btn",
                    disabled: rows[rows.length - 1] && rows[rows.length - 1].view.id === v.id,
                    onClick: function () { move(v.id, 1); },
                    title: t("moveDown"),
                  }, "↓"),
                );
              }),
            ),
        el("div", { className: "vm-footer" },
          el("button", { className: "vm-btn", onClick: resetAll }, t("reset")),
        ),
      );
    }

    function ViewManagerButton({ t, slots }) {
      var [open, setOpen] = React.useState(false);
      return el("div", { className: "vm-root" },
        el("button", {
          className: "vm-trigger",
          type: "button",
          "aria-expanded": open ? "true" : "false",
          onClick: function () { setOpen(!open); },
        }, "⚙ " + t("button")),
        open
          ? el("div", {
              className: "vm-mask",
              onClick: function () { setOpen(false); },
            },
              el("div", { onClick: function (ev) { ev.stopPropagation(); } },
                el(ManagerPanel, { t: t, slots: slots }),
              ),
            )
          : null,
      );
    }

    /* ------------------------------ apply ------------------------------ */

    function apply(ctx) {
      var styleEl = null;
      if (typeof document !== "undefined") {
        styleEl = document.createElement("style");
        styleEl.textContent = CSS;
        document.head.appendChild(styleEl);
      }

      ctx.effect(function () {
        ctx.locale.register(NS, { zh: zh, en: en });
      }, "dsh-view-manager: dictionaries");
      var t = ctx.locale.bind(NS);

      var watcher = null;
      ctx.effect(function () {
        watcher = startWatcher(ctx.slots);
        applyDom(ctx.slots, loadConfig());
      }, "dsh-view-manager: view-tab watcher");

      ctx.slots.inject("conversation.session.header.utilities", function () {
        return ctx.slots.register({
          name: "conversation.session.header.utilities",
          id: "view-manager",
          order: 10,
          locale: NS,
          inject: function () {
            return { slots: ctx.slots };
          },
        }, ViewManagerButton);
      });

      ctx.effect(function () {
        return function () {
          if (styleEl !== null && styleEl.parentNode !== null) styleEl.parentNode.removeChild(styleEl);
          if (watcher !== null && typeof watcher.disconnect === "function") watcher.disconnect();
        };
      });
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale"];
    return module.exports;
  },
});
