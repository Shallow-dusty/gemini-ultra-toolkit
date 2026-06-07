// ==UserScript==
// @name         Primer++ for Gemini™ (v12.0)
// @namespace    http://tampermonkey.net/
// @version      12.0
// @description  非官方 Gemini™ 助手平台：原生 UI 集成、计数器、热力图、配额追踪、对话文件夹等模块化增强
// @author       Script Weaver
// @match        https://gemini.google.com/*
// @homepageURL  https://github.com/Shallow-dusty/primer-pp
// @supportURL   https://github.com/Shallow-dusty/primer-pp/issues
// @updateURL    https://raw.githubusercontent.com/Shallow-dusty/primer-pp/main/primer-pp.user.js
// @downloadURL  https://raw.githubusercontent.com/Shallow-dusty/primer-pp/main/primer-pp.user.js
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // src/constants.js
  var THEMES, GLOBAL_KEYS, TIMINGS, QUOTA_COLORS, VERSION, APP_NAME, TRADEMARK_NOTICE, PANEL_ID, DEFAULT_POS, TEMP_USER;
  var init_constants = __esm({
    "src/constants.js"() {
      THEMES = {
        auto: {
          name: "🔄 Auto",
          vars: null
          // resolved at runtime → glass (dark) / paper (light)
        },
        glass: {
          name: "🌌 Glass",
          vars: {
            "--bg": "rgba(32, 33, 36, 0.82)",
            "--blur": "24px",
            "--saturate": "180%",
            "--border": "rgba(255, 255, 255, 0.12)",
            "--border-highlight": "inset 1px 1px 1px rgba(255,255,255,0.08)",
            "--text-main": "#a8c7fa",
            "--text-sub": "#9aa0a6",
            "--accent": "#8ab4f8",
            "--btn-bg": "rgba(255, 255, 255, 0.06)",
            "--row-hover": "rgba(255, 255, 255, 0.1)",
            "--shadow": "0 4px 12px rgba(0,0,0,0.1), 0 12px 32px rgba(0,0,0,0.25), 0 24px 64px rgba(0,0,0,0.2)",
            "--shadow-hover": "0 8px 24px rgba(0,0,0,0.15), 0 16px 48px rgba(0,0,0,0.3), 0 32px 80px rgba(0,0,0,0.25)",
            "--highlight": "rgba(255, 255, 255, 0.12)",
            "--header-bg": "rgba(255, 255, 255, 0.03)",
            "--header-border": "rgba(255, 255, 255, 0.05)",
            "--detail-bg": "rgba(0, 0, 0, 0.1)",
            "--overlay-tint": "rgba(0, 0, 0, 0.6)",
            "--input-bg": "rgba(255, 255, 255, 0.05)",
            "--divider": "rgba(255, 255, 255, 0.05)",
            "--badge-bg": "rgba(255, 255, 255, 0.06)",
            "--scrollbar-thumb": "rgba(255, 255, 255, 0.15)",
            "--code-bg": "rgba(0, 0, 0, 0.3)"
          }
        },
        cyber: {
          name: "⚡ Cyber",
          vars: {
            "--bg": "rgba(10, 10, 10, 0.96)",
            "--blur": "4px",
            "--saturate": "120%",
            "--border": "#00ff41",
            "--border-highlight": "inset 1px 1px 0 rgba(0,255,65,0.15)",
            "--text-main": "#00ff41",
            "--text-sub": "#008F11",
            "--accent": "#00ff41",
            "--btn-bg": "#0d0d0d",
            "--row-hover": "#1a1a1a",
            "--shadow": "0 4px 12px rgba(0,255,65,0.1), 0 12px 32px rgba(0,255,65,0.08)",
            "--shadow-hover": "0 8px 24px rgba(0,255,65,0.15), 0 16px 48px rgba(0,255,65,0.12)",
            "--highlight": "rgba(0, 255, 65, 0.1)",
            "--header-bg": "rgba(0, 255, 65, 0.03)",
            "--header-border": "rgba(0, 255, 65, 0.1)",
            "--detail-bg": "rgba(0, 0, 0, 0.3)",
            "--overlay-tint": "rgba(0, 0, 0, 0.7)",
            "--input-bg": "#0d0d0d",
            "--divider": "rgba(0, 255, 65, 0.08)",
            "--badge-bg": "rgba(0, 255, 65, 0.08)",
            "--scrollbar-thumb": "rgba(0, 255, 65, 0.2)",
            "--code-bg": "rgba(0, 0, 0, 0.5)"
          }
        },
        paper: {
          name: "📄 Paper",
          vars: {
            "--bg": "rgba(255, 255, 255, 0.88)",
            "--blur": "20px",
            "--saturate": "150%",
            "--border": "rgba(0, 0, 0, 0.08)",
            "--border-highlight": "inset 1px 1px 0 rgba(255,255,255,0.8)",
            "--text-main": "#1a1a1a",
            "--text-sub": "#5f6368",
            "--accent": "#1a73e8",
            "--btn-bg": "rgba(0, 0, 0, 0.04)",
            "--row-hover": "rgba(0, 0, 0, 0.06)",
            "--shadow": "0 4px 16px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.04), 0 24px 64px rgba(0,0,0,0.04)",
            "--shadow-hover": "0 8px 24px rgba(0,0,0,0.08), 0 16px 48px rgba(0,0,0,0.06), 0 32px 80px rgba(0,0,0,0.04)",
            "--highlight": "rgba(255, 255, 255, 0.9)",
            "--header-bg": "rgba(0, 0, 0, 0.02)",
            "--header-border": "rgba(0, 0, 0, 0.06)",
            "--detail-bg": "rgba(0, 0, 0, 0.03)",
            "--overlay-tint": "rgba(0, 0, 0, 0.35)",
            "--input-bg": "rgba(0, 0, 0, 0.04)",
            "--divider": "rgba(0, 0, 0, 0.06)",
            "--badge-bg": "rgba(0, 0, 0, 0.05)",
            "--scrollbar-thumb": "rgba(0, 0, 0, 0.15)",
            "--code-bg": "rgba(0, 0, 0, 0.04)"
          }
        }
      };
      GLOBAL_KEYS = {
        POS: "gemini_panel_pos",
        REGISTRY: "gemini_user_registry",
        THEME: "gemini_current_theme",
        RESET_HOUR: "gemini_reset_hour",
        QUOTA: "gemini_quota_limit",
        MODULES: "gemini_enabled_modules",
        DEBUG: "gemini_debug_enabled",
        LOG_LEVEL: "gemini_log_level",
        LOGS: "gemini_logs_store",
        ONBOARDING: "gemini_onboarding_seen",
        ONBOARDING_LANG: "gemini_onboarding_lang",
        TOUR_SEEN: "gemini_tour_seen"
      };
      TIMINGS = {
        POLL_INTERVAL: 1500,
        SLOW_POLL: 5e3,
        COUNTER_COOLDOWN: 1e3,
        OBSERVER_DEBOUNCE: 500,
        NATIVEUI_DEBOUNCE: 1500,
        TITLE_DEBOUNCE: 300,
        FAB_AUTO_DISMISS: 5e3,
        MODEL_MENU_TIMEOUT: 2e3,
        MODEL_MUTATION_DEBOUNCE: 500
      };
      QUOTA_COLORS = { safe: "#34a853", warn: "#fbbc04", danger: "#ea4335" };
      VERSION = "12.0";
      APP_NAME = "Primer++ for Gemini™";
      TRADEMARK_NOTICE = "Primer++ is an unofficial community extension. Gemini™ is a trademark of Google LLC.";
      PANEL_ID = "gemini-monitor-panel-v7";
      DEFAULT_POS = { top: "20px", left: "auto", bottom: "auto", right: "220px" };
      TEMP_USER = "Guest";
    }
  });

  // lib/debug_logger.js
  var require_debug_logger = __commonJS({
    "lib/debug_logger.js"(exports, module) {
      "use strict";
      function createLogger2(options) {
        const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
        const maxEntries = options?.maxEntries ?? 300;
        const maxStore = options?.maxStore ?? 500;
        let level = options?.level ?? "info";
        const store = options?.store ?? { get: () => [], set: () => {
        } };
        let buffer = Array.isArray(options?.initial) ? options.initial.slice() : Array.isArray(store.get()) ? store.get() : [];
        const subscribers = /* @__PURE__ */ new Set();
        let persistTimer = null;
        const onLevelChange = options?.onLevelChange ?? (() => {
        });
        const now = options?.now ?? (() => (/* @__PURE__ */ new Date()).toISOString());
        const sink = options?.sink ?? (() => {
        });
        function shouldLog(lvl) {
          return (LEVELS[lvl] ?? 2) <= (LEVELS[level] ?? 2);
        }
        function persist() {
          if (persistTimer) clearTimeout(persistTimer);
          persistTimer = setTimeout(() => {
            const trimmed = buffer.slice(-maxStore);
            store.set(trimmed);
          }, 0);
        }
        function emit(entry) {
          buffer.push(entry);
          if (buffer.length > maxEntries) buffer.shift();
          persist();
          subscribers.forEach((fn) => {
            try {
              fn(entry);
            } catch (_) {
            }
          });
        }
        function log(lvl, msg, data) {
          const entry = { ts: now(), level: lvl, msg, data };
          if (shouldLog(lvl)) {
            sink(lvl, msg, data);
          }
          emit(entry);
        }
        return {
          log,
          error: (m, d) => log("error", m, d),
          warn: (m, d) => log("warn", m, d),
          info: (m, d) => log("info", m, d),
          debug: (m, d) => log("debug", m, d),
          getLevel: () => level,
          setLevel: (lvl) => {
            level = lvl;
            onLevelChange(lvl);
            log("info", "Log level updated", { level: lvl });
          },
          getEntries: () => buffer.slice(),
          clear: () => {
            buffer = [];
            store.set([]);
            log("info", "Logs cleared");
          },
          subscribe: (fn) => {
            subscribers.add(fn);
            return () => subscribers.delete(fn);
          },
          export: () => ({ exportedAt: now(), level, entries: buffer.slice() })
        };
      }
      function filterLogs2(entries, opts) {
        const level = opts?.level ?? "all";
        const term = (opts?.term ?? "").toLowerCase();
        return entries.filter((e) => {
          if (level !== "all" && e.level !== level) return false;
          if (!term) return true;
          const dataStr = e.data ? JSON.stringify(e.data) : "";
          return `${e.msg} ${dataStr}`.toLowerCase().includes(term);
        });
      }
      module.exports = { createLogger: createLogger2, filterLogs: filterLogs2 };
    }
  });

  // src/logger.js
  function isDebugEnabled() {
    try {
      return GM_getValue(GLOBAL_KEYS.DEBUG, false);
    } catch (e) {
      return false;
    }
  }
  function setDebugEnabled(v) {
    try {
      GM_setValue(GLOBAL_KEYS.DEBUG, v);
    } catch (e) {
    }
  }
  var import_debug_logger, _initLevel, Logger;
  var init_logger = __esm({
    "src/logger.js"() {
      import_debug_logger = __toESM(require_debug_logger());
      init_constants();
      try {
        _initLevel = GM_getValue(GLOBAL_KEYS.LOG_LEVEL, "info");
      } catch (e) {
        _initLevel = "info";
      }
      Logger = (0, import_debug_logger.createLogger)({
        level: _initLevel,
        store: {
          get: () => {
            try {
              return GM_getValue(GLOBAL_KEYS.LOGS, []);
            } catch (e) {
              return [];
            }
          },
          set: (v) => {
            try {
              GM_setValue(GLOBAL_KEYS.LOGS, v);
            } catch (e) {
            }
          }
        },
        onLevelChange: (lvl) => {
          try {
            GM_setValue(GLOBAL_KEYS.LOG_LEVEL, lvl);
          } catch (e) {
          }
        },
        sink: (lvl, msg, data) => {
          const fn = lvl === "error" ? console.error : lvl === "warn" ? console.warn : lvl === "debug" ? console.debug : console.log;
          fn(`[Gemini] ${msg}`, data || "");
        }
      });
      Logger.info("Logger initialized", { level: Logger.getLevel() });
    }
  });

  // src/state.js
  function getCurrentUser() {
    return currentUser;
  }
  function setCurrentUser(u) {
    currentUser = u;
  }
  function getInspectingUser() {
    return inspectingUser;
  }
  function setInspectingUser(u) {
    inspectingUser = u;
  }
  function getCurrentTheme() {
    return currentTheme;
  }
  function setCurrentTheme(t) {
    currentTheme = t;
  }
  function getStorageListenerId() {
    return storageListenerId;
  }
  function setStorageListenerId(id) {
    storageListenerId = id;
  }
  var currentUser, inspectingUser, currentTheme, storageListenerId;
  var init_state = __esm({
    "src/state.js"() {
      init_constants();
      currentUser = TEMP_USER;
      inspectingUser = TEMP_USER;
      try {
        currentTheme = GM_getValue(GLOBAL_KEYS.THEME, "glass");
      } catch (e) {
        currentTheme = "glass";
      }
      storageListenerId = null;
    }
  });

  // lib/tool_mode_tools.js
  var require_tool_mode_tools = __commonJS({
    "lib/tool_mode_tools.js"(exports, module) {
      function toText(value) {
        if (value === null || value === void 0) return "";
        return String(value);
      }
      function normalizeText(value) {
        return toText(value).toLowerCase().replace(/\s+/g, " ").trim();
      }
      function detectToolModeLabel(text) {
        const value = normalizeText(text);
        if (!value) return "";
        if (/\bdeep research\b/.test(value) || value.includes("深度研究") || value.includes("深入研究")) return "Deep Research";
        if (/\bcanvas\b/.test(value) || value.includes("画布")) return "Canvas";
        if (/\bspark\b/.test(value)) return "Spark";
        if (/\baudio overview\b/.test(value) || value.includes("音频概览") || value.includes("音訊總覽")) return "Audio Overview";
        if (/\bimage\b/.test(value) || /\bimagen\b/.test(value) || value.includes("图片") || value.includes("圖像") || value.includes("画像")) return "Image";
        if (/\bvideo\b/.test(value) || /\bveo\b/.test(value) || value.includes("视频") || value.includes("影片")) return "Video";
        return "";
      }
      function classTextFromState(state = {}) {
        if (Array.isArray(state.classList)) return state.classList.join(" ");
        return toText(state.className);
      }
      function isActiveToolModeState(state = {}) {
        const source = state && typeof state === "object" ? state : {};
        if (source.ariaPressed === "true") return true;
        if (source.ariaCurrent === "true") return true;
        if (source.dataActive === "true") return true;
        return /\b(active|selected|checked)\b/.test(classTextFromState(source));
      }
      function getToolModeState2(candidate = {}) {
        const label = detectToolModeLabel(`${toText(candidate.text)} ${toText(candidate.ariaLabel)}`);
        return {
          active: !!label && isActiveToolModeState(candidate),
          label
        };
      }
      module.exports = {
        detectToolModeLabel,
        getToolModeState: getToolModeState2,
        isActiveToolModeState
      };
    }
  });

  // lib/gemini_url_tools.js
  var require_gemini_url_tools = __commonJS({
    "lib/gemini_url_tools.js"(exports, module) {
      var NON_CHAT_APP_IDS = /* @__PURE__ */ new Set([
        "download"
      ]);
      function cleanText(value) {
        if (value === null || value === void 0) return "";
        return String(value).trim();
      }
      function parseGeminiUrl(value) {
        const raw = cleanText(value);
        if (!raw) return null;
        try {
          return new URL(raw, "https://gemini.google.com");
        } catch {
          return null;
        }
      }
      function extractGeminiChatId2(value) {
        const url = parseGeminiUrl(value);
        if (!url) return null;
        if (url.hostname !== "gemini.google.com") return null;
        const match = url.pathname.match(/^\/app\/([a-zA-Z0-9_-]+)$/);
        if (!match) return null;
        const id = match[1];
        if (NON_CHAT_APP_IDS.has(id.toLowerCase())) return null;
        return id;
      }
      function isGeminiConversationHref(value) {
        return !!extractGeminiChatId2(value);
      }
      module.exports = {
        extractGeminiChatId: extractGeminiChatId2,
        isGeminiConversationHref
      };
    }
  });

  // src/adapters/gemini.js
  function firstMatch(root, list) {
    const arr = Array.isArray(list) ? list : [list];
    for (const sel of arr) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }
  function matchesAny(target, list) {
    if (!target || !target.matches) return false;
    const arr = Array.isArray(list) ? list : [list];
    for (const sel of arr) {
      try {
        if (target.matches(sel)) return true;
      } catch {
      }
    }
    return false;
  }
  function closestAny(target, list) {
    if (!target || !target.closest) return null;
    const arr = Array.isArray(list) ? list : [list];
    for (const sel of arr) {
      try {
        const el = target.closest(sel);
        if (el) return el;
      } catch {
      }
    }
    return null;
  }
  function normalizeModelText(text) {
    if (!text || typeof text !== "string") return null;
    const t = text.toLowerCase().trim();
    if (t.includes("thinking") || t.includes("思考") || t.includes("사고")) return "thinking";
    if (/\bpro\b/.test(t) || t.includes("专业") || t.includes("プロ") || t.includes("프로")) return "pro";
    if (t.includes("flash") || t.includes("fast") || t.includes("快速") || t.includes("高速") || t.includes("빠른")) return "flash";
    return null;
  }
  function cleanVisibleText(el) {
    return (el?.textContent || "").replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").trim();
  }
  var import_tool_mode_tools, import_gemini_url_tools, S, GeminiAdapter;
  var init_gemini = __esm({
    "src/adapters/gemini.js"() {
      import_tool_mode_tools = __toESM(require_tool_mode_tools());
      import_gemini_url_tools = __toESM(require_gemini_url_tools());
      S = Object.freeze({
        // Sidebar
        SIDEBAR: [
          'nav[aria-label="Side Navigation"]',
          // v12 aria
          "bard-sidenav",
          // v11/v12 web component
          ".sidenav-with-history-container",
          // v11 fallback
          'nav[role="navigation"]'
          // last-ditch
        ],
        SIDEBAR_OVERFLOW: ".overflow-container",
        SIDEBAR_CONVERSATIONS_LIST: 'conversations-list[data-test-id="all-conversations"]',
        CHAT_LINK: 'a[href*="/app/"]',
        CHAT_ROW_WRAPPER: 'gem-nav-list-item[data-test-id="conversation"]',
        CHAT_ROW_MORE_BTN: 'button[aria-label^="More options for"]',
        // Input area
        INPUT_AREA: [
          "input-area-v2",
          // v11/v12 web component
          ".input-area-container",
          // v11/v12 fieldset
          "input-container"
          // v12 outer wrapper
        ],
        INPUT_EDITOR: 'div.ql-editor[contenteditable="true"]',
        INPUT_EDITOR_BY_ARIA: '[role="textbox"][aria-label="Enter a prompt for Gemini"]',
        INPUT_EDITOR_TARGET: 'textarea, div.ql-editor[contenteditable="true"], [role="textbox"][aria-label="Enter a prompt for Gemini"], [contenteditable="true"]',
        INPUT_TRAILING_ACTIONS: ".trailing-actions-wrapper",
        TOOL_MODE_CANDIDATE: 'button, [role="button"], [aria-pressed="true"], [data-active="true"]',
        SEND_BUTTON: [
          'button[aria-label="Send message"]',
          // v12 primary
          "button.send-button",
          // v11 deprecated (kept for mixed-rollout)
          'button[aria-label*="Send" i]'
          // i18n fallback
        ],
        // Mode picker
        MODE_BTN: [
          'button[aria-label="Open mode picker"]',
          // v12 aria
          '[data-test-id="bard-mode-menu-button"]',
          // v11/v12 data-test-id
          "button.input-area-switch"
          // v11/v12 class
        ],
        MODE_BTN_LABEL: ".picker-primary-text",
        MODE_MENU: '[data-test-id="gem-mode-menu"][role="menu"]',
        MODE_MENU_ITEM: '[role="menuitem"][data-test-id^="bard-mode-option-"], gem-menu-item[data-test-id^="bard-mode-option-"]',
        MODE_MENU_ITEM_ANY: '[role="menuitem"]',
        // Chat header (conversation actions menu button — v12 has no visible title)
        CHAT_HEADER_MORE_BTN: [
          'button[aria-label*="Open menu for conversation actions" i]'
        ],
        CHAT_HEADER_TITLE: [
          ".conversation-title-container",
          // v11 (gone in v12)
          "h1.conversation-title",
          // v11
          '[data-test-id="conversation-title"]',
          // v11
          "h1.cdk-visually-hidden"
          // v12 a11y-only fallback
        ],
        // User identification (account button bottom of sidebar / Google bar)
        USER_AREAS: 'a[aria-label*="@"], button[aria-label*="@"], div[aria-label*="帐号"], div[aria-label*="Account"], img[alt*="@"], img[aria-label*="@"]',
        // Conversation actions menu (after clicking row More button)
        MENU_PANEL: '.cdk-overlay-pane [role="menu"], .cdk-overlay-container [role="menu"], .mat-mdc-menu-panel',
        MENU_ITEM: '[role="menuitem"], mat-menu-item, button.mat-mdc-menu-item, .mat-menu-item',
        DELETE_BUTTON: 'button[data-test-id="delete-button"]',
        // Confirmation dialog
        DIALOG: 'mat-dialog-container, .mdc-dialog, [role="dialog"], [role="alertdialog"]',
        DIALOG_CONFIRM_BTNS: 'button.confirm-button, button[data-test-id*="confirm"], mat-dialog-actions button, .mdc-dialog__actions button, [role="dialog"] button, [role="alertdialog"] button',
        // Messages (in chat detail)
        USER_QUERY: "user-query",
        MODEL_RESPONSE: "model-response",
        MESSAGE_ACTIONS: "message-actions",
        RESPONSE_CONTAINER: "response-container",
        CONVERSATION_CONTAINER: ".conversation-container",
        USER_QUERY_TEXT: ".query-text, .user-query-text",
        CHAT_CONTENT_ROOT: 'main, [role="main"], user-query, model-response, response-container, .conversation-container',
        MAIN_CHAT_AREA: 'main, .chat-container, [role="main"]',
        // CSS targets for UI Tweaks. These are CSS rule selectors rather than
        // element lookup selectors, but still belong in the Gemini-owned catalog.
        UI_TWEAK_CHAT_WIDTH_TARGET: "main .conversation-container, main .chat-window",
        UI_TWEAK_SIDEBAR_WIDTH_TARGET: 'bard-sidenav, nav[aria-label="Side Navigation"]',
        UI_TWEAK_GEMS_ENTRY: 'a[href*="/gems/"]',
        // Mutation-watch closest() roots (DOMWatcher zone matches)
        SIDEBAR_MUTATION_ROOT: 'nav[aria-label="Side Navigation"], bard-sidenav, bard-sidenav-container, .sidenav-with-history-container, nav[role="navigation"]',
        INPUT_MUTATION_ROOT: "input-area-v2, .input-area-container, input-container",
        HEADER_MUTATION_ROOT: "gem-icon-button, .conversation-title-container",
        MODEL_MUTATION_TARGET_MATCH: 'button.input-area-switch, [data-test-id="bard-mode-menu-button"], button[aria-label="Open mode picker"], gem-menu-item'
      });
      GeminiAdapter = {
        SELECTORS: S,
        _normalizeModelText: normalizeModelText,
        // ─── Probe ──────────────────────────────────────────────────────────
        /** Is Gemini's core UI present? (sidebar OR input area visible) */
        isReady() {
          return !!(this.getSidebar() || this.getInputArea());
        },
        // ─── User detection ────────────────────────────────────────────────
        /**
         * Extract Gmail address from any visible Google account UI.
         * Returns null when no email is found yet.
         */
        detectUserEmail() {
          try {
            const candidates = document.querySelectorAll(S.USER_AREAS);
            for (const el of candidates) {
              const label = el.getAttribute("aria-label") || el.getAttribute("alt") || "";
              const match = label.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
              if (match && match[1]) return match[1];
            }
          } catch {
          }
          return null;
        },
        /**
         * Detect account tier ('free' | 'pro' | 'ultra').
         * v12: the tier label sits inside the account block (sidebar bottom).
         * v11: a separate pillbox button.
         */
        detectAccountTier() {
          try {
            const acctLink = document.querySelector('a[aria-label*="Google Account" i], a[aria-label*="@" i]');
            if (acctLink) {
              const text = (acctLink.textContent || "").toUpperCase();
              if (text.includes("ULTRA")) return "ultra";
              if (/\bPRO\b/.test(text)) return "pro";
            }
            const pillboxBtn = document.querySelector("button.gds-pillbox-button, button.pillbox-btn");
            if (pillboxBtn) {
              const text = (pillboxBtn.textContent || "").toUpperCase();
              if (text.includes("ULTRA")) return "ultra";
              if (text.includes("PRO")) return "pro";
            }
          } catch {
          }
          return "free";
        },
        // ─── URL / Chat ID ─────────────────────────────────────────────────
        getChatId() {
          try {
            return (0, import_gemini_url_tools.extractGeminiChatId)(window.location.href);
          } catch {
            return null;
          }
        },
        isNewChatUrl() {
          const url = location.href;
          return url.includes("/app") && !url.includes("/app/") || url.endsWith("/app") || url.match(/\/app\?[^/]*$/) !== null;
        },
        // ─── Sidebar ───────────────────────────────────────────────────────
        getSidebar() {
          return firstMatch(document, S.SIDEBAR);
        },
        /**
         * The narrower container *inside* the sidebar that's safe to prepend
         * native UI into (folder filter bar, batch-delete toolbar).
         * Returns the sidebar itself when the overflow container is absent.
         */
        getSidebarOverflowContainer() {
          const sidebar = this.getSidebar();
          if (!sidebar) return null;
          return sidebar.querySelector(S.SIDEBAR_OVERFLOW) || sidebar;
        },
        /**
         * Scan every chat link in the sidebar.
         * @returns {Array<{id: string, title: string, element: HTMLElement, href: string}>}
         */
        scanSidebarChatLinks() {
          const items = [];
          const links = document.querySelectorAll(S.CHAT_LINK);
          for (const el of links) {
            const href = el.getAttribute("href") || "";
            const id = (0, import_gemini_url_tools.extractGeminiChatId)(href);
            if (!id) continue;
            let title = "";
            const textEl = el.querySelector("span, div");
            if (textEl) title = (textEl.textContent || "").trim();
            if (!title) title = "Untitled";
            items.push({ id, title, element: el, href });
          }
          return items;
        },
        /** Live chat-link count, for cache validation in Core.scanSidebarChats. */
        getChatLinkCount() {
          let count = 0;
          document.querySelectorAll(S.CHAT_LINK).forEach((el) => {
            if ((0, import_gemini_url_tools.extractGeminiChatId)(el.getAttribute("href") || "")) count++;
          });
          return count;
        },
        /**
         * v12: the row-level "More options for <title>" button is rendered in the
         * DOM persistently (CSS-hidden until hover). Resolves to that button for
         * a given chat link element. Falls back to v11 selectors.
         */
        getChatRowMoreButton(chatElement) {
          if (!chatElement) return null;
          const row = chatElement.closest(S.CHAT_ROW_WRAPPER) || chatElement.closest('mat-list-item, [role="listitem"]') || chatElement.parentElement;
          if (!row) return null;
          return row.querySelector(S.CHAT_ROW_MORE_BTN) || row.querySelector('button[data-test-id*="menu"], button[aria-label*="more" i], button[aria-label*="options" i], button[aria-label*="更多" i], button[aria-label*="その他" i], button[aria-label*="더보기" i]');
        },
        // ─── Input area ────────────────────────────────────────────────────
        getInputArea() {
          return firstMatch(document, S.INPUT_AREA);
        },
        getInputEditor() {
          return document.querySelector(S.INPUT_EDITOR) || document.querySelector(S.INPUT_EDITOR_BY_ARIA);
        },
        /** prompt_vault inject point — wrapper that holds the trailing action buttons. */
        getInputTrailingActions() {
          return document.querySelector(S.INPUT_TRAILING_ACTIONS);
        },
        /**
         * Conservative automation guard for tool/mode chips in the input area.
         * Unknown Gemini DOM still returns inactive; this is a best-effort pause
         * signal, not proof that every future tool surface is detected.
         */
        getActiveToolMode() {
          const area = this.getInputArea();
          if (!area) return { active: false, label: "" };
          const candidates = area.querySelectorAll(S.TOOL_MODE_CANDIDATE);
          for (const el of candidates) {
            const state = (0, import_tool_mode_tools.getToolModeState)({
              text: el.textContent || "",
              ariaLabel: el.getAttribute("aria-label") || "",
              ariaPressed: el.getAttribute("aria-pressed") || "",
              ariaCurrent: el.getAttribute("aria-current") || "",
              dataActive: el.getAttribute("data-active") || "",
              classList: Array.from(el.classList || [])
            });
            if (state.active) return state;
          }
          return { active: false, label: "" };
        },
        getVisibleToolModeEntries() {
          const entries = [];
          const candidates = document.querySelectorAll(S.TOOL_MODE_CANDIDATE);
          candidates.forEach((el, index) => {
            const state = (0, import_tool_mode_tools.getToolModeState)({
              text: el.textContent || "",
              ariaLabel: el.getAttribute("aria-label") || "",
              ariaPressed: el.getAttribute("aria-pressed") || "",
              ariaCurrent: el.getAttribute("aria-current") || "",
              dataActive: el.getAttribute("data-active") || "",
              classList: Array.from(el.classList || [])
            });
            if (state.label) {
              entries.push({
                index,
                label: state.label,
                active: state.active
              });
            }
          });
          return entries.slice(0, 20);
        },
        getSendButton() {
          return firstMatch(document, S.SEND_BUTTON);
        },
        isInsideInputEditor(target) {
          return !!closestAny(target, S.INPUT_EDITOR_TARGET.split(", "));
        },
        isSendButtonElement(btn) {
          if (!btn || btn.disabled) return false;
          if (btn.classList?.contains("send-button")) return true;
          const label = (btn.getAttribute?.("aria-label") || "").trim();
          if (label === "Send message" || label === "Send") return true;
          if (/^send\s+(message|prompt)$/i.test(label)) return true;
          return label.includes("发送") || label.includes("送信") || label.includes("전송") || label.includes("보내기");
        },
        getClosestSendButton(target) {
          const btn = closestAny(target, ["button"]);
          return this.isSendButtonElement(btn) ? btn : null;
        },
        // ─── Chat header ───────────────────────────────────────────────────
        /**
         * Anchor element next to which export's 📤 button can be injected.
         * v12: the conversation actions menu button (top-right more_vert).
         * v11: the conversation title container.
         */
        getChatHeader() {
          const moreBtn = firstMatch(document, S.CHAT_HEADER_MORE_BTN);
          if (moreBtn) return moreBtn.parentElement || moreBtn;
          return firstMatch(document, S.CHAT_HEADER_TITLE);
        },
        /** The conversation title text used by ui_tweaks for tab title sync. */
        getChatTitleText() {
          const visible = document.querySelector('h1.conversation-title, [data-test-id="conversation-title"], span.conversation-title');
          if (visible && visible.textContent.trim()) return visible.textContent.trim();
          const a11y = document.querySelector("h1.cdk-visually-hidden");
          if (a11y && a11y.textContent.trim()) {
            const txt = a11y.textContent.trim();
            if (!/^Conversation with Gemini|^与\s*Gemini|Gemini\s*との|Gemini\s*와의/i.test(txt)) {
              return txt;
            }
          }
          const firstMsg = document.querySelector(S.USER_QUERY_TEXT);
          if (firstMsg && firstMsg.textContent.trim()) {
            return firstMsg.textContent.trim().substring(0, 50);
          }
          return "";
        },
        isInsideMainChatArea(target) {
          return !!closestAny(target, S.MAIN_CHAT_AREA.split(", "));
        },
        isInsideChatContent(target) {
          return !!closestAny(target, S.CHAT_CONTENT_ROOT.split(", "));
        },
        /**
         * Capture messages currently rendered in the visible conversation DOM.
         * This does not navigate historical chats; bulk cross-chat export should
         * build on this only after a separate navigation/smoke-tested workflow.
         */
        getCurrentConversationMessages() {
          const nodes = document.querySelectorAll(`${S.USER_QUERY}, ${S.MODEL_RESPONSE}`);
          const messages = [];
          nodes.forEach((node, index) => {
            const isUser = node.matches(S.USER_QUERY);
            const text = isUser ? cleanVisibleText(node.querySelector(S.USER_QUERY_TEXT) || node) : cleanVisibleText(node);
            if (!text) return;
            messages.push({
              id: `m_${index}`,
              role: isUser ? "user" : "model",
              text
            });
          });
          return messages;
        },
        // ─── Mode picker ───────────────────────────────────────────────────
        getModelSwitch() {
          return firstMatch(document, S.MODE_BTN);
        },
        /**
         * The displayed model name on the pill (e.g. "Flash", "Pro").
         * Prefers the dedicated .picker-primary-text node so we don't include
         * trailing "keyboard_arrow_down" text from the icon font.
         */
        getModelSwitchLabel() {
          const btn = this.getModelSwitch();
          if (!btn) return "";
          const labelEl = btn.querySelector(S.MODE_BTN_LABEL);
          return (labelEl ? labelEl.textContent : btn.textContent || "").trim();
        },
        /**
         * Detect current model as internal key ('flash' | 'thinking' | 'pro').
         * Returns null when undetermined (caller keeps previous value).
         */
        detectModelKey() {
          try {
            const label = this.getModelSwitchLabel();
            if (label) {
              const key = normalizeModelText(label);
              if (key) return key;
            }
            const active = document.querySelector('gem-menu-item[data-active="true"], .bard-mode-list-button.is-selected');
            if (active) {
              const key = normalizeModelText(active.textContent || "");
              if (key) return key;
            }
          } catch {
          }
          return null;
        },
        /**
         * After clicking the mode button, scrape menu items into a structured list.
         * `label` is the full textContent — sufficient for keyword-based model
         * detection in `normalizeModelText`. We don't try to split title vs subtitle
         * because the DOM structure (nested generic divs) is fragile and the
         * normalizer doesn't need that precision.
         * @returns {Array<{ key: string|null, label: string, dataModeId: string|null, active: boolean, element: HTMLElement }>}
         */
        getModelMenuOptions() {
          const items = document.querySelectorAll(S.MODE_MENU_ITEM);
          const result = [];
          items.forEach((it) => {
            const label = (it.textContent || "").trim();
            result.push({
              key: normalizeModelText(label),
              label,
              dataModeId: it.getAttribute("data-mode-id"),
              active: it.getAttribute("data-active") === "true" || it.classList.contains("selected"),
              element: it
            });
          });
          return result;
        },
        /**
         * Find a menu item whose label matches the given internal key.
         * Used by default_model.js to pick the right option after opening the menu.
         */
        findModelMenuItem(internalKey) {
          const opts = this.getModelMenuOptions();
          if (internalKey === "flash") {
            const exact = opts.find((o) => o.key === "flash" && !/lite/i.test(o.label));
            if (exact) return exact.element;
          }
          const match = opts.find((o) => o.key === internalKey);
          return match ? match.element : null;
        },
        // ─── Conversation actions menu (after row More click) ──────────────
        getMenuPanel() {
          return document.querySelector(S.MENU_PANEL);
        },
        /** Find the Delete menu item — prefers data-test-id, falls back to text. */
        getDeleteMenuItem() {
          const panel = this.getMenuPanel() || document;
          const byTestId = panel.querySelector(S.DELETE_BUTTON);
          if (byTestId) return byTestId;
          const items = panel.querySelectorAll(S.MENU_ITEM);
          for (const item of items) {
            const t = (item.textContent || "").trim().toLowerCase();
            if (t.includes("delete") || t.includes("删除") || t.includes("削除") || t.includes("삭제")) {
              return item;
            }
          }
          return null;
        },
        // ─── Confirmation dialog ───────────────────────────────────────────
        getConfirmDialog() {
          return document.querySelector(S.DIALOG);
        },
        /** Pick the affirmative button (Delete / Confirm) inside a dialog. */
        getDialogConfirmButton(dialog) {
          const root = dialog || this.getConfirmDialog();
          if (!root) return null;
          const btns = root.querySelectorAll(S.DIALOG_CONFIRM_BTNS);
          for (const btn of btns) {
            const t = (btn.textContent || "").trim().toLowerCase();
            if (t.includes("delete") || t.includes("删除") || t.includes("削除") || t.includes("삭제") || t.includes("confirm") || t.includes("确认") || t.includes("確認") || t.includes("확인")) {
              return btn;
            }
          }
          return null;
        },
        // ─── MutationObserver zone matchers ────────────────────────────────
        matchesSidebarMutation(m) {
          return m && m.type === "childList" && !!closestAny(m.target, S.SIDEBAR_MUTATION_ROOT.split(", "));
        },
        matchesInputAreaMutation(m) {
          return m && m.type === "childList" && !!closestAny(m.target, S.INPUT_MUTATION_ROOT.split(", "));
        },
        matchesHeaderMutation(m) {
          return m && m.type === "childList" && !!closestAny(m.target, S.HEADER_MUTATION_ROOT.split(", "));
        },
        matchesModelMutation(m) {
          if (!m) return false;
          if (m.type === "attributes") {
            return matchesAny(m.target, S.MODEL_MUTATION_TARGET_MATCH.split(", "));
          }
          if (m.type === "childList") {
            return !!closestAny(m.target, S.INPUT_MUTATION_ROOT.split(", "));
          }
          return false;
        },
        matchesFoldersSidebarMutation(m) {
          if (!m || !m.target) return false;
          return !!closestAny(m.target, [
            "bard-sidenav-container",
            'nav[aria-label="Side Navigation"]',
            "bard-sidenav",
            'nav[role="navigation"]'
          ]);
        },
        buildUITweakCssRules({ chatWidth, sidebarWidth, hideGems } = {}) {
          const rules = [];
          if (Number.isFinite(chatWidth)) {
            rules.push(`${S.UI_TWEAK_CHAT_WIDTH_TARGET} { max-width: ${chatWidth}px !important; }`);
          }
          if (Number.isFinite(sidebarWidth)) {
            rules.push(`${S.UI_TWEAK_SIDEBAR_WIDTH_TARGET} { width: ${sidebarWidth}px !important; min-width: ${sidebarWidth}px !important; }`);
          }
          if (hideGems) {
            rules.push(`${S.UI_TWEAK_GEMS_ENTRY} { display: none !important; }`);
          }
          return rules;
        },
        getSelectorHealthReport() {
          const checks = [
            { id: "sidebar", label: "Sidebar", ok: !!this.getSidebar() },
            { id: "sidebar-overflow", label: "Sidebar overflow", ok: !!this.getSidebarOverflowContainer() },
            { id: "input-area", label: "Input area", ok: !!this.getInputArea() },
            { id: "input-editor", label: "Input editor", ok: !!this.getInputEditor() },
            { id: "input-actions", label: "Input actions", ok: !!this.getInputTrailingActions() },
            { id: "send-button", label: "Send button", ok: !!this.getSendButton() },
            { id: "chat-header", label: "Chat header", ok: !!this.getChatHeader() },
            { id: "model-switch", label: "Model switch", ok: !!this.getModelSwitch() },
            { id: "chat-links", label: "Sidebar chat links", ok: this.getChatLinkCount() > 0, detail: String(this.getChatLinkCount()) }
          ];
          const passed = checks.filter((check) => check.ok).length;
          return {
            ready: this.isReady(),
            passed,
            total: checks.length,
            failed: checks.filter((check) => !check.ok).map((check) => check.id),
            checks
          };
        },
        getRuntimeProbeReport() {
          const selectorHealth = this.getSelectorHealthReport();
          const chatLinks = this.scanSidebarChatLinks();
          const firstChat = chatLinks[0] || null;
          const modelOptions = this.getModelMenuOptions();
          const chatId = this.getChatId();
          return {
            generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
            page: {
              host: location.host,
              pathKind: chatId ? "conversation" : this.isNewChatUrl() ? "new-chat" : "other",
              chatIdPresent: !!chatId,
              viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                dpr: window.devicePixelRatio
              }
            },
            selectorHealth,
            probes: {
              sidebar: {
                present: !!this.getSidebar(),
                chatCount: chatLinks.length,
                firstRowActionPresent: !!(firstChat && this.getChatRowMoreButton(firstChat.element))
              },
              input: {
                areaPresent: !!this.getInputArea(),
                editorPresent: !!this.getInputEditor(),
                sendButtonPresent: !!this.getSendButton(),
                activeToolMode: this.getActiveToolMode(),
                visibleToolModeEntries: this.getVisibleToolModeEntries()
              },
              model: {
                switchPresent: !!this.getModelSwitch(),
                labelPresent: !!this.getModelSwitchLabel(),
                detectedKey: this.detectModelKey(),
                openMenuOptionCount: modelOptions.length,
                openMenuKeys: modelOptions.map((option) => option.key).filter(Boolean)
              },
              header: {
                anchorPresent: !!this.getChatHeader(),
                titleTextPresent: !!this.getChatTitleText()
              },
              conversation: {
                visibleMessageCount: this.getCurrentConversationMessages().length
              }
            }
          };
        }
      };
    }
  });

  // src/core.js
  var Core;
  var init_core = __esm({
    "src/core.js"() {
      init_constants();
      init_state();
      init_gemini();
      Core = {
        // --- User management ---
        registerUser(userId) {
          if (!userId || userId === TEMP_USER || !userId.includes("@")) return;
          let registry;
          try {
            registry = GM_getValue(GLOBAL_KEYS.REGISTRY, []);
          } catch (e) {
            registry = [];
          }
          if (!registry.includes(userId)) {
            registry.push(userId);
            try {
              GM_setValue(GLOBAL_KEYS.REGISTRY, registry);
            } catch (e) {
            }
          }
        },
        getAllUsers() {
          try {
            return GM_getValue(GLOBAL_KEYS.REGISTRY, []);
          } catch (e) {
            return [];
          }
        },
        detectUser() {
          return GeminiAdapter.detectUserEmail();
        },
        getCurrentUser() {
          return getCurrentUser();
        },
        getInspectingUser() {
          return getInspectingUser();
        },
        setInspectingUser(user) {
          setInspectingUser(user);
        },
        getTempUser() {
          return TEMP_USER;
        },
        // --- Theme management ---
        _autoThemeQuery: null,
        _autoThemeHandler: null,
        _appliedRootTheme: null,
        /** Resolve 'auto' to a concrete theme key based on system preference */
        resolveTheme(key) {
          if (key !== "auto") return key;
          try {
            return window.matchMedia("(prefers-color-scheme: light)").matches ? "paper" : "glass";
          } catch (e) {
            return "glass";
          }
        },
        getTheme() {
          return getCurrentTheme();
        },
        setTheme(key) {
          if (THEMES[key]) {
            setCurrentTheme(key);
            try {
              GM_setValue(GLOBAL_KEYS.THEME, key);
            } catch (e) {
            }
            this._updateAutoListener(key);
          }
        },
        getThemes() {
          return THEMES;
        },
        applyTheme(el, themeKey) {
          if (!el) return;
          const resolved = this.resolveTheme(themeKey);
          if (!THEMES[resolved]) return;
          const vars = THEMES[resolved].vars;
          for (const [key, val] of Object.entries(vars)) {
            el.style.setProperty(key, val);
          }
          if (this._appliedRootTheme !== resolved) {
            for (const [key, val] of Object.entries(vars)) {
              document.documentElement.style.setProperty(key, val);
            }
            this._appliedRootTheme = resolved;
          }
        },
        /** Start/stop matchMedia listener for auto theme */
        _updateAutoListener(key) {
          if (this._autoThemeQuery && this._autoThemeHandler) {
            this._autoThemeQuery.removeEventListener("change", this._autoThemeHandler);
            this._autoThemeQuery = null;
            this._autoThemeHandler = null;
          }
          if (key !== "auto") return;
          try {
            this._autoThemeQuery = window.matchMedia("(prefers-color-scheme: light)");
            this._autoThemeHandler = () => {
              const panel = document.getElementById(PANEL_ID);
              if (panel) this.applyTheme(panel, "auto");
            };
            this._autoThemeQuery.addEventListener("change", this._autoThemeHandler);
          } catch (e) {
          }
        },
        // --- Storage listener ---
        setupStorageListener(targetUser, callback) {
          const lid = getStorageListenerId();
          if (lid) {
            try {
              GM_removeValueChangeListener(lid);
            } catch (e) {
            }
            setStorageListenerId(null);
          }
          if (!targetUser || targetUser === TEMP_USER) return;
          const storageKey = `gemini_store_${targetUser}`;
          try {
            const newId = GM_addValueChangeListener(storageKey, (name, oldVal, newVal, remote) => {
              if (remote && newVal && callback) {
                try {
                  callback(newVal);
                } catch (e) {
                }
              }
            });
            setStorageListenerId(newId);
          } catch (e) {
          }
        },
        // --- Shared utilities ---
        sleep(ms) {
          return new Promise((r) => setTimeout(r, ms));
        },
        _sidebarCache: null,
        _sidebarCacheTime: 0,
        scanSidebarChats(forceRefresh = false) {
          const now = Date.now();
          const liveCount = GeminiAdapter.getChatLinkCount();
          if (!forceRefresh && this._sidebarCache && now - this._sidebarCacheTime < 2e3 && this._sidebarCache.length === liveCount && (this._sidebarCache.length === 0 || this._sidebarCache[0].element?.isConnected)) {
            return this._sidebarCache;
          }
          const items = GeminiAdapter.scanSidebarChatLinks();
          this._sidebarCache = items;
          this._sidebarCacheTime = now;
          return items;
        },
        invalidateSidebarCache() {
          this._sidebarCache = null;
          this._sidebarCacheTime = 0;
        },
        // --- URL utilities ---
        getChatId() {
          return GeminiAdapter.getChatId();
        },
        // --- Date utilities ---
        getDayKey(resetHour = 0) {
          const now = /* @__PURE__ */ new Date();
          if (now.getHours() < resetHour) {
            now.setDate(now.getDate() - 1);
          }
          const y = now.getFullYear();
          const m = String(now.getMonth() + 1).padStart(2, "0");
          const day = String(now.getDate()).padStart(2, "0");
          return `${y}-${m}-${day}`;
        }
      };
    }
  });

  // src/native_ui.js
  var NativeUI;
  var init_native_ui = __esm({
    "src/native_ui.js"() {
      init_module_registry();
      init_core();
      init_state();
      init_logger();
      init_gemini();
      NativeUI = {
        isZH: navigator.language.startsWith("zh"),
        t(zh, en) {
          return this.isZH ? zh : en;
        },
        trapFocus(container) {
          const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
          const handler = (e) => {
            if (e.key !== "Tab") return;
            const focusable = Array.from(container.querySelectorAll(selector)).filter((el) => !el.disabled && el.tabIndex !== -1);
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          };
          container.addEventListener("keydown", handler);
          return () => container.removeEventListener("keydown", handler);
        },
        /**
         * Show a brief toast notification at the bottom of the screen.
         * @param {string} message
         * @param {number} [duration=2000] - ms before auto-dismiss
         */
        showToast(message, duration = 2e3) {
          const toast = document.createElement("div");
          toast.className = "gc-toast";
          toast.textContent = message;
          document.body.appendChild(toast);
          requestAnimationFrame(() => toast.classList.add("visible"));
          setTimeout(() => {
            toast.classList.remove("visible");
            setTimeout(() => toast.remove(), 200);
          }, duration);
        },
        // Dirty tracking: only re-inject modules when DOM structure changes
        _dirtyModules: /* @__PURE__ */ new Set(),
        _retryCount: {},
        // Zone → module IDs: which modules inject into which DOM zones
        _zoneModules: {
          sidebar: ["folders", "batch-delete"],
          input: ["prompt-vault", "ui-tweaks", "default-model", "message-queue"],
          header: ["export"]
        },
        _clearRetryTimer() {
          if (this._retryTimer) {
            clearTimeout(this._retryTimer);
            this._retryTimer = null;
          }
        },
        markAllDirty() {
          ModuleRegistry.enabledModules.forEach((id) => {
            this._dirtyModules.add(id);
            delete this._retryCount[id];
          });
          this._clearRetryTimer();
        },
        /** Mark only modules that inject into a specific DOM zone */
        markDirtyByZone(zone) {
          const ids = this._zoneModules[zone];
          if (!ids) return this.markAllDirty();
          for (const id of ids) {
            if (ModuleRegistry.isEnabled(id)) {
              this._dirtyModules.add(id);
              delete this._retryCount[id];
            }
          }
          this._clearRetryTimer();
        },
        markDirty(id) {
          this._dirtyModules.add(id);
          delete this._retryCount[id];
          this._clearRetryTimer();
        },
        remove(id) {
          const el = document.getElementById(id);
          if (el) el.remove();
        },
        getSidebar() {
          return GeminiAdapter.getSidebar();
        },
        getInputArea() {
          return GeminiAdapter.getInputArea();
        },
        getChatHeader() {
          return GeminiAdapter.getChatHeader();
        },
        getModelSwitch() {
          return GeminiAdapter.getModelSwitch();
        },
        /**
         * Show a themed confirmation dialog (replaces native confirm()).
         * @param {string} message - Confirmation message
         * @param {Function} onConfirm - Called when user confirms
         * @param {Object} [opts] - { confirmText, cancelText, danger }
         */
        showConfirm(message, onConfirm, opts = {}) {
          const overlay = document.createElement("div");
          overlay.className = "settings-overlay";
          let releaseFocus = null;
          const escHandler = (e) => {
            if (e.key === "Escape") close(false);
          };
          document.addEventListener("keydown", escHandler);
          const close = (confirmed) => {
            document.removeEventListener("keydown", escHandler);
            if (releaseFocus) releaseFocus();
            overlay.remove();
            if (confirmed) onConfirm();
          };
          overlay.onclick = (e) => {
            if (e.target === overlay) close(false);
          };
          const modal = document.createElement("div");
          modal.className = "settings-modal";
          modal.style.width = "280px";
          try {
            Core.applyTheme(modal, getCurrentTheme());
          } catch {
          }
          const body = document.createElement("div");
          body.style.cssText = "padding:20px;font-size:13px;color:var(--text-main,#e8eaed);line-height:1.6;";
          body.textContent = message;
          const actions = document.createElement("div");
          actions.style.cssText = "display:flex;gap:8px;justify-content:flex-end;padding:0 20px 16px;";
          const cancelBtn = document.createElement("button");
          cancelBtn.className = "settings-btn";
          cancelBtn.style.cssText = "width:auto;padding:8px 16px;";
          cancelBtn.textContent = opts.cancelText || this.t("取消", "Cancel");
          cancelBtn.onclick = () => close(false);
          const confirmBtn = document.createElement("button");
          confirmBtn.className = "settings-btn";
          confirmBtn.style.cssText = `width:auto;padding:8px 16px;background:${opts.danger ? "#ea4335" : "var(--accent,#8ab4f8)"};color:${opts.danger ? "#fff" : "#000"};font-weight:600;`;
          confirmBtn.textContent = opts.confirmText || this.t("确认", "Confirm");
          confirmBtn.onclick = () => close(true);
          actions.appendChild(cancelBtn);
          actions.appendChild(confirmBtn);
          modal.appendChild(body);
          modal.appendChild(actions);
          overlay.appendChild(modal);
          document.body.appendChild(overlay);
          releaseFocus = this.trapFocus(modal);
          confirmBtn.focus();
        },
        // Called from zone handlers — only processes dirty modules
        _retryTimer: null,
        tick() {
          if (this._dirtyModules.size === 0) return;
          let needsRetry = false;
          const toProcess = [...this._dirtyModules];
          for (const id of toProcess) {
            if (!ModuleRegistry.isEnabled(id)) {
              this._dirtyModules.delete(id);
              delete this._retryCount[id];
              continue;
            }
            const mod = ModuleRegistry.modules[id];
            if (typeof mod?.injectNativeUI === "function") {
              try {
                mod.injectNativeUI();
                this._dirtyModules.delete(id);
                delete this._retryCount[id];
              } catch (e) {
                const count = (this._retryCount[id] || 0) + 1;
                this._retryCount[id] = count;
                if (count >= 5) {
                  Logger.warn("Native UI injection failed after retries", { id, error: String(e) });
                  this._dirtyModules.delete(id);
                  delete this._retryCount[id];
                } else {
                  needsRetry = true;
                }
              }
            } else {
              this._dirtyModules.delete(id);
            }
          }
          if (needsRetry && !this._retryTimer) {
            const maxCount = Math.max(...Object.values(this._retryCount), 1);
            const delay = 500 * Math.pow(2, maxCount - 1);
            this._retryTimer = setTimeout(() => {
              this._retryTimer = null;
              this.tick();
            }, delay);
          }
        }
      };
    }
  });

  // lib/date_utils.js
  var require_date_utils = __commonJS({
    "lib/date_utils.js"(exports, module) {
      "use strict";
      function formatLocalDate6(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
      function getDayKey(resetHour, now) {
        const d = now ? new Date(now.getTime()) : /* @__PURE__ */ new Date();
        if (d.getHours() < resetHour) {
          d.setDate(d.getDate() - 1);
        }
        return formatLocalDate6(d);
      }
      function getDayKeyForDate(date, resetHour) {
        return getDayKey(resetHour, date);
      }
      function parseLocalDate(dateStr) {
        const [y, m, d] = dateStr.split("-").map(Number);
        return new Date(y, m - 1, d);
      }
      module.exports = { formatLocalDate: formatLocalDate6, getDayKey, getDayKeyForDate, parseLocalDate };
    }
  });

  // src/icons.js
  function createIcon(name, size = 16) {
    const paths = PATHS[name];
    if (!paths) return document.createTextNode(name);
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "gc-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.25");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("shape-rendering", "geometricPrecision");
    svg.style.verticalAlign = "middle";
    svg.style.flexShrink = "0";
    for (const d of paths) {
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }
    const dots = DOTS[name];
    if (dots) {
      for (const { cx, cy, r } of dots) {
        const circle = document.createElementNS(NS, "circle");
        circle.setAttribute("cx", String(cx));
        circle.setAttribute("cy", String(cy));
        circle.setAttribute("r", String(r));
        circle.setAttribute("fill", "currentColor");
        circle.setAttribute("stroke", "none");
        svg.appendChild(circle);
      }
    }
    return svg;
  }
  var NS, PATHS, DOTS;
  var init_icons = __esm({
    "src/icons.js"() {
      NS = "http://www.w3.org/2000/svg";
      PATHS = {
        menu: ["M4 12h16", "M4 6h16", "M4 18h16"],
        settings: [
          "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
          "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
        ],
        chart: ["M18 20V10", "M12 20V4", "M6 20v-6"],
        x: ["M18 6 6 18", "M6 6l12 12"],
        download: [
          "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
          "M7 10l5 5 5-5",
          "M12 15V3"
        ],
        upload: [
          "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
          "M17 8l-5-5-5 5",
          "M12 3v12"
        ],
        trash: [
          "M3 6h18",
          "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",
          "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
        ],
        folder: [
          "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"
        ],
        gem: ["M6 3h12l4 6-10 13L2 9z", "M11 3l1 10", "M2 9h20"],
        bot: [
          "M12 8V4H8",
          "M2 14a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z",
          "M6 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
          "M18 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
        ],
        quote: [
          "M3 21c3 0 7-1 7-8V5c0-1.25-.76-2.017-2-2H5c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2z",
          "M15 21c3 0 7-1 7-8V5c0-1.25-.76-2.017-2-2h-3c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2z"
        ],
        palette: [
          "M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10c0 .7-.07 1.38-.2 2.04a2.5 2.5 0 0 1-2.46 2.07c-.26 0-.5-.04-.74-.12A2.49 2.49 0 0 0 17 16a2.5 2.5 0 0 0-2.5 2.5c0 .69.28 1.31.73 1.76A9.93 9.93 0 0 1 12 22z"
        ],
        wrench: [
          "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
        ],
        pin: [
          "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
          "M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
        ],
        bug: [
          "M8 2l1.88 1.88",
          "M14.12 3.88 16 2",
          "M9 7.13v-1a3.003 3.003 0 1 1 6 0v1",
          "M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6",
          "M12 20v-9",
          "M6.53 9C4.6 8.8 3 7.1 3 5",
          "M6 13H2",
          "M3 21c0-2.1 1.7-3.9 3.8-4",
          "M20.97 5c0 2.1-1.6 3.8-3.5 4",
          "M22 13h-4",
          "M17.2 17c2.1.1 3.8 1.9 3.8 4"
        ],
        package: [
          "M16.5 9.4 7.55 4.24",
          "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
          "M3.27 6.96 12 12.01l8.73-5.05",
          "M12 22.08V12"
        ],
        info: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 16v-4", "M12 8h.01"],
        refresh: [
          "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
          "M21 3v5h-5",
          "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
          "M8 16H3v5"
        ],
        lock: [
          "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z",
          "M7 11V7a5 5 0 0 1 10 0v4"
        ],
        edit: ["M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"],
        copy: [
          "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
          "M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"
        ],
        plus: ["M12 5v14", "M5 12h14"],
        play: ["M5 5a2 2 0 0 1 3.01-1.72l10.99 7a2 2 0 0 1 0 3.44L8.01 20.72A2 2 0 0 1 5 19z"],
        pause: ["M6 4h4v16H6z", "M14 4h4v16h-4z"],
        "arrow-up": ["M12 19V5", "M5 12l7-7 7 7"],
        "arrow-down": ["M12 5v14", "M19 12l-7 7-7-7"],
        search: [
          "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
          "M21 21l-4.35-4.35"
        ],
        globe: [
          "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
          "M2 12h20",
          "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
        ],
        "file-text": [
          "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z",
          "M14 2v4a2 2 0 0 0 2 2h4",
          "M10 9H8",
          "M16 13H8",
          "M16 17H8"
        ],
        compass: [
          "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
          "M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36z"
        ]
      };
      DOTS = {
        palette: [
          { cx: 7.5, cy: 10.5, r: 1.5 },
          { cx: 12, cy: 7.5, r: 1.5 },
          { cx: 16.5, cy: 10.5, r: 1.5 }
        ]
      };
    }
  });

  // lib/counter_calc.js
  var require_counter_calc = __commonJS({
    "lib/counter_calc.js"(exports, module) {
      "use strict";
      var { formatLocalDate: formatLocalDate6, getDayKey, parseLocalDate } = require_date_utils();
      function calculateStreaks2(dailyCounts, resetHour, now) {
        const dates = Object.keys(dailyCounts || {}).sort();
        if (dates.length === 0) return { current: 0, best: 0 };
        let best = 0, temp = 0, lastDate = null;
        for (const dateStr of dates) {
          if ((dailyCounts[dateStr].messages || 0) === 0) continue;
          const d = parseLocalDate(dateStr);
          if (lastDate) {
            const diff = (d - lastDate) / (1e3 * 60 * 60 * 24);
            if (Math.round(diff) === 1) temp++;
            else if (diff > 1) temp = 1;
          } else {
            temp = 1;
          }
          if (temp > best) best = temp;
          lastDate = d;
        }
        const ref = now ? new Date(now.getTime()) : /* @__PURE__ */ new Date();
        const todayStr = getDayKey(resetHour, ref);
        const yesterdayDate = new Date(ref.getTime());
        if (yesterdayDate.getHours() < resetHour) yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = formatLocalDate6(yesterdayDate);
        const startStr = dailyCounts[todayStr]?.messages > 0 ? todayStr : yesterdayStr;
        let checkDate = parseLocalDate(startStr);
        let current = 0;
        while (true) {
          const key = formatLocalDate6(checkDate);
          if (dailyCounts[key] && dailyCounts[key].messages > 0) {
            current++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        }
        return { current, best };
      }
      function getLast7DaysData2(dailyCounts, resetHour, now) {
        const result = [];
        const ref = now || /* @__PURE__ */ new Date();
        for (let i = 6; i >= 0; i--) {
          const d = new Date(ref.getTime());
          d.setDate(d.getDate() - i);
          const key = getDayKey(resetHour || 0, d);
          const [, m, day] = key.split("-");
          result.push({
            date: key,
            label: `${parseInt(m)}/${parseInt(day)}`,
            messages: (dailyCounts || {})[key]?.messages || 0
          });
        }
        return result;
      }
      function ensureTodayEntry2(dailyCounts, todayKey) {
        if (!dailyCounts[todayKey]) {
          dailyCounts[todayKey] = { messages: 0, chats: 0, byModel: { flash: 0, thinking: 0, pro: 0 } };
        }
        if (!dailyCounts[todayKey].byModel) {
          dailyCounts[todayKey].byModel = { flash: 0, thinking: 0, pro: 0 };
        }
        return todayKey;
      }
      module.exports = { calculateStreaks: calculateStreaks2, getLast7DaysData: getLast7DaysData2, ensureTodayEntry: ensureTodayEntry2 };
    }
  });

  // lib/model_config.js
  var require_model_config = __commonJS({
    "lib/model_config.js"(exports, module) {
      "use strict";
      var MODEL_CONFIG = {
        flash: { label: "3 Flash", multiplier: 0, color: "#34a853" },
        thinking: { label: "3 Flash Thinking", multiplier: 0.33, color: "#fbbc04" },
        pro: { label: "3 Pro", multiplier: 1, color: "#ea4335" }
      };
      var MODEL_DETECT_MAP = {
        // EN
        "Fast": "flash",
        "Flash": "flash",
        "flash": "flash",
        "Thinking": "thinking",
        "thinking": "thinking",
        "Pro": "pro",
        "pro": "pro",
        // ZH
        "快速": "flash",
        "思考": "thinking",
        "专业": "pro",
        // JA
        "高速": "flash",
        "プロ": "pro",
        // KO
        "빠른": "flash",
        "사고": "thinking",
        "프로": "pro"
      };
      module.exports = { MODEL_CONFIG, MODEL_DETECT_MAP };
    }
  });

  // lib/quota_calc.js
  var require_quota_calc = __commonJS({
    "lib/quota_calc.js"(exports, module) {
      var { MODEL_CONFIG } = require_model_config();
      var { getDayKey, parseLocalDate } = require_date_utils();
      function getWeightedQuota(byModel, config = MODEL_CONFIG) {
        if (!byModel || typeof byModel !== "object") return 0;
        return Object.keys(byModel).reduce((sum, key) => {
          const mult = config[key]?.multiplier ?? 1;
          return sum + (byModel[key] || 0) * mult;
        }, 0);
      }
      function ensureByModel(entry) {
        if (!entry) return { messages: 0, chats: 0, byModel: { flash: 0, thinking: 0, pro: 0 } };
        if (!entry.byModel) {
          entry.byModel = { flash: 0, thinking: 0, pro: 0 };
        }
        return entry;
      }
      function formatQuotaLabel(rawCount, weighted, limit) {
        const weightedStr = weighted % 1 === 0 ? String(weighted) : weighted.toFixed(1);
        return `${rawCount} msgs (${weightedStr} weighted) / ${limit}`;
      }
      function getQuotaBarState(weighted, limit) {
        const pct = limit > 0 ? Math.min(weighted / limit * 100, 100) : 0;
        let color;
        if (pct < 60) color = "#34a853";
        else if (pct < 85) color = "#fbbc04";
        else color = "#ea4335";
        return { pct, color };
      }
      function normalizeResetHour(value) {
        const hour = Number(value);
        if (!Number.isFinite(hour)) return 0;
        return Math.max(0, Math.min(23, Math.floor(hour)));
      }
      function formatResetHour(hour) {
        return `${String(normalizeResetHour(hour)).padStart(2, "0")}:00`;
      }
      function formatQuotaWindowRemaining(minutes) {
        const total = Math.max(0, Math.ceil(Number(minutes) || 0));
        if (total === 0) return "now";
        const hours = Math.floor(total / 60);
        const mins = total % 60;
        if (hours && mins) return `${hours}h ${mins}m`;
        if (hours) return `${hours}h`;
        return `${mins}m`;
      }
      function getQuotaWindowState2(resetHour = 0, now) {
        const hour = normalizeResetHour(resetHour);
        let ref = now instanceof Date ? new Date(now.getTime()) : new Date(now || Date.now());
        if (Number.isNaN(ref.getTime())) ref = /* @__PURE__ */ new Date();
        const dayKey = getDayKey(hour, ref);
        const windowStart = parseLocalDate(dayKey);
        windowStart.setHours(hour, 0, 0, 0);
        const windowEnd = new Date(windowStart.getTime());
        windowEnd.setDate(windowEnd.getDate() + 1);
        const remainingMinutes = Math.max(0, Math.ceil((windowEnd.getTime() - ref.getTime()) / 6e4));
        const resetLabel = formatResetHour(hour);
        return {
          resetHour: hour,
          dayKey,
          windowStart,
          windowEnd,
          resetLabel,
          windowLabel: `${resetLabel}-${resetLabel}`,
          remainingMinutes,
          remainingLabel: formatQuotaWindowRemaining(remainingMinutes)
        };
      }
      module.exports = {
        getWeightedQuota,
        ensureByModel,
        formatQuotaLabel,
        getQuotaBarState,
        normalizeResetHour,
        formatResetHour,
        formatQuotaWindowRemaining,
        getQuotaWindowState: getQuotaWindowState2
      };
    }
  });

  // src/modules/counter.js
  var import_counter_calc, import_quota_calc, CounterModule;
  var init_counter = __esm({
    "src/modules/counter.js"() {
      init_constants();
      init_logger();
      init_core();
      init_module_registry();
      init_panel_ui();
      init_native_ui();
      init_gemini();
      import_counter_calc = __toESM(require_counter_calc());
      import_quota_calc = __toESM(require_quota_calc());
      CounterModule = {
        id: "counter",
        name: NativeUI.t("消息计数器", "Message Counter"),
        description: NativeUI.t("统计消息数量、热力图、配额追踪", "Message stats, heatmap & quota tracking"),
        icon: "📊",
        defaultEnabled: true,
        // --- Module private constants ---
        COOLDOWN: TIMINGS.COUNTER_COOLDOWN,
        MODEL_CONFIG: {
          flash: { label: "3 Flash", multiplier: 0, color: "#34a853" },
          thinking: { label: "3 Flash Thinking", multiplier: 0.33, color: "#fbbc04" },
          pro: { label: "3 Pro", multiplier: 1, color: "#ea4335" }
        },
        // Model detection moved to GeminiAdapter.detectModelKey (v12). The previous
        // MODEL_DETECT_MAP lived here; lib/model_config.js still ships an identical
        // map alongside MODEL_CONFIG so the sync test can verify the multiplier
        // contract \u2014 see lib/model_config.js for the authoritative source.
        // --- Module private state ---
        resetHour: 0,
        quotaLimit: 50,
        currentModel: "flash",
        accountType: "free",
        lastDisplayedVal: -1,
        lastCountTime: 0,
        state: {
          total: 0,
          totalChatsCreated: 0,
          chats: {},
          dailyCounts: {},
          viewMode: "today",
          isExpanded: false,
          resetStep: 0
        },
        // --- Lifecycle ---
        init() {
          try {
            this.resetHour = GM_getValue(GLOBAL_KEYS.RESET_HOUR, 0);
          } catch (e) {
            this.resetHour = 0;
          }
          try {
            this.quotaLimit = GM_getValue(GLOBAL_KEYS.QUOTA, 50);
          } catch (e) {
            this.quotaLimit = 50;
          }
          this.bindEvents();
          Logger.info("CounterModule initialized");
        },
        destroy() {
          if (this._boundKeyHandler) {
            document.removeEventListener("keydown", this._boundKeyHandler, true);
            this._boundKeyHandler = null;
          }
          if (this._boundClickHandler) {
            document.removeEventListener("click", this._boundClickHandler, true);
            this._boundClickHandler = null;
          }
          if (this._cidPoller) {
            clearInterval(this._cidPoller);
            this._cidPoller = null;
          }
          if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
            this.saveData();
          }
          Core.setupStorageListener(null, null);
          Logger.info("CounterModule destroyed");
        },
        onUserChange(user) {
          this.loadDataForUser(user);
        },
        _boundKeyHandler: null,
        _boundClickHandler: null,
        _cidPoller: null,
        bindEvents() {
          if (this._boundKeyHandler && this._boundClickHandler) return;
          if (this._cidPoller) {
            clearInterval(this._cidPoller);
            this._cidPoller = null;
          }
          if (this._boundKeyHandler) {
            document.removeEventListener("keydown", this._boundKeyHandler, true);
            this._boundKeyHandler = null;
          }
          if (this._boundClickHandler) {
            document.removeEventListener("click", this._boundClickHandler, true);
            this._boundClickHandler = null;
          }
          this._boundKeyHandler = (e) => {
            if (!ModuleRegistry.isEnabled("counter")) return;
            if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.originalEvent?.isComposing) return;
            const act = document.activeElement;
            if (GeminiAdapter.isInsideInputEditor(act)) {
              setTimeout(() => this.attemptIncrement(), 50);
            }
          };
          this._boundClickHandler = (e) => {
            if (!ModuleRegistry.isEnabled("counter")) return;
            const sendBtn = GeminiAdapter.getClosestSendButton(e.target);
            if (sendBtn) {
              this.attemptIncrement();
            }
          };
          document.addEventListener("keydown", this._boundKeyHandler, true);
          document.addEventListener("click", this._boundClickHandler, true);
        },
        // --- Data management ---
        loadDataForUser(targetUser) {
          if (!targetUser) return;
          Core.setupStorageListener(targetUser, (newVal) => {
            this.state.total = newVal.total || 0;
            this.state.totalChatsCreated = newVal.totalChatsCreated || 0;
            this.state.chats = newVal.chats || {};
            this.state.dailyCounts = newVal.dailyCounts || {};
            PanelUI.update();
          });
          if (targetUser === TEMP_USER) {
            Object.assign(this.state, { total: 0, totalChatsCreated: 0, chats: {}, dailyCounts: {}, viewMode: "today", isExpanded: false, resetStep: 0 });
            return;
          }
          const storageKey = `gemini_store_${targetUser}`;
          let savedData;
          try {
            savedData = GM_getValue(storageKey, null);
          } catch (e) {
            savedData = null;
          }
          if (savedData && typeof savedData === "object") {
            this.state.total = typeof savedData.total === "number" ? savedData.total : 0;
            this.state.totalChatsCreated = typeof savedData.totalChatsCreated === "number" ? savedData.totalChatsCreated : 0;
            this.state.chats = typeof savedData.chats === "object" && savedData.chats ? savedData.chats : {};
            this.state.dailyCounts = typeof savedData.dailyCounts === "object" && savedData.dailyCounts ? savedData.dailyCounts : {};
            if (savedData.session && Object.keys(this.state.dailyCounts).length === 0) {
              const today = Core.getDayKey(this.resetHour);
              this.state.dailyCounts[today] = { messages: savedData.session, chats: 0 };
            }
          } else {
            Object.assign(this.state, { total: 0, totalChatsCreated: 0, chats: {}, dailyCounts: {}, viewMode: "today", isExpanded: false, resetStep: 0 });
          }
          Logger.debug("Loaded user data", {
            user: targetUser,
            total: this.state.total,
            totalChatsCreated: this.state.totalChatsCreated,
            days: Object.keys(this.state.dailyCounts).length
          });
        },
        _saveTimer: null,
        saveData() {
          const user = Core.getCurrentUser();
          if (!user || !user.includes("@")) return;
          const storageKey = `gemini_store_${user}`;
          try {
            GM_setValue(storageKey, {
              total: this.state.total,
              totalChatsCreated: this.state.totalChatsCreated,
              chats: this.state.chats,
              dailyCounts: this.state.dailyCounts
            });
          } catch (e) {
            Logger.warn("Failed to persist counter data", { user: user.split("@")[0], error: String(e) });
          }
        },
        /** Debounced save — coalesces multiple rapid state changes into one GM_setValue */
        _debouncedSave() {
          if (this._saveTimer) return;
          this._saveTimer = setTimeout(() => {
            this._saveTimer = null;
            this.saveData();
          }, 300);
        },
        /** Immediately persist any pending counter state. Safe to call from pagehide/beforeunload. */
        flushPendingSave() {
          if (!this._saveTimer) return;
          clearTimeout(this._saveTimer);
          this._saveTimer = null;
          this.saveData();
        },
        // --- Counting logic ---
        ensureTodayEntry() {
          const today = Core.getDayKey(this.resetHour);
          return (0, import_counter_calc.ensureTodayEntry)(this.state.dailyCounts, today);
        },
        getTodayMessages() {
          const today = Core.getDayKey(this.resetHour);
          return this.state.dailyCounts[today]?.messages || 0;
        },
        getTodayByModel() {
          const today = Core.getDayKey(this.resetHour);
          return this.state.dailyCounts[today]?.byModel || { flash: 0, thinking: 0, pro: 0 };
        },
        getWeightedQuota() {
          const bm = this.getTodayByModel();
          return Object.keys(bm).reduce((sum, key) => {
            const mult = this.MODEL_CONFIG[key]?.multiplier ?? 1;
            return sum + bm[key] * mult;
          }, 0);
        },
        getQuotaWindowState(now) {
          return (0, import_quota_calc.getQuotaWindowState)(this.resetHour, now);
        },
        attemptIncrement() {
          const now = Date.now();
          if (now - this.lastCountTime < this.COOLDOWN) return;
          const currentUser2 = Core.getCurrentUser();
          if (Core.getInspectingUser() !== currentUser2) {
            Core.setInspectingUser(currentUser2);
            this.loadDataForUser(currentUser2);
          }
          const today = this.ensureTodayEntry();
          this.state.total++;
          this.state.dailyCounts[today].messages++;
          const model = this.currentModel || "flash";
          if (this.state.dailyCounts[today].byModel) {
            this.state.dailyCounts[today].byModel[model] = (this.state.dailyCounts[today].byModel[model] || 0) + 1;
          }
          this.lastCountTime = now;
          const cid = Core.getChatId();
          if (cid) {
            if (!this.state.chats[cid]) {
              this.state.totalChatsCreated++;
              this.state.dailyCounts[today].chats++;
            }
            this.state.chats[cid] = (this.state.chats[cid] || 0) + 1;
            this._debouncedSave();
            PanelUI.update();
          } else {
            this._debouncedSave();
            PanelUI.update();
            let attempts = 0;
            const capturedDay = today;
            if (this._cidPoller) clearInterval(this._cidPoller);
            this._cidPoller = setInterval(() => {
              attempts++;
              const newCid = Core.getChatId();
              if (newCid) {
                clearInterval(this._cidPoller);
                this._cidPoller = null;
                if (!this.state.chats[newCid]) {
                  this.state.totalChatsCreated++;
                  this.ensureTodayEntry();
                  if (this.state.dailyCounts[capturedDay]) {
                    this.state.dailyCounts[capturedDay].chats++;
                  }
                }
                this.state.chats[newCid] = (this.state.chats[newCid] || 0) + 1;
                this._debouncedSave();
                PanelUI.update();
              } else if (attempts >= 20) {
                clearInterval(this._cidPoller);
                this._cidPoller = null;
                this._debouncedSave();
              }
            }, 500);
          }
        },
        // --- Model detection ---
        detectModel() {
          const key = GeminiAdapter.detectModelKey();
          return key || this.currentModel;
        },
        detectAccountType() {
          return GeminiAdapter.detectAccountTier();
        },
        // --- Statistics (delegating to lib pure functions) ---
        calculateStreaks() {
          return (0, import_counter_calc.calculateStreaks)(this.state.dailyCounts, this.resetHour);
        },
        getLast7DaysData() {
          return (0, import_counter_calc.getLast7DaysData)(this.state.dailyCounts, this.resetHour);
        },
        // --- Reset logic ---
        handleReset() {
          const user = Core.getCurrentUser();
          if (Core.getInspectingUser() !== user) return;
          if (this.state.resetStep === 0) {
            this.state.resetStep = 1;
            PanelUI.update();
            return;
          }
          if (this.state.viewMode === "today") {
            const today = Core.getDayKey(this.resetHour);
            if (this.state.dailyCounts[today]) {
              this.state.dailyCounts[today].messages = 0;
              this.state.dailyCounts[today].byModel = { flash: 0, thinking: 0, pro: 0 };
            }
          } else if (this.state.viewMode === "chat") {
            const cid = Core.getChatId();
            if (cid) this.state.chats[cid] = 0;
          } else if (this.state.viewMode === "total") {
            if (this.state.resetStep === 1) {
              this.state.resetStep = 2;
              PanelUI.update();
              return;
            }
            this.state.total = 0;
            this.state.chats = {};
            this.state.dailyCounts = {};
            this.state.totalChatsCreated = 0;
          }
          this.state.resetStep = 0;
          this.saveData();
          PanelUI.update();
        }
      };
    }
  });

  // src/guided_tour.js
  var STEPS, GuidedTour;
  var init_guided_tour = __esm({
    "src/guided_tour.js"() {
      init_constants();
      init_native_ui();
      STEPS = [
        { sel: "#" + PANEL_ID, zh: "这是 Primer++ 控制面板，可拖拽移动", en: "This is the Primer++ control panel, drag to move" },
        { sel: "#g-user-capsule", zh: "当前登录用户，点击可切换查看其他用户数据", en: "Current user, click to switch viewing other users" },
        { sel: "#g-big-display", zh: "今日消息计数，实时更新", en: "Today's message count, updates in real-time" },
        { sel: "#g-model-badge", zh: "当前模型显示（Flash/Thinking/Pro）", en: "Current model display (Flash/Thinking/Pro)" },
        { sel: "#g-quota-wrap", zh: "配额进度条，可在设置中自定义上限", en: "Quota progress bar, customize limit in settings" },
        { sel: "#g-action-btn", zh: "功能菜单：设置、仪表盘、导出等", en: "Action menu: settings, dashboard, export, etc." },
        { sel: "#g-details-pane", zh: "详情区域，展示各模块的详细信息", en: "Details pane showing module-specific information" }
      ];
      GuidedTour = {
        _current: 0,
        _overlay: null,
        _tooltip: null,
        _onKey: null,
        _onResize: null,
        _onComplete: null,
        hasSeen() {
          try {
            return !!GM_getValue(GLOBAL_KEYS.TOUR_SEEN, false);
          } catch {
            return false;
          }
        },
        markSeen() {
          try {
            GM_setValue(GLOBAL_KEYS.TOUR_SEEN, true);
          } catch {
          }
        },
        start(onComplete) {
          if (this._overlay) return;
          this._onComplete = onComplete || null;
          this._current = 0;
          const ov = document.createElement("div");
          ov.className = "gc-tour-overlay";
          ov.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483646;pointer-events:none;border-radius:8px;transition:top .3s,left .3s,width .3s,height .3s,box-shadow .3s;";
          document.body.appendChild(ov);
          this._overlay = ov;
          const tt = document.createElement("div");
          tt.className = "gc-tour-tooltip";
          tt.style.cssText = "position:fixed;z-index:2147483647;background:#1a1a2e;color:#e0e0e0;border:1px solid rgba(138,180,248,0.3);border-radius:10px;padding:14px 16px;max-width:280px;font-size:13px;line-height:1.5;box-shadow:0 8px 32px rgba(0,0,0,0.4);";
          document.body.appendChild(tt);
          this._tooltip = tt;
          const blocker = document.createElement("div");
          blocker.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483645;";
          blocker.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
          };
          document.body.appendChild(blocker);
          this._blocker = blocker;
          this._onKey = (e) => {
            if (e.key === "Escape") this.stop();
            else if (e.key === "ArrowRight") this.next();
            else if (e.key === "ArrowLeft") this.prev();
          };
          this._onResize = () => this._showStep(this._current);
          document.addEventListener("keydown", this._onKey);
          window.addEventListener("resize", this._onResize);
          this._showStep(0);
        },
        stop() {
          if (this._overlay) {
            this._overlay.remove();
            this._overlay = null;
          }
          if (this._tooltip) {
            this._tooltip.remove();
            this._tooltip = null;
          }
          if (this._blocker) {
            this._blocker.remove();
            this._blocker = null;
          }
          if (this._onKey) {
            document.removeEventListener("keydown", this._onKey);
            this._onKey = null;
          }
          if (this._onResize) {
            window.removeEventListener("resize", this._onResize);
            this._onResize = null;
          }
          this.markSeen();
          const cb = this._onComplete;
          this._onComplete = null;
          if (cb) setTimeout(cb, 500);
        },
        next() {
          if (this._current < STEPS.length - 1) this._showStep(++this._current);
          else this.stop();
        },
        prev() {
          if (this._current > 0) this._showStep(--this._current);
        },
        _showStep(i) {
          const step = STEPS[i];
          const el = document.querySelector(step.sel);
          if (!el) {
            this.next();
            return;
          }
          const r = el.getBoundingClientRect();
          const pad = 6;
          const ov = this._overlay;
          ov.style.top = r.top - pad + "px";
          ov.style.left = r.left - pad + "px";
          ov.style.width = r.width + pad * 2 + "px";
          ov.style.height = r.height + pad * 2 + "px";
          ov.style.boxShadow = "0 0 0 9999px rgba(0,0,0,0.6)";
          const tt = this._tooltip;
          tt.replaceChildren();
          const text = document.createElement("div");
          text.textContent = NativeUI.t(step.zh, step.en);
          text.style.marginBottom = "12px";
          tt.appendChild(text);
          const nav = document.createElement("div");
          nav.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:8px;";
          const counter = document.createElement("span");
          counter.style.cssText = "font-size:11px;opacity:0.6;";
          counter.textContent = `${i + 1} / ${STEPS.length}`;
          nav.appendChild(counter);
          const btnWrap = document.createElement("div");
          btnWrap.style.cssText = "display:flex;gap:6px;";
          const btnStyle = "padding:4px 12px;border-radius:6px;border:none;cursor:pointer;font-size:12px;";
          if (i > 0) {
            const prevBtn = document.createElement("button");
            prevBtn.style.cssText = btnStyle + "background:rgba(255,255,255,0.1);color:#e0e0e0;";
            prevBtn.textContent = NativeUI.t("上一步", "Prev");
            prevBtn.onclick = () => this.prev();
            btnWrap.appendChild(prevBtn);
          }
          const skipBtn = document.createElement("button");
          skipBtn.style.cssText = btnStyle + "background:rgba(255,255,255,0.1);color:#e0e0e0;";
          skipBtn.textContent = NativeUI.t("跳过", "Skip");
          skipBtn.onclick = () => this.stop();
          btnWrap.appendChild(skipBtn);
          const nextBtn = document.createElement("button");
          nextBtn.style.cssText = btnStyle + "background:#8ab4f8;color:#1a1a2e;font-weight:600;";
          nextBtn.textContent = i < STEPS.length - 1 ? NativeUI.t("下一步", "Next") : NativeUI.t("完成", "Done");
          nextBtn.onclick = () => this.next();
          btnWrap.appendChild(nextBtn);
          nav.appendChild(btnWrap);
          tt.appendChild(nav);
          const gap = 12;
          const ttRect = tt.getBoundingClientRect();
          let top = r.bottom + gap + pad;
          if (top + ttRect.height > window.innerHeight) {
            top = r.top - pad - gap - ttRect.height;
          }
          let left = r.left + (r.width - ttRect.width) / 2;
          left = Math.max(8, Math.min(left, window.innerWidth - ttRect.width - 8));
          top = Math.max(8, top);
          tt.style.top = top + "px";
          tt.style.left = left + "px";
        }
      };
    }
  });

  // lib/export_formatter.js
  var require_export_formatter = __commonJS({
    "lib/export_formatter.js"(exports, module) {
      var { getWeightedQuota } = require_quota_calc();
      var { formatLocalDate: formatLocalDate6 } = require_date_utils();
      function exportCSV2(dailyCounts, opts = {}) {
        const header = "Date,Messages,Chats,Flash,Thinking,Pro,Weighted";
        const rows = [];
        const sorted = Object.entries(dailyCounts || {}).sort(([a], [b]) => a.localeCompare(b));
        let sumMessages = 0, sumChats = 0, sumFlash = 0, sumThinking = 0, sumPro = 0, sumWeighted = 0;
        for (const [date, entry] of sorted) {
          const messages = entry.messages || 0;
          const chats = entry.chats || 0;
          const bm = entry.byModel || { flash: 0, thinking: 0, pro: 0 };
          const flash = bm.flash || 0;
          const thinking = bm.thinking || 0;
          const pro = bm.pro || 0;
          const weighted = getWeightedQuota(bm);
          const weightedStr = weighted % 1 === 0 ? String(weighted) : weighted.toFixed(2);
          rows.push(`${date},${messages},${chats},${flash},${thinking},${pro},${weightedStr}`);
          sumMessages += messages;
          sumChats += chats;
          sumFlash += flash;
          sumThinking += thinking;
          sumPro += pro;
          sumWeighted += weighted;
        }
        const swStr = sumWeighted % 1 === 0 ? String(sumWeighted) : sumWeighted.toFixed(2);
        rows.push(`TOTAL,${sumMessages},${sumChats},${sumFlash},${sumThinking},${sumPro},${swStr}`);
        return header + "\n" + rows.join("\n") + "\n";
      }
      function exportMarkdown2(dailyCounts, opts = {}) {
        const now = formatLocalDate6(/* @__PURE__ */ new Date());
        const user = opts.user || "Unknown";
        const lines = [];
        lines.push("# Gemini Usage Report");
        lines.push("");
        lines.push(`**User:** ${user} | **Exported:** ${now}`);
        lines.push("");
        lines.push("## Summary");
        lines.push("");
        lines.push("| Metric | Value |");
        lines.push("|--------|-------|");
        lines.push(`| Total Messages | ${opts.total || 0} |`);
        lines.push(`| Chats Created | ${opts.totalChatsCreated || 0} |`);
        if (opts.currentStreak !== void 0) {
          lines.push(`| Current Streak | ${opts.currentStreak} days |`);
        }
        if (opts.bestStreak !== void 0) {
          lines.push(`| Best Streak | ${opts.bestStreak} days |`);
        }
        lines.push("");
        const sorted = Object.entries(dailyCounts || {}).sort(([a], [b]) => a.localeCompare(b));
        const last30 = sorted.slice(-30);
        if (last30.length > 0) {
          lines.push("## Daily Breakdown (Last 30 Days)");
          lines.push("");
          lines.push("| Date | Messages | Flash | Thinking | Pro | Weighted |");
          lines.push("|------|----------|-------|----------|-----|----------|");
          for (const [date, entry] of last30) {
            const messages = entry.messages || 0;
            const bm = entry.byModel || { flash: 0, thinking: 0, pro: 0 };
            const flash = bm.flash || 0;
            const thinking = bm.thinking || 0;
            const pro = bm.pro || 0;
            const weighted = getWeightedQuota(bm);
            const wStr = weighted % 1 === 0 ? String(weighted) : weighted.toFixed(1);
            lines.push(`| ${date} | ${messages} | ${flash} | ${thinking} | ${pro} | ${wStr} |`);
          }
          lines.push("");
        }
        lines.push("---");
        lines.push("");
        lines.push("*Generated by Primer++ for Gemini*");
        lines.push("");
        return lines.join("\n");
      }
      module.exports = { exportCSV: exportCSV2, exportMarkdown: exportMarkdown2 };
    }
  });

  // lib/chat_transcript_export.js
  var require_chat_transcript_export = __commonJS({
    "lib/chat_transcript_export.js"(exports, module) {
      function toText(value) {
        if (value === null || value === void 0) return "";
        return String(value);
      }
      function cleanText(value) {
        return toText(value).trim();
      }
      function escapeHTML(value) {
        const replacements = {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        };
        return toText(value).replace(/[&<>"']/g, (char) => replacements[char]);
      }
      function normalizeRole(value) {
        const role = cleanText(value).toLowerCase();
        if (role === "user" || role === "assistant" || role === "model" || role === "system") return role;
        return "message";
      }
      function normalizeMessage(raw, index = 0) {
        const source = raw && typeof raw === "object" ? raw : {};
        const text = cleanText(source.text === void 0 ? source.content : source.text);
        if (!text) return null;
        return {
          id: cleanText(source.id) || `m_${index}`,
          role: normalizeRole(source.role),
          text,
          createdAt: cleanText(source.createdAt)
        };
      }
      function normalizeTranscript(raw, opts = {}) {
        const source = raw && typeof raw === "object" ? raw : {};
        const rawMessages = Array.isArray(source.messages) ? source.messages : [];
        const messages = rawMessages.map((message, index) => normalizeMessage(message, index)).filter(Boolean);
        const exportedAt = cleanText(opts.nowIso) || cleanText(source.exportedAt) || (/* @__PURE__ */ new Date()).toISOString();
        return {
          chatId: cleanText(source.chatId),
          title: cleanText(source.title) || "Gemini conversation",
          href: cleanText(source.href),
          exportedAt,
          messages
        };
      }
      function normalizeBulkStatus(value, messages) {
        const status = cleanText(value).toLowerCase();
        if (status === "exported" || status === "empty" || status === "failed" || status === "skipped") return status;
        return messages.length > 0 ? "exported" : "empty";
      }
      function normalizeBulkTranscriptExport(raw, opts = {}) {
        const source = raw && typeof raw === "object" ? raw : {};
        const exportedAt = cleanText(opts.nowIso) || cleanText(source.exportedAt) || (/* @__PURE__ */ new Date()).toISOString();
        const rawChats = Array.isArray(source.chats) ? source.chats : [];
        const chats = rawChats.map((chat, index) => {
          const chatSource = chat && typeof chat === "object" ? chat : {};
          const transcript = normalizeTranscript(chatSource, {
            nowIso: cleanText(chatSource.exportedAt) || exportedAt
          });
          return {
            ...transcript,
            status: normalizeBulkStatus(chatSource.status, transcript.messages),
            error: cleanText(chatSource.error),
            selectedTitle: cleanText(chatSource.selectedTitle),
            order: index + 1
          };
        });
        return {
          app: cleanText(source.app) || "Primer++ for Gemini",
          format: "selected-chat-transcripts",
          exportedAt,
          chatCount: chats.length,
          exportedCount: chats.filter((chat) => chat.status === "exported").length,
          failedCount: chats.filter((chat) => chat.status === "failed").length,
          chats
        };
      }
      function getRoleLabel(role) {
        if (role === "user") return "User";
        if (role === "assistant" || role === "model") return "Gemini";
        if (role === "system") return "System";
        return "Message";
      }
      function getHTMLDocument(title, body) {
        return [
          "<!doctype html>",
          '<html lang="en">',
          "<head>",
          '<meta charset="utf-8">',
          '<meta name="viewport" content="width=device-width, initial-scale=1">',
          `<title>${escapeHTML(title)}</title>`,
          "<style>",
          ':root{color-scheme:light dark;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5;}',
          "body{margin:0;padding:32px;background:#f7f7f4;color:#202124;}",
          "main{max-width:960px;margin:0 auto;}",
          "h1{font-size:28px;margin:0 0 12px;}",
          "h2{font-size:20px;margin:28px 0 8px;}",
          "h3{font-size:16px;margin:18px 0 8px;}",
          ".meta{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin:0 0 24px;font-size:13px;color:#5f6368;}",
          ".meta dt{font-weight:650;color:#3c4043;}",
          ".meta dd{margin:0;overflow-wrap:anywhere;}",
          ".message,.chat{border:1px solid #dadce0;border-radius:8px;background:#fff;margin:16px 0;padding:16px;}",
          ".message-text{white-space:pre-wrap;overflow-wrap:anywhere;}",
          ".empty{color:#5f6368;font-style:italic;}",
          ".status{display:inline-block;border-radius:999px;padding:2px 8px;background:#e8f0fe;color:#174ea6;font-size:12px;text-transform:capitalize;}",
          ".status.failed{background:#fce8e6;color:#a50e0e;}",
          ".status.empty,.status.skipped{background:#f1f3f4;color:#3c4043;}",
          "@media (prefers-color-scheme:dark){body{background:#202124;color:#e8eaed}.message,.chat{background:#2b2c2f;border-color:#3c4043}.meta{color:#bdc1c6}.meta dt{color:#e8eaed}.empty{color:#bdc1c6}}",
          "</style>",
          "</head>",
          "<body>",
          body,
          "</body>",
          "</html>",
          ""
        ].join("\n");
      }
      function renderMetaItem(label, value) {
        return `<dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd>`;
      }
      function renderMessageHTML(message, index, headingTag) {
        const roleLabel = escapeHTML(`${index + 1}. ${getRoleLabel(message.role)}`);
        return [
          '<article class="message">',
          `<${headingTag}>${roleLabel}</${headingTag}>`,
          `<div class="message-text">${escapeHTML(message.text)}</div>`,
          "</article>"
        ].join("\n");
      }
      function exportTranscriptJSON2(transcript, opts = {}) {
        return JSON.stringify(normalizeTranscript(transcript, opts), null, 2);
      }
      function exportTranscriptMarkdown2(transcript, opts = {}) {
        const data = normalizeTranscript(transcript, opts);
        const lines = [
          `# ${data.title}`,
          "",
          `- Chat ID: ${data.chatId || "unknown"}`,
          `- Exported: ${data.exportedAt}`
        ];
        if (data.href) lines.push(`- Source: ${data.href}`);
        lines.push("");
        if (data.messages.length === 0) {
          lines.push("_No visible messages captured._");
          lines.push("");
          return lines.join("\n");
        }
        data.messages.forEach((message, index) => {
          lines.push(`## ${index + 1}. ${getRoleLabel(message.role)}`);
          lines.push("");
          lines.push(message.text);
          lines.push("");
        });
        return lines.join("\n");
      }
      function exportTranscriptText2(transcript, opts = {}) {
        const data = normalizeTranscript(transcript, opts);
        const lines = [
          data.title,
          `Chat ID: ${data.chatId || "unknown"}`,
          `Exported: ${data.exportedAt}`
        ];
        if (data.href) lines.push(`Source: ${data.href}`);
        lines.push("");
        if (data.messages.length === 0) {
          lines.push("No visible messages captured.");
          return lines.join("\n");
        }
        data.messages.forEach((message, index) => {
          lines.push(`${index + 1}. ${getRoleLabel(message.role)}`);
          lines.push(message.text);
          lines.push("");
        });
        return lines.join("\n").trimEnd() + "\n";
      }
      function exportTranscriptHTML2(transcript, opts = {}) {
        const data = normalizeTranscript(transcript, opts);
        const sourceMeta = data.href ? renderMetaItem("Source", data.href) : "";
        const messages = data.messages.length === 0 ? '<p class="empty">No visible messages captured.</p>' : data.messages.map((message, index) => renderMessageHTML(message, index, "h2")).join("\n");
        const body = [
          "<main>",
          `<h1>${escapeHTML(data.title)}</h1>`,
          '<dl class="meta">',
          renderMetaItem("Chat ID", data.chatId || "unknown"),
          renderMetaItem("Exported", data.exportedAt),
          sourceMeta,
          "</dl>",
          messages,
          "</main>"
        ].join("\n");
        return getHTMLDocument(data.title, body);
      }
      function exportBulkTranscriptJSON2(bulkExport, opts = {}) {
        return JSON.stringify(normalizeBulkTranscriptExport(bulkExport, opts), null, 2);
      }
      function appendBulkChatMarkdown(lines, chat) {
        lines.push(`## ${chat.order}. ${chat.title}`);
        lines.push("");
        lines.push(`- Chat ID: ${chat.chatId || "unknown"}`);
        lines.push(`- Status: ${chat.status}`);
        if (chat.href) lines.push(`- Source: ${chat.href}`);
        if (chat.error) lines.push(`- Error: ${chat.error}`);
        lines.push("");
        if (chat.messages.length === 0) {
          lines.push(chat.status === "failed" ? "_Transcript export failed._" : "_No visible messages captured._");
          lines.push("");
          return;
        }
        chat.messages.forEach((message, index) => {
          lines.push(`### ${index + 1}. ${getRoleLabel(message.role)}`);
          lines.push("");
          lines.push(message.text);
          lines.push("");
        });
      }
      function exportBulkTranscriptMarkdown2(bulkExport, opts = {}) {
        const data = normalizeBulkTranscriptExport(bulkExport, opts);
        const lines = [
          "# Gemini Selected Chat Export",
          "",
          `- Exported: ${data.exportedAt}`,
          `- Chats: ${data.chatCount}`,
          `- Exported chats: ${data.exportedCount}`,
          `- Failed chats: ${data.failedCount}`,
          ""
        ];
        if (data.chats.length === 0) {
          lines.push("_No chats selected._");
          lines.push("");
          return lines.join("\n");
        }
        data.chats.forEach((chat) => appendBulkChatMarkdown(lines, chat));
        return lines.join("\n");
      }
      function appendBulkChatText(lines, chat) {
        lines.push(`${chat.order}. ${chat.title}`);
        lines.push(`Chat ID: ${chat.chatId || "unknown"}`);
        lines.push(`Status: ${chat.status}`);
        if (chat.href) lines.push(`Source: ${chat.href}`);
        if (chat.error) lines.push(`Error: ${chat.error}`);
        lines.push("");
        if (chat.messages.length === 0) {
          lines.push(chat.status === "failed" ? "Transcript export failed." : "No visible messages captured.");
          lines.push("");
          return;
        }
        chat.messages.forEach((message, index) => {
          lines.push(`${index + 1}. ${getRoleLabel(message.role)}`);
          lines.push(message.text);
          lines.push("");
        });
      }
      function exportBulkTranscriptText2(bulkExport, opts = {}) {
        const data = normalizeBulkTranscriptExport(bulkExport, opts);
        const lines = [
          "Gemini Selected Chat Export",
          `Exported: ${data.exportedAt}`,
          `Chats: ${data.chatCount}`,
          `Exported chats: ${data.exportedCount}`,
          `Failed chats: ${data.failedCount}`,
          ""
        ];
        if (data.chats.length === 0) {
          lines.push("No chats selected.");
          return lines.join("\n") + "\n";
        }
        data.chats.forEach((chat) => appendBulkChatText(lines, chat));
        return lines.join("\n").trimEnd() + "\n";
      }
      function renderBulkChatHTML(chat) {
        const sourceMeta = chat.href ? renderMetaItem("Source", chat.href) : "";
        const errorMeta = chat.error ? renderMetaItem("Error", chat.error) : "";
        const messages = chat.messages.length === 0 ? `<p class="empty">${chat.status === "failed" ? "Transcript export failed." : "No visible messages captured."}</p>` : chat.messages.map((message, index) => renderMessageHTML(message, index, "h3")).join("\n");
        return [
          `<section class="chat">`,
          `<h2>${escapeHTML(`${chat.order}. ${chat.title}`)}</h2>`,
          '<dl class="meta">',
          renderMetaItem("Chat ID", chat.chatId || "unknown"),
          `<dt>Status</dt><dd><span class="status ${escapeHTML(chat.status)}">${escapeHTML(chat.status)}</span></dd>`,
          sourceMeta,
          errorMeta,
          "</dl>",
          messages,
          "</section>"
        ].join("\n");
      }
      function exportBulkTranscriptHTML2(bulkExport, opts = {}) {
        const data = normalizeBulkTranscriptExport(bulkExport, opts);
        const chats = data.chats.length === 0 ? '<p class="empty">No chats selected.</p>' : data.chats.map((chat) => renderBulkChatHTML(chat)).join("\n");
        const body = [
          "<main>",
          "<h1>Gemini Selected Chat Export</h1>",
          '<dl class="meta">',
          renderMetaItem("Exported", data.exportedAt),
          renderMetaItem("Chats", data.chatCount),
          renderMetaItem("Exported chats", data.exportedCount),
          renderMetaItem("Failed chats", data.failedCount),
          "</dl>",
          chats,
          "</main>"
        ].join("\n");
        return getHTMLDocument("Gemini Selected Chat Export", body);
      }
      module.exports = {
        exportBulkTranscriptHTML: exportBulkTranscriptHTML2,
        exportBulkTranscriptJSON: exportBulkTranscriptJSON2,
        exportBulkTranscriptMarkdown: exportBulkTranscriptMarkdown2,
        exportBulkTranscriptText: exportBulkTranscriptText2,
        exportTranscriptHTML: exportTranscriptHTML2,
        exportTranscriptJSON: exportTranscriptJSON2,
        exportTranscriptMarkdown: exportTranscriptMarkdown2,
        exportTranscriptText: exportTranscriptText2,
        normalizeMessage,
        normalizeBulkTranscriptExport,
        normalizeTranscript
      };
    }
  });

  // src/modules/export.js
  var import_export_formatter, import_chat_transcript_export, ExportModule;
  var init_export = __esm({
    "src/modules/export.js"() {
      init_logger();
      init_core();
      init_native_ui();
      init_panel_ui();
      init_counter();
      import_export_formatter = __toESM(require_export_formatter());
      import_chat_transcript_export = __toESM(require_chat_transcript_export());
      init_icons();
      init_gemini();
      ExportModule = {
        id: "export",
        name: NativeUI.t("数据导出", "Data Export"),
        description: NativeUI.t("JSON / CSV / Markdown / HTML 多格式导出", "Export in JSON / CSV / Markdown / HTML"),
        iconId: "download",
        defaultEnabled: true,
        _bulkSelected: /* @__PURE__ */ new Set(),
        _bulkSelectedMeta: {},
        _bulkExporting: false,
        _bulkCancelRequested: false,
        _bulkProgress: { current: 0, total: 0, title: "" },
        init() {
          Logger.info("ExportModule initialized");
        },
        destroy() {
          this.removeNativeUI();
          this._clearBulkSelection();
          this._bulkExporting = false;
          this._bulkCancelRequested = false;
          Logger.info("ExportModule destroyed");
        },
        onUserChange() {
          this._clearBulkSelection();
          this._bulkExporting = false;
          this._bulkCancelRequested = false;
        },
        // --- Native UI: Export button next to chat title ---
        injectNativeUI() {
          const NATIVE_ID = "gc-export-native";
          if (document.getElementById(NATIVE_ID)) return;
          const titleEl = NativeUI.getChatHeader();
          if (!titleEl) return;
          const parent = titleEl.parentElement;
          if (!parent) return;
          const btn = document.createElement("button");
          btn.id = NATIVE_ID;
          btn.className = "gc-header-btn";
          btn.appendChild(createIcon("download", 16));
          btn.title = "Export conversation";
          btn.onclick = (e) => {
            e.stopPropagation();
            this._toggleExportMenu(btn);
          };
          const pos = getComputedStyle(parent).position;
          if (pos === "static" || pos === "") parent.style.position = "relative";
          parent.appendChild(btn);
        },
        removeNativeUI() {
          NativeUI.remove("gc-export-native");
          NativeUI.remove("gc-export-menu");
          if (this._menuAbort) {
            this._menuAbort.abort();
            this._menuAbort = null;
          }
        },
        _toggleExportMenu(anchorBtn) {
          const MENU_ID = "gc-export-menu";
          const existing = document.getElementById(MENU_ID);
          if (existing) {
            existing.remove();
            return;
          }
          const menu = document.createElement("div");
          menu.id = MENU_ID;
          menu.className = "gc-dropdown-menu";
          menu.style.cssText = "top:100%;right:0;margin-top:4px;";
          const items = [
            { icon: "file-text", text: "Usage JSON", action: () => this.exportJSON() },
            { icon: "chart", text: "Usage CSV", action: () => this.doExportCSV() },
            { icon: "edit", text: "Usage Markdown", action: () => this.doExportMarkdown() },
            { icon: "file-text", text: "Chat JSON", action: () => this.exportCurrentChatJSON() },
            { icon: "edit", text: "Chat Markdown", action: () => this.exportCurrentChatMarkdown() },
            { icon: "file-text", text: "Chat TXT", action: () => this.exportCurrentChatText() },
            { icon: "file-text", text: "Chat HTML", action: () => this.exportCurrentChatHTML() }
          ];
          items.forEach((item) => {
            const el = document.createElement("div");
            el.className = "gc-dropdown-item";
            el.appendChild(createIcon(item.icon, 14));
            el.appendChild(document.createTextNode(" " + item.text));
            el.onclick = (e) => {
              e.stopPropagation();
              menu.remove();
              item.action();
            };
            menu.appendChild(el);
          });
          anchorBtn.parentElement.appendChild(menu);
          if (this._menuAbort) this._menuAbort.abort();
          this._menuAbort = new AbortController();
          const signal = this._menuAbort.signal;
          const closeMenu = (e) => {
            if (!menu.contains(e.target) && e.target !== anchorBtn) {
              menu.remove();
              if (this._menuAbort) {
                this._menuAbort.abort();
                this._menuAbort = null;
              }
            }
          };
          document.addEventListener("click", closeMenu, { capture: true, signal });
        },
        // --- Export helpers ---
        _download(content, filename, type) {
          const blob = new Blob([content], { type });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);
          NativeUI.showToast(NativeUI.t("已导出: " + filename, "Exported: " + filename));
        },
        _getFilePrefix() {
          const user = Core.getCurrentUser()?.split("@")[0] || "unknown";
          const now = /* @__PURE__ */ new Date();
          const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
          return `primer-pp-${user}-${date}`;
        },
        _getChatFilePrefix() {
          const chatId = Core.getChatId() || "current-chat";
          return `${this._getFilePrefix()}-${chatId}`;
        },
        _getBulkFilePrefix() {
          return `${this._getFilePrefix()}-selected-chats`;
        },
        _cloneChatMeta(chat) {
          return {
            id: chat?.id || "",
            title: chat?.title || "Untitled",
            href: chat?.href || "",
            element: chat?.element || null
          };
        },
        _rememberBulkChat(chat) {
          if (!chat?.id) return;
          this._bulkSelectedMeta[chat.id] = this._cloneChatMeta(chat);
        },
        _toggleBulkChat(chat) {
          if (!chat?.id) return;
          this._rememberBulkChat(chat);
          if (this._bulkSelected.has(chat.id)) {
            this._bulkSelected.delete(chat.id);
          } else {
            this._bulkSelected.add(chat.id);
          }
        },
        _selectVisibleBulkChats(chats) {
          chats.forEach((chat) => {
            this._rememberBulkChat(chat);
            this._bulkSelected.add(chat.id);
          });
        },
        _clearBulkSelection() {
          this._bulkSelected.clear();
          this._bulkSelectedMeta = {};
        },
        _getSelectedBulkChats() {
          const visible = Core.scanSidebarChats(true);
          const byId = /* @__PURE__ */ new Map();
          visible.forEach((chat) => {
            this._rememberBulkChat(chat);
            byId.set(chat.id, this._cloneChatMeta(chat));
          });
          return Array.from(this._bulkSelected).map((id) => byId.get(id) || this._bulkSelectedMeta[id]).filter((chat) => chat?.id);
        },
        _resolveBulkChatForNavigation(chat) {
          const visible = Core.scanSidebarChats(true);
          const match = visible.find((item) => item.id === chat.id);
          if (!match) return chat;
          const resolved = this._cloneChatMeta(match);
          resolved.title = chat.title || resolved.title;
          this._rememberBulkChat(resolved);
          return resolved;
        },
        _absoluteChatHref(chat) {
          const href = chat?.href || "";
          if (!href) return "";
          try {
            return new URL(href, location.origin).href;
          } catch {
            return "";
          }
        },
        async _waitForChatReady(chatId, timeout = 12e3) {
          const start = Date.now();
          let lastSignature = "";
          let stableMs = 0;
          while (Date.now() - start < timeout) {
            const currentId = Core.getChatId();
            if (currentId === chatId) {
              const messages = GeminiAdapter.getCurrentConversationMessages();
              if (messages.length > 0) {
                const signature = messages.map((message) => `${message.role}:${message.text.length}`).join("|");
                if (signature === lastSignature) {
                  stableMs += 250;
                } else {
                  lastSignature = signature;
                  stableMs = 0;
                }
                if (stableMs >= 500) return true;
              } else if (Date.now() - start > 1500 && GeminiAdapter.getChatTitleText()) {
                return true;
              }
            }
            await Core.sleep(250);
          }
          return Core.getChatId() === chatId;
        },
        async _navigateToBulkChat(chat) {
          if (Core.getChatId() !== chat.id) {
            if (!chat.element || typeof chat.element.click !== "function") {
              throw new Error("Chat row is not available for in-page navigation");
            }
            chat.element.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
            await Core.sleep(100);
            chat.element.click();
          }
          const loaded = await this._waitForChatReady(chat.id);
          if (!loaded) throw new Error("Timed out waiting for chat to render");
        },
        _getCurrentChatReference() {
          const id = Core.getChatId();
          if (!id) return null;
          const visible = Core.scanSidebarChats(true);
          const match = visible.find((chat) => chat.id === id);
          if (match) return this._cloneChatMeta(match);
          return {
            id,
            title: GeminiAdapter.getChatTitleText() || id,
            href: location.href,
            element: null
          };
        },
        async _restoreOriginalChat(originalChat) {
          if (!originalChat?.id || Core.getChatId() === originalChat.id) return;
          const visible = Core.scanSidebarChats(true);
          const match = visible.find((chat) => chat.id === originalChat.id);
          if (!match?.element || typeof match.element.click !== "function") return;
          match.element.click();
          await this._waitForChatReady(originalChat.id, 6e3);
        },
        _captureBulkTranscript(chat, exportedAt) {
          const messages = GeminiAdapter.getCurrentConversationMessages();
          return {
            chatId: chat.id,
            selectedTitle: chat.title,
            title: GeminiAdapter.getChatTitleText() || chat.title || "Gemini conversation",
            href: location.href,
            exportedAt,
            status: messages.length > 0 ? "exported" : "empty",
            messages
          };
        },
        _failedBulkTranscript(chat, exportedAt, error) {
          return {
            chatId: chat.id,
            selectedTitle: chat.title,
            title: chat.title || "Gemini conversation",
            href: this._absoluteChatHref(chat),
            exportedAt,
            status: "failed",
            error: error?.message || String(error),
            messages: []
          };
        },
        exportJSON() {
          const cm = CounterModule;
          if (!cm?.state) return;
          const data = {
            total: cm.state.total,
            totalChatsCreated: cm.state.totalChatsCreated,
            chats: cm.state.chats,
            dailyCounts: cm.state.dailyCounts,
            exportedAt: (/* @__PURE__ */ new Date()).toISOString()
          };
          this._download(JSON.stringify(data, null, 2), `${this._getFilePrefix()}.json`, "application/json");
        },
        doExportCSV() {
          const cm = CounterModule;
          if (!cm?.state) return;
          const content = (0, import_export_formatter.exportCSV)(cm.state.dailyCounts);
          this._download(content, `${this._getFilePrefix()}.csv`, "text/csv");
        },
        doExportMarkdown() {
          const cm = CounterModule;
          if (!cm?.state) return;
          const streaks = cm.calculateStreaks ? cm.calculateStreaks() : {};
          const content = (0, import_export_formatter.exportMarkdown)(cm.state.dailyCounts, {
            user: Core.getCurrentUser(),
            total: cm.state.total,
            totalChatsCreated: cm.state.totalChatsCreated,
            currentStreak: streaks.current,
            bestStreak: streaks.best
          });
          this._download(content, `${this._getFilePrefix()}.md`, "text/markdown");
        },
        _getCurrentTranscript() {
          const chatId = Core.getChatId() || "";
          const title = GeminiAdapter.getChatTitleText() || document.title || chatId || "Gemini conversation";
          return {
            chatId,
            title,
            href: location.href,
            exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
            messages: GeminiAdapter.getCurrentConversationMessages()
          };
        },
        _downloadCurrentTranscript(format) {
          const transcript = this._getCurrentTranscript();
          if (transcript.messages.length === 0) {
            NativeUI.showToast(NativeUI.t("没有可导出的可见对话消息", "No visible chat messages to export"));
            return;
          }
          if (format === "json") {
            this._download((0, import_chat_transcript_export.exportTranscriptJSON)(transcript), `${this._getChatFilePrefix()}.chat.json`, "application/json");
          } else if (format === "markdown") {
            this._download((0, import_chat_transcript_export.exportTranscriptMarkdown)(transcript), `${this._getChatFilePrefix()}.chat.md`, "text/markdown");
          } else if (format === "html") {
            this._download((0, import_chat_transcript_export.exportTranscriptHTML)(transcript), `${this._getChatFilePrefix()}.chat.html`, "text/html");
          } else {
            this._download((0, import_chat_transcript_export.exportTranscriptText)(transcript), `${this._getChatFilePrefix()}.chat.txt`, "text/plain");
          }
        },
        exportCurrentChatJSON() {
          this._downloadCurrentTranscript("json");
        },
        exportCurrentChatMarkdown() {
          this._downloadCurrentTranscript("markdown");
        },
        exportCurrentChatText() {
          this._downloadCurrentTranscript("text");
        },
        exportCurrentChatHTML() {
          this._downloadCurrentTranscript("html");
        },
        async _collectSelectedTranscripts() {
          if (this._bulkExporting) return null;
          const selected = this._getSelectedBulkChats();
          if (selected.length === 0) {
            NativeUI.showToast(NativeUI.t("请选择要导出的对话", "Select chats to export"));
            return null;
          }
          const exportedAt = (/* @__PURE__ */ new Date()).toISOString();
          const originalChat = this._getCurrentChatReference();
          const transcripts = [];
          this._bulkExporting = true;
          this._bulkCancelRequested = false;
          this._bulkProgress = { current: 0, total: selected.length, title: "" };
          PanelUI.renderDetailsPane();
          try {
            for (let i = 0; i < selected.length; i++) {
              if (this._bulkCancelRequested) break;
              const chat = this._resolveBulkChatForNavigation(selected[i]);
              this._bulkProgress = { current: i + 1, total: selected.length, title: chat.title };
              PanelUI.renderDetailsPane();
              try {
                await this._navigateToBulkChat(chat);
                transcripts.push(this._captureBulkTranscript(chat, exportedAt));
              } catch (error) {
                Logger.warn("Selected chat export failed", { chatId: chat.id, error: String(error) });
                transcripts.push(this._failedBulkTranscript(chat, exportedAt, error));
              }
              await Core.sleep(300);
            }
            if (this._bulkCancelRequested) {
              NativeUI.showToast(NativeUI.t("已取消导出", "Export canceled"));
              return null;
            }
            return {
              app: "Primer++ for Gemini",
              exportedAt,
              chats: transcripts
            };
          } finally {
            await this._restoreOriginalChat(originalChat);
            this._bulkExporting = false;
            this._bulkCancelRequested = false;
            this._bulkProgress = { current: 0, total: 0, title: "" };
            PanelUI.renderDetailsPane();
          }
        },
        async _downloadSelectedTranscripts(format) {
          const bulkExport = await this._collectSelectedTranscripts();
          if (!bulkExport) return;
          if (format === "json") {
            this._download((0, import_chat_transcript_export.exportBulkTranscriptJSON)(bulkExport), `${this._getBulkFilePrefix()}.json`, "application/json");
          } else if (format === "markdown") {
            this._download((0, import_chat_transcript_export.exportBulkTranscriptMarkdown)(bulkExport), `${this._getBulkFilePrefix()}.md`, "text/markdown");
          } else if (format === "html") {
            this._download((0, import_chat_transcript_export.exportBulkTranscriptHTML)(bulkExport), `${this._getBulkFilePrefix()}.html`, "text/html");
          } else {
            this._download((0, import_chat_transcript_export.exportBulkTranscriptText)(bulkExport), `${this._getBulkFilePrefix()}.txt`, "text/plain");
          }
        },
        exportSelectedChatsJSON() {
          return this._downloadSelectedTranscripts("json");
        },
        exportSelectedChatsMarkdown() {
          return this._downloadSelectedTranscripts("markdown");
        },
        exportSelectedChatsText() {
          return this._downloadSelectedTranscripts("text");
        },
        exportSelectedChatsHTML() {
          return this._downloadSelectedTranscripts("html");
        },
        _panelButton(label, onClick, opts = {}) {
          const btn = document.createElement("button");
          btn.className = "settings-btn";
          btn.style.cssText = opts.style || "width:auto;flex:1;padding:5px 6px;font-size:10px;margin-top:0;";
          btn.textContent = label;
          btn.disabled = !!opts.disabled;
          if (btn.disabled) {
            btn.style.opacity = "0.45";
            btn.style.cursor = "not-allowed";
          } else {
            btn.onclick = onClick;
          }
          return btn;
        },
        _buttonRow(buttons) {
          const row = document.createElement("div");
          row.style.cssText = "display:flex;gap:4px;margin-top:6px;";
          buttons.forEach((button) => row.appendChild(button));
          return row;
        },
        renderToDetailsPane(container) {
          const section = document.createElement("div");
          section.className = "gf-section";
          const currentTitle = document.createElement("div");
          currentTitle.className = "section-title";
          currentTitle.textContent = "Current Chat";
          section.appendChild(currentTitle);
          section.appendChild(this._buttonRow([
            this._panelButton("JSON", () => this.exportCurrentChatJSON()),
            this._panelButton("MD", () => this.exportCurrentChatMarkdown()),
            this._panelButton("TXT", () => this.exportCurrentChatText()),
            this._panelButton("HTML", () => this.exportCurrentChatHTML())
          ]));
          const bulkTitle = document.createElement("div");
          bulkTitle.className = "section-title";
          bulkTitle.style.cssText = "display:flex;justify-content:space-between;align-items:center;";
          const bulkLabel = document.createElement("span");
          bulkLabel.textContent = "Selected Chats";
          const bulkCount = document.createElement("span");
          bulkCount.textContent = String(this._bulkSelected.size);
          bulkTitle.appendChild(bulkLabel);
          bulkTitle.appendChild(bulkCount);
          section.appendChild(bulkTitle);
          const chats = Core.scanSidebarChats(true);
          if (chats.length === 0) {
            const empty = document.createElement("div");
            empty.style.cssText = "font-size:11px;color:var(--text-sub);padding:8px 0;text-align:center;";
            empty.textContent = NativeUI.t("未找到侧栏对话", "No sidebar chats found");
            section.appendChild(empty);
          } else {
            const actions = this._buttonRow([
              this._panelButton("All", () => {
                this._selectVisibleBulkChats(chats);
                PanelUI.renderDetailsPane();
              }),
              this._panelButton("Clear", () => {
                this._clearBulkSelection();
                PanelUI.renderDetailsPane();
              }),
              this._panelButton("Refresh", () => {
                Core.invalidateSidebarCache();
                PanelUI.renderDetailsPane();
              })
            ]);
            section.appendChild(actions);
            const list = document.createElement("div");
            list.style.cssText = "max-height:160px;overflow-y:auto;margin-top:6px;border-top:1px solid var(--divider);border-bottom:1px solid var(--divider);";
            chats.forEach((chat) => {
              this._rememberBulkChat(chat);
              const row = document.createElement("div");
              row.style.cssText = "display:flex;align-items:center;gap:6px;padding:5px 2px;cursor:pointer;font-size:11px;color:var(--text-main);";
              row.title = chat.title;
              const check = document.createElement("div");
              const checked = this._bulkSelected.has(chat.id);
              check.style.cssText = `width:14px;height:14px;border-radius:3px;border:1px solid ${checked ? "var(--accent)" : "var(--text-sub)"};background:${checked ? "var(--accent)" : "transparent"};flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;`;
              check.textContent = checked ? "✓" : "";
              const label = document.createElement("span");
              label.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;";
              label.textContent = chat.title;
              row.onclick = (e) => {
                e.stopPropagation();
                this._toggleBulkChat(chat);
                PanelUI.renderDetailsPane();
              };
              row.appendChild(check);
              row.appendChild(label);
              list.appendChild(row);
            });
            section.appendChild(list);
          }
          if (this._bulkExporting) {
            const progress = document.createElement("div");
            progress.style.cssText = "font-size:10px;color:var(--accent);margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
            progress.textContent = `Exporting ${this._bulkProgress.current}/${this._bulkProgress.total}: ${this._bulkProgress.title}`;
            section.appendChild(progress);
            section.appendChild(this._buttonRow([
              this._panelButton("Cancel", () => {
                this._bulkCancelRequested = true;
              }, { style: "width:auto;flex:1;padding:5px 6px;font-size:10px;margin-top:0;color:#f28b82;" })
            ]));
          } else {
            const disabled = this._bulkSelected.size === 0;
            section.appendChild(this._buttonRow([
              this._panelButton("JSON", () => this.exportSelectedChatsJSON(), { disabled }),
              this._panelButton("MD", () => this.exportSelectedChatsMarkdown(), { disabled }),
              this._panelButton("TXT", () => this.exportSelectedChatsText(), { disabled }),
              this._panelButton("HTML", () => this.exportSelectedChatsHTML(), { disabled })
            ]));
          }
          container.appendChild(section);
        },
        getOnboarding() {
          return {
            zh: {
              rant: "2026 年了，Google 最引以为傲的 AI 产品居然不支持导出对话。你跟 Gemini 讨论了三天的架构方案，结果想保存一份？不好意思，请手动复制粘贴 300 条消息。产品经理是不是觉得用户的对话像阅后即焚的 Snapchat？",
              features: "在聊天标题旁添加导出按钮，可导出用量报告、当前可见对话，或在导出面板多选侧栏对话并导出为 JSON/Markdown/TXT/HTML。",
              guide: "当前对话：打开对话 → 点击标题右侧导出按钮。多选对话：打开悬浮面板导出标签 → 选择对话 → 选择 JSON / MD / TXT / HTML。"
            },
            en: {
              rant: "It's 2026. Google's flagship AI product doesn't let you export conversations. You spent three days discussing architecture with Gemini and want to save it? Sorry, please manually copy-paste 300 messages. Does the PM think conversations are Snapchats?",
              features: "Adds a 📤 export button next to the chat title. Export usage reports, the current visible conversation, or selected sidebar chats to JSON/Markdown/TXT/HTML.",
              guide: "Current chat: open a conversation → click the title export button. Selected chats: open the Export panel tab → select chats → choose JSON / MD / TXT / HTML."
            }
          };
        },
        renderExportButtons(container) {
          const jsonBtn = document.createElement("button");
          jsonBtn.className = "settings-btn";
          jsonBtn.style.cssText = "display:flex;align-items:center;gap:6px;";
          jsonBtn.appendChild(createIcon("download", 14));
          jsonBtn.appendChild(document.createTextNode(" Export JSON"));
          jsonBtn.onclick = () => this.exportJSON();
          container.appendChild(jsonBtn);
          const csvBtn = document.createElement("button");
          csvBtn.className = "settings-btn";
          csvBtn.style.cssText = "display:flex;align-items:center;gap:6px;";
          csvBtn.appendChild(createIcon("download", 14));
          csvBtn.appendChild(document.createTextNode(" Export CSV"));
          csvBtn.onclick = () => this.doExportCSV();
          container.appendChild(csvBtn);
          const mdBtn = document.createElement("button");
          mdBtn.className = "settings-btn";
          mdBtn.style.cssText = "display:flex;align-items:center;gap:6px;";
          mdBtn.appendChild(createIcon("download", 14));
          mdBtn.appendChild(document.createTextNode(" Export Markdown"));
          mdBtn.onclick = () => this.doExportMarkdown();
          container.appendChild(mdBtn);
          const chatMdBtn = document.createElement("button");
          chatMdBtn.className = "settings-btn";
          chatMdBtn.style.cssText = "display:flex;align-items:center;gap:6px;";
          chatMdBtn.appendChild(createIcon("download", 14));
          chatMdBtn.appendChild(document.createTextNode(" Export Current Chat"));
          chatMdBtn.onclick = () => this.exportCurrentChatMarkdown();
          container.appendChild(chatMdBtn);
          const chatHtmlBtn = document.createElement("button");
          chatHtmlBtn.className = "settings-btn";
          chatHtmlBtn.style.cssText = "display:flex;align-items:center;gap:6px;";
          chatHtmlBtn.appendChild(createIcon("download", 14));
          chatHtmlBtn.appendChild(document.createTextNode(" Export Current Chat HTML"));
          chatHtmlBtn.onclick = () => this.exportCurrentChatHTML();
          container.appendChild(chatHtmlBtn);
        }
      };
    }
  });

  // src/debug_utils.js
  function maskEmail(email) {
    if (!email || !email.includes("@")) return email;
    const [local, domain] = email.split("@");
    return local[0] + "***@" + domain[0] + "***." + domain.split(".").pop();
  }
  function maskStorageKey(key) {
    if (!key || !key.includes("@")) return key;
    return key.replace(/([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/, (m, local, domain) => {
      return local[0] + "***@" + domain[0] + "***." + domain.split(".").pop();
    });
  }
  function debugDumpStorageKeys() {
    try {
      const keys = (typeof GM_listValues === "function" ? GM_listValues() : []).slice().sort();
      const geminiKeys = keys.filter((k) => k.startsWith("gemini_") || k.startsWith("gemini_store_"));
      console.group("💎 Gemini Debug: Storage Keys");
      console.log("All keys:", keys.map(maskStorageKey));
      console.log("Gemini keys:", geminiKeys.map(maskStorageKey));
      console.groupEnd();
      Logger.info("Debug: dumped storage keys", { count: keys.length });
    } catch (e) {
      Logger.warn("Debug: failed to list storage keys", { error: String(e) });
    }
  }
  function debugShowDetectedUser() {
    try {
      const detected = Core.detectUser();
      const current = Core.getCurrentUser();
      const effective = detected || current;
      const storageKey = effective && effective.includes("@") ? `gemini_store_${maskEmail(effective)}` : null;
      console.group("💎 Gemini Debug: User");
      console.log("detected:", maskEmail(detected));
      console.log("currentUser:", maskEmail(current));
      console.log("effectiveUser:", maskEmail(effective));
      console.log("storageKey:", storageKey);
      console.groupEnd();
      Logger.info("Debug: show detected user", { detected: maskEmail(detected), current: maskEmail(current), effective: maskEmail(effective) });
    } catch (e) {
      Logger.warn("Debug: failed to show detected user", { error: String(e) });
    }
  }
  function debugExportAllStorage() {
    try {
      const keys = (typeof GM_listValues === "function" ? GM_listValues() : []).slice().sort();
      const data = {};
      keys.forEach((k) => {
        try {
          data[k] = GM_getValue(k);
        } catch (e) {
          data[k] = { error: String(e) };
        }
      });
      const payload = {
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        keys,
        data
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "gemini_storage_export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      console.log("💎 Storage export saved: gemini_storage_export.json");
      Logger.info("Debug: export all storage");
    } catch (e) {
      Logger.warn("Debug: failed to export storage", { error: String(e) });
    }
  }
  function debugExportLegacyData() {
    try {
      const legacyKeys = [
        "gemini_count_chats_map",
        "gemini_count_session",
        "gemini_count_total",
        "gemini_interaction_count",
        "gemini_view_mode",
        "gemini_panel_position",
        "gemini_panel_pos_v64",
        "gemini_panel_pos"
      ];
      const data = {};
      legacyKeys.forEach((k) => {
        try {
          data[k] = GM_getValue(k);
        } catch (e) {
          data[k] = { error: String(e) };
        }
      });
      const payload = {
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        legacyKeys,
        data
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "gemini_legacy_export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      console.log("💎 Legacy export saved: gemini_legacy_export.json");
      Logger.info("Debug: export legacy data");
    } catch (e) {
      Logger.warn("Debug: failed to export legacy data", { error: String(e) });
    }
  }
  function debugExportLogs() {
    try {
      const payload = Logger.export();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "gemini_logs_export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      Logger.info("Debug: export logs");
    } catch (e) {
      Logger.warn("Debug: failed to export logs", { error: String(e) });
    }
  }
  function debugExportAdapterProbe() {
    try {
      if (typeof window.__PRIMER_PP_GET_PROBE_REPORT__ !== "function") {
        throw new Error("Probe report bridge is unavailable");
      }
      const payload = window.__PRIMER_PP_GET_PROBE_REPORT__();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "primer_pp_adapter_probe.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      Logger.info("Debug: export adapter probe report");
    } catch (e) {
      Logger.warn("Debug: failed to export adapter probe report", { error: String(e) });
    }
  }
  function debugDumpGeminiStores() {
    try {
      const keys = (typeof GM_listValues === "function" ? GM_listValues() : []).slice().sort();
      const targets = keys.filter((k) => k.startsWith("gemini_store_") || k.startsWith("gemini_folders_data") || k.startsWith("gemini_"));
      console.group("💎 Gemini Debug: Storage Dump");
      targets.forEach((k) => {
        try {
          console.log(maskStorageKey(k), GM_getValue(k));
        } catch (err) {
          console.warn("Failed to read", maskStorageKey(k), err);
        }
      });
      console.groupEnd();
    } catch (e) {
      Logger.warn("Debug: failed to dump storage", { error: String(e) });
    }
  }
  var init_debug_utils = __esm({
    "src/debug_utils.js"() {
      init_logger();
      init_core();
    }
  });

  // src/panel_settings.js
  function openSettingsModal() {
    const SETTINGS_MODAL_ID = "gemini-settings-modal";
    if (document.getElementById(SETTINGS_MODAL_ID)) return;
    const overlay = document.createElement("div");
    overlay.id = SETTINGS_MODAL_ID;
    overlay.className = "settings-overlay";
    let releaseFocus = null;
    const escHandler = (e) => {
      if (e.key === "Escape") closeOverlay();
    };
    document.addEventListener("keydown", escHandler);
    const closeOverlay = () => {
      document.removeEventListener("keydown", escHandler);
      if (releaseFocus) releaseFocus();
      overlay.remove();
    };
    overlay.onclick = (e) => {
      if (e.target === overlay) closeOverlay();
    };
    const modal = document.createElement("div");
    modal.className = "settings-modal";
    Core.applyTheme(modal, getCurrentTheme());
    const header = document.createElement("div");
    header.className = "settings-header";
    const title = document.createElement("h3");
    setIconText(title, "settings", NativeUI.t("设置", "Settings"));
    const closeBtn = document.createElement("span");
    closeBtn.className = "settings-close";
    closeBtn.tabIndex = 0;
    closeBtn.setAttribute("role", "button");
    closeBtn.setAttribute("aria-label", NativeUI.t("关闭设置", "Close settings"));
    closeBtn.appendChild(createIcon("x", 16));
    closeBtn.onclick = () => closeOverlay();
    closeBtn.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") closeOverlay();
    };
    header.appendChild(title);
    header.appendChild(closeBtn);
    const body = document.createElement("div");
    body.className = "settings-body";
    const extSection = document.createElement("div");
    extSection.className = "settings-section";
    const extTitle = document.createElement("div");
    extTitle.className = "settings-section-title";
    extTitle.textContent = "";
    setIconText(extTitle, "package", NativeUI.t("功能扩展", "Feature Extensions"));
    extSection.appendChild(extTitle);
    const PanelUI2 = this;
    ModuleRegistry.getAll().forEach((mod) => {
      const row = document.createElement("div");
      row.className = "module-toggle-compact";
      row.title = mod.description;
      const label = document.createElement("div");
      label.className = "module-compact-label";
      const icon = document.createElement("span");
      icon.className = "module-icon";
      icon.appendChild(renderModIcon(mod, 16));
      const name = document.createElement("span");
      name.textContent = mod.name;
      label.appendChild(icon);
      label.appendChild(name);
      const rightSide = document.createElement("div");
      rightSide.style.cssText = "display:flex;align-items:center;gap:6px;";
      if (typeof mod.getOnboarding === "function") {
        const infoBtn = document.createElement("span");
        infoBtn.className = "onboarding-info-btn";
        infoBtn.appendChild(createIcon("info", 12));
        infoBtn.title = NativeUI.t("显示引导", "Show guide");
        infoBtn.onclick = (e) => {
          e.stopPropagation();
          PanelUI2.showOnboarding(mod.id);
        };
        rightSide.appendChild(infoBtn);
      }
      const toggle = document.createElement("div");
      toggle.className = `toggle-switch ${ModuleRegistry.isEnabled(mod.id) ? "on" : ""}`;
      toggle.onclick = () => {
        ModuleRegistry.toggle(mod.id);
        toggle.classList.toggle("on");
        if (CounterModule.state.isExpanded) {
          PanelUI2.renderDetailsPane();
        }
      };
      rightSide.appendChild(toggle);
      row.appendChild(label);
      row.appendChild(rightSide);
      extSection.appendChild(row);
    });
    body.appendChild(extSection);
    ModuleRegistry.getAll().forEach((mod) => {
      if (ModuleRegistry.isEnabled(mod.id) && typeof mod.renderToSettings === "function") {
        const modSection = document.createElement("div");
        modSection.className = "settings-section";
        const modTitle = document.createElement("div");
        modTitle.className = "settings-section-title";
        modTitle.textContent = "";
        modTitle.appendChild(renderModIcon(mod, 12));
        modTitle.appendChild(document.createTextNode(" " + NativeUI.t("设置", "Settings")));
        modSection.appendChild(modTitle);
        mod.renderToSettings(modSection);
        body.appendChild(modSection);
      }
    });
    const cm = CounterModule;
    const resetSection = document.createElement("div");
    resetSection.className = "settings-section";
    const resetTitle = document.createElement("div");
    resetTitle.className = "settings-section-title";
    resetTitle.textContent = NativeUI.t("每日重置", "Daily Reset");
    resetSection.appendChild(resetTitle);
    const resetRow = document.createElement("div");
    resetRow.className = "settings-row";
    const resetLabel = document.createElement("span");
    resetLabel.className = "settings-label";
    resetLabel.textContent = NativeUI.t("重置时间", "Reset Hour");
    const resetSelect = document.createElement("select");
    resetSelect.className = "settings-select";
    for (let h = 0; h < 24; h++) {
      const opt = document.createElement("option");
      opt.value = h;
      opt.textContent = `${h.toString().padStart(2, "0")}:00`;
      if (h === cm.resetHour) opt.selected = true;
      resetSelect.appendChild(opt);
    }
    resetSelect.onchange = () => {
      cm.resetHour = parseInt(resetSelect.value, 10);
      try {
        GM_setValue(GLOBAL_KEYS.RESET_HOUR, cm.resetHour);
      } catch {
      }
      PanelUI2.update();
    };
    resetRow.appendChild(resetLabel);
    resetRow.appendChild(resetSelect);
    resetSection.appendChild(resetRow);
    body.appendChild(resetSection);
    const quotaSection = document.createElement("div");
    quotaSection.className = "settings-section";
    const quotaTitle = document.createElement("div");
    quotaTitle.className = "settings-section-title";
    quotaTitle.textContent = NativeUI.t("每日配额", "Daily Quota");
    quotaSection.appendChild(quotaTitle);
    const quotaRow = document.createElement("div");
    quotaRow.className = "settings-row";
    const quotaLabelEl = document.createElement("span");
    quotaLabelEl.className = "settings-label";
    quotaLabelEl.textContent = NativeUI.t("消息限制", "Message Limit");
    const quotaInput = document.createElement("input");
    quotaInput.type = "number";
    quotaInput.min = "1";
    quotaInput.max = "999";
    quotaInput.value = cm.quotaLimit;
    quotaInput.className = "settings-select";
    quotaInput.style.width = "60px";
    quotaInput.style.textAlign = "center";
    quotaInput.onchange = () => {
      const v = parseInt(quotaInput.value, 10);
      if (v > 0 && v <= 999) {
        cm.quotaLimit = v;
        try {
          GM_setValue(GLOBAL_KEYS.QUOTA, v);
        } catch {
        }
        PanelUI2.update();
      }
    };
    quotaRow.appendChild(quotaLabelEl);
    quotaRow.appendChild(quotaInput);
    quotaSection.appendChild(quotaRow);
    body.appendChild(quotaSection);
    const chartSection = document.createElement("div");
    chartSection.className = "settings-section";
    const chartTitle = document.createElement("div");
    chartTitle.className = "settings-section-title";
    chartTitle.textContent = NativeUI.t("使用历史（最近 7 天）", "Usage History (Last 7 Days)");
    chartSection.appendChild(chartTitle);
    const chartContainer = document.createElement("div");
    chartContainer.style.cssText = "background: rgba(0,0,0,0.2); border-radius: 8px; padding: 10px; margin-top: 4px;";
    const data = cm.getLast7DaysData();
    const svgWidth = 268, svgHeight = 80, padding = 20;
    const maxVal = Math.max(...data.map((d) => d.messages), 1);
    const points = data.map((d, i) => ({
      x: padding + i * ((svgWidth - 2 * padding) / 6),
      y: svgHeight - padding - d.messages / maxVal * (svgHeight - 2 * padding),
      val: d.messages,
      label: d.label
    }));
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", svgWidth);
    svg.setAttribute("height", svgHeight + 20);
    svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight + 20}`);
    const areaPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const areaD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + ` L ${points[6].x} ${svgHeight - padding} L ${points[0].x} ${svgHeight - padding} Z`;
    areaPath.setAttribute("d", areaD);
    areaPath.setAttribute("fill", "rgba(138, 180, 248, 0.2)");
    svg.appendChild(areaPath);
    const linePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const lineD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    linePath.setAttribute("d", lineD);
    linePath.setAttribute("fill", "none");
    linePath.setAttribute("stroke", "var(--accent, #8ab4f8)");
    linePath.setAttribute("stroke-width", "2");
    linePath.setAttribute("stroke-linecap", "round");
    linePath.setAttribute("stroke-linejoin", "round");
    svg.appendChild(linePath);
    points.forEach((p) => {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", p.x);
      circle.setAttribute("cy", p.y);
      circle.setAttribute("r", "3");
      circle.setAttribute("fill", "var(--accent, #8ab4f8)");
      svg.appendChild(circle);
      if (p.val > 0) {
        const valText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        valText.setAttribute("x", p.x);
        valText.setAttribute("y", p.y - 6);
        valText.setAttribute("text-anchor", "middle");
        valText.setAttribute("font-size", "8");
        valText.setAttribute("fill", "var(--text-sub, #9aa0a6)");
        valText.textContent = p.val;
        svg.appendChild(valText);
      }
      const dateText = document.createElementNS("http://www.w3.org/2000/svg", "text");
      dateText.setAttribute("x", p.x);
      dateText.setAttribute("y", svgHeight + 10);
      dateText.setAttribute("text-anchor", "middle");
      dateText.setAttribute("font-size", "8");
      dateText.setAttribute("fill", "var(--text-sub, #9aa0a6)");
      dateText.textContent = p.label;
      svg.appendChild(dateText);
    });
    chartContainer.appendChild(svg);
    chartSection.appendChild(chartContainer);
    body.appendChild(chartSection);
    const dataSection = document.createElement("div");
    dataSection.className = "settings-section";
    const dataTitle = document.createElement("div");
    dataTitle.className = "settings-section-title";
    dataTitle.textContent = NativeUI.t("数据", "Data");
    dataSection.appendChild(dataTitle);
    if (ModuleRegistry.isEnabled("export")) {
      ExportModule.renderExportButtons(dataSection);
    } else {
      const exportBtn = document.createElement("button");
      exportBtn.className = "settings-btn";
      setIconText(exportBtn, "download", NativeUI.t("导出数据 (JSON)", "Export Data (JSON)"));
      exportBtn.onclick = () => {
        const exportData = {
          total: cm.state.total,
          totalChatsCreated: cm.state.totalChatsCreated,
          chats: cm.state.chats,
          dailyCounts: cm.state.dailyCounts,
          exportedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const _d = /* @__PURE__ */ new Date();
        a.download = `primer-pp-${Core.getCurrentUser().split("@")[0]}-${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}.json`;
        a.click();
        URL.revokeObjectURL(url);
      };
      dataSection.appendChild(exportBtn);
    }
    const calibrateBtn = document.createElement("button");
    calibrateBtn.className = "settings-btn";
    setIconText(calibrateBtn, "wrench", NativeUI.t("校准数据", "Calibrate Data"));
    calibrateBtn.onclick = () => PanelUI2.openCalibrationModal();
    dataSection.appendChild(calibrateBtn);
    const resetPosBtn = document.createElement("button");
    resetPosBtn.className = "settings-btn";
    setIconText(resetPosBtn, "pin", NativeUI.t("重置面板位置", "Reset Panel Position"));
    resetPosBtn.onclick = () => {
      try {
        GM_setValue(GLOBAL_KEYS.POS, DEFAULT_POS);
      } catch {
      }
      closeOverlay();
      location.reload();
    };
    dataSection.appendChild(resetPosBtn);
    const tourBtn = document.createElement("button");
    tourBtn.className = "settings-btn";
    setIconText(tourBtn, "compass", NativeUI.t("引导教程", "Guided Tour"));
    tourBtn.onclick = () => {
      closeOverlay();
      GuidedTour.start();
    };
    dataSection.appendChild(tourBtn);
    body.appendChild(dataSection);
    const debugSection = document.createElement("div");
    debugSection.className = "settings-section";
    const debugTitle = document.createElement("div");
    debugTitle.className = "settings-section-title";
    debugTitle.textContent = NativeUI.t("调试", "Debug");
    debugSection.appendChild(debugTitle);
    const debugToggleRow = document.createElement("div");
    debugToggleRow.className = "settings-row";
    const debugLabel = document.createElement("span");
    debugLabel.className = "settings-label";
    debugLabel.textContent = NativeUI.t("启用调试", "Enable Debug");
    const debugToggle = document.createElement("div");
    debugToggle.className = `toggle-switch ${isDebugEnabled() ? "on" : ""}`;
    debugToggle.onclick = () => {
      const enabled = !isDebugEnabled();
      setDebugEnabled(enabled);
      debugToggle.classList.toggle("on");
      Logger.info("Debug mode toggled", { enabled });
    };
    debugToggleRow.appendChild(debugLabel);
    debugToggleRow.appendChild(debugToggle);
    debugSection.appendChild(debugToggleRow);
    const logLevelRow = document.createElement("div");
    logLevelRow.className = "settings-row";
    const logLevelLabel = document.createElement("span");
    logLevelLabel.className = "settings-label";
    logLevelLabel.textContent = NativeUI.t("日志级别", "Log Level");
    const logSelect = document.createElement("select");
    logSelect.className = "settings-select";
    ["error", "warn", "info", "debug"].forEach((lvl) => {
      const opt = document.createElement("option");
      opt.value = lvl;
      opt.textContent = lvl.toUpperCase();
      if (lvl === Logger.getLevel()) opt.selected = true;
      logSelect.appendChild(opt);
    });
    logSelect.onchange = () => Logger.setLevel(logSelect.value);
    logLevelRow.appendChild(logLevelLabel);
    logLevelRow.appendChild(logSelect);
    debugSection.appendChild(logLevelRow);
    const debugPanelBtn = document.createElement("button");
    debugPanelBtn.className = "settings-btn";
    setIconText(debugPanelBtn, "bug", NativeUI.t("打开调试面板", "Open Debug Panel"));
    debugPanelBtn.onclick = () => PanelUI2.openDebugModal();
    debugSection.appendChild(debugPanelBtn);
    body.appendChild(debugSection);
    const version = document.createElement("div");
    version.className = "settings-version";
    version.textContent = APP_NAME + " v" + VERSION;
    version.title = TRADEMARK_NOTICE;
    body.appendChild(version);
    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    releaseFocus = NativeUI.trapFocus(modal);
    closeBtn.focus();
  }
  function showOnboarding(moduleId) {
    const mod = ModuleRegistry.modules[moduleId];
    if (!mod || typeof mod.getOnboarding !== "function") return;
    const content = mod.getOnboarding();
    if (!content) return;
    let lang;
    try {
      lang = GM_getValue(GLOBAL_KEYS.ONBOARDING_LANG, "zh");
    } catch {
      lang = "zh";
    }
    const MODAL_ID = "gemini-onboarding-modal";
    const existing = document.getElementById(MODAL_ID);
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.className = "onboarding-overlay";
    let releaseFocus = null;
    const escHandler = (e) => {
      if (e.key === "Escape") closeOverlay();
    };
    document.addEventListener("keydown", escHandler);
    const closeOverlay = () => {
      document.removeEventListener("keydown", escHandler);
      if (releaseFocus) releaseFocus();
      overlay.remove();
    };
    overlay.onclick = (e) => {
      if (e.target === overlay) closeOverlay();
    };
    const modal = document.createElement("div");
    modal.className = "onboarding-modal";
    Core.applyTheme(modal, getCurrentTheme());
    const renderContent = () => {
      modal.replaceChildren();
      const t = content[lang] || content.zh || content.en;
      const header = document.createElement("div");
      header.className = "onboarding-header";
      const title = document.createElement("h3");
      title.textContent = "";
      title.appendChild(renderModIcon(mod, 16));
      title.appendChild(document.createTextNode(" " + mod.name));
      const closeBtn = document.createElement("span");
      closeBtn.className = "onboarding-close";
      closeBtn.tabIndex = 0;
      closeBtn.setAttribute("role", "button");
      closeBtn.setAttribute("aria-label", NativeUI.t("关闭引导", "Close guide"));
      closeBtn.appendChild(createIcon("x", 16));
      closeBtn.onclick = () => closeOverlay();
      closeBtn.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") closeOverlay();
      };
      header.appendChild(title);
      header.appendChild(closeBtn);
      modal.appendChild(header);
      const body = document.createElement("div");
      body.className = "onboarding-body";
      if (t.rant) {
        const sec1 = document.createElement("div");
        sec1.className = "onboarding-section";
        const h1 = document.createElement("div");
        h1.className = "onboarding-section-title";
        h1.textContent = "";
        h1.appendChild(createIcon("info", 14));
        h1.appendChild(document.createTextNode(lang === "zh" ? " 为什么需要这个？" : " Why does this exist?"));
        const p1 = document.createElement("div");
        p1.className = "onboarding-text";
        p1.textContent = t.rant;
        sec1.appendChild(h1);
        sec1.appendChild(p1);
        body.appendChild(sec1);
      }
      if (t.features) {
        const sec2 = document.createElement("div");
        sec2.className = "onboarding-section";
        const h2 = document.createElement("div");
        h2.className = "onboarding-section-title";
        h2.textContent = "";
        h2.appendChild(createIcon("gem", 14));
        h2.appendChild(document.createTextNode(lang === "zh" ? " 它能做什么？" : " What does it do?"));
        const p2 = document.createElement("div");
        p2.className = "onboarding-text";
        p2.textContent = t.features;
        sec2.appendChild(h2);
        sec2.appendChild(p2);
        body.appendChild(sec2);
      }
      if (t.guide) {
        const sec3 = document.createElement("div");
        sec3.className = "onboarding-section";
        const h3el = document.createElement("div");
        h3el.className = "onboarding-section-title";
        h3el.textContent = "";
        h3el.appendChild(createIcon("wrench", 14));
        h3el.appendChild(document.createTextNode(lang === "zh" ? " 如何使用？" : " How to use?"));
        const p3 = document.createElement("div");
        p3.className = "onboarding-text";
        p3.textContent = t.guide;
        sec3.appendChild(h3el);
        sec3.appendChild(p3);
        body.appendChild(sec3);
      }
      modal.appendChild(body);
      const footer = document.createElement("div");
      footer.className = "onboarding-footer";
      const langBtn = document.createElement("button");
      langBtn.className = "onboarding-lang-btn";
      langBtn.textContent = "";
      langBtn.appendChild(createIcon("globe", 12));
      langBtn.appendChild(document.createTextNode(lang === "zh" ? " EN" : " 中"));
      langBtn.onclick = () => {
        lang = lang === "zh" ? "en" : "zh";
        try {
          GM_setValue(GLOBAL_KEYS.ONBOARDING_LANG, lang);
        } catch {
        }
        renderContent();
      };
      const startBtn = document.createElement("button");
      startBtn.className = "onboarding-start-btn";
      startBtn.textContent = lang === "zh" ? "开始使用 →" : "Get Started →";
      startBtn.onclick = () => closeOverlay();
      footer.appendChild(langBtn);
      footer.appendChild(startBtn);
      modal.appendChild(footer);
    };
    renderContent();
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    releaseFocus = NativeUI.trapFocus(modal);
    const firstButton = modal.querySelector('button, [tabindex]:not([tabindex="-1"])');
    if (firstButton) firstButton.focus();
  }
  function openDebugModal() {
    const DEBUG_MODAL_ID = "gemini-debug-modal";
    if (document.getElementById(DEBUG_MODAL_ID)) return;
    const overlay = document.createElement("div");
    overlay.id = DEBUG_MODAL_ID;
    overlay.className = "debug-overlay";
    let unsubscribe = null;
    let releaseFocus = null;
    const escHandler = (e) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", escHandler);
    const closeModal = () => {
      document.removeEventListener("keydown", escHandler);
      if (unsubscribe) unsubscribe();
      if (releaseFocus) releaseFocus();
      overlay.remove();
    };
    overlay.onclick = (e) => {
      if (e.target === overlay) closeModal();
    };
    const modal = document.createElement("div");
    modal.className = "debug-modal";
    Core.applyTheme(modal, getCurrentTheme());
    const header = document.createElement("div");
    header.className = "debug-header";
    const title = document.createElement("h3");
    setIconText(title, "bug", NativeUI.t("调试面板", "Debug Panel"));
    const closeBtn = document.createElement("span");
    closeBtn.className = "debug-close";
    closeBtn.tabIndex = 0;
    closeBtn.setAttribute("role", "button");
    closeBtn.setAttribute("aria-label", NativeUI.t("关闭调试面板", "Close debug panel"));
    closeBtn.appendChild(createIcon("x", 16));
    closeBtn.onclick = () => closeModal();
    closeBtn.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") closeModal();
    };
    header.appendChild(title);
    header.appendChild(closeBtn);
    const body = document.createElement("div");
    body.className = "debug-body";
    const info = document.createElement("div");
    info.className = "debug-kv";
    const infoLine = (label, value) => {
      const div = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = label + ":";
      div.appendChild(strong);
      div.appendChild(document.createTextNode(" " + value));
      return div;
    };
    const detected = Core.detectUser();
    const current = Core.getCurrentUser();
    const inspecting = Core.getInspectingUser();
    const effective = detected || current;
    const storageKey = effective && effective.includes("@") ? `gemini_store_${effective}` : "N/A";
    info.appendChild(infoLine("Detected", detected || "null"));
    info.appendChild(infoLine("Current", current));
    info.appendChild(infoLine("Inspecting", inspecting));
    info.appendChild(infoLine("Storage Key", storageKey));
    info.appendChild(infoLine("Debug Enabled", String(isDebugEnabled())));
    info.appendChild(infoLine("Log Level", Logger.getLevel()));
    const adapterHealth = GeminiAdapter.getSelectorHealthReport();
    const health = document.createElement("div");
    health.className = "debug-kv";
    health.appendChild(infoLine("Adapter Ready", String(adapterHealth.ready)));
    health.appendChild(infoLine("Adapter Health", `${adapterHealth.passed}/${adapterHealth.total}`));
    adapterHealth.checks.forEach((check) => {
      const label = check.detail ? `${check.label} (${check.detail})` : check.label;
      health.appendChild(infoLine(label, check.ok ? "ok" : "missing"));
    });
    const filterRow = document.createElement("div");
    filterRow.className = "debug-filter-row";
    const filters = ["all", "error", "warn", "info", "debug"];
    let activeFilter = "all";
    let searchTerm = "";
    const mkFilterBtn = (label) => {
      const b = document.createElement("button");
      b.className = "debug-filter-btn";
      b.textContent = label.toUpperCase();
      b.onclick = () => {
        activeFilter = label;
        Array.from(filterRow.children).forEach((el) => el.classList.remove("active"));
        b.classList.add("active");
        renderLogs();
      };
      return b;
    };
    filters.forEach((f, i) => {
      const btn = mkFilterBtn(f);
      if (i === 0) btn.classList.add("active");
      filterRow.appendChild(btn);
    });
    const search = document.createElement("input");
    search.className = "debug-search";
    search.placeholder = NativeUI.t("搜索日志...", "Search logs...");
    search.oninput = () => {
      searchTerm = search.value.trim().toLowerCase();
      renderLogs();
    };
    const actions = document.createElement("div");
    actions.className = "debug-actions";
    const mkBtn = (label, onClick) => {
      const b = document.createElement("button");
      b.className = "settings-btn";
      b.textContent = label;
      b.onclick = onClick;
      return b;
    };
    actions.appendChild(mkBtn(NativeUI.t("显示检测用户", "Show Detected User"), () => debugShowDetectedUser()));
    actions.appendChild(mkBtn(NativeUI.t("导出存储键", "Dump Storage Keys"), () => debugDumpStorageKeys()));
    actions.appendChild(mkBtn(NativeUI.t("导出 Gemini 存储", "Dump Gemini Storage"), () => debugDumpGeminiStores()));
    actions.appendChild(mkBtn(NativeUI.t("导出旧版数据", "Export Legacy Data"), () => debugExportLegacyData()));
    actions.appendChild(mkBtn(NativeUI.t("导出全部存储", "Export All Storage"), () => debugExportAllStorage()));
    actions.appendChild(mkBtn(NativeUI.t("导出日志", "Export Logs"), () => debugExportLogs()));
    actions.appendChild(mkBtn(NativeUI.t("导出适配器探针", "Export Adapter Probe"), () => debugExportAdapterProbe()));
    actions.appendChild(mkBtn(NativeUI.t("清空日志", "Clear Logs"), () => Logger.clear()));
    const logList = document.createElement("div");
    logList.className = "debug-log-list";
    const renderLogs = () => {
      logList.replaceChildren();
      let entries = (0, import_debug_logger.filterLogs)(Logger.getEntries(), { level: activeFilter, term: searchTerm }).slice(-120);
      if (entries.length === 0) {
        const empty = document.createElement("div");
        empty.className = "debug-log-item";
        empty.textContent = NativeUI.t("暂无日志。", "No logs yet.");
        logList.appendChild(empty);
        return;
      }
      entries.forEach((e) => {
        const item = document.createElement("div");
        item.className = "debug-log-item";
        const meta = `${e.ts}`;
        const lvl = document.createElement("span");
        lvl.className = `debug-level ${e.level}`;
        lvl.textContent = `[${e.level.toUpperCase()}]`;
        const data = e.data ? ` ${JSON.stringify(e.data)}` : "";
        item.textContent = `${meta} `;
        item.appendChild(lvl);
        item.appendChild(document.createTextNode(` ${e.msg}${data}`));
        logList.appendChild(item);
      });
    };
    renderLogs();
    unsubscribe = Logger.subscribe(renderLogs);
    body.appendChild(info);
    body.appendChild(health);
    body.appendChild(filterRow);
    body.appendChild(search);
    body.appendChild(actions);
    body.appendChild(logList);
    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    releaseFocus = NativeUI.trapFocus(modal);
    closeBtn.focus();
  }
  function openCalibrationModal() {
    const MODAL_ID = "gemini-calibrate-modal";
    if (document.getElementById(MODAL_ID)) return;
    const PanelUI2 = this;
    const cm = CounterModule;
    const todayKey = Core.getDayKey(cm.resetHour);
    const overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.className = "settings-overlay";
    let releaseFocus = null;
    const escHandler = (e) => {
      if (e.key === "Escape") closeOverlay();
    };
    document.addEventListener("keydown", escHandler);
    const closeOverlay = () => {
      document.removeEventListener("keydown", escHandler);
      if (releaseFocus) releaseFocus();
      overlay.remove();
    };
    overlay.onclick = (e) => {
      if (e.target === overlay) closeOverlay();
    };
    const modal = document.createElement("div");
    modal.className = "settings-modal";
    Core.applyTheme(modal, getCurrentTheme());
    const header = document.createElement("div");
    header.className = "settings-header";
    const title = document.createElement("h3");
    title.textContent = NativeUI.t("校准数据", "Calibrate Data");
    const closeBtn = document.createElement("span");
    closeBtn.className = "settings-close";
    closeBtn.tabIndex = 0;
    closeBtn.setAttribute("role", "button");
    closeBtn.setAttribute("aria-label", NativeUI.t("关闭校准", "Close calibration"));
    closeBtn.appendChild(createIcon("x", 16));
    closeBtn.onclick = () => closeOverlay();
    closeBtn.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") closeOverlay();
    };
    header.appendChild(title);
    header.appendChild(closeBtn);
    const body = document.createElement("div");
    body.className = "settings-body";
    const mkField = (label, value) => {
      const row = document.createElement("div");
      row.className = "settings-row";
      const lbl = document.createElement("span");
      lbl.className = "settings-label";
      lbl.textContent = label;
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.value = value;
      input.className = "settings-select";
      input.style.width = "80px";
      input.style.textAlign = "center";
      row.appendChild(lbl);
      row.appendChild(input);
      return { row, input };
    };
    const section = document.createElement("div");
    section.className = "settings-section";
    const sTitle = document.createElement("div");
    sTitle.className = "settings-section-title";
    sTitle.textContent = NativeUI.t("调整数值", "Adjust Values");
    section.appendChild(sTitle);
    const todayField = mkField(NativeUI.t("今日消息", "Today Messages"), cm.state.dailyCounts[todayKey]?.messages || 0);
    const totalField = mkField(NativeUI.t("总消息数", "Lifetime Total"), cm.state.total);
    const chatsField = mkField(NativeUI.t("创建对话数", "Chats Created"), cm.state.totalChatsCreated);
    section.appendChild(todayField.row);
    section.appendChild(totalField.row);
    section.appendChild(chatsField.row);
    body.appendChild(section);
    let chatField = null;
    const currentCid = Core.getChatId();
    if (currentCid) {
      const chatSection = document.createElement("div");
      chatSection.className = "settings-section";
      const chatTitle = document.createElement("div");
      chatTitle.className = "settings-section-title";
      chatTitle.textContent = NativeUI.t("当前对话", "Current Chat");
      chatSection.appendChild(chatTitle);
      chatField = mkField(NativeUI.t("对话消息数", "Chat Messages"), cm.state.chats[currentCid] || 0);
      chatSection.appendChild(chatField.row);
      const chatIdHint = document.createElement("div");
      chatIdHint.style.cssText = "font-size: 9px; color: var(--text-sub); opacity: 0.5; margin-top: 2px;";
      chatIdHint.textContent = "ID: " + currentCid.slice(0, 12) + "...";
      chatSection.appendChild(chatIdHint);
      body.appendChild(chatSection);
    }
    const applyBtn = document.createElement("button");
    applyBtn.className = "settings-btn";
    applyBtn.textContent = NativeUI.t("应用校准", "Apply Calibration");
    applyBtn.style.marginTop = "12px";
    applyBtn.style.background = "rgba(138, 180, 248, 0.2)";
    applyBtn.style.color = "var(--accent, #8ab4f8)";
    applyBtn.style.fontWeight = "500";
    applyBtn.onclick = () => {
      const newToday = parseInt(todayField.input.value, 10) || 0;
      const newTotal = parseInt(totalField.input.value, 10) || 0;
      const newChats = parseInt(chatsField.input.value, 10) || 0;
      cm.ensureTodayEntry();
      cm.state.dailyCounts[todayKey].messages = newToday;
      cm.state.total = newTotal;
      cm.state.totalChatsCreated = newChats;
      if (chatField && currentCid) {
        const newChatVal = parseInt(chatField.input.value, 10) || 0;
        cm.state.chats[currentCid] = newChatVal;
      }
      cm.saveData();
      PanelUI2.update();
      if (cm.state.isExpanded) PanelUI2.renderDetailsPane();
      Logger.info("Data calibrated", {
        today: newToday,
        total: newTotal,
        chats: newChats,
        chatId: currentCid || null
      });
      closeOverlay();
    };
    body.appendChild(applyBtn);
    const note = document.createElement("div");
    note.className = "settings-version";
    note.textContent = NativeUI.t("手动调整计数器数值", "Manually adjust counter values");
    body.appendChild(note);
    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    releaseFocus = NativeUI.trapFocus(modal);
    closeBtn.focus();
  }
  var init_panel_settings = __esm({
    "src/panel_settings.js"() {
      init_constants();
      init_icons();
      init_guided_tour();
      init_logger();
      init_core();
      init_module_registry();
      init_state();
      init_native_ui();
      init_gemini();
      init_counter();
      init_export();
      init_debug_utils();
      init_panel_ui();
    }
  });

  // src/panel_dashboard.js
  function openDashboard() {
    const exist = document.getElementById("gemini-dashboard-overlay");
    if (exist) return;
    const cm = CounterModule;
    const overlay = document.createElement("div");
    overlay.id = "gemini-dashboard-overlay";
    overlay.className = "dash-overlay";
    let releaseFocus = null;
    const closeDash = () => {
      document.removeEventListener("keydown", escHandler);
      if (releaseFocus) releaseFocus();
      const tip = document.getElementById("g-heatmap-tooltip");
      if (tip) tip.remove();
      overlay.remove();
    };
    const escHandler = (e) => {
      if (e.key === "Escape") closeDash();
    };
    document.addEventListener("keydown", escHandler);
    overlay.onclick = (e) => {
      if (e.target === overlay) closeDash();
    };
    const modal = document.createElement("div");
    modal.className = "dash-modal";
    Core.applyTheme(modal, getCurrentTheme());
    const header = document.createElement("div");
    header.className = "dash-header";
    const titleDiv = document.createElement("div");
    titleDiv.className = "dash-title";
    titleDiv.textContent = "";
    titleDiv.appendChild(createIcon("chart", 20));
    titleDiv.appendChild(document.createTextNode(" " + NativeUI.t("统计", "Analytics") + " "));
    const userSpan = document.createElement("span");
    userSpan.style.fontSize = "12px";
    userSpan.style.opacity = "0.5";
    userSpan.style.marginTop = "8px";
    userSpan.textContent = Core.getCurrentUser().split("@")[0];
    titleDiv.appendChild(userSpan);
    const close = document.createElement("div");
    close.className = "dash-close";
    close.tabIndex = 0;
    close.setAttribute("role", "button");
    close.setAttribute("aria-label", NativeUI.t("关闭统计面板", "Close analytics"));
    close.appendChild(createIcon("x", 22));
    close.onclick = () => closeDash();
    close.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") closeDash();
    };
    header.appendChild(titleDiv);
    header.appendChild(close);
    modal.appendChild(header);
    const content = document.createElement("div");
    content.className = "dash-content";
    const streaks = cm.calculateStreaks();
    const grid = document.createElement("div");
    grid.className = "metric-grid";
    const metrics = [
      { label: NativeUI.t("总消息数", "Total Messages"), val: cm.state.total.toLocaleString() },
      { label: NativeUI.t("创建对话数", "Chats Created"), val: cm.state.totalChatsCreated.toLocaleString() },
      { label: NativeUI.t("当前连续天数", "Current Streak"), val: streaks.current + " " + NativeUI.t("天", "Days") },
      { label: NativeUI.t("最长连续天数", "Best Streak"), val: streaks.best + " " + NativeUI.t("天", "Days") }
    ];
    metrics.forEach((m) => {
      const card = document.createElement("div");
      card.className = "metric-card";
      const valDiv = document.createElement("div");
      valDiv.className = "metric-val";
      valDiv.textContent = m.val;
      const labelDiv = document.createElement("div");
      labelDiv.className = "metric-label";
      labelDiv.textContent = m.label;
      card.appendChild(valDiv);
      card.appendChild(labelDiv);
      grid.appendChild(card);
    });
    content.appendChild(grid);
    const hmContainer = document.createElement("div");
    hmContainer.className = "heatmap-container";
    const hmHeader = document.createElement("div");
    hmHeader.className = "heatmap-title";
    const titleSpan = document.createElement("span");
    titleSpan.textContent = NativeUI.t("活动记录（最近 365 天）", "Activity (Last 365 Days)");
    const legend = document.createElement("div");
    legend.className = "heatmap-legend";
    legend.appendChild(document.createTextNode(NativeUI.t("少 ", "Less ")));
    ["l-0", "l-1", "l-3", "l-4"].forEach((cls) => {
      const item = document.createElement("div");
      item.className = `legend-item ${cls}`;
      legend.appendChild(item);
    });
    legend.appendChild(document.createTextNode(NativeUI.t(" 多", " More")));
    hmHeader.appendChild(titleSpan);
    hmHeader.appendChild(legend);
    hmContainer.appendChild(hmHeader);
    const hmWrapper = document.createElement("div");
    hmWrapper.className = "heatmap-wrapper";
    const weekCol = document.createElement("div");
    weekCol.className = "heatmap-week-labels";
    ["", "Mon", "", "Wed", "", "Fri", ""].forEach((d) => {
      const label = document.createElement("div");
      label.className = "week-label";
      label.textContent = NativeUI.t({ Mon: "一", Wed: "三", Fri: "五" }[d] || "", d);
      weekCol.appendChild(label);
    });
    hmWrapper.appendChild(weekCol);
    const hmMain = document.createElement("div");
    hmMain.className = "heatmap-main";
    const monthRow = document.createElement("div");
    monthRow.className = "heatmap-months";
    const hmGrid = document.createElement("div");
    hmGrid.className = "heatmap-grid";
    const today = /* @__PURE__ */ new Date();
    const oneYearAgo = /* @__PURE__ */ new Date();
    oneYearAgo.setDate(today.getDate() - 365);
    let maxVal = 0;
    Object.values(cm.state.dailyCounts).forEach((v) => {
      if (v.messages > maxVal) maxVal = v.messages;
    });
    if (maxVal < 10) maxVal = 10;
    let tooltip = document.getElementById("g-heatmap-tooltip");
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.id = "g-heatmap-tooltip";
      tooltip.className = "g-tooltip";
      document.body.appendChild(tooltip);
    }
    let iterDate = new Date(oneYearAgo);
    iterDate.setDate(iterDate.getDate() - iterDate.getDay());
    let lastMonth = -1;
    for (let week = 0; week < 53; week++) {
      const currentMonth = iterDate.getMonth();
      const mLabel = document.createElement("div");
      mLabel.className = "month-label";
      if (currentMonth !== lastMonth) {
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        mLabel.textContent = monthNames[currentMonth];
        lastMonth = currentMonth;
      }
      monthRow.appendChild(mLabel);
      const col = document.createElement("div");
      col.className = "heatmap-col";
      for (let day = 0; day < 7; day++) {
        const key = (0, import_date_utils.formatLocalDate)(iterDate);
        const count = cm.state.dailyCounts[key]?.messages || 0;
        const cell = document.createElement("div");
        cell.className = "heatmap-cell";
        let level = "l-0";
        if (count > 0) {
          const ratio = count / maxVal;
          if (ratio > 0.75) level = "l-4";
          else if (ratio > 0.5) level = "l-3";
          else if (ratio > 0.25) level = "l-2";
          else level = "l-1";
        }
        cell.classList.add(level);
        cell.onmouseenter = (e) => {
          tooltip.textContent = "";
          const b = document.createElement("div");
          b.style.fontWeight = "bold";
          b.textContent = key;
          const sp = document.createElement("div");
          sp.textContent = `${count} messages`;
          tooltip.appendChild(b);
          tooltip.appendChild(sp);
          tooltip.classList.add("visible");
          const rect = cell.getBoundingClientRect();
          let left = rect.left + rect.width / 2;
          let top = rect.top;
          tooltip.style.left = left + "px";
          tooltip.style.top = top + "px";
          const ttRect = tooltip.getBoundingClientRect();
          if (ttRect.right > window.innerWidth) tooltip.style.left = window.innerWidth - ttRect.width / 2 - 10 + "px";
          if (ttRect.left < 0) tooltip.style.left = ttRect.width / 2 + 10 + "px";
          if (ttRect.top < 0) tooltip.style.top = rect.bottom + 10 + "px";
          if (ttRect.bottom > window.innerHeight) tooltip.style.top = rect.top - ttRect.height - 10 + "px";
        };
        cell.onmouseleave = () => tooltip.classList.remove("visible");
        col.appendChild(cell);
        iterDate.setDate(iterDate.getDate() + 1);
        if (iterDate > today && day === today.getDay()) break;
      }
      hmGrid.appendChild(col);
      if (iterDate > today) break;
    }
    hmMain.appendChild(monthRow);
    hmMain.appendChild(hmGrid);
    hmWrapper.appendChild(hmMain);
    hmContainer.appendChild(hmWrapper);
    content.appendChild(hmContainer);
    const allByModel = { flash: 0, thinking: 0, pro: 0 };
    Object.values(cm.state.dailyCounts).forEach((entry) => {
      if (entry.byModel) {
        allByModel.flash += entry.byModel.flash || 0;
        allByModel.thinking += entry.byModel.thinking || 0;
        allByModel.pro += entry.byModel.pro || 0;
      }
    });
    const modelTotal = allByModel.flash + allByModel.thinking + allByModel.pro;
    if (modelTotal > 0) {
      const modelContainer = document.createElement("div");
      modelContainer.className = "heatmap-container";
      const modelTitle = document.createElement("div");
      modelTitle.className = "heatmap-title";
      const modelTitleSpan = document.createElement("span");
      modelTitleSpan.textContent = NativeUI.t("模型使用分布", "Model Usage Distribution");
      modelTitle.appendChild(modelTitleSpan);
      modelContainer.appendChild(modelTitle);
      const modelColors = { flash: CounterModule.MODEL_CONFIG.flash.color, thinking: CounterModule.MODEL_CONFIG.thinking.color, pro: CounterModule.MODEL_CONFIG.pro.color };
      const models = [
        { key: "flash", label: "3 Flash", count: allByModel.flash },
        { key: "thinking", label: "3 Flash Thinking", count: allByModel.thinking },
        { key: "pro", label: "3 Pro", count: allByModel.pro }
      ];
      models.forEach((m) => {
        const pct = (m.count / modelTotal * 100).toFixed(1);
        const barRow = document.createElement("div");
        barRow.style.cssText = "display: flex; align-items: center; gap: 8px; margin-bottom: 8px;";
        const labelEl = document.createElement("div");
        labelEl.style.cssText = "font-size: 11px; color: var(--text-sub); width: 110px; flex-shrink: 0;";
        labelEl.textContent = m.label;
        const barBg = document.createElement("div");
        barBg.style.cssText = "flex: 1; height: 16px; background: var(--btn-bg, rgba(255,255,255,0.05)); border-radius: 4px; overflow: hidden;";
        const barFill = document.createElement("div");
        barFill.style.cssText = `height: 100%; width: ${pct}%; background: ${modelColors[m.key]}; border-radius: 4px; transition: width 0.4s;`;
        barBg.appendChild(barFill);
        const valEl = document.createElement("div");
        valEl.style.cssText = "font-size: 11px; color: var(--text-main); width: 70px; text-align: right; flex-shrink: 0; font-family: monospace;";
        valEl.textContent = `${m.count} (${pct}%)`;
        barRow.appendChild(labelEl);
        barRow.appendChild(barBg);
        barRow.appendChild(valEl);
        modelContainer.appendChild(barRow);
      });
      const weightedTotal = Object.keys(allByModel).reduce((sum, k) => sum + (allByModel[k] || 0) * (CounterModule.MODEL_CONFIG[k]?.multiplier ?? 1), 0);
      const wStr = weightedTotal % 1 === 0 ? String(weightedTotal) : weightedTotal.toFixed(1);
      const weightedRow = document.createElement("div");
      weightedRow.style.cssText = "font-size: 11px; color: var(--text-sub); margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--divider, rgba(255,255,255,0.05));";
      weightedRow.textContent = NativeUI.t(`加权总量: ${wStr} | 原始消息: ${modelTotal}`, `Total Weighted: ${wStr} | Raw Messages: ${modelTotal}`);
      modelContainer.appendChild(weightedRow);
      content.appendChild(modelContainer);
    }
    modal.appendChild(content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    releaseFocus = NativeUI.trapFocus(modal);
    close.focus();
    setTimeout(() => {
      hmContainer.scrollLeft = hmContainer.scrollWidth;
    }, 0);
  }
  var import_date_utils;
  var init_panel_dashboard = __esm({
    "src/panel_dashboard.js"() {
      init_icons();
      init_core();
      init_state();
      init_counter();
      import_date_utils = __toESM(require_date_utils());
      init_native_ui();
    }
  });

  // src/panel_ui.js
  function setIconText(el, iconName, text, iconSize = 14) {
    el.textContent = "";
    el.appendChild(createIcon(iconName, iconSize));
    if (text) el.appendChild(document.createTextNode(" " + text));
  }
  function renderModIcon(mod, size = 16) {
    const name = MODULE_ICON_MAP[mod.id];
    if (name) return createIcon(name, size);
    const span = document.createElement("span");
    span.textContent = mod.icon;
    return span;
  }
  var import_date_utils2, MODULE_ICON_MAP, PanelUI;
  var init_panel_ui = __esm({
    "src/panel_ui.js"() {
      init_constants();
      import_date_utils2 = __toESM(require_date_utils());
      init_icons();
      init_core();
      init_module_registry();
      init_state();
      init_counter();
      init_native_ui();
      init_panel_settings();
      init_panel_dashboard();
      MODULE_ICON_MAP = {
        "counter": "chart",
        "export": "upload",
        "folders": "folder",
        "prompt-vault": "gem",
        "default-model": "bot",
        "batch-delete": "trash",
        "quote-reply": "quote",
        "ui-tweaks": "palette",
        "chat-notes": "pin",
        "message-queue": "package"
      };
      PanelUI = {
        _activeTab: "stats",
        // --- 样式注入 ---
        injectStyles() {
          GM_addStyle(`
            #${PANEL_ID} {
                --bg: #202124; --text-main: #fff; --text-sub: #ccc; --accent: #8ab4f8;
                --blur: 18px; --saturate: 180%;
                position: fixed; z-index: 2147483647; width: 170px;
                background: var(--bg);
                backdrop-filter: blur(var(--blur)) saturate(var(--saturate));
                -webkit-backdrop-filter: blur(var(--blur)) saturate(var(--saturate));
                border: 1px solid var(--border); border-radius: 16px;
                border-top: 1px solid var(--highlight, rgba(255,255,255,0.08));
                box-shadow: var(--shadow), var(--border-highlight, inset 0 0 0 transparent);
                font-family: 'Google Sans', Roboto, sans-serif;
                overflow: hidden; user-select: none;
                display: flex; flex-direction: column;
                transition: height 0.35s cubic-bezier(0.19, 1, 0.22, 1),
                            background 0.3s cubic-bezier(0.19, 1, 0.22, 1),
                            box-shadow 0.4s cubic-bezier(0.19, 1, 0.22, 1),
                            transform 0.4s cubic-bezier(0.19, 1, 0.22, 1);
            }
            #${PANEL_ID}:hover {
                box-shadow: var(--shadow-hover, var(--shadow)), var(--border-highlight, inset 0 0 0 transparent);
                transform: translateY(-2px);
            }
            .gemini-header {
                padding: 8px 14px; cursor: grab;
                background: var(--header-bg, rgba(255, 255, 255, 0.03));
                border-bottom: 1px solid var(--header-border, rgba(255, 255, 255, 0.05));
                display: flex; align-items: center; justify-content: space-between; height: 32px;
            }
            .user-capsule {
                display: flex; align-items: center; gap: 4px;
                font-size: 10px; color: var(--text-sub);
                background: var(--badge-bg, rgba(255,255,255,0.05));
                padding: 2px 8px; border-radius: 12px; border: 1px solid transparent;
                max-width: 120px; overflow: hidden;
            }
            .acct-badge-inline {
                font-size: 8px; font-weight: 600; letter-spacing: 0.4px;
                padding: 1px 5px; border-radius: 10px;
                background: var(--badge-bg, rgba(255,255,255,0.06));
                color: var(--text-sub);
                text-transform: uppercase;
                flex-shrink: 0;
            }
            .acct-badge-inline[data-tier="pro"] {
                background: rgba(138,180,248,0.2);
                color: #8ab4f8;
            }
            .acct-badge-inline[data-tier="ultra"] {
                background: rgba(251,188,4,0.2);
                color: #fbbc04;
            }
            .user-capsule.viewing-other { border-color: #fdbd00; color: #fdbd00; }
            .user-avatar-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
            .gemini-toggle-btn { cursor: pointer; font-size: 14px; opacity: 0.6; color: var(--text-sub);
                transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
            .gemini-toggle-btn:hover { opacity: 1; color: var(--accent); }
            .gemini-main-view { padding: 12px 14px 14px; text-align: center; }
            .gemini-big-num {
                font-size: 40px; font-weight: 400; color: var(--text-main); line-height: 1;
                margin-bottom: 4px; text-shadow: 0 0 20px rgba(128, 128, 128, 0.1);
                transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .gemini-big-num.bump {
                animation: numBump 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            @keyframes numBump {
                0%   { transform: scale(1); }
                40%  { transform: scale(1.15); }
                100% { transform: scale(1); }
            }

            /* --- 模型 & 配额 --- */
            .gemini-model-row {
                display: flex; align-items: center; justify-content: center; gap: 6px;
                margin-bottom: 6px;
            }
            .model-badge {
                font-size: 9px; font-weight: 700; letter-spacing: 0.6px;
                padding: 2px 7px; border-radius: 6px;
                line-height: 1.4;
                border: 1px solid var(--divider, rgba(255,255,255,0.15));
            }
            .quota-bar-wrap {
                margin: 6px 0 8px; height: 4px; border-radius: 2px;
                background: var(--btn-bg); overflow: hidden;
                position: relative;
            }
            .quota-bar-fill {
                height: 100%; border-radius: 2px;
                transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1),
                            background 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .quota-label {
                font-size: 9px; color: var(--text-sub); opacity: 0.6;
                margin-bottom: 8px; font-family: monospace;
            }

            .gemini-sub-info {
                font-size: 10px; color: var(--text-sub); margin-bottom: 8px;
                font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .gemini-details-view {
                height: 0; opacity: 0; overflow: hidden; background: var(--detail-bg, rgba(0,0,0,0.1));
                padding: 0 12px;
                transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                            padding 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .gemini-details-view.expanded { height: auto; opacity: 1; padding: 10px 12px 14px 12px; border-top: 1px solid var(--border); max-height: 420px; overflow-y: auto; }
            .section-title {
                font-size: 9px; color: var(--text-sub); opacity: 0.5;
                margin: 8px 0 4px 0; text-transform: uppercase; letter-spacing: 1px;
            }
            .detail-row {
                display: flex; justify-content: space-between; align-items: center;
                margin-bottom: 4px; font-size: 11px; color: var(--text-sub); cursor: pointer;
                padding: 5px 8px; border-radius: 6px;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .detail-row:hover { background: var(--row-hover); color: var(--text-main); }
            .detail-row:active { transform: scale(0.98); }
            .detail-row.active-mode { background: rgba(138, 180, 248, 0.15); color: var(--accent); font-weight: 500; }
            .user-row { justify-content: flex-start; gap: 6px; }
            .user-row.is-me { border-left: 2px solid var(--accent); }
            .user-indicator { font-size: 8px; padding: 1px 4px; border-radius: 4px; background: var(--accent); color: #000; }
            .g-btn {
                background: var(--btn-bg); border: 1px solid transparent;
                color: var(--text-sub); border-radius: 8px; padding: 6px 0; font-size: 11px;
                cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); width: 100%;
            }
            .g-btn:hover { background: var(--row-hover); color: var(--text-main); }
            .g-btn:focus-visible,
            .settings-btn:focus-visible,
            .settings-select:focus-visible,
            .settings-close:focus-visible,
            .onboarding-close:focus-visible,
            .dash-close:focus-visible,
            .debug-close:focus-visible,
            .detail-row:focus-visible,
            .onboarding-lang-btn:focus-visible,
            .gc-native-btn:focus-visible,
            .gc-dropdown-item:focus-visible {
                outline: 2px solid var(--accent, #8ab4f8);
                outline-offset: 2px;
            }
            .g-btn:active { transform: scale(0.97); opacity: 0.85; }
            .g-btn.danger-1 { color: #f28b82; border-color: #f28b82; }
            .g-btn.danger-2 { background: #f28b82; color: #202124; font-weight: bold; }
            .g-btn.disabled { opacity: 0.5; cursor: not-allowed; }

            /* Settings Modal */
            @keyframes modalIn {
                0% { opacity: 0; transform: translateY(16px) scale(0.96); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes overlayIn {
                from { opacity: 0; }
                to   { opacity: 1; }
            }
            .settings-overlay {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: var(--overlay-tint, rgba(0,0,0,0.6)); z-index: 2147483646;
                display: flex; align-items: center; justify-content: center;
                animation: overlayIn 0.2s ease-out;
            }
            .settings-modal {
                width: 300px; max-height: 80vh; overflow-y: auto;
                background: var(--bg, #202124); border: 1px solid var(--border, rgba(255,255,255,0.1));
                border-top: 1px solid var(--highlight, rgba(255,255,255,0.08));
                border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2);
                font-family: 'Google Sans', Roboto, sans-serif;
                animation: modalIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .settings-header {
                padding: 12px 16px; border-bottom: 1px solid var(--divider, rgba(255,255,255,0.1));
                display: flex; justify-content: space-between; align-items: center;
            }
            .settings-header h3 { margin: 0; font-size: 14px; color: var(--text-main, #fff); font-weight: 500; }
            .settings-close { cursor: pointer; font-size: 18px; color: var(--text-sub, #9aa0a6); }
            .settings-close:hover { color: var(--accent, #8ab4f8); }
            .settings-body { padding: 12px 16px; }
            .settings-section { margin-bottom: 16px; }
            .settings-section-title { font-size: 10px; color: var(--text-sub, #9aa0a6); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
            .settings-row {
                display: flex; justify-content: space-between; align-items: center;
                padding: 8px 0; border-bottom: 1px solid var(--divider, rgba(255,255,255,0.05));
            }
            .settings-row:last-child { border-bottom: none; }
            .settings-label { font-size: 12px; color: var(--text-main, #fff); }
            .settings-select {
                background: var(--btn-bg, rgba(255,255,255,0.05)); border: 1px solid var(--border, rgba(255,255,255,0.1));
                color: var(--text-main, #fff); border-radius: 6px; padding: 4px 8px; font-size: 11px;
            }
            .settings-btn {
                background: var(--btn-bg, rgba(255,255,255,0.05)); border: 1px solid transparent;
                color: var(--text-sub, #9aa0a6); border-radius: 8px; padding: 8px 12px; font-size: 11px;
                cursor: pointer; transition: all 0.2s; width: 100%; margin-top: 4px;
            }
            .settings-btn:hover { background: var(--row-hover, rgba(255,255,255,0.05)); color: var(--text-main, #fff); }
            .settings-btn:active { transform: scale(0.97); opacity: 0.85; }
            .settings-btn.danger { color: #f28b82; border-color: #f28b82; }
            .settings-version { font-size: 10px; color: var(--text-sub, #9aa0a6); text-align: center; padding: 8px; opacity: 0.6; }

            /* Debug Modal */
            .debug-overlay {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: var(--overlay-tint, rgba(0,0,0,0.6)); z-index: 2147483646;
                display: flex; align-items: center; justify-content: center;
                animation: overlayIn 0.2s ease-out;
            }
            .debug-modal {
                width: 520px; max-width: 95vw; max-height: 85vh; overflow-y: auto;
                background: var(--bg, #202124); border: 1px solid var(--border, rgba(255,255,255,0.1));
                border-top: 1px solid var(--highlight, rgba(255,255,255,0.08));
                border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2);
                font-family: 'Google Sans', Roboto, sans-serif;
                animation: modalIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .debug-header {
                padding: 12px 16px; border-bottom: 1px solid var(--divider, rgba(255,255,255,0.1));
                display: flex; justify-content: space-between; align-items: center;
            }
            .debug-header h3 { margin: 0; font-size: 14px; color: var(--text-main, #fff); font-weight: 500; }
            .debug-close { cursor: pointer; font-size: 18px; color: var(--text-sub, #9aa0a6); }
            .debug-close:hover { color: var(--accent, #8ab4f8); }
            .debug-body { padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }
            .debug-kv { font-size: 11px; color: var(--text-sub); line-height: 1.6; }
            .debug-kv strong { color: var(--text-main); font-weight: 500; }
            .debug-actions { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
            .debug-log-list {
                background: var(--code-bg, rgba(0,0,0,0.3)); border: 1px solid var(--divider, rgba(255,255,255,0.08));
                border-radius: 8px; padding: 8px; max-height: 240px; overflow: auto;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
                font-size: 10px; color: var(--text-sub);
            }
            .debug-log-item { padding: 2px 0; border-bottom: 1px dashed var(--divider, rgba(255,255,255,0.05)); }
            .debug-log-item:last-child { border-bottom: none; }
            .debug-filter-row { display: flex; gap: 6px; flex-wrap: wrap; }
            .debug-filter-btn {
                font-size: 10px; padding: 4px 8px; border-radius: 6px;
                border: 1px solid var(--divider, rgba(255,255,255,0.1));
                background: var(--input-bg, rgba(255,255,255,0.05));
                color: var(--text-sub); cursor: pointer;
            }
            .debug-filter-btn.active { color: var(--text-main); border-color: var(--accent); }
            .debug-search {
                background: var(--code-bg, rgba(0,0,0,0.3));
                border: 1px solid var(--divider, rgba(255,255,255,0.1));
                color: var(--text-main); border-radius: 6px; padding: 4px 8px;
                font-size: 10px; width: 100%;
            }
            .debug-level { font-weight: 700; letter-spacing: 0.3px; }
            .debug-level.error { color: #f28b82; }
            .debug-level.warn { color: #fbbc04; }
            .debug-level.info { color: #8ab4f8; }
            .debug-level.debug { color: #81c995; }

            /* Module Toggle */
            .module-toggle-row {
                display: flex; justify-content: space-between; align-items: center;
                padding: 10px 0; border-bottom: 1px solid var(--divider, rgba(255,255,255,0.05));
            }
            .module-info { display: flex; align-items: center; gap: 8px; }
            .module-icon { font-size: 16px; display: inline-flex; align-items: center; }
            .module-text { display: flex; flex-direction: column; }
            .module-name { font-size: 12px; color: var(--text-main, #fff); }
            .module-desc { font-size: 9px; color: var(--text-sub, #9aa0a6); opacity: 0.7; }
            .toggle-switch {
                position: relative; width: 36px; height: 20px;
                background: var(--btn-bg, rgba(255,255,255,0.1)); border-radius: 10px;
                cursor: pointer; transition: background 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .toggle-switch.on { background: var(--accent, #8ab4f8); }
            .toggle-switch::after {
                content: ''; position: absolute; top: 2px; left: 2px;
                width: 16px; height: 16px; background: #fff; border-radius: 50%;
                transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
                box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            }
            .toggle-switch.on::after { transform: translateX(16px); }

            /* --- Dashboard Styles --- */
            .dash-overlay {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: var(--overlay-tint, rgba(0,0,0,0.85)); z-index: 2147483645;
                display: flex; align-items: center; justify-content: center;
                backdrop-filter: blur(5px);
                animation: overlayIn 0.2s ease-out;
            }
            .dash-modal {
                width: 800px; max-width: 95vw; max-height: 90vh; overflow-y: auto;
                background: var(--bg); border: 1px solid var(--border);
                border-top: 1px solid var(--highlight, rgba(255,255,255,0.08));
                border-radius: 24px; box-shadow: 0 12px 40px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.2);
                display: flex; flex-direction: column;
                animation: modalIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .dash-header {
                padding: 24px 32px; border-bottom: 1px solid var(--border);
                display: flex; justify-content: space-between; align-items: center;
            }
            .dash-title { font-size: 24px; font-weight: 300; color: var(--text-main); display: flex; align-items: center; gap: 12px; }
            .dash-close { font-size: 28px; color: var(--text-sub); cursor: pointer; transition: 0.2s; }
            .dash-close:hover { color: var(--accent); transform: scale(1.1); }

            .dash-content { padding: 32px; display: flex; flex-direction: column; gap: 32px; }

            /* Metric Cards */
            .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; }
            .metric-card {
                background: var(--input-bg, rgba(255,255,255,0.03)); border: 1px solid var(--border);
                border-top: 1px solid var(--highlight, rgba(255,255,255,0.08));
                border-radius: 16px; padding: 20px; text-align: center;
                transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s;
            }
            .metric-card:hover { transform: translateY(-3px); background: var(--row-hover, rgba(255,255,255,0.06)); box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
            .metric-val { font-size: 32px; color: var(--text-main); font-weight: 300; margin-bottom: 4px; }
            .metric-label { font-size: 12px; color: var(--text-sub); text-transform: uppercase; letter-spacing: 1px; }

            /* Heatmap */
            .heatmap-container {
                background: var(--input-bg, rgba(255,255,255,0.03)); border: 1px solid var(--border);
                border-radius: 16px; padding: 24px; overflow-x: auto;
            }
            .heatmap-title { font-size: 14px; color: var(--text-main); margin-bottom: 16px; display: flex; justify-content: space-between; }
            .heatmap-grid { display: flex; gap: 4px; }
            .heatmap-col { display: flex; flex-direction: column; gap: 4px; }
            .heatmap-cell {
                width: 12px; height: 12px; border-radius: 3px;
                background: var(--btn-bg, rgba(255,255,255,0.1)); position: relative;
                transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .heatmap-cell:hover { transform: scale(1.4); z-index: 10; outline: 1.5px solid var(--accent); outline-offset: 0.5px; }
            .heatmap-legend { display: flex; gap: 4px; align-items: center; font-size: 10px; color: var(--text-sub); }
            .legend-item { width: 10px; height: 10px; border-radius: 2px; }

            .heatmap-wrapper { display: flex; gap: 8px; }
            .heatmap-week-labels { display: flex; flex-direction: column; gap: 4px; padding-top: 18px; }
            .week-label { height: 12px; font-size: 9px; line-height: 12px; color: var(--text-sub); opacity: 0.7; }

            .heatmap-main { display: flex; flex-direction: column; }
            .heatmap-months { display: flex; gap: 4px; margin-bottom: 6px; height: 12px; }
            .month-label { width: 12px; font-size: 9px; color: var(--text-sub); overflow: visible; white-space: nowrap; }

            /* Custom Tooltip */
            .g-tooltip {
                position: fixed; background: rgba(0,0,0,0.9); border: 1px solid var(--border);
                color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 10px;
                pointer-events: none; z-index: 2147483647; opacity: 0; transition: opacity 0.1s;
                transform: translate(-50%, -100%); margin-top: -8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            }
            .g-tooltip.visible { opacity: 1; }

            /* Level Colors */
            .l-0 { background: var(--btn-bg, rgba(255,255,255,0.05)); }
            .l-1 { background: rgba(138, 180, 248, 0.2); }
            .l-2 { background: rgba(138, 180, 248, 0.4); }
            .l-3 { background: rgba(138, 180, 248, 0.7); }
            .l-4 { background: rgba(138, 180, 248, 1.0); }

            /* Details Pane Tab Bar */
            .details-tab-bar {
                display: flex; gap: 2px; padding: 0 0 8px 0;
                border-bottom: 1px solid var(--divider, rgba(255,255,255,0.05));
                margin-bottom: 8px;
            }
            .details-tab {
                flex: 1; padding: 5px 0; text-align: center;
                font-size: 12px; cursor: pointer; border-radius: 6px;
                color: var(--text-sub); transition: all 0.2s;
                background: transparent;
            }
            .details-tab:hover { background: var(--row-hover); color: var(--text-main); }
            .details-tab.active {
                background: var(--accent); color: #000; font-weight: 600;
            }

            /* Module Toggle Compact */
            .module-toggle-compact {
                display: flex; justify-content: space-between; align-items: center;
                padding: 6px 0; border-bottom: 1px solid var(--divider, rgba(255,255,255,0.05));
            }
            .module-compact-label {
                display: flex; align-items: center; gap: 6px;
                font-size: 11px; color: var(--text-main);
            }
            .module-compact-label .module-icon { font-size: 14px; }

            /* Onboarding Modal */
            .onboarding-overlay {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: var(--overlay-tint, rgba(0,0,0,0.7)); z-index: 2147483647;
                display: flex; align-items: center; justify-content: center;
                animation: overlayIn 0.2s ease-out;
            }
            .onboarding-modal {
                width: 400px; max-width: 92vw; max-height: 80vh; overflow-y: auto;
                background: var(--bg, #202124); border: 1px solid var(--border, rgba(255,255,255,0.1));
                border-top: 1px solid var(--highlight, rgba(255,255,255,0.08));
                border-radius: 20px; box-shadow: 0 12px 40px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.2);
                font-family: 'Google Sans', Roboto, sans-serif;
                animation: modalIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .onboarding-header {
                padding: 16px 20px; border-bottom: 1px solid var(--divider, rgba(255,255,255,0.08));
                display: flex; justify-content: space-between; align-items: center;
            }
            .onboarding-header h3 { margin: 0; font-size: 16px; color: var(--text-main, #fff); font-weight: 500; }
            .onboarding-close { cursor: pointer; font-size: 18px; color: var(--text-sub, #9aa0a6); }
            .onboarding-close:hover { color: var(--accent, #8ab4f8); }
            .onboarding-body { padding: 16px 20px; }
            .onboarding-section { margin-bottom: 16px; }
            .onboarding-section-title {
                font-size: 13px; font-weight: 600; color: var(--accent, #8ab4f8);
                margin-bottom: 6px;
            }
            .onboarding-text {
                font-size: 12px; color: var(--text-sub, #9aa0a6); line-height: 1.6;
                white-space: pre-line;
            }
            .onboarding-footer {
                padding: 12px 20px; border-top: 1px solid var(--divider, rgba(255,255,255,0.08));
                display: flex; justify-content: space-between; align-items: center;
            }
            .onboarding-lang-btn {
                background: var(--btn-bg, rgba(255,255,255,0.06)); border: 1px solid var(--border);
                color: var(--text-sub); border-radius: 8px; padding: 4px 10px;
                font-size: 11px; cursor: pointer;
            }
            .onboarding-lang-btn:hover { color: var(--text-main); }
            .onboarding-start-btn {
                background: var(--accent, #8ab4f8); color: #000; border: none;
                border-radius: 8px; padding: 6px 16px; font-size: 12px;
                font-weight: 600; cursor: pointer;
            }
            .onboarding-start-btn:hover { opacity: 0.9; }
            .onboarding-info-btn {
                font-size: 11px; color: var(--text-sub, #9aa0a6); cursor: pointer;
                opacity: 0.5; margin-left: 4px;
            }
            .onboarding-info-btn:hover { opacity: 1; color: var(--accent, #8ab4f8); }

            /* Native UI shared styles */
            .gc-native-btn {
                background: transparent; border: none; cursor: pointer;
                font-size: 16px; padding: 4px 6px; border-radius: 50%;
                transition: background 0.2s;
                line-height: 1;
            }
            .gc-native-btn:hover { background: rgba(128,128,128,0.2); }
            .gc-dropdown-menu {
                position: absolute; z-index: 2147483646;
                background: var(--bg, #303134); border: 1px solid rgba(255,255,255,0.12);
                border-top: 1px solid var(--highlight, rgba(255,255,255,0.08));
                border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.3), 0 12px 32px rgba(0,0,0,0.2);
                padding: 4px 0; min-width: 160px;
                font-family: 'Google Sans', Roboto, sans-serif;
                animation: modalIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .gc-dropdown-item {
                padding: 8px 16px; font-size: 13px; color: #e8eaed;
                cursor: pointer; display: flex; align-items: center; gap: 8px;
            }
            .gc-dropdown-item:hover { background: rgba(255,255,255,0.08); }
            @media (prefers-reduced-motion: reduce) {
                #gemini-monitor-panel-v7 *,
                .settings-overlay *,
                .debug-overlay *,
                .dash-overlay *,
                .onboarding-overlay *,
                .settings-overlay,
                .debug-overlay,
                .dash-overlay,
                .onboarding-overlay {
                    animation-duration: 0.01ms !important;
                    animation-iteration-count: 1 !important;
                    transition-duration: 0.01ms !important;
                    scroll-behavior: auto !important;
                }
            }
        `);
        },
        // --- 面板创建 ---
        create() {
          try {
            const existing = document.getElementById(PANEL_ID);
            if (existing) {
              if (this._isPanelComplete(existing)) {
                this.update();
                return;
              }
              existing.remove();
            }
            this._prev = {};
            this._prevTabIds = null;
            const container = document.createElement("div");
            container.id = PANEL_ID;
            container.className = "notranslate";
            container.setAttribute("translate", "no");
            let pos = DEFAULT_POS;
            try {
              pos = GM_getValue(GLOBAL_KEYS.POS, DEFAULT_POS);
            } catch (e) {
            }
            this.applyPos(container, pos);
            Core.applyTheme(container, getCurrentTheme());
            const header = document.createElement("div");
            header.className = "gemini-header";
            const userCapsule = document.createElement("div");
            userCapsule.id = "g-user-capsule";
            userCapsule.className = "user-capsule";
            const toggle = document.createElement("span");
            toggle.className = "gemini-toggle-btn";
            toggle.appendChild(createIcon("menu", 14));
            toggle.onpointerdown = (e) => e.stopPropagation();
            toggle.onclick = () => this.toggleDetails();
            header.appendChild(userCapsule);
            header.appendChild(toggle);
            const mainView = document.createElement("div");
            mainView.className = "gemini-main-view";
            const bigDisplay = document.createElement("div");
            bigDisplay.id = "g-big-display";
            bigDisplay.className = "gemini-big-num";
            bigDisplay.textContent = "0";
            const modelRow = document.createElement("div");
            modelRow.id = "g-model-row";
            modelRow.className = "gemini-model-row";
            const modelBadge = document.createElement("span");
            modelBadge.id = "g-model-badge";
            modelBadge.className = "model-badge";
            modelRow.appendChild(modelBadge);
            const subInfo = document.createElement("div");
            subInfo.id = "g-sub-info";
            subInfo.className = "gemini-sub-info";
            subInfo.textContent = NativeUI.t("今天", "Today");
            const quotaWrap = document.createElement("div");
            quotaWrap.id = "g-quota-wrap";
            quotaWrap.className = "quota-bar-wrap";
            const quotaFill = document.createElement("div");
            quotaFill.id = "g-quota-fill";
            quotaFill.className = "quota-bar-fill";
            quotaWrap.appendChild(quotaFill);
            const quotaLabel = document.createElement("div");
            quotaLabel.id = "g-quota-label";
            quotaLabel.className = "quota-label";
            const actionBtn = document.createElement("button");
            actionBtn.id = "g-action-btn";
            actionBtn.className = "g-btn";
            actionBtn.textContent = NativeUI.t("重置今天", "Reset Today");
            actionBtn.onclick = () => CounterModule.handleReset();
            actionBtn.onpointerdown = (e) => e.stopPropagation();
            mainView.appendChild(bigDisplay);
            mainView.appendChild(modelRow);
            mainView.appendChild(subInfo);
            mainView.appendChild(quotaWrap);
            mainView.appendChild(quotaLabel);
            mainView.appendChild(actionBtn);
            const details = document.createElement("div");
            details.id = "g-details-pane";
            details.className = "gemini-details-view";
            container.appendChild(header);
            container.appendChild(mainView);
            container.appendChild(details);
            document.body.appendChild(container);
            this.makeDraggable(container, header);
            if (CounterModule.state.isExpanded) {
              details.classList.add("expanded");
              this.renderDetailsPane();
            }
            this.update();
          } catch (e) {
            console.error("Panel init error", e);
          }
        },
        _isPanelComplete(container) {
          return !!(container && container.querySelector("#g-user-capsule") && container.querySelector("#g-big-display") && container.querySelector("#g-model-badge") && container.querySelector("#g-action-btn") && container.querySelector("#g-details-pane"));
        },
        // --- 详情面板渲染 (optimized: separate tab bar from content) ---
        _prevTabIds: null,
        renderDetailsPane() {
          const pane = document.getElementById("g-details-pane");
          if (!pane) return;
          if (!CounterModule.state.isExpanded && !pane.classList.contains("expanded")) return;
          const tabs = [{ id: "stats", iconName: "chart" }];
          Object.keys(ModuleRegistry.modules).forEach((id) => {
            const mod = ModuleRegistry.modules[id];
            if (mod && ModuleRegistry.isEnabled(id) && typeof mod.renderToDetailsPane === "function") {
              tabs.push({ id, iconName: MODULE_ICON_MAP[id] || null, icon: mod.icon });
            }
          });
          if (!tabs.find((t) => t.id === this._activeTab)) this._activeTab = "stats";
          const tabIds = tabs.map((t) => t.id).join(",");
          const tabBarChanged = tabIds !== this._prevTabIds;
          if (tabBarChanged) {
            pane.replaceChildren();
            this._prevTabIds = tabIds;
            if (tabs.length > 1) {
              const tabBar = document.createElement("div");
              tabBar.id = "g-details-tab-bar";
              tabBar.className = "details-tab-bar";
              tabs.forEach((t) => {
                const tab = document.createElement("div");
                tab.className = `details-tab ${t.id === this._activeTab ? "active" : ""}`;
                tab.dataset.tabId = t.id;
                if (t.iconName) {
                  tab.appendChild(createIcon(t.iconName, 14));
                } else {
                  tab.textContent = t.icon;
                }
                tab.title = t.id;
                tab.onclick = (e) => {
                  e.stopPropagation();
                  this._activeTab = t.id;
                  this._switchTabContent(pane, tabs);
                };
                tabBar.appendChild(tab);
              });
              pane.appendChild(tabBar);
            }
            const content = document.createElement("div");
            content.id = "g-details-content";
            pane.appendChild(content);
          }
          this._switchTabContent(pane, tabs);
        },
        _switchTabContent(pane, tabs) {
          const content = document.getElementById("g-details-content") || pane;
          content.replaceChildren();
          const tabBar = document.getElementById("g-details-tab-bar");
          if (tabBar) {
            tabBar.querySelectorAll(".details-tab").forEach((tab) => {
              tab.classList.toggle("active", tab.dataset.tabId === this._activeTab);
            });
          }
          try {
            if (this._activeTab === "stats") {
              this._renderStatsTab(content);
            } else {
              const mod = ModuleRegistry.modules[this._activeTab];
              if (mod && typeof mod.renderToDetailsPane === "function") {
                mod.renderToDetailsPane(content);
              }
            }
          } catch (e) {
            console.error("Details pane render error", e);
            const fallback = document.createElement("div");
            fallback.className = "detail-row";
            fallback.textContent = NativeUI.t("详情暂时无法渲染", "Details unavailable");
            content.appendChild(fallback);
          }
        },
        // --- Stats tab content (original Statistics + Profiles + Themes + Actions) ---
        _renderStatsTab(pane) {
          const cm = CounterModule;
          const user = Core.getCurrentUser();
          const inspecting = Core.getInspectingUser();
          pane.appendChild(this.createSectionTitle("Statistics"));
          const cid = Core.getChatId();
          pane.appendChild(this.createRow("Today", "today", cm.getTodayMessages()));
          pane.appendChild(this.createPassiveRow(
            NativeUI.t("配额窗口", "Quota Window"),
            this._formatQuotaWindowText(cm.getQuotaWindowState())
          ));
          pane.appendChild(this.createRow("Current Chat", "chat", cid ? cm.state.chats[cid] || 0 : 0));
          pane.appendChild(this.createRow("Chats Created", "chatsCreated", cm.state.totalChatsCreated));
          pane.appendChild(this.createRow("Lifetime", "total", cm.state.total));
          const byModel = cm.getTodayByModel();
          const hasModelData = byModel.flash || byModel.thinking || byModel.pro;
          if (hasModelData) {
            const modelRow = document.createElement("div");
            modelRow.className = "detail-row model-breakdown";
            modelRow.style.cssText = "display: flex; gap: 10px; font-size: 10px; padding: 4px 8px; color: var(--text-sub);";
            const models = [
              { key: "flash", label: "Flash", color: QUOTA_COLORS.safe },
              { key: "thinking", label: "Think", color: QUOTA_COLORS.warn },
              { key: "pro", label: "Pro", color: QUOTA_COLORS.danger }
            ];
            models.forEach((m) => {
              const span = document.createElement("span");
              span.style.cssText = "display: flex; align-items: center; gap: 3px;";
              const dot = document.createElement("span");
              dot.style.cssText = `width: 6px; height: 6px; border-radius: 50%; background: ${m.color}; display: inline-block;`;
              const num = document.createElement("span");
              num.textContent = byModel[m.key] || 0;
              span.appendChild(dot);
              span.appendChild(num);
              modelRow.appendChild(span);
            });
            pane.appendChild(modelRow);
          }
          pane.appendChild(this.createSectionTitle(NativeUI.t("账号", "Profiles")));
          const users = Core.getAllUsers();
          const sortedUsers = users.sort((a, b) => a === user ? -1 : b === user ? 1 : a.localeCompare(b));
          if (sortedUsers.length === 0 && user === TEMP_USER) {
            const row = document.createElement("div");
            row.className = "detail-row";
            row.textContent = NativeUI.t("等待登录...", "Waiting for login...");
            pane.appendChild(row);
          } else {
            sortedUsers.forEach((uid) => {
              const row = document.createElement("div");
              row.className = `detail-row user-row ${uid === user ? "is-me" : ""} ${uid === inspecting ? "active-mode" : ""}`;
              row.onclick = (e) => {
                e.stopPropagation();
                Core.setInspectingUser(uid);
                cm.loadDataForUser(uid);
                cm.state.viewMode = "total";
                this.renderDetailsPane();
              };
              const nameSpan = document.createElement("span");
              nameSpan.textContent = uid.split("@")[0];
              row.appendChild(nameSpan);
              if (uid === user) {
                const meBadge = document.createElement("span");
                meBadge.className = "user-indicator";
                meBadge.textContent = NativeUI.t("我", "ME");
                row.appendChild(meBadge);
              }
              pane.appendChild(row);
            });
          }
          pane.appendChild(this.createSectionTitle(NativeUI.t("主题", "Themes")));
          const themes = Core.getThemes();
          Object.keys(themes).forEach((key) => {
            const row = document.createElement("div");
            row.className = `detail-row ${getCurrentTheme() === key ? "active-mode" : ""}`;
            row.textContent = themes[key].name;
            row.onclick = (e) => {
              e.stopPropagation();
              Core.setTheme(key);
              setCurrentTheme(key);
              const panel = document.getElementById(PANEL_ID);
              Core.applyTheme(panel, key);
              this.renderDetailsPane();
            };
            pane.appendChild(row);
          });
          pane.appendChild(this.createSectionTitle(""));
          const actionsRow = document.createElement("div");
          actionsRow.style.display = "flex";
          actionsRow.style.gap = "8px";
          const statsBtn = document.createElement("button");
          statsBtn.className = "g-btn";
          statsBtn.textContent = "";
          setIconText(statsBtn, "chart", NativeUI.t("统计", "Stats"));
          statsBtn.style.flex = "1";
          statsBtn.onclick = (e) => {
            e.stopPropagation();
            this.openDashboard();
          };
          const settingsBtn = document.createElement("button");
          settingsBtn.className = "g-btn";
          settingsBtn.appendChild(createIcon("settings", 14));
          settingsBtn.style.width = "44px";
          settingsBtn.style.minWidth = "44px";
          settingsBtn.title = NativeUI.t("设置", "Settings");
          settingsBtn.onclick = (e) => {
            e.stopPropagation();
            this.openSettingsModal();
          };
          actionsRow.appendChild(statsBtn);
          actionsRow.appendChild(settingsBtn);
          pane.appendChild(actionsRow);
        },
        createSectionTitle(text) {
          const div = document.createElement("div");
          div.className = "section-title";
          div.textContent = text;
          return div;
        },
        _formatQuotaWindowText(windowState) {
          if (!windowState) return "";
          const resetText = windowState.remainingLabel === "now" ? NativeUI.t("现在重置", "reset now") : NativeUI.t(`${windowState.remainingLabel} 后重置`, `resets in ${windowState.remainingLabel}`);
          return `${windowState.windowLabel} · ${resetText}`;
        },
        createPassiveRow(label, val) {
          const row = document.createElement("div");
          row.className = "detail-row";
          row.style.cursor = "default";
          const labelSpan = document.createElement("span");
          labelSpan.textContent = label;
          const valSpan = document.createElement("span");
          valSpan.className = "detail-val";
          valSpan.textContent = val;
          row.appendChild(labelSpan);
          row.appendChild(valSpan);
          return row;
        },
        createRow(label, mode, val) {
          const cm = CounterModule;
          const user = Core.getCurrentUser();
          const inspecting = Core.getInspectingUser();
          const row = document.createElement("div");
          row.className = `detail-row ${cm.state.viewMode === mode && inspecting === user ? "active-mode" : ""}`;
          const labelSpan = document.createElement("span");
          labelSpan.textContent = label;
          const valSpan = document.createElement("span");
          valSpan.className = "detail-val";
          valSpan.textContent = val;
          row.appendChild(labelSpan);
          row.appendChild(valSpan);
          row.onclick = (e) => {
            e.stopPropagation();
            if (inspecting !== user) {
              Core.setInspectingUser(user);
              cm.loadDataForUser(user);
            }
            cm.state.viewMode = mode;
            cm.state.resetStep = 0;
            this.update();
            this.renderDetailsPane();
          };
          return row;
        },
        // --- UI 更新 (with dirty-checking) ---
        _prev: {},
        update() {
          const cm = CounterModule;
          const user = Core.getCurrentUser();
          const inspecting = Core.getInspectingUser();
          const bigDisplay = document.getElementById("g-big-display");
          const subInfo = document.getElementById("g-sub-info");
          const actionBtn = document.getElementById("g-action-btn");
          const capsule = document.getElementById("g-user-capsule");
          const modelBadge = document.getElementById("g-model-badge");
          const quotaFill = document.getElementById("g-quota-fill");
          const quotaLabel = document.getElementById("g-quota-label");
          if (!bigDisplay || !subInfo || !actionBtn || !capsule || !modelBadge) return;
          const p = this._prev;
          const isMe = inspecting === user;
          const displayName = inspecting === TEMP_USER ? "Guest" : inspecting.split("@")[0];
          const accountType = cm.accountType || "free";
          const modelKey = cm.currentModel;
          const quotaWindowText = this._formatQuotaWindowText(cm.getQuotaWindowState());
          let val = 0, sub = "", btn = NativeUI.t("重置", "Reset");
          let disableBtn = !isMe;
          if (cm.state.viewMode === "today") {
            val = cm.getTodayMessages();
            sub = NativeUI.t(`今天 ${quotaWindowText}`, `Today ${quotaWindowText}`);
            btn = NativeUI.t("重置今天", "Reset Today");
            if (!isMe) {
              sub = NativeUI.t(`今天（${inspecting.split("@")[0]}）`, `Today (${inspecting.split("@")[0]})`);
            }
          } else if (cm.state.viewMode === "chat") {
            if (!isMe) {
              val = "--";
              sub = NativeUI.t("不同上下文", "Different Context");
              disableBtn = true;
            } else {
              const cid = Core.getChatId();
              val = cid ? cm.state.chats[cid] || 0 : 0;
              sub = cid ? `ID: ${cid.slice(0, 8)}...` : NativeUI.t("ID: 新对话", "ID: New Chat");
              btn = NativeUI.t("重置对话", "Reset Chat");
            }
          } else if (cm.state.viewMode === "chatsCreated") {
            val = cm.state.totalChatsCreated;
            sub = NativeUI.t("创建对话数", "Chats Created");
            btn = NativeUI.t("仅查看", "View Only");
            disableBtn = true;
          } else if (cm.state.viewMode === "total") {
            val = cm.state.total;
            sub = NativeUI.t("历史总计", "Lifetime History");
            btn = NativeUI.t("清空历史", "Clear History");
          }
          const used = cm.getTodayMessages();
          const weighted = cm.getWeightedQuota();
          const quotaPct = cm.quotaLimit > 0 ? Math.min(weighted / cm.quotaLimit * 100, 100) : 0;
          const quotaColor = quotaPct < 60 ? QUOTA_COLORS.safe : quotaPct < 85 ? QUOTA_COLORS.warn : QUOTA_COLORS.danger;
          const weightedStr = weighted % 1 === 0 ? String(weighted) : weighted.toFixed(1);
          const quotaText = `${used} msgs (${weightedStr} weighted) / ${cm.quotaLimit}`;
          const resetStep = cm.state.resetStep;
          if (p.displayName !== displayName || p.isMe !== isMe || p.accountType !== accountType) {
            capsule.replaceChildren();
            const dot = document.createElement("div");
            dot.className = "user-avatar-dot";
            const name = document.createElement("span");
            name.textContent = displayName;
            name.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
            capsule.appendChild(dot);
            capsule.appendChild(name);
            if (accountType !== "free") {
              const badge = document.createElement("span");
              badge.className = "acct-badge-inline";
              badge.dataset.tier = accountType;
              badge.textContent = accountType === "ultra" ? "Ultra" : "Pro";
              badge.title = NativeUI.t("账户等级", "Account Tier");
              capsule.appendChild(badge);
            }
            capsule.classList.toggle("viewing-other", !isMe);
            capsule.title = isMe ? NativeUI.t("活跃用户", "Active User") : NativeUI.t("查看其他用户（只读）", "Viewing other user (Read Only)");
            p.displayName = displayName;
            p.isMe = isMe;
            p.accountType = accountType;
          }
          if (p.modelKey !== modelKey && modelBadge) {
            const mc = cm.MODEL_CONFIG[modelKey];
            if (mc) {
              modelBadge.textContent = mc.label;
              modelBadge.style.background = mc.color;
              modelBadge.style.color = modelKey === "flash" ? "#000" : "#fff";
              p.modelKey = modelKey;
            }
          }
          if (p.val !== val) {
            const numericVal = typeof val === "number" ? val : -1;
            if (numericVal !== cm.lastDisplayedVal && cm.lastDisplayedVal !== -1 && numericVal > cm.lastDisplayedVal) {
              bigDisplay.classList.remove("bump");
              void bigDisplay.offsetWidth;
              bigDisplay.classList.add("bump");
            }
            cm.lastDisplayedVal = numericVal;
            bigDisplay.textContent = val;
            p.val = val;
          }
          if (p.sub !== sub) {
            subInfo.textContent = sub;
            subInfo.title = sub;
            p.sub = sub;
          }
          if (quotaFill && quotaLabel) {
            if (p.quotaPct !== quotaPct || p.quotaColor !== quotaColor) {
              quotaFill.style.width = quotaPct + "%";
              quotaFill.style.background = quotaColor;
              p.quotaPct = quotaPct;
              p.quotaColor = quotaColor;
            }
            if (p.quotaText !== quotaText) {
              quotaLabel.textContent = quotaText;
              p.quotaText = quotaText;
            }
          }
          if (p.btn !== btn || p.disableBtn !== disableBtn || p.resetStep !== resetStep) {
            if (disableBtn) {
              actionBtn.textContent = NativeUI.t("仅查看", "View Only");
              actionBtn.className = "g-btn disabled";
              actionBtn.disabled = true;
            } else {
              actionBtn.disabled = false;
              if (resetStep === 0) {
                actionBtn.textContent = btn;
                actionBtn.className = "g-btn";
              } else {
                actionBtn.textContent = resetStep === 1 ? "Sure?" : "Really?";
                actionBtn.className = `g-btn danger-${resetStep}`;
              }
            }
            p.btn = btn;
            p.disableBtn = disableBtn;
            p.resetStep = resetStep;
          }
        },
        toggleDetails() {
          const cm = CounterModule;
          cm.state.isExpanded = !cm.state.isExpanded;
          const pane = document.getElementById("g-details-pane");
          if (pane) {
            if (cm.state.isExpanded) {
              pane.classList.add("expanded");
              this.renderDetailsPane();
            } else {
              pane.classList.remove("expanded");
              cm.state.resetStep = 0;
            }
            this.update();
          }
        },
        // --- 位置管理 ---
        applyPos(el, pos) {
          const winW = window.innerWidth;
          const winH = window.innerHeight;
          const savedLeft = parseFloat(pos.left) || 0;
          const savedTop = parseFloat(pos.top) || 0;
          if (pos.left !== "auto" && pos.top !== "auto" && (savedLeft > winW - 50 || savedTop > winH - 50)) {
            console.warn(`💎 Panel off-screen detected. Resetting.`);
            pos = DEFAULT_POS;
            try {
              GM_setValue(GLOBAL_KEYS.POS, DEFAULT_POS);
            } catch {
            }
            ;
          }
          el.style.top = pos.top;
          el.style.left = pos.left;
          el.style.bottom = pos.bottom;
          el.style.right = pos.right;
        },
        makeDraggable(el, handle) {
          if (this._dragMove) document.removeEventListener("pointermove", this._dragMove);
          if (this._dragUp) document.removeEventListener("pointerup", this._dragUp);
          handle.style.touchAction = "none";
          let isDragging = false, startX, startY, iLeft, iTop;
          handle.onpointerdown = (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = el.getBoundingClientRect();
            iLeft = rect.left;
            iTop = rect.top;
            el.style.bottom = "auto";
            el.style.right = "auto";
            el.style.left = iLeft + "px";
            el.style.top = iTop + "px";
            handle.style.cursor = "grabbing";
            handle.setPointerCapture(e.pointerId);
          };
          this._dragMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            let nL = iLeft + e.clientX - startX;
            let nT = iTop + e.clientY - startY;
            if (nT < 10) nT = 10;
            if (nL < 0) nL = 0;
            if (nL + el.offsetWidth > window.innerWidth) nL = window.innerWidth - el.offsetWidth;
            if (nT + el.offsetHeight > window.innerHeight) nT = window.innerHeight - el.offsetHeight;
            el.style.left = nL + "px";
            el.style.top = nT + "px";
          };
          this._dragUp = () => {
            if (!isDragging) return;
            isDragging = false;
            handle.style.cursor = "grab";
            try {
              GM_setValue(GLOBAL_KEYS.POS, { top: el.style.top, left: el.style.left, bottom: "auto", right: "auto" });
            } catch {
            }
          };
          document.addEventListener("pointermove", this._dragMove);
          document.addEventListener("pointerup", this._dragUp);
        },
        destroy() {
          if (this._dragMove) document.removeEventListener("pointermove", this._dragMove);
          if (this._dragUp) document.removeEventListener("pointerup", this._dragUp);
          this._dragMove = null;
          this._dragUp = null;
        },
        // --- Delegated modals (extracted to panel_settings.js / panel_dashboard.js) ---
        openSettingsModal,
        showOnboarding,
        openDebugModal,
        openCalibrationModal,
        openDashboard
      };
    }
  });

  // src/module_registry.js
  var ModuleRegistry;
  var init_module_registry = __esm({
    "src/module_registry.js"() {
      init_constants();
      init_logger();
      init_native_ui();
      init_panel_ui();
      ModuleRegistry = {
        modules: {},
        enabledModules: /* @__PURE__ */ new Set(),
        register(module) {
          this.modules[module.id] = module;
          Logger.debug("Module registered", { id: module.id });
        },
        init() {
          let saved;
          try {
            saved = GM_getValue(GLOBAL_KEYS.MODULES, null);
          } catch (e) {
            saved = null;
          }
          if (saved) {
            this.enabledModules = new Set(saved);
          } else {
            Object.values(this.modules).forEach((m) => {
              if (m.defaultEnabled) this.enabledModules.add(m.id);
            });
            this.save();
          }
          this.enabledModules.forEach((id) => {
            if (this.modules[id]?.init) {
              try {
                this.modules[id].init();
              } catch (e) {
                Logger.error("Module init failed", { id, error: String(e) });
              }
            }
          });
        },
        isEnabled(id) {
          return this.enabledModules.has(id);
        },
        toggle(id) {
          if (this.enabledModules.has(id)) {
            this.enabledModules.delete(id);
            if (this.modules[id]?.destroy) {
              try {
                this.modules[id].destroy();
              } catch (e) {
                Logger.error("Module destroy failed", { id, error: String(e) });
              }
            }
          } else {
            this.enabledModules.add(id);
            if (this.modules[id]?.init) {
              try {
                this.modules[id].init();
              } catch (e) {
                Logger.error("Module init failed (toggle)", { id, error: String(e) });
              }
            }
            if (typeof this.modules[id]?.injectNativeUI === "function") {
              try {
                this.modules[id].injectNativeUI();
              } catch (e) {
                NativeUI.markDirty(id);
              }
            }
            let seen;
            try {
              seen = GM_getValue(GLOBAL_KEYS.ONBOARDING, {});
            } catch (e) {
              seen = {};
            }
            if (!seen[id] && typeof this.modules[id]?.getOnboarding === "function") {
              PanelUI.showOnboarding(id);
              seen[id] = true;
              try {
                GM_setValue(GLOBAL_KEYS.ONBOARDING, seen);
              } catch (e) {
              }
            }
          }
          this.save();
          Logger.info("Module toggled", { id, enabled: this.enabledModules.has(id) });
        },
        save() {
          try {
            GM_setValue(GLOBAL_KEYS.MODULES, Array.from(this.enabledModules));
          } catch (e) {
          }
        },
        notifyUserChange(user) {
          this.enabledModules.forEach((id) => {
            if (this.modules[id]?.onUserChange) {
              try {
                this.modules[id].onUserChange(user);
              } catch (e) {
                Logger.error("Module onUserChange failed", { id, error: String(e) });
              }
            }
          });
        },
        getAll() {
          return Object.values(this.modules);
        }
      };
    }
  });

  // src/dom_watcher.js
  var DOMWatcher;
  var init_dom_watcher = __esm({
    "src/dom_watcher.js"() {
      init_logger();
      DOMWatcher = {
        _observer: null,
        _handlers: [],
        _timers: {},
        init() {
          if (this._observer) return;
          this._observer = new MutationObserver((mutations) => {
            for (const h of this._handlers) {
              try {
                if (mutations.some((m) => h.match(m))) {
                  clearTimeout(this._timers[h.id]);
                  this._timers[h.id] = setTimeout(h.callback, h.debounce || 0);
                }
              } catch (e) {
              }
            }
          });
          this._observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["aria-label", "alt", "class", "data-test-id"]
          });
          Logger.debug("DOMWatcher initialized");
        },
        register(id, { match, callback, debounce = 0 }) {
          this.unregister(id);
          this._handlers.push({ id, match, callback, debounce });
          Logger.debug("DOMWatcher handler registered", { id, debounce });
        },
        unregister(id) {
          this._handlers = this._handlers.filter((h) => h.id !== id);
          clearTimeout(this._timers[id]);
          delete this._timers[id];
        },
        destroy() {
          this._observer?.disconnect();
          this._observer = null;
          Object.values(this._timers).forEach(clearTimeout);
          this._handlers = [];
          this._timers = {};
        }
      };
    }
  });

  // lib/folder_tools.js
  var require_folder_tools = __commonJS({
    "lib/folder_tools.js"(exports, module) {
      var FOLDER_EXPORT_SCHEMA = "primer-pp.folders";
      var FOLDER_EXPORT_VERSION = 1;
      var DEFAULT_FOLDER_COLOR = "#8ab4f8";
      var MAX_FOLDER_NAME_LENGTH = 80;
      var MAX_RULE_VALUE_LENGTH = 80;
      function toId(value) {
        if (value === null || value === void 0) return "";
        return String(value).trim();
      }
      function toNullableFolderId(value) {
        const id = toId(value);
        return id || null;
      }
      function cloneFolderData(data) {
        const source = data && typeof data === "object" ? data : {};
        const rawFolders = source.folders && typeof source.folders === "object" ? source.folders : {};
        const folders = {};
        Object.entries(rawFolders).forEach(([id, folder]) => {
          folders[id] = folder && typeof folder === "object" ? { ...folder } : folder;
        });
        const chatToFolder = source.chatToFolder && typeof source.chatToFolder === "object" ? { ...source.chatToFolder } : {};
        const folderOrder = Array.isArray(source.folderOrder) ? [...source.folderOrder] : Object.keys(folders);
        return { folders, chatToFolder, folderOrder };
      }
      function getNowIso(opts = {}) {
        return opts.nowIso || (/* @__PURE__ */ new Date()).toISOString();
      }
      function normalizeFolderColor(value, fallback = DEFAULT_FOLDER_COLOR) {
        const color = toId(value);
        return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : fallback;
      }
      function normalizeFolderRule(raw) {
        const source = raw && typeof raw === "object" ? raw : {};
        const value = toId(source.value).slice(0, MAX_RULE_VALUE_LENGTH);
        if (!value) return null;
        return {
          type: source.type === "regex" ? "regex" : "keyword",
          value
        };
      }
      function normalizeFolderRecord(raw, index = 0) {
        const source = raw && typeof raw === "object" ? raw : {};
        const rules = Array.isArray(source.rules) ? source.rules.map(normalizeFolderRule).filter(Boolean) : [];
        return {
          name: (toId(source.name) || `Folder ${index + 1}`).slice(0, MAX_FOLDER_NAME_LENGTH),
          color: normalizeFolderColor(source.color),
          collapsed: source.collapsed === true,
          pinned: source.pinned === true,
          rules
        };
      }
      function normalizeFolderData(data) {
        const source = data && typeof data === "object" ? data : {};
        const rawFolders = source.folders && typeof source.folders === "object" ? source.folders : {};
        const folders = {};
        Object.entries(rawFolders).forEach(([rawId, folder], index) => {
          const id = toId(rawId);
          if (!id) return;
          folders[id] = normalizeFolderRecord(folder, index);
        });
        const seen = /* @__PURE__ */ new Set();
        const folderOrder = [];
        const rawOrder = Array.isArray(source.folderOrder) ? source.folderOrder : Object.keys(folders);
        rawOrder.forEach((rawId) => {
          const id = toId(rawId);
          if (!id || !folders[id] || seen.has(id)) return;
          seen.add(id);
          folderOrder.push(id);
        });
        Object.keys(folders).forEach((id) => {
          if (seen.has(id)) return;
          seen.add(id);
          folderOrder.push(id);
        });
        const chatToFolder = {};
        const rawMap = source.chatToFolder && typeof source.chatToFolder === "object" ? source.chatToFolder : {};
        Object.entries(rawMap).forEach(([rawChatId, rawFolderId]) => {
          const chatId = toId(rawChatId);
          const folderId = toId(rawFolderId);
          if (chatId && folders[folderId]) chatToFolder[chatId] = folderId;
        });
        return { folders, chatToFolder, folderOrder };
      }
      function getCurrentFolderId(chatToFolder, chatId) {
        return Object.prototype.hasOwnProperty.call(chatToFolder, chatId) ? chatToFolder[chatId] : null;
      }
      function normalizeChatIds(chatIds) {
        const raw = Array.isArray(chatIds) ? chatIds : [chatIds];
        const seen = /* @__PURE__ */ new Set();
        return raw.map(toId).filter((id) => {
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      }
      function moveChatsToFolderForUndo2(data, chatIds, targetFolderId, opts = {}) {
        const next = cloneFolderData(data);
        const targetId = toNullableFolderId(targetFolderId);
        if (targetId !== null && !next.folders[targetId]) {
          return { data: next, undo: null };
        }
        const entries = [];
        normalizeChatIds(chatIds).forEach((chatId) => {
          const previousFolderId = getCurrentFolderId(next.chatToFolder, chatId);
          if (previousFolderId === targetId) return;
          if (targetId === null) {
            delete next.chatToFolder[chatId];
          } else {
            next.chatToFolder[chatId] = targetId;
          }
          entries.push({ chatId, previousFolderId, nextFolderId: targetId });
        });
        if (entries.length === 0) return { data: next, undo: null };
        return {
          data: next,
          undo: {
            type: "folder-move",
            movedAt: getNowIso(opts),
            targetFolderId: targetId,
            entries
          }
        };
      }
      function restoreFolderMove2(data, undo) {
        const next = cloneFolderData(data);
        if (!undo || undo.type !== "folder-move" || !Array.isArray(undo.entries)) {
          return { data: next, restored: false, restoredCount: 0, skippedCount: 0 };
        }
        let restoredCount = 0;
        let skippedCount = 0;
        undo.entries.forEach((entry) => {
          const chatId = toId(entry.chatId);
          const previousFolderId = toNullableFolderId(entry.previousFolderId);
          const nextFolderId = toNullableFolderId(entry.nextFolderId);
          const currentFolderId = chatId ? getCurrentFolderId(next.chatToFolder, chatId) : null;
          const canRestoreTarget = previousFolderId === null || Boolean(next.folders[previousFolderId]);
          if (!chatId || currentFolderId !== nextFolderId || !canRestoreTarget) {
            skippedCount++;
            return;
          }
          if (previousFolderId === null) {
            delete next.chatToFolder[chatId];
          } else {
            next.chatToFolder[chatId] = previousFolderId;
          }
          restoredCount++;
        });
        return {
          data: next,
          restored: restoredCount > 0,
          restoredCount,
          skippedCount
        };
      }
      function deleteFolderForUndo2(data, folderId, opts = {}) {
        const next = cloneFolderData(data);
        const id = toId(folderId);
        if (!id || !next.folders[id]) {
          return { data: next, undo: null };
        }
        const assignments = Object.entries(next.chatToFolder).filter(([, assignedFolderId]) => assignedFolderId === id).map(([chatId]) => ({ chatId, folderId: id }));
        assignments.forEach(({ chatId }) => {
          delete next.chatToFolder[chatId];
        });
        const folder = { ...next.folders[id] };
        const restoreIndex = next.folderOrder.indexOf(id);
        delete next.folders[id];
        next.folderOrder = next.folderOrder.filter((existingId) => existingId !== id);
        return {
          data: next,
          undo: {
            type: "folder-delete",
            deletedAt: getNowIso(opts),
            folderId: id,
            folder,
            restoreIndex,
            assignments
          }
        };
      }
      function createFolderExport(data, opts = {}) {
        return {
          schema: FOLDER_EXPORT_SCHEMA,
          version: FOLDER_EXPORT_VERSION,
          exportedAt: getNowIso(opts),
          app: "Primer++ for Gemini",
          ...normalizeFolderData(data)
        };
      }
      function serializeFolderExport2(data, opts = {}) {
        return JSON.stringify(createFolderExport(data, opts), null, 2);
      }
      function defaultImportedFolderId(folder, index) {
        return `folder_${Date.now()}_${index}`;
      }
      function mergeFolderImport2(existing, rawImport, opts = {}) {
        const state = normalizeFolderData(existing);
        const imported = normalizeFolderData(rawImport);
        const idFactory = typeof opts.idFactory === "function" ? opts.idFactory : defaultImportedFolderId;
        const idMap = {};
        let importedFolders = 0;
        imported.folderOrder.forEach((oldId) => {
          const folder = imported.folders[oldId];
          let nextId = oldId;
          if (state.folders[nextId]) {
            nextId = toId(idFactory(folder, importedFolders)) || defaultImportedFolderId(folder, importedFolders);
          }
          while (state.folders[nextId]) {
            nextId = `${nextId}_copy`;
          }
          state.folders[nextId] = folder;
          state.folderOrder.push(nextId);
          idMap[oldId] = nextId;
          importedFolders++;
        });
        let importedAssignments = 0;
        Object.entries(imported.chatToFolder).forEach(([chatId, oldFolderId]) => {
          const folderId = idMap[oldFolderId];
          state.chatToFolder[chatId] = folderId;
          importedAssignments++;
        });
        return {
          data: state,
          importedFolders,
          importedAssignments
        };
      }
      function restoreDeletedFolder2(data, undo) {
        const next = cloneFolderData(data);
        const folderId = toId(undo && undo.folderId);
        const folder = undo && undo.folder && typeof undo.folder === "object" ? undo.folder : null;
        if (!undo || undo.type !== "folder-delete" || !folderId || !folder || next.folders[folderId]) {
          return { data: next, restored: false, restoredAssignments: 0, skippedAssignments: 0 };
        }
        next.folders[folderId] = { ...folder };
        const rawIndex = Number(undo.restoreIndex);
        const restoreIndex = Number.isInteger(rawIndex) ? Math.max(0, Math.min(rawIndex, next.folderOrder.length)) : next.folderOrder.length;
        const order = next.folderOrder.filter((id) => id !== folderId);
        order.splice(restoreIndex, 0, folderId);
        next.folderOrder = order;
        let restoredAssignments = 0;
        let skippedAssignments = 0;
        const assignments = Array.isArray(undo.assignments) ? undo.assignments : [];
        assignments.forEach((entry) => {
          const chatId = toId(entry.chatId);
          const currentFolderId = chatId ? getCurrentFolderId(next.chatToFolder, chatId) : null;
          if (!chatId || currentFolderId !== null && Boolean(next.folders[currentFolderId])) {
            skippedAssignments++;
            return;
          }
          next.chatToFolder[chatId] = folderId;
          restoredAssignments++;
        });
        return {
          data: next,
          restored: true,
          restoredAssignments,
          skippedAssignments
        };
      }
      module.exports = {
        cloneFolderData,
        createFolderExport,
        deleteFolderForUndo: deleteFolderForUndo2,
        mergeFolderImport: mergeFolderImport2,
        moveChatsToFolderForUndo: moveChatsToFolderForUndo2,
        normalizeFolderData,
        restoreDeletedFolder: restoreDeletedFolder2,
        restoreFolderMove: restoreFolderMove2,
        serializeFolderExport: serializeFolderExport2
      };
    }
  });

  // src/modules/folders.js
  function isValidChatHref(href) {
    if (!href || typeof href !== "string") return false;
    const lower = href.toLowerCase().trim();
    return !lower.match(/^(javascript|data|vbscript):/);
  }
  function safeHexColor(c, fallback = "#8ab4f8") {
    return typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : fallback;
  }
  function isSafeRegex(src) {
    if (typeof src !== "string") return false;
    if (src.length > 80) return false;
    if (/([+*?]|\{\d+,?\d*\})\s*\)\s*[+*?{]/.test(src)) return false;
    if (src.includes("|") && /[+*]|\{\d+,?\d*\}/.test(src)) return false;
    return true;
  }
  var import_date_utils3, import_folder_tools, FoldersModule;
  var init_folders = __esm({
    "src/modules/folders.js"() {
      init_constants();
      init_logger();
      init_core();
      init_native_ui();
      init_dom_watcher();
      init_panel_ui();
      init_counter();
      init_gemini();
      init_icons();
      import_date_utils3 = __toESM(require_date_utils());
      import_folder_tools = __toESM(require_folder_tools());
      FoldersModule = {
        id: "folders",
        name: NativeUI.t("对话文件夹", "Chat Folders"),
        description: NativeUI.t("整理对话到自定义文件夹", "Organize chats into custom folders"),
        iconId: "folder",
        defaultEnabled: false,
        // --- \u6A21\u5757\u79C1\u6709\u5E38\u91CF ---
        STORAGE_KEY: "gemini_folders_data",
        FOLDER_COLORS: ["#8ab4f8", "#81c995", "#f28b82", "#fdd663", "#d7aefb", "#78d9ec", "#fcad70", "#c58af9"],
        // --- \u6A21\u5757\u79C1\u6709\u72B6\u6001 ---
        data: {
          folders: {},
          // { folderId: { name, color, collapsed } }
          chatToFolder: {},
          // { chatId: folderId }
          folderOrder: []
          // [folderId, folderId, ...]
        },
        observer: null,
        chatCache: [],
        // \u7F13\u5B58\u626B\u63CF\u5230\u7684\u804A\u5929\u9879
        dragState: null,
        // Chat drag state: { chatId, chatTitle }
        folderDragState: null,
        // Folder reorder state: { folderId }
        uncategorizedCollapsed: false,
        _searchQuery: "",
        _batchMode: false,
        _batchSelected: /* @__PURE__ */ new Set(),
        _activeFilter: null,
        _initTimeout: null,
        _lastFolderUndo: null,
        // --- \u751F\u547D\u5468\u671F ---
        init() {
          this.loadData();
          this._lastFolderUndo = null;
          this.injectStyles();
          this.startObserver();
          Logger.info("FoldersModule initialized", { mode: "pure" });
        },
        destroy() {
          if (this._styleEl) {
            this._styleEl.remove();
            this._styleEl = null;
          }
          if (this._initTimeout) {
            clearTimeout(this._initTimeout);
            this._initTimeout = null;
          }
          if (this._searchDebounce) {
            clearTimeout(this._searchDebounce);
            this._searchDebounce = null;
          }
          DOMWatcher.unregister("folders-sidebar");
          this.dragState = null;
          this.folderDragState = null;
          this._lastFolderUndo = null;
          document.querySelectorAll(".gf-sidebar-dot").forEach((el) => el.remove());
          document.querySelectorAll(".gf-modal-overlay").forEach((el) => el.remove());
          if (this.chatCache) {
            this.chatCache.forEach((chat) => {
              if (chat.element) {
                chat.element.removeAttribute("draggable");
                chat.element.ondragstart = null;
                chat.element.ondragend = null;
                chat.element.style.opacity = "";
              }
            });
          }
          document.querySelectorAll(".gf-drop-highlight").forEach((el) => {
            el.classList.remove("gf-drop-highlight");
          });
          this.removeNativeUI();
          Logger.info("FoldersModule destroyed");
        },
        onUserChange(user) {
          this.loadData();
          this._lastFolderUndo = null;
          this._activeFilter = null;
          this.removeNativeUI();
          this.markSidebarChats();
          NativeUI.markDirty(this.id);
          NativeUI.tick();
          if (CounterModule.state.isExpanded) {
            PanelUI.renderDetailsPane();
          }
        },
        // --- \u539F\u751F UI \u6CE8\u5165 ---
        injectNativeUI() {
          const FILTER_ID = "gc-folder-filter";
          if (document.getElementById(FILTER_ID)) return;
          const sidebar = NativeUI.getSidebar();
          if (!sidebar) return;
          const filterBar = document.createElement("div");
          filterBar.id = FILTER_ID;
          filterBar.className = "gc-filter-bar";
          this._renderFilterTabs(filterBar);
          if (!sidebar) return;
          const overflowC = GeminiAdapter.getSidebarOverflowContainer() || sidebar;
          overflowC.prepend(filterBar);
        },
        removeNativeUI() {
          NativeUI.remove("gc-folder-filter");
          const chats = Core.scanSidebarChats();
          chats.forEach((chat) => {
            if (chat.element) chat.element.style.display = "";
          });
          this._activeFilter = null;
        },
        _renderFilterTabs(container) {
          container.replaceChildren();
          const folders = this.data.folderOrder.map((id) => ({ id, ...this.data.folders[id] })).filter((f) => f.name);
          const allTab = this._createFilterTab("全部", null, "#8ab4f8");
          container.appendChild(allTab);
          folders.forEach((folder) => {
            const tab = this._createFilterTab(folder.name, folder.id, folder.color);
            container.appendChild(tab);
          });
        },
        _createFilterTab(label, folderId, color) {
          const tab = document.createElement("button");
          const isActive = this._activeFilter === folderId;
          tab.className = "gc-filter-tab" + (isActive ? " active" : "");
          const c = color || "var(--accent, #8ab4f8)";
          if (isActive) {
            tab.style.background = c + "12";
            tab.style.color = c;
          }
          tab.textContent = label;
          tab.onclick = (e) => {
            e.stopPropagation();
            this._activeFilter = folderId;
            this._applyFilter(folderId);
            const bar = document.getElementById("gc-folder-filter");
            if (bar) this._renderFilterTabs(bar);
          };
          return tab;
        },
        _applyFilter(folderId) {
          const chats = Core.scanSidebarChats();
          chats.forEach((chat) => {
            if (!folderId) {
              chat.element.style.display = "";
            } else {
              const assignment = this.data.chatToFolder[chat.id];
              chat.element.style.display = assignment === folderId ? "" : "none";
            }
          });
        },
        _refreshFilterBar() {
          const bar = document.getElementById("gc-folder-filter");
          if (bar) this._renderFilterTabs(bar);
        },
        // --- \u6570\u636E\u7BA1\u7406 ---
        loadData() {
          const user = Core.getCurrentUser();
          const key = user && user !== TEMP_USER ? `${this.STORAGE_KEY}_${user}` : this.STORAGE_KEY;
          let saved;
          try {
            saved = GM_getValue(key, null);
          } catch (e) {
            saved = null;
          }
          if (saved) {
            this.data = {
              folders: saved.folders || {},
              chatToFolder: saved.chatToFolder || {},
              folderOrder: saved.folderOrder || Object.keys(saved.folders || {})
            };
          } else {
            this.data = { folders: {}, chatToFolder: {}, folderOrder: [] };
          }
        },
        saveData() {
          const user = Core.getCurrentUser();
          const key = user && user !== TEMP_USER ? `${this.STORAGE_KEY}_${user}` : this.STORAGE_KEY;
          try {
            GM_setValue(key, this.data);
          } catch (e) {
          }
        },
        // --- \u6587\u4EF6\u5939 CRUD ---
        createFolder(name, color) {
          const id = "folder_" + Date.now();
          this.data.folders[id] = {
            name: name || "New Folder",
            color: color || this.FOLDER_COLORS[Object.keys(this.data.folders).length % this.FOLDER_COLORS.length],
            collapsed: false,
            rules: []
            // Auto-classification rules: [{ type: 'keyword', value: 'string' }]
          };
          this.data.folderOrder.push(id);
          this.saveData();
          this.markSidebarChats();
          this._refreshFilterBar();
          PanelUI.renderDetailsPane();
          return id;
        },
        renameFolder(folderId, newName) {
          if (this.data.folders[folderId]) {
            this.data.folders[folderId].name = newName;
            this.saveData();
            this._refreshFilterBar();
            PanelUI.renderDetailsPane();
          }
        },
        deleteFolder(folderId) {
          const result = (0, import_folder_tools.deleteFolderForUndo)(this.data, folderId, { nowIso: (/* @__PURE__ */ new Date()).toISOString() });
          if (!result.undo) return;
          this.data = result.data;
          this._lastFolderUndo = result.undo;
          if (this._activeFilter === result.undo.folderId) this._activeFilter = null;
          this._persistFolderChanges();
          NativeUI.showToast(NativeUI.t("文件夹已删除，可撤销", "Folder deleted. Undo is available"));
        },
        toggleFolderCollapse(folderId) {
          if (this.data.folders[folderId]) {
            this.data.folders[folderId].collapsed = !this.data.folders[folderId].collapsed;
            this.saveData();
            PanelUI.renderDetailsPane();
          }
        },
        setFolderColor(folderId, color) {
          if (this.data.folders[folderId]) {
            this.data.folders[folderId].color = color;
            this.saveData();
            this.markSidebarChats();
            this._refreshFilterBar();
            PanelUI.renderDetailsPane();
          }
        },
        toggleFolderPin(folderId) {
          if (this.data.folders[folderId]) {
            this.data.folders[folderId].pinned = !this.data.folders[folderId].pinned;
            this.saveData();
            PanelUI.renderDetailsPane();
          }
        },
        moveChatToFolder(chatId, folderId) {
          const result = (0, import_folder_tools.moveChatsToFolderForUndo)(this.data, [chatId], folderId, { nowIso: (/* @__PURE__ */ new Date()).toISOString() });
          if (!result.undo) return;
          this.data = result.data;
          this._lastFolderUndo = result.undo;
          this._persistFolderChanges();
          NativeUI.showToast(NativeUI.t("对话已移动，可撤销", "Chat moved. Undo is available"));
        },
        reorderFolder(draggedId, targetId, position) {
          const order = this.data.folderOrder.filter((id) => id !== draggedId);
          const targetIdx = order.indexOf(targetId);
          if (targetIdx === -1) return;
          const insertIdx = position === "before" ? targetIdx : targetIdx + 1;
          order.splice(insertIdx, 0, draggedId);
          this.data.folderOrder = order;
          this.saveData();
          PanelUI.renderDetailsPane();
        },
        batchMoveToFolder(targetFolderId) {
          const result = (0, import_folder_tools.moveChatsToFolderForUndo)(this.data, [...this._batchSelected], targetFolderId, { nowIso: (/* @__PURE__ */ new Date()).toISOString() });
          this.data = result.data;
          if (result.undo) {
            this._lastFolderUndo = result.undo;
            NativeUI.showToast(NativeUI.t("批量移动已完成，可撤销", "Batch move complete. Undo is available"));
          }
          this._batchSelected.clear();
          this._batchMode = false;
          this._persistFolderChanges();
        },
        undoLastFolderAction() {
          if (!this._lastFolderUndo) return;
          const undo = this._lastFolderUndo;
          const result = undo.type === "folder-delete" ? (0, import_folder_tools.restoreDeletedFolder)(this.data, undo) : (0, import_folder_tools.restoreFolderMove)(this.data, undo);
          this._lastFolderUndo = null;
          if (!result.restored) {
            PanelUI.renderDetailsPane();
            NativeUI.showToast(NativeUI.t("无法撤销最近的文件夹操作", "Unable to undo the latest folder change"));
            return;
          }
          this.data = result.data;
          this._persistFolderChanges();
          NativeUI.showToast(NativeUI.t("已撤销文件夹操作", "Folder change undone"));
        },
        _persistFolderChanges() {
          this.saveData();
          this.markSidebarChats();
          this._applyFilter(this._activeFilter);
          this._refreshFilterBar();
          PanelUI.renderDetailsPane();
        },
        _exportFolders() {
          const data = (0, import_folder_tools.serializeFolderExport)(this.data, { nowIso: (/* @__PURE__ */ new Date()).toISOString() });
          const blob = new Blob([data], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `primer-pp-folders-${(0, import_date_utils3.formatLocalDate)(/* @__PURE__ */ new Date())}.json`;
          a.click();
          URL.revokeObjectURL(url);
          NativeUI.showToast(NativeUI.t("文件夹已导出", "Folders exported"));
        },
        _importFolders() {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".json";
          input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
              try {
                const imported = JSON.parse(ev.target.result);
                const result = (0, import_folder_tools.mergeFolderImport)(this.data, imported, {
                  idFactory: (_folder, index) => {
                    return "folder_" + Date.now() + "_" + index + "_" + Math.random().toString(36).slice(2, 6);
                  }
                });
                if (result.importedFolders === 0) throw new Error("Invalid format");
                this.data = result.data;
                this._lastFolderUndo = null;
                this._persistFolderChanges();
                NativeUI.showToast(NativeUI.t(`已导入 ${result.importedFolders} 个文件夹`, `Imported ${result.importedFolders} folders`));
              } catch {
                NativeUI.showToast(NativeUI.t("导入失败: 格式无效", "Import failed: invalid format"));
              }
            };
            reader.readAsText(file);
          };
          input.click();
        },
        getFolderStats(folderId) {
          const chatIds = Object.entries(this.data.chatToFolder).filter(([, fid]) => fid === folderId).map(([cid]) => cid);
          return { chatCount: chatIds.length };
        },
        setFolderRules(folderId, rules) {
          if (this.data.folders[folderId]) {
            this.data.folders[folderId].rules = rules;
            this.saveData();
          }
        },
        autoClassify() {
          let classified = 0;
          this.scanSidebarChats();
          this.chatCache.forEach((chat) => {
            if (this.data.chatToFolder[chat.id]) return;
            const title = chat.title.toLowerCase();
            for (const folderId of this.data.folderOrder) {
              const folder = this.data.folders[folderId];
              if (!folder || !folder.rules || folder.rules.length === 0) continue;
              const matched = folder.rules.some((rule) => {
                if (rule.type === "keyword" && rule.value) {
                  return title.includes(rule.value.toLowerCase());
                }
                if (rule.type === "regex" && rule.value) {
                  try {
                    if (!isSafeRegex(rule.value)) return false;
                    const regex = new RegExp(rule.value, "i");
                    return regex.test(chat.title.substring(0, 200));
                  } catch {
                    return false;
                  }
                }
                return false;
              });
              if (matched) {
                this.data.chatToFolder[chat.id] = folderId;
                classified++;
                break;
              }
            }
          });
          if (classified > 0) {
            this.saveData();
            this.markSidebarChats();
            PanelUI.renderDetailsPane();
            Logger.info(`Auto-classified ${classified} chats`);
          }
          return classified;
        },
        // --- \u4FA7\u8FB9\u680F\u626B\u63CF ---
        scanSidebarChats() {
          this.chatCache = Core.scanSidebarChats();
          return this.chatCache;
        },
        // --- \u4EC5\u5728\u4FA7\u8FB9\u680F\u804A\u5929\u9879\u4E0A\u6DFB\u52A0\u989C\u8272\u6807\u8BB0 (6px dot) ---
        markSidebarChats() {
          document.querySelectorAll(".gf-sidebar-dot").forEach((el) => el.remove());
          const chats = this.scanSidebarChats();
          chats.forEach((chat) => {
            const folderId = this.data.chatToFolder[chat.id];
            if (folderId && this.data.folders[folderId]) {
              const folder = this.data.folders[folderId];
              const dot = document.createElement("span");
              dot.className = "gf-sidebar-dot";
              dot.style.cssText = `
                    display: inline-block;
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: ${safeHexColor(folder.color)};
                    margin-right: 6px;
                    flex-shrink: 0;
                    vertical-align: middle;
                `;
              dot.title = folder.name;
              chat.element.insertBefore(dot, chat.element.firstChild);
            }
          });
          this.enableSidebarDrag();
        },
        // --- \u5728\u4FA7\u8FB9\u680F\u542F\u7528\u62D6\u62FD\uFF08\u62D6\u5230\u6211\u4EEC\u7684\u9762\u677F\uFF09 ---
        enableSidebarDrag() {
          const chats = this.chatCache;
          chats.forEach((chat) => {
            chat.element.setAttribute("draggable", "true");
            chat.element.ondragstart = (e) => {
              this.dragState = { chatId: chat.id, chatTitle: chat.title };
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", chat.id);
              chat.element.style.opacity = "0.5";
            };
            chat.element.ondragend = () => {
              chat.element.style.opacity = "";
              this.dragState = null;
              document.querySelectorAll(".gf-drop-highlight").forEach((el) => {
                el.classList.remove("gf-drop-highlight");
              });
            };
          });
        },
        // --- DOM 观察 ---
        startObserver() {
          if (this._initTimeout) clearTimeout(this._initTimeout);
          this._initTimeout = setTimeout(() => this.markSidebarChats(), TIMINGS.POLL_INTERVAL);
          DOMWatcher.register("folders-sidebar", {
            match: (m) => GeminiAdapter.matchesFoldersSidebarMutation(m),
            callback: () => this.markSidebarChats(),
            debounce: TIMINGS.OBSERVER_DEBOUNCE
          });
        },
        _styleEl: null,
        // --- \u6CE8\u5165\u6837\u5F0F ---
        injectStyles() {
          if (this._styleEl) return;
          this._styleEl = GM_addStyle(`
            /* Folder Modal */
            .gf-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: var(--overlay-tint, rgba(0, 0, 0, 0.6));
                z-index: 2147483646;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .gf-modal {
                width: 280px;
                background: var(--bg, #202124);
                border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
                border-radius: 16px;
                padding: 20px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            }
            .gf-modal-title {
                font-size: 16px;
                font-weight: 500;
                color: var(--text-main, #e8eaed);
                margin-bottom: 16px;
            }
            .gf-modal-input {
                width: 100%;
                padding: 10px 12px;
                border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
                border-radius: 8px;
                background: var(--input-bg, rgba(255, 255, 255, 0.05));
                color: var(--text-main, #e8eaed);
                font-size: 14px;
                margin-bottom: 12px;
                box-sizing: border-box;
            }
            .gf-modal-input:focus {
                outline: none;
                border-color: var(--accent, #8ab4f8);
            }
            .gf-modal-colors {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                margin-bottom: 16px;
            }
            .gf-color-option {
                width: 28px;
                height: 28px;
                border-radius: 50%;
                cursor: pointer;
                border: 2px solid transparent;
                transition: transform 0.2s, border-color 0.2s;
            }
            .gf-color-option:hover {
                transform: scale(1.1);
            }
            .gf-color-option.selected {
                border-color: #fff;
            }
            .gf-modal-actions {
                display: flex;
                gap: 8px;
                justify-content: flex-end;
            }
            .gf-modal-btn {
                padding: 8px 16px;
                border: none;
                border-radius: 8px;
                font-size: 13px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .gf-modal-btn.primary {
                background: var(--accent, #8ab4f8);
                color: #000;
            }
            .gf-modal-btn.secondary {
                background: var(--btn-bg, rgba(255, 255, 255, 0.1));
                color: var(--text-main, #e8eaed);
            }
            .gf-modal-btn.danger {
                background: rgba(242, 139, 130, 0.2);
                color: #f28b82;
            }
            .gf-modal-btn:hover {
                filter: brightness(1.1);
            }

            /* Folder row in details pane */
            .gf-folder-row {
                display: flex;
                align-items: center;
                padding: 6px 8px;
                margin: 2px 0;
                border-radius: 6px;
                cursor: pointer;
                transition: background 0.2s;
            }
            .gf-folder-row:hover {
                background: var(--row-hover, rgba(255, 255, 255, 0.08));
            }
            .gf-folder-row.drop-active {
                background: rgba(138, 180, 248, 0.2) !important;
                outline: 2px dashed rgba(138, 180, 248, 0.5);
            }
            .gf-folder-dot {
                width: 10px;
                height: 10px;
                border-radius: 3px;
                margin-right: 8px;
                flex-shrink: 0;
            }
            .gf-folder-label {
                flex: 1;
                font-size: 11px;
                color: var(--text-main, #e8eaed);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .gf-folder-badge {
                font-size: 9px;
                color: var(--text-sub, #9aa0a6);
                margin-left: 4px;
            }
            .gf-folder-toggle {
                font-size: 8px;
                color: var(--text-sub, #9aa0a6);
                margin-left: 4px;
                transition: transform 0.2s;
            }
            .gf-folder-row.collapsed .gf-folder-toggle {
                transform: rotate(-90deg);
            }
            .gf-folder-actions {
                display: none;
                gap: 2px;
                margin-left: 4px;
            }
            .gf-folder-row:hover .gf-folder-actions {
                display: flex;
            }
            .gf-folder-action {
                font-size: 10px;
                padding: 2px;
                cursor: pointer;
                opacity: 0.6;
            }
            .gf-folder-action:hover {
                opacity: 1;
            }

            /* Chat item in folder */
            .gf-chat-row {
                display: flex;
                align-items: center;
                padding: 4px 8px 4px 20px;
                margin: 1px 0;
                border-radius: 4px;
                cursor: pointer;
                transition: background 0.2s;
                font-size: 10px;
                color: var(--text-sub, #9aa0a6);
            }
            .gf-chat-row:hover {
                background: var(--row-hover, rgba(255, 255, 255, 0.08));
                color: var(--text-main, #e8eaed);
            }
            .gf-chat-title {
                flex: 1;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .gf-chat-remove {
                font-size: 9px;
                opacity: 0;
                cursor: pointer;
                padding: 2px;
            }
            .gf-chat-row:hover .gf-chat-remove {
                opacity: 0.6;
            }
            .gf-chat-remove:hover {
                opacity: 1;
            }

            /* Add folder button in details */
            .gf-add-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
                padding: 6px;
                margin-top: 4px;
                border: 1px dashed var(--divider, rgba(255, 255, 255, 0.15));
                border-radius: 6px;
                background: transparent;
                color: var(--text-sub, #9aa0a6);
                font-size: 10px;
                cursor: pointer;
                transition: all 0.2s;
                width: 100%;
            }
            .gf-add-btn:hover {
                background: var(--input-bg, rgba(255, 255, 255, 0.05));
                border-color: var(--border, rgba(255, 255, 255, 0.25));
                color: var(--text-main, #e8eaed);
            }

            /* Drop highlight for folder rows */
            .gf-drop-highlight {
                background: rgba(138, 180, 248, 0.15) !important;
            }

            /* Folder drag reorder */
            .gf-folder-row[draggable="true"] {
                cursor: grab;
            }
            .gf-folder-row.dragging {
                opacity: 0.4;
            }
            .gf-folder-row.drag-above {
                border-top: 2px solid var(--accent, #8ab4f8);
            }
            .gf-folder-row.drag-below {
                border-bottom: 2px solid var(--accent, #8ab4f8);
            }

            /* Uncategorized section */
            .gf-uncategorized-header {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 6px 8px;
                margin-top: 6px;
                font-size: 10px;
                color: var(--text-sub, #9aa0a6);
                opacity: 0.7;
                cursor: pointer;
                border-radius: 6px;
                transition: background 0.2s;
            }
            .gf-uncategorized-header:hover {
                background: var(--row-hover, rgba(255, 255, 255, 0.08));
                opacity: 1;
            }

            /* Batch mode */
            .gf-batch-bar {
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 4px 8px;
                margin-bottom: 4px;
                font-size: 10px;
                color: var(--text-sub, #9aa0a6);
            }
            .gf-batch-bar button {
                font-size: 9px;
                padding: 2px 6px;
                border-radius: 4px;
                border: 1px solid var(--divider, rgba(255,255,255,0.1));
                background: var(--btn-bg, rgba(255,255,255,0.05));
                color: var(--text-sub, #9aa0a6);
                cursor: pointer;
            }
            .gf-batch-bar button:hover {
                color: var(--text-main, #fff);
            }
            .gf-chat-row.batch-selected {
                background: rgba(138, 180, 248, 0.15);
            }
            .gf-batch-check {
                width: 12px; height: 12px;
                border: 1px solid var(--text-sub, #9aa0a6);
                border-radius: 3px;
                margin-right: 6px;
                flex-shrink: 0;
                cursor: pointer;
            }
            .gf-batch-check.checked {
                background: var(--accent, #8ab4f8);
                border-color: var(--accent, #8ab4f8);
            }
        `);
        },
        getOnboarding() {
          return {
            zh: {
              rant: "你的 Gemini 侧边栏现在是什么样？200 个无序对话，按时间排列，连搜索都没有。想找上周那个关于 Kubernetes 部署的对话？祝你好运，慢慢翻吧。Google Keep 有标签，Gmail 有标签，Google Drive 有文件夹，但 Gemini 就是没有。一致性？不存在的。",
              features: "侧边栏顶部添加文件夹筛选栏，支持按分组过滤对话。对话项显示彩色文件夹标记，支持拖拽分配。",
              guide: "1. 在浮动面板的 📁 标签页创建文件夹\n2. 拖拽对话到文件夹\n3. 点击侧边栏顶部的文件夹标签筛选"
            },
            en: {
              rant: "Your Gemini sidebar right now: 200 unorganized conversations sorted by time with no search. Want to find last week's Kubernetes deployment chat? Good luck scrolling. Google Keep has labels, Gmail has labels, Drive has folders, but Gemini has nothing. Consistency? Never heard of it.",
              features: "Adds a folder filter bar at the top of the sidebar. Filter conversations by group. Chat items show colored folder dots, with drag-and-drop assignment.",
              guide: "1. Create folders in the 📁 tab of the floating panel\n2. Drag conversations into folders\n3. Click folder tabs at the top of the sidebar to filter"
            }
          };
        },
        // --- \u6E32\u67D3\u5230\u8BE6\u60C5\u9762\u677F ---
        renderToDetailsPane(container) {
          const title = document.createElement("div");
          title.className = "section-title";
          title.style.cssText = "display: flex; justify-content: space-between; align-items: center;";
          const titleText = document.createElement("span");
          titleText.textContent = "Folders";
          const batchToggle = document.createElement("span");
          batchToggle.style.cssText = "font-size: 9px; cursor: pointer; opacity: 0.6;";
          batchToggle.textContent = this._batchMode ? "✕ Cancel" : "☑ Select";
          batchToggle.onclick = (e) => {
            e.stopPropagation();
            this._batchMode = !this._batchMode;
            this._batchSelected.clear();
            PanelUI.renderDetailsPane();
          };
          title.appendChild(titleText);
          title.appendChild(batchToggle);
          container.appendChild(title);
          if (this._lastFolderUndo) {
            const undoRow = document.createElement("div");
            undoRow.className = "detail-row";
            undoRow.style.cssText = "display:flex;align-items:center;gap:6px;";
            const label = document.createElement("span");
            label.style.cssText = "flex:1;font-size:10px;color:var(--text-sub);";
            label.textContent = this._lastFolderUndo.type === "folder-delete" ? NativeUI.t("文件夹删除可撤销", "Folder delete can be undone") : NativeUI.t("文件夹移动可撤销", "Folder move can be undone");
            const undoBtn = document.createElement("button");
            undoBtn.className = "settings-btn";
            undoBtn.style.cssText = "width:auto;margin-top:0;padding:3px 8px;font-size:10px;";
            undoBtn.textContent = NativeUI.t("撤销", "Undo");
            undoBtn.onclick = (e) => {
              e.stopPropagation();
              this.undoLastFolderAction();
            };
            undoRow.appendChild(label);
            undoRow.appendChild(undoBtn);
            container.appendChild(undoRow);
          }
          if (this._batchMode && this._batchSelected.size > 0) {
            const batchBar = document.createElement("div");
            batchBar.className = "gf-batch-bar";
            const countLabel = document.createElement("span");
            countLabel.textContent = `${this._batchSelected.size} selected`;
            batchBar.appendChild(countLabel);
            this.data.folderOrder.forEach((fid) => {
              const f = this.data.folders[fid];
              if (!f) return;
              const btn = document.createElement("button");
              btn.textContent = `→ ${f.name}`;
              btn.onclick = () => this.batchMoveToFolder(fid);
              batchBar.appendChild(btn);
            });
            const unassignBtn = document.createElement("button");
            unassignBtn.textContent = "→ None";
            unassignBtn.onclick = () => this.batchMoveToFolder(null);
            batchBar.appendChild(unassignBtn);
            container.appendChild(batchBar);
          }
          const searchWrap = document.createElement("div");
          searchWrap.style.cssText = "margin-bottom: 6px;";
          const searchInput = document.createElement("input");
          searchInput.type = "text";
          searchInput.placeholder = "Search chats...";
          searchInput.style.cssText = "width: 100%; padding: 4px 8px; font-size: 10px; border-radius: 6px; border: 1px solid var(--divider, rgba(255,255,255,0.1)); background: var(--input-bg, rgba(255,255,255,0.05)); color: var(--text-main, #fff); box-sizing: border-box;";
          searchInput.value = this._searchQuery || "";
          searchInput.oninput = (e) => {
            this._searchQuery = e.target.value;
            if (this._searchDebounce) clearTimeout(this._searchDebounce);
            this._searchDebounce = setTimeout(() => PanelUI.renderDetailsPane(), 150);
          };
          searchWrap.appendChild(searchInput);
          container.appendChild(searchWrap);
          const query = (this._searchQuery || "").toLowerCase().trim();
          this.scanSidebarChats();
          const chatsByFolder = {};
          this.chatCache.forEach((chat) => {
            const fid = this.data.chatToFolder[chat.id];
            if (fid && this.data.folders[fid]) {
              if (!chatsByFolder[fid]) chatsByFolder[fid] = [];
              chatsByFolder[fid].push(chat);
            }
          });
          const sortedFolderOrder = [...this.data.folderOrder].sort((a, b) => {
            const aPinned = this.data.folders[a]?.pinned ? 1 : 0;
            const bPinned = this.data.folders[b]?.pinned ? 1 : 0;
            return bPinned - aPinned;
          });
          if (this.data.folderOrder.length === 0) {
            const hint = document.createElement("div");
            hint.style.cssText = "font-size: 10px; color: var(--text-sub); opacity: 0.6; padding: 4px 8px;";
            hint.textContent = "Drag chats here to organize";
            container.appendChild(hint);
          } else {
            sortedFolderOrder.forEach((folderId) => {
              const folder = this.data.folders[folderId];
              if (!folder) return;
              let chats = chatsByFolder[folderId] || [];
              if (query) {
                chats = chats.filter((c) => c.title.toLowerCase().includes(query));
                if (!folder.name.toLowerCase().includes(query) && chats.length === 0) return;
              }
              const folderEl = this.createFolderRow(folderId, folder, chats);
              container.appendChild(folderEl);
            });
          }
          const assignedChatIds = new Set(
            Object.entries(this.data.chatToFolder).filter(([, fid]) => this.data.folders[fid]).map(([cid]) => cid)
          );
          let uncategorized = this.chatCache.filter((chat) => !assignedChatIds.has(chat.id));
          if (query) {
            uncategorized = uncategorized.filter((c) => c.title.toLowerCase().includes(query));
          }
          if (uncategorized.length > 0) {
            const uncatHeader = document.createElement("div");
            uncatHeader.className = "gf-uncategorized-header";
            const uncatToggle = document.createElement("span");
            uncatToggle.textContent = this.uncategorizedCollapsed ? "▶" : "▼";
            uncatToggle.style.fontSize = "8px";
            const uncatLabel = document.createElement("span");
            uncatLabel.textContent = `Uncategorized (${uncategorized.length})`;
            uncatHeader.appendChild(uncatToggle);
            uncatHeader.appendChild(uncatLabel);
            uncatHeader.onclick = (e) => {
              e.stopPropagation();
              this.uncategorizedCollapsed = !this.uncategorizedCollapsed;
              PanelUI.renderDetailsPane();
            };
            container.appendChild(uncatHeader);
            if (!this.uncategorizedCollapsed) {
              uncategorized.forEach((chat) => {
                const chatRow = document.createElement("div");
                chatRow.className = "gf-chat-row" + (this._batchSelected.has(chat.id) ? " batch-selected" : "");
                if (this._batchMode) {
                  const check = document.createElement("div");
                  check.className = "gf-batch-check" + (this._batchSelected.has(chat.id) ? " checked" : "");
                  check.onclick = (e) => {
                    e.stopPropagation();
                    if (this._batchSelected.has(chat.id)) {
                      this._batchSelected.delete(chat.id);
                    } else {
                      this._batchSelected.add(chat.id);
                    }
                    PanelUI.renderDetailsPane();
                  };
                  chatRow.appendChild(check);
                }
                if (!this._batchMode) {
                  chatRow.setAttribute("draggable", "true");
                  chatRow.ondragstart = (e) => {
                    this.dragState = { chatId: chat.id, chatTitle: chat.title };
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", chat.id);
                    chatRow.style.opacity = "0.5";
                  };
                  chatRow.ondragend = () => {
                    chatRow.style.opacity = "";
                    this.dragState = null;
                  };
                }
                const chatTitle = document.createElement("span");
                chatTitle.className = "gf-chat-title";
                chatTitle.textContent = chat.title.length > 20 ? chat.title.slice(0, 20) + "..." : chat.title;
                chatTitle.title = chat.title;
                chatRow.appendChild(chatTitle);
                chatRow.onclick = (e) => {
                  e.stopPropagation();
                  if (this._batchMode) {
                    if (this._batchSelected.has(chat.id)) {
                      this._batchSelected.delete(chat.id);
                    } else {
                      this._batchSelected.add(chat.id);
                    }
                    PanelUI.renderDetailsPane();
                    return;
                  }
                  if (chat.element && chat.element.click) {
                    chat.element.click();
                  } else if (isValidChatHref(chat.href)) {
                    window.location.href = chat.href;
                  }
                };
                container.appendChild(chatRow);
              });
            }
          }
          const addBtn = document.createElement("button");
          addBtn.className = "gf-add-btn";
          addBtn.textContent = "+ New Folder";
          addBtn.onclick = (e) => {
            e.stopPropagation();
            this.showFolderModal(null, "Create Folder", "", this.FOLDER_COLORS[0]);
          };
          container.appendChild(addBtn);
          const hasRules = this.data.folderOrder.some((fid) => {
            const f = this.data.folders[fid];
            return f && f.rules && f.rules.length > 0;
          });
          if (hasRules) {
            const classifyBtn = document.createElement("button");
            classifyBtn.className = "gf-add-btn";
            classifyBtn.style.borderStyle = "solid";
            classifyBtn.textContent = "";
            classifyBtn.appendChild(createIcon("bot", 12));
            classifyBtn.appendChild(document.createTextNode(" Auto Classify"));
            classifyBtn.onclick = (e) => {
              e.stopPropagation();
              const count = this.autoClassify();
              classifyBtn.textContent = count > 0 ? `✓ Classified ${count} chats` : "✓ Nothing to classify";
              setTimeout(() => {
                classifyBtn.textContent = "";
                classifyBtn.appendChild(createIcon("bot", 12));
                classifyBtn.appendChild(document.createTextNode(" Auto Classify"));
              }, 2e3);
            };
            container.appendChild(classifyBtn);
          }
          const ioRow = document.createElement("div");
          ioRow.style.cssText = "display:flex;gap:6px;margin-top:8px;";
          const exportBtn = document.createElement("button");
          exportBtn.style.cssText = "flex:1;font-size:10px;padding:4px 8px;border-radius:6px;border:1px solid var(--divider,rgba(255,255,255,0.1));background:var(--btn-bg,rgba(255,255,255,0.05));color:var(--text-sub,#9aa0a6);cursor:pointer;";
          exportBtn.textContent = NativeUI.t("导出", "Export");
          exportBtn.onclick = (e) => {
            e.stopPropagation();
            this._exportFolders();
          };
          const importBtn = document.createElement("button");
          importBtn.style.cssText = "flex:1;font-size:10px;padding:4px 8px;border-radius:6px;border:1px solid var(--divider,rgba(255,255,255,0.1));background:var(--btn-bg,rgba(255,255,255,0.05));color:var(--text-sub,#9aa0a6);cursor:pointer;";
          importBtn.textContent = NativeUI.t("导入", "Import");
          importBtn.onclick = (e) => {
            e.stopPropagation();
            this._importFolders();
          };
          ioRow.appendChild(exportBtn);
          ioRow.appendChild(importBtn);
          container.appendChild(ioRow);
        },
        createFolderRow(folderId, folder, chats) {
          const wrapper = document.createElement("div");
          wrapper.className = "gf-folder-wrapper";
          const row = document.createElement("div");
          row.className = `gf-folder-row ${folder.collapsed ? "collapsed" : ""}`;
          row.setAttribute("draggable", "true");
          row.dataset.folderId = folderId;
          row.ondragstart = (e) => {
            if (this.dragState) return;
            this.folderDragState = { folderId };
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", "folder:" + folderId);
            row.classList.add("dragging");
          };
          row.ondragend = () => {
            row.classList.remove("dragging");
            this.folderDragState = null;
            document.querySelectorAll(".gf-folder-row").forEach((el) => {
              el.classList.remove("drag-above", "drag-below");
            });
          };
          const dot = document.createElement("div");
          dot.className = "gf-folder-dot";
          dot.style.background = folder.color;
          const label = document.createElement("span");
          label.className = "gf-folder-label";
          if (folder.pinned) {
            label.appendChild(createIcon("pin", 10));
            label.appendChild(document.createTextNode(" " + folder.name));
          } else {
            label.textContent = folder.name;
          }
          const stats = this.getFolderStats(folderId);
          const badge = document.createElement("span");
          badge.className = "gf-folder-badge";
          badge.textContent = chats.length > 0 ? `(${chats.length})` : "";
          badge.title = `Total assigned: ${stats.chatCount} | Visible: ${chats.length}`;
          const toggle = document.createElement("span");
          toggle.className = "gf-folder-toggle";
          toggle.textContent = "▼";
          const actions = document.createElement("div");
          actions.className = "gf-folder-actions";
          const editBtn = document.createElement("span");
          editBtn.className = "gf-folder-action";
          editBtn.appendChild(createIcon("edit", 12));
          editBtn.title = "Edit";
          editBtn.onclick = (e) => {
            e.stopPropagation();
            this.showFolderModal(folderId, "Edit Folder", folder.name, folder.color);
          };
          const deleteBtn = document.createElement("span");
          deleteBtn.className = "gf-folder-action";
          deleteBtn.appendChild(createIcon("trash", 12));
          deleteBtn.title = "Delete";
          deleteBtn.onclick = (e) => {
            e.stopPropagation();
            NativeUI.showConfirm(
              NativeUI.t(`确认删除文件夹 "${folder.name}"？`, `Delete folder "${folder.name}"?`),
              () => this.deleteFolder(folderId),
              { confirmText: NativeUI.t("删除", "Delete"), danger: true }
            );
          };
          const pinBtn = document.createElement("span");
          pinBtn.className = "gf-folder-action";
          pinBtn.appendChild(createIcon("pin", 12));
          pinBtn.title = folder.pinned ? "Unpin" : "Pin to top";
          pinBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleFolderPin(folderId);
          };
          actions.appendChild(pinBtn);
          actions.appendChild(editBtn);
          actions.appendChild(deleteBtn);
          row.appendChild(dot);
          row.appendChild(label);
          row.appendChild(badge);
          row.appendChild(actions);
          row.appendChild(toggle);
          row.onclick = (e) => {
            if (e.target.closest(".gf-folder-actions")) return;
            e.stopPropagation();
            this.toggleFolderCollapse(folderId);
          };
          row.ondragover = (e) => {
            e.preventDefault();
            if (this.folderDragState && this.folderDragState.folderId !== folderId) {
              const rect = row.getBoundingClientRect();
              const mid = rect.top + rect.height / 2;
              row.classList.remove("drag-above", "drag-below", "drop-active");
              if (e.clientY < mid) {
                row.classList.add("drag-above");
              } else {
                row.classList.add("drag-below");
              }
            } else if (this.dragState) {
              row.classList.add("drop-active");
            }
          };
          row.ondragleave = () => {
            row.classList.remove("drop-active", "drag-above", "drag-below");
          };
          row.ondrop = (e) => {
            e.preventDefault();
            const wasAbove = row.classList.contains("drag-above");
            row.classList.remove("drop-active", "drag-above", "drag-below");
            if (this.folderDragState && this.folderDragState.folderId !== folderId) {
              this.reorderFolder(this.folderDragState.folderId, folderId, wasAbove ? "before" : "after");
            } else if (this.dragState) {
              this.moveChatToFolder(this.dragState.chatId, folderId);
            }
          };
          wrapper.appendChild(row);
          if (!folder.collapsed && chats.length > 0) {
            chats.forEach((chat) => {
              const chatRow = document.createElement("div");
              chatRow.className = "gf-chat-row" + (this._batchSelected.has(chat.id) ? " batch-selected" : "");
              if (this._batchMode) {
                const check = document.createElement("div");
                check.className = "gf-batch-check" + (this._batchSelected.has(chat.id) ? " checked" : "");
                check.onclick = (e) => {
                  e.stopPropagation();
                  if (this._batchSelected.has(chat.id)) {
                    this._batchSelected.delete(chat.id);
                  } else {
                    this._batchSelected.add(chat.id);
                  }
                  PanelUI.renderDetailsPane();
                };
                chatRow.appendChild(check);
              }
              const chatTitle = document.createElement("span");
              chatTitle.className = "gf-chat-title";
              chatTitle.textContent = chat.title;
              chatTitle.title = chat.title;
              const removeBtn = document.createElement("span");
              removeBtn.className = "gf-chat-remove";
              removeBtn.appendChild(createIcon("x", 10));
              removeBtn.title = "Remove from folder";
              removeBtn.onclick = (e) => {
                e.stopPropagation();
                this.moveChatToFolder(chat.id, null);
              };
              chatRow.appendChild(chatTitle);
              if (!this._batchMode) chatRow.appendChild(removeBtn);
              chatRow.onclick = (e) => {
                e.stopPropagation();
                if (this._batchMode) {
                  if (this._batchSelected.has(chat.id)) {
                    this._batchSelected.delete(chat.id);
                  } else {
                    this._batchSelected.add(chat.id);
                  }
                  PanelUI.renderDetailsPane();
                  return;
                }
                if (chat.element && chat.element.click) {
                  chat.element.click();
                } else if (isValidChatHref(chat.href)) {
                  window.location.href = chat.href;
                }
              };
              wrapper.appendChild(chatRow);
            });
          }
          return wrapper;
        },
        // --- \u6A21\u6001\u6846 ---
        showFolderModal(folderId, title, currentName, currentColor) {
          const isEdit = folderId !== null;
          const overlay = document.createElement("div");
          overlay.className = "gf-modal-overlay";
          const escHandler = (e) => {
            if (e.key === "Escape") closeOverlay();
          };
          document.addEventListener("keydown", escHandler);
          const closeOverlay = () => {
            document.removeEventListener("keydown", escHandler);
            overlay.remove();
          };
          overlay.onclick = (e) => {
            if (e.target === overlay) closeOverlay();
          };
          const modal = document.createElement("div");
          modal.className = "gf-modal";
          Core.applyTheme(modal, Core.getTheme());
          const titleEl = document.createElement("div");
          titleEl.className = "gf-modal-title";
          titleEl.textContent = title;
          const input = document.createElement("input");
          input.className = "gf-modal-input";
          input.type = "text";
          input.placeholder = "Folder name";
          input.value = currentName;
          const colorsContainer = document.createElement("div");
          colorsContainer.className = "gf-modal-colors";
          let selectedColor = currentColor;
          this.FOLDER_COLORS.forEach((color) => {
            const colorBtn = document.createElement("div");
            colorBtn.className = `gf-color-option ${color === selectedColor ? "selected" : ""}`;
            colorBtn.style.background = color;
            colorBtn.onclick = () => {
              colorsContainer.querySelectorAll(".gf-color-option").forEach((c) => c.classList.remove("selected"));
              colorBtn.classList.add("selected");
              selectedColor = color;
              hexInput.value = color;
            };
            colorsContainer.appendChild(colorBtn);
          });
          const hexWrap = document.createElement("div");
          hexWrap.style.cssText = "display: flex; align-items: center; gap: 8px; margin-bottom: 16px;";
          const hexLabel = document.createElement("span");
          hexLabel.style.cssText = "font-size: 11px; color: var(--text-sub, #9aa0a6);";
          hexLabel.textContent = "Custom:";
          const hexInput = document.createElement("input");
          hexInput.type = "text";
          hexInput.value = currentColor;
          hexInput.placeholder = "#ff6600";
          hexInput.style.cssText = "flex: 1; padding: 6px 8px; font-size: 12px; border-radius: 6px; border: 1px solid var(--border, rgba(255,255,255,0.1)); background: var(--input-bg, rgba(255,255,255,0.05)); color: var(--text-main, #e8eaed); font-family: monospace; box-sizing: border-box;";
          hexInput.oninput = () => {
            const val = hexInput.value.trim();
            if (/^#[0-9a-fA-F]{3,8}$/.test(val)) {
              selectedColor = val;
              colorsContainer.querySelectorAll(".gf-color-option").forEach((c) => c.classList.remove("selected"));
            }
          };
          hexWrap.appendChild(hexLabel);
          hexWrap.appendChild(hexInput);
          let rulesData = [];
          let rulesContainer = null;
          if (isEdit) {
            rulesData = [...this.data.folders[folderId].rules || []];
            const rulesSection = document.createElement("div");
            rulesSection.style.cssText = "margin-bottom: 16px;";
            const rulesLabel = document.createElement("div");
            rulesLabel.style.cssText = "font-size: 11px; color: var(--text-sub, #9aa0a6); margin-bottom: 6px;";
            rulesLabel.textContent = "Auto-classify rules (keyword or /regex/):";
            rulesSection.appendChild(rulesLabel);
            rulesContainer = document.createElement("div");
            rulesContainer.style.cssText = "display: flex; flex-direction: column; gap: 4px;";
            const renderRules = () => {
              rulesContainer.replaceChildren();
              rulesData.forEach((rule, idx) => {
                const ruleRow = document.createElement("div");
                ruleRow.style.cssText = "display: flex; gap: 4px; align-items: center;";
                const ruleInput = document.createElement("input");
                ruleInput.type = "text";
                ruleInput.value = rule.type === "regex" ? `/${rule.value}/` : rule.value;
                ruleInput.style.cssText = "flex: 1; padding: 4px 8px; font-size: 11px; border-radius: 4px; border: 1px solid var(--border, rgba(255,255,255,0.1)); background: var(--input-bg, rgba(255,255,255,0.05)); color: var(--text-main, #e8eaed); box-sizing: border-box;";
                ruleInput.oninput = () => {
                  const val = ruleInput.value.trim();
                  const regexMatch = val.match(/^\/(.+)\/$/);
                  if (regexMatch) {
                    try {
                      new RegExp(regexMatch[1], "i");
                      rulesData[idx] = { type: "regex", value: regexMatch[1] };
                    } catch (e) {
                      rulesData[idx] = { type: "keyword", value: val };
                    }
                  } else {
                    rulesData[idx] = { type: "keyword", value: val };
                  }
                };
                const delBtn = document.createElement("span");
                delBtn.appendChild(createIcon("x", 10));
                delBtn.style.cssText = "cursor: pointer; font-size: 12px; color: var(--text-sub); opacity: 0.6;";
                delBtn.onclick = () => {
                  rulesData.splice(idx, 1);
                  renderRules();
                };
                ruleRow.appendChild(ruleInput);
                ruleRow.appendChild(delBtn);
                rulesContainer.appendChild(ruleRow);
              });
            };
            renderRules();
            const addRuleBtn = document.createElement("button");
            addRuleBtn.style.cssText = "font-size: 10px; padding: 4px 8px; border-radius: 4px; border: 1px dashed var(--divider, rgba(255,255,255,0.15)); background: transparent; color: var(--text-sub, #9aa0a6); cursor: pointer; margin-top: 4px;";
            addRuleBtn.textContent = "+ Add Rule";
            addRuleBtn.onclick = () => {
              rulesData.push({ type: "keyword", value: "" });
              renderRules();
            };
            rulesSection.appendChild(rulesContainer);
            rulesSection.appendChild(addRuleBtn);
            modal.rulesSection = rulesSection;
          }
          const actionsDiv = document.createElement("div");
          actionsDiv.className = "gf-modal-actions";
          if (isEdit) {
            const deleteBtn = document.createElement("button");
            deleteBtn.className = "gf-modal-btn danger";
            deleteBtn.textContent = NativeUI.t("删除", "Delete");
            deleteBtn.onclick = () => {
              if (deleteBtn.dataset.confirmed) {
                this.deleteFolder(folderId);
                closeOverlay();
              } else {
                deleteBtn.dataset.confirmed = "1";
                deleteBtn.textContent = NativeUI.t("确认删除？", "Confirm?");
                setTimeout(() => {
                  deleteBtn.dataset.confirmed = "";
                  deleteBtn.textContent = NativeUI.t("删除", "Delete");
                }, 3e3);
              }
            };
            actionsDiv.appendChild(deleteBtn);
          }
          const cancelBtn = document.createElement("button");
          cancelBtn.className = "gf-modal-btn secondary";
          cancelBtn.textContent = NativeUI.t("取消", "Cancel");
          cancelBtn.onclick = () => closeOverlay();
          const saveBtn = document.createElement("button");
          saveBtn.className = "gf-modal-btn primary";
          saveBtn.textContent = isEdit ? "Save" : "Create";
          saveBtn.onclick = () => {
            const name = input.value.trim() || "New Folder";
            if (isEdit) {
              this.renameFolder(folderId, name);
              this.setFolderColor(folderId, selectedColor);
              this.setFolderRules(folderId, rulesData.filter((r) => r.value));
            } else {
              this.createFolder(name, selectedColor);
            }
            closeOverlay();
          };
          actionsDiv.appendChild(cancelBtn);
          actionsDiv.appendChild(saveBtn);
          modal.appendChild(titleEl);
          modal.appendChild(input);
          modal.appendChild(colorsContainer);
          modal.appendChild(hexWrap);
          if (modal.rulesSection) modal.appendChild(modal.rulesSection);
          modal.appendChild(actionsDiv);
          overlay.appendChild(modal);
          document.body.appendChild(overlay);
          input.focus();
          input.select();
        }
      };
    }
  });

  // lib/message_queue_tools.js
  var require_message_queue_tools = __commonJS({
    "lib/message_queue_tools.js"(exports, module) {
      var MAX_TITLE_LENGTH = 80;
      var MAX_TEXT_LENGTH = 12e3;
      var MAX_ERROR_LENGTH = 240;
      var STATUSES = /* @__PURE__ */ new Set(["queued", "sending", "sent", "failed", "cancelled"]);
      function toText(value) {
        if (value === null || value === void 0) return "";
        return String(value);
      }
      function cleanText(value) {
        return toText(value).trim();
      }
      function limitedText(value, maxLength) {
        return cleanText(value).slice(0, maxLength);
      }
      function nowIso(opts = {}) {
        return cleanText(opts.nowIso) || (/* @__PURE__ */ new Date()).toISOString();
      }
      function deriveTitle(text) {
        const firstLine = cleanText(text).split(/\r?\n/)[0];
        return firstLine.slice(0, MAX_TITLE_LENGTH);
      }
      function normalizeStatus(value, opts = {}) {
        const status = cleanText(value);
        if (status === "sending" && opts.recoverSending) return "queued";
        return STATUSES.has(status) ? status : "queued";
      }
      function normalizeQueueItem(raw, index = 0, opts = {}) {
        const source = raw && typeof raw === "object" ? raw : {};
        const text = limitedText(source.text === void 0 ? source.content : source.text, MAX_TEXT_LENGTH);
        if (!text) return null;
        const now = nowIso(opts);
        const createdAt = cleanText(source.createdAt) || now;
        const updatedAt = cleanText(source.updatedAt) || createdAt;
        return {
          id: cleanText(source.id) || `q_${index}`,
          title: limitedText(source.title, MAX_TITLE_LENGTH) || deriveTitle(text),
          text,
          status: normalizeStatus(source.status, opts),
          createdAt,
          updatedAt,
          sentAt: cleanText(source.sentAt),
          error: limitedText(source.error, MAX_ERROR_LENGTH)
        };
      }
      function normalizeQueueData2(raw, opts = {}) {
        const source = raw && typeof raw === "object" ? raw : {};
        const rawItems = Array.isArray(source.items) ? source.items : [];
        const items = rawItems.map((item, index) => normalizeQueueItem(item, index, opts)).filter(Boolean);
        const activeId = cleanText(source.activeId);
        const activeExists = activeId && items.some((item) => item.id === activeId && item.status === "sending");
        return {
          paused: source.paused === false ? false : true,
          activeId: activeExists ? activeId : "",
          lastError: limitedText(source.lastError, MAX_ERROR_LENGTH),
          items
        };
      }
      function createQueueItem(text, opts = {}) {
        const content = limitedText(text, MAX_TEXT_LENGTH);
        if (!content) return null;
        const now = nowIso(opts);
        return {
          id: cleanText(opts.id) || `q_${Date.now()}`,
          title: limitedText(opts.title, MAX_TITLE_LENGTH) || deriveTitle(content),
          text: content,
          status: "queued",
          createdAt: now,
          updatedAt: now,
          sentAt: "",
          error: ""
        };
      }
      function addQueueItem2(data, text, opts = {}) {
        const state = normalizeQueueData2(data, opts);
        const item = createQueueItem(text, opts);
        if (!item) return state;
        if (opts.position === "front") state.items.unshift(item);
        else state.items.push(item);
        state.lastError = "";
        return state;
      }
      function addQueueItems2(data, entries, opts = {}) {
        const state = normalizeQueueData2(data, opts);
        const source = Array.isArray(entries) ? entries : [entries];
        const idPrefix = cleanText(opts.idPrefix) || `q_${Date.now()}`;
        const items = [];
        source.forEach((entry, index) => {
          const raw = entry && typeof entry === "object" ? entry : { text: entry };
          const id = cleanText(raw.id) || `${idPrefix}_${index + 1}`;
          const item = createQueueItem(raw.text === void 0 ? raw.content : raw.text, {
            ...opts,
            id,
            title: raw.title
          });
          if (item) items.push(item);
        });
        if (items.length === 0) return { data: state, added: 0, items: [] };
        if (opts.position === "front") state.items.unshift(...items);
        else state.items.push(...items);
        state.lastError = "";
        return { data: state, added: items.length, items };
      }
      function updateQueueItem(data, id, updates = {}, opts = {}) {
        const state = normalizeQueueData2(data, opts);
        const item = state.items.find((entry) => entry.id === cleanText(id));
        if (!item) return state;
        const hasTitleUpdate = updates.title !== void 0;
        const nextTitle = hasTitleUpdate ? limitedText(updates.title, MAX_TITLE_LENGTH) : "";
        if (updates.text !== void 0) {
          const text = limitedText(updates.text, MAX_TEXT_LENGTH);
          if (text) {
            item.text = text;
            item.title = hasTitleUpdate ? nextTitle || deriveTitle(text) : item.title;
          }
        }
        if (hasTitleUpdate && updates.text === void 0) {
          item.title = nextTitle || deriveTitle(item.text);
        }
        item.updatedAt = nowIso(opts);
        return state;
      }
      function removeQueueItem2(data, id, opts = {}) {
        const state = normalizeQueueData2(data, opts);
        const targetId = cleanText(id);
        state.items = state.items.filter((item) => item.id !== targetId);
        if (state.activeId === targetId) state.activeId = "";
        return state;
      }
      function moveQueueItem2(data, id, direction, opts = {}) {
        const state = normalizeQueueData2(data, opts);
        const index = state.items.findIndex((item2) => item2.id === cleanText(id));
        if (index === -1) return state;
        const delta = direction === "up" ? -1 : direction === "down" ? 1 : Number(direction);
        if (!Number.isFinite(delta) || delta === 0) return state;
        const target = Math.max(0, Math.min(state.items.length - 1, index + delta));
        if (target === index) return state;
        const [item] = state.items.splice(index, 1);
        state.items.splice(target, 0, item);
        return state;
      }
      function setQueuePaused2(data, paused, opts = {}) {
        const state = normalizeQueueData2(data, opts);
        state.paused = paused === true;
        if (opts.lastError !== void 0) {
          state.lastError = limitedText(opts.lastError, MAX_ERROR_LENGTH);
        }
        return state;
      }
      function getNextQueuedItem2(data) {
        return normalizeQueueData2(data).items.find((item) => item.status === "queued") || null;
      }
      function markQueueItemSending2(data, id, opts = {}) {
        const state = normalizeQueueData2(data, opts);
        const item = state.items.find((entry) => entry.id === cleanText(id));
        if (!item) return state;
        item.status = "sending";
        item.error = "";
        item.updatedAt = nowIso(opts);
        state.paused = false;
        state.activeId = item.id;
        state.lastError = "";
        return state;
      }
      function markQueueItemSent2(data, id, opts = {}) {
        const state = normalizeQueueData2(data, opts);
        const item = state.items.find((entry) => entry.id === cleanText(id));
        if (!item) return state;
        const now = nowIso(opts);
        item.status = "sent";
        item.sentAt = now;
        item.updatedAt = now;
        item.error = "";
        if (state.activeId === item.id) state.activeId = "";
        return state;
      }
      function markQueueItemFailed2(data, id, error, opts = {}) {
        const state = normalizeQueueData2(data, opts);
        const item = state.items.find((entry) => entry.id === cleanText(id));
        if (!item) return state;
        const message = limitedText(error, MAX_ERROR_LENGTH) || "Queue send failed";
        item.status = opts.requeue === false ? "failed" : "queued";
        item.error = message;
        item.updatedAt = nowIso(opts);
        state.paused = true;
        state.lastError = message;
        if (state.activeId === item.id) state.activeId = "";
        return state;
      }
      function cancelQueueItem2(data, id, opts = {}) {
        const state = normalizeQueueData2(data, opts);
        const item = state.items.find((entry) => entry.id === cleanText(id));
        if (!item) return state;
        item.status = "cancelled";
        item.updatedAt = nowIso(opts);
        if (state.activeId === item.id) state.activeId = "";
        return state;
      }
      function clearQueueHistory2(data, opts = {}) {
        const state = normalizeQueueData2(data, opts);
        state.items = state.items.filter((item) => !["sent", "cancelled"].includes(item.status));
        return state;
      }
      function getQueueStats2(data) {
        const state = normalizeQueueData2(data);
        const stats = {
          total: state.items.length,
          queued: 0,
          sending: 0,
          sent: 0,
          failed: 0,
          cancelled: 0,
          pending: 0,
          paused: state.paused
        };
        for (const item of state.items) {
          if (Object.prototype.hasOwnProperty.call(stats, item.status)) {
            stats[item.status] += 1;
          }
        }
        stats.pending = stats.queued + stats.sending;
        return stats;
      }
      function evaluateQueueSafety2(context = {}) {
        if (context.toolModeActive) {
          const label = cleanText(context.toolModeLabel) || "unknown tool mode";
          return { ok: false, reason: `Tool mode active: ${label}` };
        }
        if (context.editorReady === false) {
          return { ok: false, reason: "Input editor unavailable" };
        }
        if (context.sendReady === false) {
          return { ok: false, reason: "Send button unavailable" };
        }
        return { ok: true, reason: "" };
      }
      module.exports = {
        addQueueItem: addQueueItem2,
        addQueueItems: addQueueItems2,
        cancelQueueItem: cancelQueueItem2,
        clearQueueHistory: clearQueueHistory2,
        createQueueItem,
        evaluateQueueSafety: evaluateQueueSafety2,
        getNextQueuedItem: getNextQueuedItem2,
        getQueueStats: getQueueStats2,
        markQueueItemFailed: markQueueItemFailed2,
        markQueueItemSending: markQueueItemSending2,
        markQueueItemSent: markQueueItemSent2,
        moveQueueItem: moveQueueItem2,
        normalizeQueueData: normalizeQueueData2,
        normalizeQueueItem,
        removeQueueItem: removeQueueItem2,
        setQueuePaused: setQueuePaused2,
        updateQueueItem
      };
    }
  });

  // src/modules/message_queue.js
  var import_message_queue_tools, PROCESS_DELAY_MS, SEND_READY_DELAY_MS, MessageQueueModule;
  var init_message_queue = __esm({
    "src/modules/message_queue.js"() {
      init_core();
      init_logger();
      init_native_ui();
      init_panel_ui();
      init_gemini();
      init_icons();
      import_message_queue_tools = __toESM(require_message_queue_tools());
      PROCESS_DELAY_MS = 1600;
      SEND_READY_DELAY_MS = 120;
      MessageQueueModule = {
        id: "message-queue",
        name: NativeUI.t("消息队列", "Message Queue"),
        description: NativeUI.t("本地排队发送 Prompt，支持暂停、取消和重排", "Queue prompts locally with pause, cancel, and reorder controls"),
        iconId: "package",
        defaultEnabled: false,
        STORAGE_KEY: "gemini_message_queue",
        data: { paused: true, activeId: "", lastError: "", items: [] },
        _timer: null,
        _processing: false,
        _getStorageKey() {
          const user = Core.getCurrentUser();
          return user && user.includes("@") ? `${this.STORAGE_KEY}_${user}` : this.STORAGE_KEY;
        },
        init() {
          this.loadData();
          Logger.info("MessageQueueModule initialized", (0, import_message_queue_tools.getQueueStats)(this.data));
        },
        destroy() {
          this.pauseQueue();
          this.removeNativeUI();
        },
        onUserChange() {
          this.pauseQueue();
          this.loadData();
          PanelUI.renderDetailsPane();
        },
        loadData() {
          let saved;
          try {
            saved = GM_getValue(this._getStorageKey(), null);
          } catch {
            saved = null;
          }
          this.data = (0, import_message_queue_tools.normalizeQueueData)(saved, { recoverSending: true });
          this.data.paused = true;
          this._save();
        },
        _save() {
          try {
            GM_setValue(this._getStorageKey(), this.data);
          } catch {
          }
        },
        injectNativeUI() {
          const BTN_ID = "gc-queue-native";
          if (document.getElementById(BTN_ID)) return;
          const trailing = GeminiAdapter.getInputTrailingActions();
          if (!trailing) return;
          const btn = document.createElement("button");
          btn.id = BTN_ID;
          btn.className = "gc-input-btn";
          btn.title = NativeUI.t("加入发送队列", "Add to message queue");
          btn.appendChild(createIcon("package", 16));
          btn.onclick = (e) => {
            e.stopPropagation();
            this.queueCurrentInput();
          };
          trailing.insertBefore(btn, trailing.firstChild);
        },
        removeNativeUI() {
          NativeUI.remove("gc-queue-native");
        },
        _getEditorText() {
          const editor = GeminiAdapter.getInputEditor();
          if (!editor) return "";
          return (("value" in editor ? editor.value : editor.textContent) || "").trim();
        },
        _clearEditor(editor) {
          if ("value" in editor) editor.value = "";
          else editor.textContent = "";
          editor.dispatchEvent(new Event("input", { bubbles: true }));
        },
        _insertEditorText(editor, text) {
          this._clearEditor(editor);
          editor.focus();
          if ("value" in editor) {
            editor.value = text;
            editor.dispatchEvent(new Event("input", { bubbles: true }));
            return;
          }
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
          const inputEvent = new InputEvent("beforeinput", {
            inputType: "insertText",
            data: text,
            bubbles: true,
            cancelable: true,
            composed: true
          });
          const accepted = editor.dispatchEvent(inputEvent);
          if (!accepted || editor.textContent.trim() === "") {
            const p = document.createElement("p");
            p.textContent = text;
            editor.appendChild(p);
            editor.dispatchEvent(new Event("input", { bubbles: true }));
          }
        },
        _delay(ms) {
          return new Promise((resolve) => setTimeout(resolve, ms));
        },
        async _sendText(text) {
          const editor = GeminiAdapter.getInputEditor();
          if (!editor) return { ok: false, reason: "Input editor unavailable" };
          this._insertEditorText(editor, text);
          await this._delay(SEND_READY_DELAY_MS);
          const sendBtn = GeminiAdapter.getSendButton();
          if (!GeminiAdapter.isSendButtonElement(sendBtn)) {
            return { ok: false, reason: "Send button unavailable" };
          }
          sendBtn.click();
          return { ok: true, reason: "" };
        },
        _scheduleProcess(delay = PROCESS_DELAY_MS) {
          if (this._timer) clearTimeout(this._timer);
          if (this.data.paused) return;
          this._timer = setTimeout(() => {
            this._timer = null;
            this._processNext();
          }, delay);
        },
        async _processNext() {
          if (this._processing || this.data.paused) return;
          const item = (0, import_message_queue_tools.getNextQueuedItem)(this.data);
          if (!item) {
            PanelUI.renderDetailsPane();
            return;
          }
          const toolMode = GeminiAdapter.getActiveToolMode();
          const safety = (0, import_message_queue_tools.evaluateQueueSafety)({
            toolModeActive: toolMode.active,
            toolModeLabel: toolMode.label,
            editorReady: !!GeminiAdapter.getInputEditor()
          });
          if (!safety.ok) {
            this.data = (0, import_message_queue_tools.setQueuePaused)(this.data, true, { lastError: safety.reason });
            this._save();
            NativeUI.showToast(safety.reason);
            PanelUI.renderDetailsPane();
            return;
          }
          this._processing = true;
          this.data = (0, import_message_queue_tools.markQueueItemSending)(this.data, item.id);
          this._save();
          PanelUI.renderDetailsPane();
          const result = await this._sendText(item.text);
          this._processing = false;
          if (!result.ok) {
            this.data = (0, import_message_queue_tools.markQueueItemFailed)(this.data, item.id, result.reason);
            this._save();
            NativeUI.showToast(result.reason);
            PanelUI.renderDetailsPane();
            return;
          }
          this.data = (0, import_message_queue_tools.markQueueItemSent)(this.data, item.id);
          this._save();
          PanelUI.renderDetailsPane();
          this._scheduleProcess();
        },
        queueCurrentInput() {
          const editor = GeminiAdapter.getInputEditor();
          const text = this._getEditorText();
          if (!text) {
            NativeUI.showToast(NativeUI.t("输入框为空", "Input is empty"));
            return;
          }
          this.data = (0, import_message_queue_tools.addQueueItem)(this.data, text);
          this._save();
          if (editor) this._clearEditor(editor);
          NativeUI.showToast(NativeUI.t("已加入队列", "Added to queue"));
          PanelUI.renderDetailsPane();
        },
        enqueueEntries(entries, opts = {}) {
          const result = (0, import_message_queue_tools.addQueueItems)(this.data, entries, {
            idPrefix: opts.idPrefix || `q_${Date.now()}`
          });
          if (result.added === 0) return 0;
          this.data = result.data;
          this._save();
          PanelUI.renderDetailsPane();
          return result.added;
        },
        startQueue() {
          const stats = (0, import_message_queue_tools.getQueueStats)(this.data);
          if (stats.queued === 0) return;
          this.data = (0, import_message_queue_tools.setQueuePaused)(this.data, false);
          this._save();
          PanelUI.renderDetailsPane();
          this._scheduleProcess(50);
        },
        pauseQueue() {
          if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
          }
          this.data = (0, import_message_queue_tools.setQueuePaused)(this.data, true);
          this._save();
          PanelUI.renderDetailsPane();
        },
        cancelItem(id) {
          this.data = (0, import_message_queue_tools.cancelQueueItem)(this.data, id);
          this._save();
          PanelUI.renderDetailsPane();
        },
        removeItem(id) {
          this.data = (0, import_message_queue_tools.removeQueueItem)(this.data, id);
          this._save();
          PanelUI.renderDetailsPane();
        },
        moveItem(id, direction) {
          this.data = (0, import_message_queue_tools.moveQueueItem)(this.data, id, direction);
          this._save();
          PanelUI.renderDetailsPane();
        },
        clearHistory() {
          this.data = (0, import_message_queue_tools.clearQueueHistory)(this.data);
          this._save();
          PanelUI.renderDetailsPane();
        },
        _makeButton(iconName, title, onClick, text = "") {
          const btn = document.createElement("button");
          btn.className = "g-btn";
          btn.title = title;
          btn.style.cssText = "display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:26px;height:24px;padding:0 6px;font-size:10px;";
          btn.appendChild(createIcon(iconName, 12));
          if (text) btn.appendChild(document.createTextNode(" " + text));
          btn.onclick = (e) => {
            e.stopPropagation();
            onClick();
          };
          return btn;
        },
        _renderControls(container, stats) {
          const row = document.createElement("div");
          row.style.cssText = "display:flex;gap:6px;margin:6px 0 8px;flex-wrap:wrap;";
          row.appendChild(this._makeButton("plus", NativeUI.t("加入当前输入", "Add current input"), () => this.queueCurrentInput(), NativeUI.t("加入", "Add")));
          if (this.data.paused) {
            row.appendChild(this._makeButton("play", NativeUI.t("开始发送队列", "Start queue"), () => this.startQueue(), NativeUI.t("开始", "Start")));
          } else {
            row.appendChild(this._makeButton("pause", NativeUI.t("暂停队列", "Pause queue"), () => this.pauseQueue(), NativeUI.t("暂停", "Pause")));
          }
          if (stats.sent || stats.cancelled) {
            row.appendChild(this._makeButton("trash", NativeUI.t("清理已完成", "Clear finished"), () => this.clearHistory(), NativeUI.t("清理", "Clear")));
          }
          container.appendChild(row);
        },
        _renderQueueItem(container, item, index) {
          const row = document.createElement("div");
          row.className = "detail-row";
          row.style.alignItems = "center";
          row.title = item.text;
          const label = document.createElement("span");
          label.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
          label.textContent = `${index + 1}. ${item.title} [${item.status}]`;
          const actions = document.createElement("div");
          actions.style.cssText = "display:flex;gap:4px;";
          if (item.status === "queued") {
            actions.appendChild(this._makeButton("arrow-up", NativeUI.t("上移", "Move up"), () => this.moveItem(item.id, "up")));
            actions.appendChild(this._makeButton("arrow-down", NativeUI.t("下移", "Move down"), () => this.moveItem(item.id, "down")));
            actions.appendChild(this._makeButton("x", NativeUI.t("取消", "Cancel"), () => this.cancelItem(item.id)));
          } else {
            actions.appendChild(this._makeButton("trash", NativeUI.t("删除", "Delete"), () => this.removeItem(item.id)));
          }
          row.appendChild(label);
          row.appendChild(actions);
          container.appendChild(row);
          if (item.error) {
            const err = document.createElement("div");
            err.className = "detail-row";
            err.style.cssText = "font-size:10px;color:#f28b82;";
            err.textContent = item.error;
            container.appendChild(err);
          }
        },
        renderToDetailsPane(container) {
          const stats = (0, import_message_queue_tools.getQueueStats)(this.data);
          const title = document.createElement("div");
          title.className = "section-title";
          title.style.cssText = "display:flex;justify-content:space-between;align-items:center;";
          const label = document.createElement("span");
          label.textContent = "Message Queue";
          const count = document.createElement("span");
          count.style.opacity = "0.7";
          count.textContent = `${stats.queued}/${stats.total}`;
          title.appendChild(label);
          title.appendChild(count);
          container.appendChild(title);
          this._renderControls(container, stats);
          if (this.data.lastError) {
            const err = document.createElement("div");
            err.className = "detail-row";
            err.style.cssText = "font-size:10px;color:#f28b82;";
            err.textContent = this.data.lastError;
            container.appendChild(err);
          }
          if (this.data.items.length === 0) {
            const hint = document.createElement("div");
            hint.className = "detail-row";
            hint.textContent = NativeUI.t("输入 Prompt 后点击加入队列。", "Type a prompt, then add it to the queue.");
            container.appendChild(hint);
            return;
          }
          this.data.items.slice(0, 12).forEach((item, index) => this._renderQueueItem(container, item, index));
        },
        getOnboarding() {
          return {
            zh: {
              rant: "连续发多条 Prompt 时，Gemini 没有本地队列；你只能手动复制、等待、再发送。",
              features: "把输入框内容加入本地发送队列，支持开始、暂停、取消、重排。遇到可识别的工具模式会暂停，避免盲目自动发送。",
              guide: "在输入框写好 Prompt 后点击队列按钮或面板里的加入，再从 Message Queue 标签开始发送。"
            },
            en: {
              rant: "Gemini has no local send queue, so multi-prompt runs become copy, wait, paste, repeat.",
              features: "Queues prompts locally with start, pause, cancel, and reorder controls. Recognized tool modes pause automation instead of blindly sending.",
              guide: "Write a prompt, add it through the queue button or panel, then start sending from the Message Queue tab."
            }
          };
        }
      };
    }
  });

  // lib/prompt_vault_tools.js
  var require_prompt_vault_tools = __commonJS({
    "lib/prompt_vault_tools.js"(exports, module) {
      var { formatLocalDate: formatLocalDate6 } = require_date_utils();
      var DEFAULT_CATEGORY = "General";
      var MAX_NAME_LENGTH = 80;
      var MAX_CATEGORY_LENGTH = 40;
      var MAX_SHORTCUT_LENGTH = 32;
      var MAX_CHAIN_STEPS = 12;
      var PROMPT_EXPORT_SCHEMA = "primer-pp.prompt-vault";
      var PROMPT_EXPORT_VERSION = 1;
      function toText(value) {
        if (value === null || value === void 0) return "";
        return String(value);
      }
      function cleanText(value, fallback = "") {
        const text = toText(value).trim();
        return text || fallback;
      }
      function normalizeShortcut(value, name = "") {
        const source = cleanText(value) || cleanText(name);
        return source.replace(/^\/+/, "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, MAX_SHORTCUT_LENGTH);
      }
      function normalizeUsedCount(value) {
        const count = Number(value);
        if (!Number.isFinite(count) || count <= 0) return 0;
        return Math.floor(count);
      }
      function normalizeChainSteps(value) {
        const rawSteps = Array.isArray(value) ? value : toText(value).split(/\n\s*---+\s*\n/g);
        return rawSteps.map((step) => step && typeof step === "object" ? step.content : step).map((step) => toText(step).trim()).filter(Boolean).slice(0, MAX_CHAIN_STEPS);
      }
      function normalizePrompt2(raw, index = 0, opts = {}) {
        const source = raw && typeof raw === "object" ? raw : {};
        const nowIso = opts.nowIso || (/* @__PURE__ */ new Date()).toISOString();
        const name = cleanText(source.name, `Prompt ${index + 1}`).slice(0, MAX_NAME_LENGTH);
        const content = toText(source.content).trim();
        const category = cleanText(source.category, DEFAULT_CATEGORY).slice(0, MAX_CATEGORY_LENGTH);
        const createdAt = cleanText(source.createdAt, nowIso);
        return {
          id: cleanText(source.id, `p_${index}`),
          name,
          content,
          category,
          shortcut: normalizeShortcut(source.shortcut, name),
          favorite: source.favorite === true,
          chainSteps: normalizeChainSteps(source.chainSteps || source.chain),
          createdAt,
          updatedAt: cleanText(source.updatedAt, createdAt),
          usedCount: normalizeUsedCount(source.usedCount),
          lastUsedAt: cleanText(source.lastUsedAt, "")
        };
      }
      function normalizePromptList2(raw, opts = {}) {
        if (!Array.isArray(raw)) return [];
        return raw.map((prompt, index) => normalizePrompt2(prompt, index, opts)).filter((prompt) => prompt.content);
      }
      function comparePromptDisplay(a, b) {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        const aLast = a.lastUsedAt || "";
        const bLast = b.lastUsedAt || "";
        if (aLast !== bLast) return bLast.localeCompare(aLast);
        if (a.usedCount !== b.usedCount) return b.usedCount - a.usedCount;
        return a.name.localeCompare(b.name);
      }
      function sortPromptsForDisplay2(prompts) {
        return normalizePromptList2(prompts).sort(comparePromptDisplay);
      }
      function getQuickMenuSections2(prompts, opts = {}) {
        const limit = Number.isFinite(Number(opts.limit)) ? Math.max(0, Math.floor(Number(opts.limit))) : 8;
        const sorted = sortPromptsForDisplay2(prompts);
        const seen = /* @__PURE__ */ new Set();
        const sections = [];
        function addSection(label, candidates) {
          if (seen.size >= limit) return;
          const picked = [];
          for (const prompt of candidates) {
            if (seen.size >= limit) break;
            if (seen.has(prompt.id)) continue;
            picked.push(prompt);
            seen.add(prompt.id);
          }
          if (picked.length > 0) sections.push({ label, prompts: picked });
        }
        addSection("Favorites", sorted.filter((prompt) => prompt.favorite));
        addSection("Recent", sorted.filter((prompt) => !prompt.favorite && prompt.lastUsedAt));
        addSection("Top Prompts", sorted);
        return sections;
      }
      function buildPromptVariables2(context = {}) {
        const date = context.now instanceof Date ? context.now : /* @__PURE__ */ new Date();
        const day = formatLocalDate6(date);
        const time = date.toTimeString().slice(0, 5);
        return {
          date: day,
          time,
          datetime: `${day} ${time}`,
          chat_title: cleanText(context.chatTitle, ""),
          selected_text: cleanText(context.selectedText, ""),
          model: cleanText(context.model, "")
        };
      }
      function renderPromptTemplate2(template, variables = {}) {
        return toText(template).replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (match, key) => {
          const normalizedKey = key.toLowerCase().replace(/-/g, "_");
          if (!Object.prototype.hasOwnProperty.call(variables, normalizedKey)) return match;
          const value = variables[normalizedKey];
          return value === null || value === void 0 ? "" : String(value);
        });
      }
      function composePromptContent2(prompt, variables = {}) {
        const normalized = normalizePrompt2(prompt);
        const parts = [normalized.content, ...normalized.chainSteps].map((part) => renderPromptTemplate2(part, variables)).filter(Boolean);
        if (parts.length <= 1) return parts[0] || "";
        return parts.map((part, index) => `Step ${index + 1}
${part}`).join("\n\n---\n\n");
      }
      function createPromptQueueEntries2(prompt, variables = {}) {
        const normalized = normalizePrompt2(prompt);
        const parts = [normalized.content, ...normalized.chainSteps].map((part) => renderPromptTemplate2(part, variables).trim()).filter(Boolean);
        if (parts.length === 0) return [];
        if (parts.length === 1) {
          return [{
            title: normalized.name,
            text: parts[0],
            promptId: normalized.id,
            stepIndex: 1,
            totalSteps: 1
          }];
        }
        return parts.map((part, index) => {
          return {
            title: `${normalized.name} ${index + 1}/${parts.length}`,
            text: part,
            promptId: normalized.id,
            stepIndex: index + 1,
            totalSteps: parts.length
          };
        });
      }
      function findPromptByShortcut2(prompts, command) {
        const shortcut = normalizeShortcut(command);
        if (!shortcut) return null;
        return sortPromptsForDisplay2(prompts).find((prompt) => prompt.shortcut === shortcut) || null;
      }
      function markPromptUsed2(prompts, id, opts = {}) {
        const nowIso = opts.nowIso || (/* @__PURE__ */ new Date()).toISOString();
        return normalizePromptList2(prompts, opts).map((prompt) => {
          if (prompt.id !== id) return prompt;
          return {
            ...prompt,
            usedCount: prompt.usedCount + 1,
            lastUsedAt: nowIso,
            updatedAt: nowIso
          };
        });
      }
      function removePromptForUndo2(prompts, id, opts = {}) {
        const normalized = normalizePromptList2(prompts, opts);
        const idx = normalized.findIndex((prompt) => prompt.id === cleanText(id));
        if (idx === -1) {
          return { prompts: normalized, removed: null };
        }
        const removed = {
          ...normalized[idx],
          deletedAt: getNowIso(opts),
          restoreIndex: idx
        };
        return {
          prompts: normalized.filter((prompt) => prompt.id !== removed.id),
          removed
        };
      }
      function restoreRemovedPrompt2(prompts, removed, opts = {}) {
        const normalized = normalizePromptList2(prompts, opts);
        const source = removed && typeof removed === "object" ? removed : {};
        const prompt = normalizePrompt2(source, normalized.length, opts);
        if (!prompt.content || normalized.some((existing) => existing.id === prompt.id)) {
          return { prompts: normalized, restored: false };
        }
        const rawIndex = Number(source.restoreIndex);
        const restoreIndex = Number.isInteger(rawIndex) ? Math.max(0, Math.min(rawIndex, normalized.length)) : normalized.length;
        const next = [...normalized];
        next.splice(restoreIndex, 0, prompt);
        return { prompts: next, restored: true };
      }
      function getNowIso(opts = {}) {
        return opts.nowIso || (/* @__PURE__ */ new Date()).toISOString();
      }
      function createPromptExport(prompts, opts = {}) {
        return {
          schema: PROMPT_EXPORT_SCHEMA,
          version: PROMPT_EXPORT_VERSION,
          exportedAt: getNowIso(opts),
          app: "Primer++ for Gemini",
          prompts: normalizePromptList2(prompts, opts)
        };
      }
      function serializePromptExport2(prompts, opts = {}) {
        return JSON.stringify(createPromptExport(prompts, opts), null, 2);
      }
      function getImportPromptArray(raw) {
        if (Array.isArray(raw)) return raw;
        if (raw && typeof raw === "object" && Array.isArray(raw.prompts)) return raw.prompts;
        return [];
      }
      function parsePromptImport(raw, opts = {}) {
        return normalizePromptList2(getImportPromptArray(raw), opts);
      }
      function defaultImportedPromptId(prompt, index) {
        return `p_${Date.now()}_${index}`;
      }
      function mergePromptImport2(existing, rawImport, opts = {}) {
        const prompts = normalizePromptList2(existing, opts);
        const imported = parsePromptImport(rawImport, opts);
        const idFactory = typeof opts.idFactory === "function" ? opts.idFactory : defaultImportedPromptId;
        imported.forEach((prompt, index) => {
          prompts.push(normalizePrompt2({
            ...prompt,
            id: idFactory(prompt, index)
          }, prompts.length, opts));
        });
        return {
          prompts,
          imported: imported.length
        };
      }
      module.exports = {
        buildPromptVariables: buildPromptVariables2,
        composePromptContent: composePromptContent2,
        createPromptQueueEntries: createPromptQueueEntries2,
        createPromptExport,
        findPromptByShortcut: findPromptByShortcut2,
        getQuickMenuSections: getQuickMenuSections2,
        markPromptUsed: markPromptUsed2,
        mergePromptImport: mergePromptImport2,
        normalizePrompt: normalizePrompt2,
        normalizeChainSteps,
        normalizePromptList: normalizePromptList2,
        normalizeShortcut,
        parsePromptImport,
        renderPromptTemplate: renderPromptTemplate2,
        removePromptForUndo: removePromptForUndo2,
        restoreRemovedPrompt: restoreRemovedPrompt2,
        serializePromptExport: serializePromptExport2,
        sortPromptsForDisplay: sortPromptsForDisplay2
      };
    }
  });

  // src/modules/prompt_vault.js
  var import_date_utils4, import_prompt_vault_tools, PromptVaultModule;
  var init_prompt_vault = __esm({
    "src/modules/prompt_vault.js"() {
      init_logger();
      init_core();
      init_module_registry();
      init_native_ui();
      init_panel_ui();
      init_state();
      init_icons();
      init_counter();
      init_message_queue();
      init_gemini();
      import_date_utils4 = __toESM(require_date_utils());
      import_prompt_vault_tools = __toESM(require_prompt_vault_tools());
      PromptVaultModule = {
        id: "prompt-vault",
        name: NativeUI.t("提示词金库", "Prompt Vault"),
        description: NativeUI.t("保存和快速插入常用 Prompt 模板", "Save & quickly insert prompt templates"),
        iconId: "gem",
        defaultEnabled: false,
        STORAGE_KEY: "gemini_prompt_vault",
        _prompts: [],
        _lastDeletedPrompt: null,
        _getStorageKey() {
          const user = Core.getCurrentUser();
          return user && user.includes("@") ? `${this.STORAGE_KEY}_${user}` : this.STORAGE_KEY;
        },
        init() {
          let prompts;
          try {
            prompts = GM_getValue(this._getStorageKey(), []);
          } catch (e) {
            prompts = [];
          }
          this._prompts = (0, import_prompt_vault_tools.normalizePromptList)(prompts);
          this._lastDeletedPrompt = null;
          this._save();
          Logger.info("PromptVaultModule initialized", { count: this._prompts.length });
        },
        destroy() {
          const fab = document.getElementById("gv-fab");
          if (fab) fab.remove();
          if (this._slashAbort) {
            this._slashAbort.abort();
            this._slashAbort = null;
          }
          this._slashEditor = null;
          this._lastDeletedPrompt = null;
          this.removeNativeUI();
        },
        onUserChange() {
          let prompts;
          try {
            prompts = GM_getValue(this._getStorageKey(), []);
          } catch (e) {
            prompts = [];
          }
          this._prompts = (0, import_prompt_vault_tools.normalizePromptList)(prompts);
          this._lastDeletedPrompt = null;
          this._save();
          PanelUI.renderDetailsPane();
        },
        // --- Native UI: Quick menu button near input area ---
        injectNativeUI() {
          const NATIVE_ID = "gc-vault-native";
          if (document.getElementById(NATIVE_ID)) {
            this._bindSlashExpansion();
            return;
          }
          const trailing = GeminiAdapter.getInputTrailingActions();
          if (!trailing) return;
          const btn = document.createElement("button");
          btn.id = NATIVE_ID;
          btn.className = "gc-input-btn";
          btn.appendChild(createIcon("gem", 16));
          btn.title = "Prompt Vault";
          btn.onclick = (e) => {
            e.stopPropagation();
            this._toggleQuickMenu(btn);
          };
          trailing.insertBefore(btn, trailing.firstChild);
          this._bindSlashExpansion();
        },
        removeNativeUI() {
          NativeUI.remove("gc-vault-native");
          NativeUI.remove("gc-vault-menu");
          if (this._menuAbort) {
            this._menuAbort.abort();
            this._menuAbort = null;
          }
        },
        _toggleQuickMenu(anchorBtn) {
          const MENU_ID = "gc-vault-menu";
          const existing = document.getElementById(MENU_ID);
          if (existing) {
            existing.remove();
            return;
          }
          const menu = document.createElement("div");
          menu.id = MENU_ID;
          menu.className = "gc-dropdown-menu";
          menu.style.cssText = "position:fixed;bottom:60px;max-height:300px;overflow-y:auto;min-width:200px;";
          const rect = anchorBtn.getBoundingClientRect();
          menu.style.left = rect.left + "px";
          menu.style.bottom = window.innerHeight - rect.top + 4 + "px";
          const sections = (0, import_prompt_vault_tools.getQuickMenuSections)(this._prompts, { limit: 8 });
          if (sections.length === 0) {
            const empty = document.createElement("div");
            empty.className = "gc-dropdown-item";
            empty.style.cssText = "color:#9aa0a6;font-size:12px;";
            empty.textContent = NativeUI.t("还没有保存的提示词", "No saved prompts yet");
            menu.appendChild(empty);
          } else {
            sections.forEach((section) => {
              const catLabel = document.createElement("div");
              catLabel.style.cssText = "padding:4px 16px;font-size:9px;color:#9aa0a6;text-transform:uppercase;letter-spacing:0.5px;";
              catLabel.textContent = section.label;
              menu.appendChild(catLabel);
              section.prompts.forEach((p) => {
                const item = document.createElement("div");
                item.className = "gc-dropdown-item";
                item.style.fontSize = "12px";
                const chainLabel = p.chainSteps?.length ? `  chain:${p.chainSteps.length + 1}` : "";
                item.textContent = `${p.name}${p.shortcut ? "  /" + p.shortcut : ""}${chainLabel}`;
                item.title = p.content.substring(0, 80);
                item.onclick = (e) => {
                  e.stopPropagation();
                  menu.remove();
                  this.insertPrompt(p.content, p.id);
                };
                menu.appendChild(item);
              });
            });
          }
          const divider = document.createElement("div");
          divider.style.cssText = "border-top:1px solid rgba(255,255,255,0.08);margin:4px 0;";
          menu.appendChild(divider);
          const manageLink = document.createElement("div");
          manageLink.className = "gc-dropdown-item";
          manageLink.style.cssText = "font-size:11px;color:#8ab4f8;";
          manageLink.textContent = NativeUI.t("管理提示词...", "Manage prompts...");
          manageLink.onclick = (e) => {
            e.stopPropagation();
            menu.remove();
            const cm = CounterModule;
            if (!cm.state.isExpanded) {
              PanelUI.toggleDetails();
            }
          };
          menu.appendChild(manageLink);
          document.body.appendChild(menu);
          if (this._menuAbort) this._menuAbort.abort();
          this._menuAbort = new AbortController();
          const signal = this._menuAbort.signal;
          setTimeout(() => {
            document.addEventListener("click", (e) => {
              if (!menu.contains(e.target) && e.target !== anchorBtn) {
                menu.remove();
                if (this._menuAbort) {
                  this._menuAbort.abort();
                  this._menuAbort = null;
                }
              }
            }, { capture: true, signal });
          }, 0);
        },
        _save() {
          try {
            GM_setValue(this._getStorageKey(), this._prompts);
          } catch (e) {
          }
        },
        addPrompt(name, content, category, shortcut, chainSteps = []) {
          const nowIso = (/* @__PURE__ */ new Date()).toISOString();
          this._prompts.push((0, import_prompt_vault_tools.normalizePrompt)({
            id: "p_" + Date.now(),
            name: name || "Untitled",
            content: content || "",
            category: category || "General",
            shortcut,
            chainSteps,
            createdAt: nowIso,
            updatedAt: nowIso
          }, this._prompts.length, { nowIso }));
          this._save();
        },
        deletePrompt(id) {
          const result = (0, import_prompt_vault_tools.removePromptForUndo)(this._prompts, id, { nowIso: (/* @__PURE__ */ new Date()).toISOString() });
          if (!result.removed) return;
          this._prompts = result.prompts;
          this._lastDeletedPrompt = result.removed;
          this._save();
          NativeUI.showToast(NativeUI.t("提示词已删除，可撤销", "Prompt deleted. Undo is available"));
        },
        undoDeletePrompt() {
          if (!this._lastDeletedPrompt) return;
          const result = (0, import_prompt_vault_tools.restoreRemovedPrompt)(this._prompts, this._lastDeletedPrompt, {
            nowIso: (/* @__PURE__ */ new Date()).toISOString()
          });
          if (!result.restored) {
            this._lastDeletedPrompt = null;
            return;
          }
          this._prompts = result.prompts;
          this._lastDeletedPrompt = null;
          this._save();
          PanelUI.renderDetailsPane();
          NativeUI.showToast(NativeUI.t("已恢复提示词", "Prompt restored"));
        },
        updatePrompt(id, updates) {
          const idx = this._prompts.findIndex((p) => p.id === id);
          if (idx !== -1) {
            const nowIso = (/* @__PURE__ */ new Date()).toISOString();
            this._prompts[idx] = (0, import_prompt_vault_tools.normalizePrompt)({
              ...this._prompts[idx],
              ...updates,
              id,
              updatedAt: nowIso
            }, idx, { nowIso });
          }
          this._save();
        },
        togglePromptFavorite(id) {
          const p = this._prompts.find((p2) => p2.id === id);
          if (!p) return;
          p.favorite = !p.favorite;
          p.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          this._save();
        },
        _getTemplateVariables() {
          let selectedText = "";
          let chatTitle = "";
          let model = "";
          try {
            selectedText = window.getSelection()?.toString().trim() || "";
          } catch {
          }
          try {
            chatTitle = GeminiAdapter.getChatTitleText() || document.title || "";
          } catch {
            chatTitle = document.title || "";
          }
          try {
            model = GeminiAdapter.detectModelKey() || "";
          } catch {
          }
          return (0, import_prompt_vault_tools.buildPromptVariables)({ selectedText, chatTitle, model, now: /* @__PURE__ */ new Date() });
        },
        _clearEditor(editor) {
          if ("value" in editor) editor.value = "";
          else editor.textContent = "";
          editor.dispatchEvent(new Event("input", { bubbles: true }));
        },
        _bindSlashExpansion() {
          const editor = GeminiAdapter.getInputEditor();
          if (!editor || editor === this._slashEditor) return;
          if (this._slashAbort) this._slashAbort.abort();
          this._slashEditor = editor;
          this._slashAbort = new AbortController();
          editor.addEventListener("keydown", (e) => {
            if (e.key !== "Tab" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
            const currentText = (editor.value || editor.textContent || "").trim();
            const prompt = (0, import_prompt_vault_tools.findPromptByShortcut)(this._prompts, currentText);
            if (!prompt) return;
            e.preventDefault();
            this._clearEditor(editor);
            this.insertPrompt(prompt.content, prompt.id);
            NativeUI.showToast(NativeUI.t(`已展开 /${prompt.shortcut}`, `Expanded /${prompt.shortcut}`));
          }, { signal: this._slashAbort.signal });
        },
        insertPrompt(content, promptId = null) {
          const editor = GeminiAdapter.getInputEditor();
          if (!editor) return;
          const prompt = this._prompts.find((pr) => pr.id === promptId) || this._prompts.find((pr) => pr.content === content);
          const variables = this._getTemplateVariables();
          const resolvedContent = prompt ? (0, import_prompt_vault_tools.composePromptContent)(prompt, variables) : (0, import_prompt_vault_tools.renderPromptTemplate)(content, variables);
          editor.focus();
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
          const inputEvent = new InputEvent("beforeinput", {
            inputType: "insertText",
            data: resolvedContent,
            bubbles: true,
            cancelable: true,
            composed: true
          });
          const accepted = editor.dispatchEvent(inputEvent);
          if (!accepted || editor.textContent.trim() === "") {
            const p = document.createElement("p");
            p.textContent = resolvedContent;
            editor.appendChild(p);
            editor.dispatchEvent(new Event("input", { bubbles: true }));
          }
          if (prompt) {
            this._prompts = (0, import_prompt_vault_tools.markPromptUsed)(this._prompts, prompt.id);
            this._save();
          }
          Logger.info("Prompt inserted");
        },
        queuePrompt(prompt) {
          if (!ModuleRegistry.isEnabled("message-queue")) {
            NativeUI.showToast(NativeUI.t("请先启用 Message Queue", "Enable Message Queue first"));
            return;
          }
          const entries = (0, import_prompt_vault_tools.createPromptQueueEntries)(prompt, this._getTemplateVariables());
          const added = MessageQueueModule.enqueueEntries(entries, {
            idPrefix: `pv_${prompt.id}_${Date.now()}`
          });
          if (added === 0) return;
          this._prompts = (0, import_prompt_vault_tools.markPromptUsed)(this._prompts, prompt.id);
          this._save();
          PanelUI.renderDetailsPane();
          NativeUI.showToast(NativeUI.t(`已加入 ${added} 条队列`, `Queued ${added} item(s)`));
        },
        getOnboarding() {
          return {
            zh: {
              rant: "每次打开 Gemini 都要重新敲一遍“你是一个资深架构师...”，Google 觉得你的手指不需要休息。ChatGPT 2023 年就有 Custom Instructions 了，Gemini 表示：我们不一样，我们让用户每次都从零开始，这叫“新鲜感”。",
              features: "输入框旁添加 💎 按钮，点击弹出提示词快捷菜单，一键插入常用提示词。支持分类管理、收藏、slash 快捷命令、模板变量、多步 prompt chain、分步入队和使用统计。",
              guide: "1. 点击输入框旁的 💎 → 2. 选择提示词插入 → 3. 可为提示词设置 /review 快捷命令，或用 --- 分隔多个 chain step 后插入或逐步加入 Message Queue"
            },
            en: {
              rant: "Every time you open Gemini you retype 'You are a senior architect...' because Google thinks your fingers need exercise. ChatGPT had Custom Instructions in 2023. Gemini says: we're different, we let users start from scratch every time. It's called 'freshness'.",
              features: "Adds a 💎 button near the input box. Click to open a prompt quick menu and insert saved prompts with one click. Supports categories, favorites, slash shortcuts, template variables, multi-step prompt chains, step-by-step queueing, and usage stats.",
              guide: "1. Click 💎 near the input box → 2. Select a prompt to insert → 3. Optionally give a prompt a /review shortcut, or separate chain steps with --- to insert a multi-step packet or queue each step through Message Queue"
            }
          };
        },
        renderToDetailsPane(container) {
          const title = document.createElement("div");
          title.className = "section-title";
          title.style.cssText = "display: flex; justify-content: space-between; align-items: center;";
          const titleText = document.createElement("span");
          titleText.textContent = "Prompt Vault";
          const addBtn = document.createElement("span");
          addBtn.style.cssText = "font-size: 12px; cursor: pointer; opacity: 0.6;";
          addBtn.textContent = "+";
          addBtn.title = "Add new prompt";
          addBtn.onclick = (e) => {
            e.stopPropagation();
            this.showPromptEditor(null);
          };
          title.appendChild(titleText);
          title.appendChild(addBtn);
          container.appendChild(title);
          if (this._lastDeletedPrompt) {
            const undoRow = document.createElement("div");
            undoRow.className = "detail-row";
            undoRow.style.cssText = "display:flex;align-items:center;gap:6px;";
            const label = document.createElement("span");
            label.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
            label.textContent = NativeUI.t(
              `已删除：${this._lastDeletedPrompt.name}`,
              `Deleted: ${this._lastDeletedPrompt.name}`
            );
            const undoBtn = document.createElement("button");
            undoBtn.className = "settings-btn";
            undoBtn.style.cssText = "width:auto;margin-top:0;padding:3px 8px;font-size:10px;";
            undoBtn.textContent = NativeUI.t("撤销", "Undo");
            undoBtn.onclick = (e) => {
              e.stopPropagation();
              this.undoDeletePrompt();
            };
            undoRow.appendChild(label);
            undoRow.appendChild(undoBtn);
            container.appendChild(undoRow);
          }
          if (this._prompts.length === 0) {
            const hint = document.createElement("div");
            hint.style.cssText = "font-size: 10px; color: var(--text-sub); opacity: 0.6; padding: 4px 8px;";
            hint.textContent = "No saved prompts. Click + to add.";
            container.appendChild(hint);
            this._appendPromptIORow(container);
            return;
          }
          const categories = {};
          (0, import_prompt_vault_tools.sortPromptsForDisplay)(this._prompts).forEach((p) => {
            const cat = p.category || "General";
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(p);
          });
          Object.entries(categories).forEach(([catName, prompts]) => {
            const catLabel = document.createElement("div");
            catLabel.style.cssText = "font-size: 9px; color: var(--text-sub); opacity: 0.5; padding: 4px 8px 2px; text-transform: uppercase; letter-spacing: 0.5px;";
            catLabel.textContent = catName;
            container.appendChild(catLabel);
            prompts.forEach((p) => {
              const row = document.createElement("div");
              row.className = "detail-row";
              row.title = p.content.length > 100 ? p.content.slice(0, 100) + "..." : p.content;
              const nameEl = document.createElement("span");
              nameEl.style.cssText = "flex: 1; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
              const chainLabel = p.chainSteps?.length ? `  chain:${p.chainSteps.length + 1}` : "";
              nameEl.textContent = `${p.name}${p.shortcut ? "  /" + p.shortcut : ""}${chainLabel}`;
              const actions = document.createElement("div");
              actions.style.cssText = "display: flex; gap: 4px; opacity: 0;";
              row.onmouseenter = () => actions.style.opacity = "1";
              row.onmouseleave = () => actions.style.opacity = "0";
              const insertBtn = document.createElement("span");
              insertBtn.style.cssText = "cursor: pointer; display: flex; align-items: center; justify-content: center; width: 14px; height: 14px;";
              insertBtn.appendChild(createIcon("copy", 12));
              insertBtn.title = "Insert into chat";
              insertBtn.onclick = (e) => {
                e.stopPropagation();
                this.insertPrompt(p.content, p.id);
              };
              const queueBtn = document.createElement("span");
              queueBtn.style.cssText = "cursor: pointer; display: flex; align-items: center; justify-content: center; width: 14px; height: 14px;";
              queueBtn.appendChild(createIcon("package", 12));
              queueBtn.title = p.chainSteps?.length ? "Queue prompt chain" : "Add to queue";
              queueBtn.onclick = (e) => {
                e.stopPropagation();
                this.queuePrompt(p);
              };
              const favoriteBtn = document.createElement("span");
              favoriteBtn.style.cssText = `cursor: pointer; display: flex; align-items: center; justify-content: center; width: 14px; height: 14px; color: ${p.favorite ? "var(--accent)" : "inherit"};`;
              favoriteBtn.appendChild(createIcon("pin", 12));
              favoriteBtn.title = p.favorite ? "Unfavorite" : "Favorite";
              favoriteBtn.onclick = (e) => {
                e.stopPropagation();
                this.togglePromptFavorite(p.id);
                PanelUI.renderDetailsPane();
              };
              const editBtn = document.createElement("span");
              editBtn.style.cssText = "cursor: pointer; display: flex; align-items: center; justify-content: center; width: 14px; height: 14px;";
              editBtn.appendChild(createIcon("edit", 12));
              editBtn.onclick = (e) => {
                e.stopPropagation();
                this.showPromptEditor(p);
              };
              const delBtn = document.createElement("span");
              delBtn.style.cssText = "cursor: pointer; display: flex; align-items: center; justify-content: center; width: 14px; height: 14px;";
              delBtn.appendChild(createIcon("trash", 12));
              delBtn.onclick = (e) => {
                e.stopPropagation();
                this.deletePrompt(p.id);
                PanelUI.renderDetailsPane();
              };
              actions.appendChild(insertBtn);
              if (ModuleRegistry.isEnabled("message-queue")) actions.appendChild(queueBtn);
              actions.appendChild(favoriteBtn);
              actions.appendChild(editBtn);
              actions.appendChild(delBtn);
              row.appendChild(nameEl);
              row.appendChild(actions);
              row.onclick = (e) => {
                e.stopPropagation();
                this.insertPrompt(p.content, p.id);
              };
              container.appendChild(row);
            });
          });
          this._appendPromptIORow(container);
        },
        _appendPromptIORow(container) {
          const ioRow = document.createElement("div");
          ioRow.style.cssText = "display:flex;gap:6px;margin-top:8px;";
          const exportBtn = document.createElement("button");
          exportBtn.style.cssText = "flex:1;font-size:10px;padding:4px 8px;border-radius:6px;border:1px solid var(--divider,rgba(255,255,255,0.1));background:var(--btn-bg,rgba(255,255,255,0.05));color:var(--text-sub,#9aa0a6);cursor:pointer;";
          exportBtn.textContent = NativeUI.t("导出", "Export");
          exportBtn.onclick = (e) => {
            e.stopPropagation();
            this._exportPrompts();
          };
          const importBtn = document.createElement("button");
          importBtn.style.cssText = "flex:1;font-size:10px;padding:4px 8px;border-radius:6px;border:1px solid var(--divider,rgba(255,255,255,0.1));background:var(--btn-bg,rgba(255,255,255,0.05));color:var(--text-sub,#9aa0a6);cursor:pointer;";
          importBtn.textContent = NativeUI.t("导入", "Import");
          importBtn.onclick = (e) => {
            e.stopPropagation();
            this._importPrompts();
          };
          ioRow.appendChild(exportBtn);
          ioRow.appendChild(importBtn);
          container.appendChild(ioRow);
        },
        _exportPrompts() {
          const data = (0, import_prompt_vault_tools.serializePromptExport)(this._prompts, { nowIso: (/* @__PURE__ */ new Date()).toISOString() });
          const blob = new Blob([data], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `primer-pp-prompts-${(0, import_date_utils4.formatLocalDate)(/* @__PURE__ */ new Date())}.json`;
          a.click();
          URL.revokeObjectURL(url);
          NativeUI.showToast(NativeUI.t("提示词已导出", "Prompts exported"));
        },
        _importPrompts() {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".json";
          input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
              try {
                const imported = JSON.parse(ev.target.result);
                const result = (0, import_prompt_vault_tools.mergePromptImport)(this._prompts, imported, {
                  nowIso: (/* @__PURE__ */ new Date()).toISOString(),
                  idFactory: (_prompt, index) => {
                    return "p_" + Date.now() + "_" + index + "_" + Math.random().toString(36).slice(2, 6);
                  }
                });
                if (result.imported === 0) throw new Error("Invalid format");
                this._prompts = result.prompts;
                this._save();
                PanelUI.renderDetailsPane();
                NativeUI.showToast(NativeUI.t(`已导入 ${result.imported} 条提示词`, `Imported ${result.imported} prompts`));
              } catch (err) {
                NativeUI.showToast(NativeUI.t("导入失败: 格式无效", "Import failed: invalid format"));
              }
            };
            reader.readAsText(file);
          };
          input.click();
        },
        showPromptEditor(existing) {
          const overlay = document.createElement("div");
          overlay.className = "settings-overlay";
          const escHandler = (e) => {
            if (e.key === "Escape") closeOverlay();
          };
          document.addEventListener("keydown", escHandler);
          const closeOverlay = () => {
            document.removeEventListener("keydown", escHandler);
            overlay.remove();
          };
          overlay.onclick = (e) => {
            if (e.target === overlay) closeOverlay();
          };
          const modal = document.createElement("div");
          modal.className = "settings-modal";
          Core.applyTheme(modal, getCurrentTheme());
          const header = document.createElement("div");
          header.className = "settings-header";
          const h3 = document.createElement("h3");
          h3.textContent = existing ? "Edit Prompt" : "New Prompt";
          const closeBtn = document.createElement("span");
          closeBtn.className = "settings-close";
          closeBtn.textContent = "";
          closeBtn.appendChild(createIcon("x", 16));
          closeBtn.onclick = () => closeOverlay();
          header.appendChild(h3);
          header.appendChild(closeBtn);
          const body = document.createElement("div");
          body.className = "settings-body";
          const nameInput = document.createElement("input");
          nameInput.className = "settings-select";
          nameInput.style.cssText = "width: 100%; margin-bottom: 8px; padding: 8px; box-sizing: border-box;";
          nameInput.placeholder = "Prompt name";
          nameInput.value = existing ? existing.name : "";
          const catInput = document.createElement("input");
          catInput.className = "settings-select";
          catInput.style.cssText = "width: 100%; margin-bottom: 8px; padding: 8px; box-sizing: border-box;";
          catInput.placeholder = "Category (e.g. Coding, Writing)";
          catInput.value = existing ? existing.category : "General";
          const shortcutInput = document.createElement("input");
          shortcutInput.className = "settings-select";
          shortcutInput.style.cssText = "width: 100%; margin-bottom: 8px; padding: 8px; box-sizing: border-box;";
          shortcutInput.placeholder = "Slash shortcut (e.g. /review)";
          shortcutInput.value = existing?.shortcut ? "/" + existing.shortcut : "";
          const chainArea = document.createElement("textarea");
          chainArea.style.cssText = "width: 100%; height: 96px; padding: 8px; font-size: 12px; border-radius: 6px; border: 1px solid var(--border, rgba(255,255,255,0.1)); background: var(--input-bg, rgba(255,255,255,0.05)); color: var(--text-main, #fff); resize: vertical; box-sizing: border-box; font-family: inherit; margin-bottom: 8px;";
          chainArea.placeholder = "Optional chain steps. Separate each step with ---";
          chainArea.value = existing?.chainSteps?.length ? existing.chainSteps.join("\n---\n") : "";
          const contentArea = document.createElement("textarea");
          contentArea.style.cssText = "width: 100%; height: 120px; padding: 8px; font-size: 12px; border-radius: 6px; border: 1px solid var(--border, rgba(255,255,255,0.1)); background: var(--input-bg, rgba(255,255,255,0.05)); color: var(--text-main, #fff); resize: vertical; box-sizing: border-box; font-family: inherit;";
          contentArea.placeholder = "Enter your prompt template...";
          contentArea.value = existing ? existing.content : "";
          const saveBtn = document.createElement("button");
          saveBtn.className = "settings-btn";
          saveBtn.style.cssText = "background: var(--accent, #8ab4f8); color: #000; font-weight: 500; margin-top: 8px;";
          saveBtn.textContent = existing ? "Save" : "Create";
          saveBtn.onclick = () => {
            const name = nameInput.value.trim() || "Untitled";
            const content = contentArea.value.trim();
            const category = catInput.value.trim() || "General";
            const shortcut = shortcutInput.value.trim();
            const chainSteps = chainArea.value.split(/\n\s*---+\s*\n/g).map((step) => step.trim()).filter(Boolean);
            if (!content) return;
            if (existing) {
              this.updatePrompt(existing.id, { name, content, category, shortcut, chainSteps });
            } else {
              this.addPrompt(name, content, category, shortcut, chainSteps);
            }
            closeOverlay();
            PanelUI.renderDetailsPane();
          };
          body.appendChild(nameInput);
          body.appendChild(catInput);
          body.appendChild(shortcutInput);
          body.appendChild(contentArea);
          body.appendChild(chainArea);
          body.appendChild(saveBtn);
          modal.appendChild(header);
          modal.appendChild(body);
          overlay.appendChild(modal);
          document.body.appendChild(overlay);
          nameInput.focus();
        }
      };
    }
  });

  // src/modules/default_model.js
  var DefaultModelModule;
  var init_default_model = __esm({
    "src/modules/default_model.js"() {
      init_constants();
      init_logger();
      init_core();
      init_native_ui();
      init_gemini();
      init_icons();
      DefaultModelModule = {
        id: "default-model",
        name: NativeUI.t("默认模型", "Default Model"),
        description: NativeUI.t("新对话自动选择首选模型", "Auto-select preferred model for new chats"),
        icon: "🤖",
        iconId: "settings",
        defaultEnabled: false,
        STORAGE_KEY: "gemini_default_model",
        _preferredModel: "pro",
        _lastUrl: "",
        _pollTimer: null,
        _switching: false,
        init() {
          let model;
          try {
            model = GM_getValue(this.STORAGE_KEY, "pro");
          } catch (e) {
            model = "pro";
          }
          this._preferredModel = model;
          this._lastUrl = location.href;
          this._startUrlWatcher();
          Logger.info("DefaultModelModule initialized", { preferred: this._preferredModel });
        },
        destroy() {
          if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
          }
          this._switching = false;
          this.removeNativeUI();
        },
        onUserChange() {
        },
        // --- \u539F\u751F UI \u6CE8\u5165 ---
        injectNativeUI() {
          const LOCK_ID = "gc-model-lock";
          if (document.getElementById(LOCK_ID)) return;
          const modelBtn = NativeUI.getModelSwitch();
          if (!modelBtn) return;
          const parent = modelBtn.parentElement;
          if (!parent) return;
          const lock = document.createElement("span");
          lock.id = LOCK_ID;
          lock.className = "gc-model-lock";
          lock.appendChild(createIcon("lock", 9));
          const modelLabel = this._preferredModel === "flash" ? "Fast" : this._preferredModel === "thinking" ? "Thinking" : "Pro";
          lock.title = NativeUI.t("已锁定: " + modelLabel, "Locked: " + modelLabel);
          parent.appendChild(lock);
        },
        removeNativeUI() {
          NativeUI.remove("gc-model-lock");
        },
        setPreferredModel(model) {
          this._preferredModel = model;
          try {
            GM_setValue(this.STORAGE_KEY, model);
          } catch (e) {
          }
          this.removeNativeUI();
          this.injectNativeUI();
          Logger.info("Default model set", { model });
        },
        _isNewChat() {
          return GeminiAdapter.isNewChatUrl();
        },
        _startUrlWatcher() {
          if (this._pollTimer) return;
          this._pollTimer = setInterval(() => {
            const currentUrl = location.href;
            if (currentUrl !== this._lastUrl) {
              const wasChat = this._lastUrl.includes("/app/");
              this._lastUrl = currentUrl;
              if (this._isNewChat() || !wasChat && this._isNewChat()) {
                this._attemptModelSwitch();
              }
            }
          }, 800);
        },
        async _attemptModelSwitch() {
          if (this._switching) return;
          this._switching = true;
          try {
            await this._waitFor(() => GeminiAdapter.getModelSwitch(), 5e3);
            const currentModel = this._detectCurrentModel();
            if (currentModel === this._preferredModel) {
              Logger.info("Already on preferred model", { model: currentModel });
              return;
            }
            const modeBtn = GeminiAdapter.getModelSwitch();
            if (!modeBtn) return;
            modeBtn.click();
            await this._waitFor(
              () => GeminiAdapter.getModelMenuOptions().length > 0,
              TIMINGS.MODEL_MENU_TIMEOUT
            );
            const option = GeminiAdapter.findModelMenuItem(this._preferredModel);
            if (option) {
              option.click();
              Logger.info("Model switched", { from: currentModel, to: this._preferredModel });
            } else {
              document.body.click();
              Logger.warn("Model option not found", { preferred: this._preferredModel });
            }
          } catch (e) {
            Logger.warn("Model switch failed", { error: e.message });
            try {
              document.body.click();
            } catch {
            }
          } finally {
            this._switching = false;
          }
        },
        _detectCurrentModel() {
          return GeminiAdapter.detectModelKey() || "flash";
        },
        _waitFor(predicate, timeout) {
          return new Promise((resolve, reject) => {
            if (predicate()) return resolve(true);
            const start = Date.now();
            let check = null;
            const cleanup = () => {
              if (check) clearInterval(check);
            };
            check = setInterval(() => {
              if (predicate()) {
                cleanup();
                resolve(true);
              } else if (Date.now() - start > timeout) {
                cleanup();
                reject(new Error("timeout"));
              }
            }, 200);
          });
        },
        _sleep(ms) {
          return Core.sleep(ms);
        },
        getOnboarding() {
          return {
            zh: {
              rant: "Gemini 每次新建对话都默认选 Flash。你明明想用 Pro，但它偏要你每次手动切。这就像一个咖啡店，你天天来点美式，但服务员每次都问“先生，来杯速溶咖啡吧？”。Google，求求你记住用户的选择，这不难对吧？",
              features: "自动将新对话切换到你的首选模型。模型选择按钮旁显示 🔒 锁定标记。",
              guide: "1. 在设置中选择首选模型 (Fast/Thinking/Pro)\n2. 新建对话时自动切换\n3. 看到 🔒 表示已锁定"
            },
            en: {
              rant: "Gemini defaults to Flash for every new chat. You want Pro, but it insists on asking every time. It's like a coffee shop where you come daily for an americano, but the barista says 'instant coffee today, sir?' Google, please just remember the user's choice. It's not hard.",
              features: "Automatically switches new conversations to your preferred model. Shows a 🔒 lock indicator next to the model switch button.",
              guide: "1. Select your preferred model in Settings (Fast/Thinking/Pro)\n2. New chats auto-switch to it\n3. The 🔒 icon confirms the lock is active"
            }
          };
        },
        renderToSettings(container) {
          const row = document.createElement("div");
          row.className = "settings-row";
          const label = document.createElement("span");
          label.textContent = NativeUI.t("🤖 首选模型", "🤖 Preferred Model");
          const select = document.createElement("select");
          select.style.cssText = "background:var(--input-bg,rgba(255,255,255,0.1));color:var(--text-main);border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:13px;";
          const models = [
            { value: "flash", label: "3 Fast (Flash)" },
            { value: "thinking", label: "3 Flash Thinking" },
            { value: "pro", label: "3 Pro" }
          ];
          models.forEach((m) => {
            const opt = document.createElement("option");
            opt.value = m.value;
            opt.textContent = m.label;
            if (m.value === this._preferredModel) opt.selected = true;
            select.appendChild(opt);
          });
          select.addEventListener("change", () => {
            this.setPreferredModel(select.value);
          });
          row.appendChild(label);
          row.appendChild(select);
          container.appendChild(row);
        }
      };
    }
  });

  // src/modules/batch_delete.js
  var BatchDeleteModule;
  var init_batch_delete = __esm({
    "src/modules/batch_delete.js"() {
      init_logger();
      init_core();
      init_native_ui();
      init_panel_ui();
      init_gemini();
      BatchDeleteModule = {
        id: "batch-delete",
        name: NativeUI.t("批量删除", "Batch Delete"),
        description: NativeUI.t("在面板中批量选择并删除对话", "Batch select and delete chats from panel"),
        icon: "🗑️",
        iconId: "trash",
        defaultEnabled: false,
        _selected: /* @__PURE__ */ new Set(),
        _deleting: false,
        _progress: { current: 0, total: 0 },
        _batchMode: false,
        init() {
          this._selected = /* @__PURE__ */ new Set();
          this._batchMode = false;
          Logger.info("BatchDeleteModule initialized");
        },
        destroy() {
          this._selected.clear();
          this._deleting = false;
          this._batchMode = false;
          this.removeNativeUI();
        },
        onUserChange() {
          this._selected.clear();
          this._batchMode = false;
          this.removeNativeUI();
          NativeUI.markDirty(this.id);
          NativeUI.tick();
        },
        // --- Native UI: Sidebar batch toolbar ---
        injectNativeUI() {
          const TOOLBAR_ID = "gc-batch-toolbar";
          if (document.getElementById(TOOLBAR_ID)) return;
          const sidebar = NativeUI.getSidebar();
          if (!sidebar) return;
          const toolbar = document.createElement("div");
          toolbar.id = TOOLBAR_ID;
          toolbar.className = "gc-sidebar-toolbar";
          if (this._batchMode) {
            this._renderBatchToolbar(toolbar);
          } else {
            const enterBtn = document.createElement("button");
            enterBtn.className = "gc-sidebar-btn full-width";
            enterBtn.textContent = NativeUI.t("批量管理", "Batch Manage");
            enterBtn.onclick = () => {
              this._batchMode = true;
              this._refreshNativeUI();
            };
            toolbar.appendChild(enterBtn);
          }
          if (!sidebar) return;
          const overflowC = GeminiAdapter.getSidebarOverflowContainer() || sidebar;
          const folderFilter = document.getElementById("gc-folder-filter");
          if (folderFilter && folderFilter.parentElement === overflowC) {
            overflowC.insertBefore(toolbar, folderFilter.nextSibling);
          } else {
            overflowC.prepend(toolbar);
          }
        },
        removeNativeUI() {
          NativeUI.remove("gc-batch-toolbar");
          document.querySelectorAll(".gc-batch-check").forEach((el) => el.remove());
          this._batchMode = false;
        },
        _refreshNativeUI() {
          NativeUI.remove("gc-batch-toolbar");
          document.querySelectorAll(".gc-batch-check").forEach((el) => el.remove());
          this.injectNativeUI();
          if (this._batchMode) this._injectCheckboxes();
        },
        _renderBatchToolbar(toolbar) {
          toolbar.className = "gc-sidebar-toolbar gc-sidebar-toolbar-active";
          const selectAllBtn = document.createElement("button");
          selectAllBtn.className = "gc-sidebar-btn";
          selectAllBtn.textContent = NativeUI.t("全选", "Select All");
          selectAllBtn.onclick = () => {
            const chats = this._scanChats();
            chats.forEach((c) => this._selected.add(c.id));
            this._refreshNativeUI();
          };
          const cancelBtn = document.createElement("button");
          cancelBtn.className = "gc-sidebar-btn";
          cancelBtn.textContent = NativeUI.t("取消", "Cancel");
          cancelBtn.onclick = () => {
            this._batchMode = false;
            this._selected.clear();
            this._refreshNativeUI();
          };
          const countLabel = document.createElement("span");
          countLabel.className = "gc-count-label";
          countLabel.textContent = NativeUI.t("已选 " + this._selected.size + " 个", this._selected.size + " selected");
          toolbar.appendChild(selectAllBtn);
          toolbar.appendChild(cancelBtn);
          toolbar.appendChild(countLabel);
          if (this._selected.size > 0) {
            const deleteBtn = document.createElement("button");
            deleteBtn.className = "gc-sidebar-btn danger";
            deleteBtn.textContent = NativeUI.t("删除", "Delete");
            deleteBtn.onclick = () => {
              NativeUI.showConfirm(
                NativeUI.t("确认删除选中的 " + this._selected.size + " 个对话？", "Delete " + this._selected.size + " selected conversation(s)?"),
                () => this._batchDelete(),
                { confirmText: NativeUI.t("删除", "Delete"), danger: true }
              );
            };
            toolbar.appendChild(deleteBtn);
          }
        },
        _injectCheckboxes() {
          const chats = Core.scanSidebarChats();
          chats.forEach((chat) => {
            if (chat.element.querySelector(".gc-batch-check")) return;
            const check = document.createElement("div");
            check.className = "gc-batch-check";
            const isChecked = this._selected.has(chat.id);
            check.dataset.checked = isChecked ? "true" : "false";
            check.textContent = isChecked ? "✓" : "";
            check.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (this._selected.has(chat.id)) {
                this._selected.delete(chat.id);
              } else {
                this._selected.add(chat.id);
              }
              this._refreshNativeUI();
            };
            chat.element.insertBefore(check, chat.element.firstChild);
          });
        },
        _scanChats() {
          return Core.scanSidebarChats();
        },
        async _deleteChat(chatElement) {
          try {
            chatElement.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
            await this._sleep(300);
            const menuBtn = GeminiAdapter.getChatRowMoreButton(chatElement);
            if (!menuBtn) throw new Error("Menu button not found");
            (menuBtn.closest("button") || menuBtn).click();
            await this._sleep(400);
            const deleteBtn = GeminiAdapter.getDeleteMenuItem();
            if (!deleteBtn) throw new Error("Delete option not found");
            deleteBtn.click();
            await this._sleep(400);
            const dialog = GeminiAdapter.getConfirmDialog();
            if (!dialog) throw new Error("Dialog not found");
            const confirmBtn = GeminiAdapter.getDialogConfirmButton(dialog);
            if (!confirmBtn) throw new Error("Confirm button not found");
            confirmBtn.click();
            await this._sleep(300);
            return true;
          } catch (e) {
            Logger.warn("Delete failed", { error: e.message });
            document.body.click();
            await this._sleep(200);
            return false;
          }
        },
        async _batchDelete() {
          if (this._deleting || this._selected.size === 0) return;
          this._deleting = true;
          this._progress = { current: 0, total: this._selected.size };
          const chats = this._scanChats();
          const toDelete = chats.filter((c) => this._selected.has(c.id));
          let deleted = 0;
          let failed = 0;
          for (const chat of toDelete) {
            this._progress.current++;
            PanelUI.renderDetailsPane();
            const ok = await this._deleteChat(chat.element);
            if (ok) {
              deleted++;
              this._selected.delete(chat.id);
            } else {
              failed++;
            }
            await this._sleep(500);
          }
          this._deleting = false;
          this._selected.clear();
          Logger.info("Batch delete complete", { deleted, failed });
          PanelUI.renderDetailsPane();
        },
        _sleep(ms) {
          return Core.sleep(ms);
        },
        renderToDetailsPane(container) {
          const section = document.createElement("div");
          section.className = "gf-section";
          const header = document.createElement("div");
          header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;";
          const title = document.createElement("div");
          title.style.cssText = "font-weight:600;font-size:13px;color:var(--text-main);";
          title.textContent = "Batch Delete";
          header.appendChild(title);
          if (this._deleting) {
            const progress = document.createElement("span");
            progress.style.cssText = "font-size:11px;color:var(--accent);";
            progress.textContent = "Deleting " + this._progress.current + "/" + this._progress.total + "...";
            header.appendChild(progress);
          } else if (this._selected.size > 0) {
            const deleteBtn = document.createElement("button");
            deleteBtn.style.cssText = "background:#ea4335;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;";
            deleteBtn.textContent = "Delete " + this._selected.size + " chats";
            deleteBtn.onclick = () => {
              NativeUI.showConfirm(
                NativeUI.t("确认删除选中的 " + this._selected.size + " 个对话？此操作不可撤销。", "Delete " + this._selected.size + " chats? This cannot be undone."),
                () => this._batchDelete(),
                { confirmText: NativeUI.t("删除", "Delete"), danger: true }
              );
            };
            header.appendChild(deleteBtn);
          }
          section.appendChild(header);
          const chats = this._scanChats();
          if (chats.length === 0) {
            const empty = document.createElement("div");
            empty.style.cssText = "font-size:12px;color:var(--text-sub);text-align:center;padding:12px;";
            empty.textContent = NativeUI.t("侧栏中未发现对话项", "No conversations found in sidebar");
            section.appendChild(empty);
          } else {
            const list = document.createElement("div");
            list.style.cssText = "max-height:200px;overflow-y:auto;";
            chats.forEach((chat) => {
              const row = document.createElement("div");
              row.style.cssText = "display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:4px;cursor:pointer;font-size:12px;color:var(--text-main);";
              row.onmouseenter = () => {
                row.style.background = "var(--row-hover)";
              };
              row.onmouseleave = () => {
                row.style.background = "";
              };
              const check = document.createElement("div");
              const isChecked = this._selected.has(chat.id);
              check.style.cssText = "width:16px;height:16px;border-radius:3px;border:2px solid " + (isChecked ? "var(--accent)" : "var(--text-sub)") + ";background:" + (isChecked ? "var(--accent)" : "transparent") + ";flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;";
              check.textContent = isChecked ? "✓" : "";
              const label = document.createElement("span");
              label.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;";
              label.textContent = chat.title;
              row.onclick = () => {
                if (this._selected.has(chat.id)) {
                  this._selected.delete(chat.id);
                } else {
                  this._selected.add(chat.id);
                }
                PanelUI.renderDetailsPane();
              };
              row.appendChild(check);
              row.appendChild(label);
              list.appendChild(row);
            });
            section.appendChild(list);
          }
          if (chats.length > 0 && !this._deleting) {
            const actions = document.createElement("div");
            actions.style.cssText = "display:flex;gap:8px;margin-top:6px;";
            const selectAll = document.createElement("button");
            selectAll.style.cssText = "background:var(--btn-bg);color:var(--text-main);border:1px solid var(--border);border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;";
            selectAll.textContent = "Select All";
            selectAll.onclick = () => {
              chats.forEach((c) => this._selected.add(c.id));
              PanelUI.renderDetailsPane();
            };
            const deselectAll = document.createElement("button");
            deselectAll.style.cssText = "background:var(--btn-bg);color:var(--text-main);border:1px solid var(--border);border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;";
            deselectAll.textContent = "Deselect All";
            deselectAll.onclick = () => {
              this._selected.clear();
              PanelUI.renderDetailsPane();
            };
            actions.appendChild(selectAll);
            actions.appendChild(deselectAll);
            section.appendChild(actions);
          }
          container.appendChild(section);
        },
        getOnboarding() {
          return {
            zh: {
              rant: "Gemini 的删除对话功能：打开菜单 → 点删除 → 确认 → 等待。一个对话要 4 次点击。你有 50 个测试对话要清理？那就点 200 次吧，Google 工程师显然没有清理过自己的对话列表。也可能他们写了个内部工具，只是懒得给你用。",
              features: "在侧边栏添加批量管理工具栏。激活后每个对话出现复选框，勾选后一键批量删除。支持全选/反选。",
              guide: "1. 点击侧边栏的“🗑️ 批量管理” → 2. 勾选要删除的对话 → 3. 点击“删除” → 4. 确认"
            },
            en: {
              rant: "Deleting a Gemini conversation: open menu → click delete → confirm → wait. 4 clicks per conversation. Have 50 test chats to clean up? That's 200 clicks. Google engineers clearly never clean up their own conversation lists. Or maybe they have an internal tool, they just can't be bothered to give it to you.",
              features: "Adds a batch management toolbar to the sidebar. When activated, checkboxes appear on each conversation for one-click batch deletion. Supports select all/deselect.",
              guide: '1. Click "🗑️ Batch Manage" in the sidebar → 2. Check conversations to delete → 3. Click "Delete" → 4. Confirm'
            }
          };
        }
      };
    }
  });

  // src/modules/quote_reply.js
  var QuoteReplyModule;
  var init_quote_reply = __esm({
    "src/modules/quote_reply.js"() {
      init_constants();
      init_logger();
      init_native_ui();
      init_gemini();
      QuoteReplyModule = {
        id: "quote-reply",
        name: NativeUI.t("引用回复", "Quote Reply"),
        description: NativeUI.t("选中文本后快速插入引用到输入框", "Select text to quickly quote into input"),
        icon: "💬",
        defaultEnabled: false,
        _fab: null,
        _boundPointerUp: null,
        _boundPointerDown: null,
        init() {
          this._boundPointerUp = this._onPointerUp.bind(this);
          this._boundPointerDown = this._onPointerDown.bind(this);
          document.addEventListener("pointerup", this._boundPointerUp, true);
          document.addEventListener("pointerdown", this._boundPointerDown, true);
          Logger.info("QuoteReplyModule initialized");
        },
        destroy() {
          if (this._boundPointerUp) {
            document.removeEventListener("pointerup", this._boundPointerUp, true);
            this._boundPointerUp = null;
          }
          if (this._boundPointerDown) {
            document.removeEventListener("pointerdown", this._boundPointerDown, true);
            this._boundPointerDown = null;
          }
          this._removeFab();
        },
        onUserChange() {
        },
        _onPointerDown(e) {
          if (this._fab && this._fab.contains(e.target)) return;
          this._removeFab();
        },
        _onPointerUp(e) {
          setTimeout(() => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !sel.toString().trim()) {
              return;
            }
            const range = sel.getRangeAt(0);
            const container = range.commonAncestorContainer;
            const el = container.nodeType === 3 ? container.parentElement : container;
            if (!el) return;
            if (el.closest("#" + PANEL_ID)) return;
            if (GeminiAdapter.isInsideInputEditor(el)) return;
            if (!GeminiAdapter.isInsideChatContent(el)) return;
            const text = sel.toString().trim();
            if (!text || text.length < 2) return;
            this._showFab(e.clientX, e.clientY, text);
          }, 50);
        },
        _showFab(x, y, text) {
          this._removeFab();
          const fab = document.createElement("div");
          fab.className = "gc-quote-fab";
          fab.textContent = "💬 Quote";
          const fabW = 90;
          const fabH = 30;
          let left = Math.min(x + 8, window.innerWidth - fabW - 10);
          let top = Math.max(y - fabH - 8, 10);
          fab.style.left = left + "px";
          fab.style.top = top + "px";
          fab.onclick = (e) => {
            e.stopPropagation();
            this._insertQuote(text);
            this._removeFab();
          };
          document.body.appendChild(fab);
          this._fab = fab;
          requestAnimationFrame(() => fab.classList.add("visible"));
          setTimeout(() => {
            if (this._fab === fab) this._removeFab();
          }, TIMINGS.FAB_AUTO_DISMISS);
        },
        _removeFab() {
          if (this._fab) {
            this._fab.remove();
            this._fab = null;
          }
        },
        _insertQuote(text) {
          const editor = GeminiAdapter.getInputEditor();
          if (!editor) {
            Logger.warn("QuoteReply: editor not found");
            return;
          }
          const quoted = text.split("\n").map((line) => "> " + line).join("\n");
          const fullText = quoted + "\n\n";
          const isBlank = editor.classList.contains("ql-blank") || editor.textContent.trim() === "" && editor.children.length <= 1;
          if (isBlank) {
            editor.replaceChildren();
            editor.classList.remove("ql-blank");
          }
          const lines = fullText.split("\n");
          lines.forEach((line) => {
            const p = document.createElement("p");
            if (line === "") {
              p.appendChild(document.createElement("br"));
            } else {
              p.textContent = line;
            }
            editor.appendChild(p);
          });
          editor.dispatchEvent(new Event("input", { bubbles: true }));
          editor.focus();
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
          Logger.info("Quote inserted", { length: text.length });
        }
      };
    }
  });

  // src/modules/ui_tweaks.js
  var UITweaksModule;
  var init_ui_tweaks = __esm({
    "src/modules/ui_tweaks.js"() {
      init_constants();
      init_logger();
      init_core();
      init_dom_watcher();
      init_native_ui();
      init_gemini();
      UITweaksModule = {
        id: "ui-tweaks",
        name: NativeUI.t("UI 自定义", "UI Tweaks"),
        description: NativeUI.t("Tab 标题 / 快捷键 / 布局调整", "Tab title / hotkeys / layout tweaks"),
        icon: "🎨",
        defaultEnabled: false,
        STORAGE_KEY: "gemini_ui_tweaks",
        _styleEl: null,
        _titleObserver: null,
        _keyHandler: null,
        features: {
          tabTitle: { enabled: false, label: NativeUI.t("Tab 标题同步对话名", "Sync tab title with chat name") },
          ctrlEnter: { enabled: false, label: NativeUI.t("Ctrl+Enter 才发送", "Ctrl+Enter to send") },
          chatWidth: { enabled: false, label: NativeUI.t("聊天区宽度", "Chat area width"), value: 900 },
          sidebarWidth: { enabled: false, label: NativeUI.t("侧栏宽度", "Sidebar width"), value: 280 },
          hideGems: { enabled: false, label: NativeUI.t("隐藏 Gems 入口", "Hide Gems entry") }
        },
        init() {
          let saved;
          try {
            saved = GM_getValue(this.STORAGE_KEY, null);
          } catch (e) {
            saved = null;
          }
          if (saved) {
            Object.keys(saved).forEach((k) => {
              if (this.features[k]) {
                this.features[k].enabled = saved[k].enabled;
                if (saved[k].value !== void 0) this.features[k].value = saved[k].value;
              }
            });
          }
          this._applyAll();
          Logger.info("UITweaksModule initialized", { features: Object.keys(this.features).filter((k) => this.features[k].enabled) });
        },
        destroy() {
          if (this._styleEl) {
            this._styleEl.remove();
            this._styleEl = null;
          }
          DOMWatcher.unregister("uitweaks-tabtitle");
          if (this._titleDebounce) {
            clearTimeout(this._titleDebounce);
            this._titleDebounce = null;
          }
          if (this._keyHandler) {
            document.removeEventListener("keydown", this._keyHandler, true);
            this._keyHandler = null;
          }
          document.title = "Google Gemini";
          this.removeNativeUI();
        },
        onUserChange() {
        },
        // --- \u539F\u751F UI \u6CE8\u5165 ---
        injectNativeUI() {
          if (!this.features.ctrlEnter.enabled) return;
          const HINT_ID = "gc-tweaks-send-hint";
          if (document.getElementById(HINT_ID)) return;
          const inputArea = NativeUI.getInputArea();
          if (!inputArea) return;
          const pos = getComputedStyle(inputArea).position;
          if (pos === "static" || pos === "") inputArea.style.position = "relative";
          const hint = document.createElement("div");
          hint.id = HINT_ID;
          hint.className = "gc-send-hint";
          hint.textContent = "Ctrl+Enter ↵";
          inputArea.appendChild(hint);
        },
        removeNativeUI() {
          NativeUI.remove("gc-tweaks-send-hint");
        },
        _getStatusText() {
          const items = [];
          if (this.features.ctrlEnter.enabled) items.push("Ctrl+Enter: ON");
          if (this.features.tabTitle.enabled) items.push("Tab Title: ON");
          if (this.features.chatWidth.enabled) items.push("Chat Width: " + this.features.chatWidth.value + "px");
          if (this.features.sidebarWidth.enabled) items.push("Sidebar: " + this.features.sidebarWidth.value + "px");
          if (this.features.hideGems.enabled) items.push("Hide Gems: ON");
          return items.length > 0 ? items.join(" | ") : "All tweaks off";
        },
        _save() {
          try {
            GM_setValue(this.STORAGE_KEY, this.features);
          } catch (e) {
          }
        },
        _applyAll() {
          this._applyCSS();
          this._applyTabTitle();
          this._applyCtrlEnter();
        },
        _applyCSS() {
          if (this._styleEl) this._styleEl.remove();
          const rules = [];
          const clampPx = (v, fallback, min, max) => {
            const n = Math.floor(Number(v));
            return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
          };
          rules.push(...GeminiAdapter.buildUITweakCssRules({
            chatWidth: this.features.chatWidth.enabled ? clampPx(this.features.chatWidth.value, 900, 400, 4e3) : null,
            sidebarWidth: this.features.sidebarWidth.enabled ? clampPx(this.features.sidebarWidth.value, 280, 160, 800) : null,
            hideGems: this.features.hideGems.enabled
          }));
          if (rules.length > 0) {
            const style = document.createElement("style");
            style.textContent = rules.join("\n");
            document.head.appendChild(style);
            this._styleEl = style;
          }
        },
        _applyTabTitle() {
          DOMWatcher.unregister("uitweaks-tabtitle");
          if (this._titleDebounce) {
            clearTimeout(this._titleDebounce);
            this._titleDebounce = null;
          }
          if (!this.features.tabTitle.enabled) return;
          const updateTitle = () => {
            const text = GeminiAdapter.getChatTitleText();
            if (text) {
              const desired = text + (text.length === 50 ? "... - Gemini" : " - Gemini");
              if (document.title !== desired) document.title = desired;
            }
          };
          updateTitle();
          DOMWatcher.register("uitweaks-tabtitle", {
            match: (m) => {
              if (m.type === "characterData") return true;
              if (m.type === "childList") {
                const target = m.target;
                if (!target || !target.closest) return true;
                return GeminiAdapter.isInsideMainChatArea(target);
              }
              return false;
            },
            callback: updateTitle,
            debounce: TIMINGS.TITLE_DEBOUNCE
          });
        },
        _applyCtrlEnter() {
          if (this._keyHandler) {
            document.removeEventListener("keydown", this._keyHandler, true);
            this._keyHandler = null;
          }
          if (!this.features.ctrlEnter.enabled) return;
          this._keyHandler = (e) => {
            if (e.key !== "Enter") return;
            const target = e.target;
            if (!GeminiAdapter.isInsideInputEditor(target)) return;
            if (e.isComposing) return;
            if (!e.ctrlKey && !e.metaKey) {
              e.stopPropagation();
              e.stopImmediatePropagation();
            } else {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              const sendBtn = GeminiAdapter.getSendButton();
              if (sendBtn && !sendBtn.disabled) {
                sendBtn.click();
              }
            }
          };
          document.addEventListener("keydown", this._keyHandler, true);
        },
        toggleFeature(key) {
          if (!this.features[key]) return;
          this.features[key].enabled = !this.features[key].enabled;
          this._save();
          this._applyAll();
          this.removeNativeUI();
          this.injectNativeUI();
        },
        setFeatureValue(key, value) {
          if (!this.features[key]) return;
          this.features[key].value = value;
          this._save();
          this._applyAll();
        },
        getOnboarding() {
          return {
            zh: {
              rant: "Gemini 不支持 Ctrl+Enter 发送，Enter 直接发送意味着你永远不能在消息里换行——除非你知道 Shift+Enter 这个隐藏快捷键。浏览器标签页标题永远显示“Gemini”，开了 10 个对话标签？全是 Gemini - Gemini - Gemini。Google 的 UX 团队是不是觉得用户只用一个标签页？",
              features: "三个微调开关：Ctrl+Enter 发送、标签页显示对话标题、布局优化。输入框旁 3 个小圆点显示当前状态。",
              guide: "1. 在设置中开启需要的调整项\n2. 输入框右下角的小圆点指示哪些调整已生效\n3. 亮蓝色=已启用"
            },
            en: {
              rant: "Gemini doesn't support Ctrl+Enter to send. Enter sends immediately, meaning you can never add newlines — unless you know the secret Shift+Enter shortcut. Browser tab title always shows 'Gemini' — open 10 chat tabs? All 'Gemini - Gemini - Gemini'. Does the UX team think users only use one tab?",
              features: "Three micro-tweaks: Ctrl+Enter to send, tab title shows conversation name, layout adjustments. Three tiny dots near the input area show current status.",
              guide: "1. Enable desired tweaks in Settings\n2. Dots at the bottom-right of the input area indicate active tweaks\n3. Blue = enabled"
            }
          };
        },
        renderToSettings(container) {
          Object.keys(this.features).forEach((key) => {
            const feat = this.features[key];
            const row = document.createElement("div");
            row.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:6px 0;";
            const labelEl = document.createElement("span");
            labelEl.style.cssText = "font-size:13px;color:var(--text-main);";
            labelEl.textContent = feat.label;
            row.appendChild(labelEl);
            const rightSide = document.createElement("div");
            rightSide.style.cssText = "display:flex;align-items:center;gap:8px;";
            if (feat.value !== void 0) {
              const input = document.createElement("input");
              input.type = "number";
              input.value = feat.value;
              input.style.cssText = "width:60px;background:var(--input-bg,rgba(255,255,255,0.1));color:var(--text-main);border:1px solid var(--border);border-radius:4px;padding:2px 6px;font-size:12px;text-align:center;";
              input.onchange = () => {
                const v = parseInt(input.value, 10);
                if (v > 0) this.setFeatureValue(key, v);
              };
              const unit = document.createElement("span");
              unit.style.cssText = "font-size:11px;color:var(--text-sub);";
              unit.textContent = "px";
              rightSide.appendChild(input);
              rightSide.appendChild(unit);
            }
            const toggle = document.createElement("div");
            toggle.className = "toggle-switch " + (feat.enabled ? "on" : "");
            toggle.onclick = () => {
              this.toggleFeature(key);
              toggle.classList.toggle("on");
            };
            rightSide.appendChild(toggle);
            row.appendChild(rightSide);
            container.appendChild(row);
          });
        }
      };
    }
  });

  // lib/context_packet_tools.js
  var require_context_packet_tools = __commonJS({
    "lib/context_packet_tools.js"(exports, module) {
      var MAX_TITLE_LENGTH = 120;
      var MAX_NOTE_LENGTH = 1200;
      var MAX_HREF_LENGTH = 600;
      function toText(value) {
        if (value === null || value === void 0) return "";
        return String(value);
      }
      function cleanText(value, fallback = "") {
        const text = toText(value).trim();
        return text || fallback;
      }
      function normalizeHref(value) {
        const href = cleanText(value, "").slice(0, MAX_HREF_LENGTH);
        if (!href) return "";
        return /^(javascript|data|vbscript):/i.test(href) ? "" : href;
      }
      function normalizeContextReference(raw) {
        if (!raw || typeof raw !== "object") return null;
        const source = raw;
        const chatId = cleanText(source.chatId || source.id, "");
        const note = cleanText(source.note, "").slice(0, MAX_NOTE_LENGTH);
        const title = cleanText(source.title, chatId || (note ? "Untitled chat" : "")).slice(0, MAX_TITLE_LENGTH);
        const href = normalizeHref(source.href);
        if (!chatId && !title && !note) return null;
        return { chatId, title, href, note };
      }
      function formatContextReference2(raw, opts = {}) {
        const ref = normalizeContextReference(raw);
        if (!ref) return "";
        const label = cleanText(opts.label, "Gemini chat reference");
        const lines = [
          `[${label}]`,
          `Title: ${ref.title}`
        ];
        if (ref.href) lines.push(`Link: ${ref.href}`);
        if (ref.chatId) lines.push(`Chat ID: ${ref.chatId}`);
        if (ref.note && opts.includeNote !== false) {
          lines.push("Local note:");
          lines.push(ref.note);
        }
        return lines.join("\n");
      }
      function formatContextPacket2(items, opts = {}) {
        const refs = (Array.isArray(items) ? items : [items]).map(normalizeContextReference).filter(Boolean);
        if (refs.length === 0) return "";
        if (refs.length === 1) return formatContextReference2(refs[0], opts);
        const label = cleanText(opts.label, "Gemini context packet");
        const sections = refs.map((ref, index) => {
          return formatContextReference2(ref, {
            ...opts,
            label: `${index + 1}. ${ref.title}`
          });
        });
        return [`[${label}]`, ...sections].join("\n\n");
      }
      module.exports = {
        formatContextPacket: formatContextPacket2,
        formatContextReference: formatContextReference2,
        normalizeContextReference
      };
    }
  });

  // lib/chat_notes_store.js
  var require_chat_notes_store = __commonJS({
    "lib/chat_notes_store.js"(exports, module) {
      var MAX_TITLE_LENGTH = 120;
      var MAX_NOTE_LENGTH = 4e3;
      var NOTES_EXPORT_SCHEMA = "primer-pp.chat-notes";
      var NOTES_EXPORT_VERSION = 1;
      function toText(value) {
        if (value === null || value === void 0) return "";
        return String(value);
      }
      function cleanText(value, fallback = "") {
        const text = toText(value).trim();
        return text || fallback;
      }
      function normalizeHref(value) {
        const href = cleanText(value, "");
        if (!href) return "";
        return /^(javascript|data|vbscript):/i.test(href) ? "" : href;
      }
      function normalizeChatRef(chat) {
        const source = chat && typeof chat === "object" ? chat : {};
        const chatId = cleanText(source.chatId || source.id, "");
        if (!chatId) return null;
        return {
          chatId,
          title: cleanText(source.title, chatId).slice(0, MAX_TITLE_LENGTH),
          href: normalizeHref(source.href)
        };
      }
      function normalizeNote(raw, opts = {}) {
        const source = raw && typeof raw === "object" ? raw : {};
        const ref = normalizeChatRef(source);
        if (!ref) return null;
        const nowIso = opts.nowIso || (/* @__PURE__ */ new Date()).toISOString();
        const createdAt = cleanText(source.createdAt, nowIso);
        return {
          chatId: ref.chatId,
          title: ref.title,
          href: ref.href,
          note: cleanText(source.note, "").slice(0, MAX_NOTE_LENGTH),
          pinned: source.pinned === true,
          createdAt,
          updatedAt: cleanText(source.updatedAt, createdAt)
        };
      }
      function normalizeNotesData2(raw, opts = {}) {
        const source = raw && typeof raw === "object" ? raw : {};
        const notes = {};
        for (const [chatId, note] of Object.entries(source.notes || {})) {
          const normalized = normalizeNote({ ...note, chatId }, opts);
          if (normalized) notes[normalized.chatId] = normalized;
        }
        return { notes };
      }
      function upsertChatNote2(data, chat, updates = {}, opts = {}) {
        const state = normalizeNotesData2(data, opts);
        const ref = normalizeChatRef(chat);
        if (!ref) return state;
        const chatSource = chat;
        const nowIso = opts.nowIso || (/* @__PURE__ */ new Date()).toISOString();
        const existing = state.notes[ref.chatId];
        const title = cleanText(chatSource.title, existing?.title || ref.title);
        const href = normalizeHref(chatSource.href) || existing?.href || ref.href;
        const note = updates.note === void 0 ? existing?.note || "" : cleanText(updates.note, "").slice(0, MAX_NOTE_LENGTH);
        const pinned = updates.pinned === void 0 ? !!existing?.pinned : updates.pinned === true;
        if (!note && !pinned) {
          delete state.notes[ref.chatId];
          return state;
        }
        state.notes[ref.chatId] = {
          chatId: ref.chatId,
          title,
          href,
          note,
          pinned,
          createdAt: existing?.createdAt || nowIso,
          updatedAt: nowIso
        };
        return state;
      }
      function toggleChatPin2(data, chat, opts = {}) {
        const state = normalizeNotesData2(data, opts);
        const ref = normalizeChatRef(chat);
        if (!ref) return state;
        const existing = state.notes[ref.chatId];
        return upsertChatNote2(state, ref, { pinned: !existing?.pinned }, opts);
      }
      function deleteChatNote2(data, chatId, opts = {}) {
        const state = normalizeNotesData2(data, opts);
        delete state.notes[cleanText(chatId, "")];
        return state;
      }
      function getPinnedNotes2(data) {
        return Object.values(normalizeNotesData2(data).notes).filter((note) => note.pinned).sort((a, b) => {
          if (a.updatedAt !== b.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
          return a.title.localeCompare(b.title);
        });
      }
      function getNotesStats2(data) {
        const notes = Object.values(normalizeNotesData2(data).notes);
        return {
          total: notes.length,
          pinned: notes.filter((note) => note.pinned).length,
          withNote: notes.filter((note) => note.note).length
        };
      }
      function getNowIso(opts = {}) {
        return opts.nowIso || (/* @__PURE__ */ new Date()).toISOString();
      }
      function createNotesExport(data, opts = {}) {
        return {
          schema: NOTES_EXPORT_SCHEMA,
          version: NOTES_EXPORT_VERSION,
          exportedAt: getNowIso(opts),
          app: "Primer++ for Gemini",
          ...normalizeNotesData2(data, opts)
        };
      }
      function serializeNotesExport2(data, opts = {}) {
        return JSON.stringify(createNotesExport(data, opts), null, 2);
      }
      function mergeNotesImport2(existing, rawImport, opts = {}) {
        const state = normalizeNotesData2(existing, opts);
        const imported = normalizeNotesData2(rawImport, opts);
        let importedNotes = 0;
        Object.entries(imported.notes).forEach(([chatId, note]) => {
          state.notes[chatId] = note;
          importedNotes++;
        });
        return { data: state, importedNotes };
      }
      module.exports = {
        createNotesExport,
        deleteChatNote: deleteChatNote2,
        getNotesStats: getNotesStats2,
        getPinnedNotes: getPinnedNotes2,
        mergeNotesImport: mergeNotesImport2,
        normalizeChatRef,
        normalizeNote,
        normalizeNotesData: normalizeNotesData2,
        serializeNotesExport: serializeNotesExport2,
        toggleChatPin: toggleChatPin2,
        upsertChatNote: upsertChatNote2
      };
    }
  });

  // src/modules/chat_notes.js
  var import_date_utils5, import_context_packet_tools, import_chat_notes_store, ChatNotesModule;
  var init_chat_notes = __esm({
    "src/modules/chat_notes.js"() {
      init_core();
      init_logger();
      init_native_ui();
      init_panel_ui();
      init_icons();
      init_gemini();
      import_date_utils5 = __toESM(require_date_utils());
      import_context_packet_tools = __toESM(require_context_packet_tools());
      import_chat_notes_store = __toESM(require_chat_notes_store());
      ChatNotesModule = {
        id: "chat-notes",
        name: NativeUI.t("对话笔记", "Chat Notes"),
        description: NativeUI.t("为对话保存本地笔记和置顶标记", "Save local notes and pins for chats"),
        iconId: "pin",
        defaultEnabled: false,
        STORAGE_KEY: "gemini_chat_notes",
        data: { notes: {} },
        _getStorageKey() {
          const user = Core.getCurrentUser();
          return user && user.includes("@") ? `${this.STORAGE_KEY}_${user}` : this.STORAGE_KEY;
        },
        init() {
          this.loadData();
          Logger.info("ChatNotesModule initialized", (0, import_chat_notes_store.getNotesStats)(this.data));
        },
        onUserChange() {
          this.loadData();
          PanelUI.renderDetailsPane();
        },
        loadData() {
          let saved;
          try {
            saved = GM_getValue(this._getStorageKey(), null);
          } catch {
            saved = null;
          }
          this.data = (0, import_chat_notes_store.normalizeNotesData)(saved);
          this._save();
        },
        _save() {
          try {
            GM_setValue(this._getStorageKey(), this.data);
          } catch {
          }
        },
        _insertTextIntoEditor(text) {
          const editor = GeminiAdapter.getInputEditor();
          if (!editor) {
            NativeUI.showToast(NativeUI.t("未找到 Gemini 输入框", "Gemini input box not found"));
            return false;
          }
          editor.focus();
          const before = "value" in editor ? editor.value : editor.textContent;
          const inputEvent = new InputEvent("beforeinput", {
            inputType: "insertText",
            data: text,
            bubbles: true,
            cancelable: true,
            composed: true
          });
          const accepted = editor.dispatchEvent(inputEvent);
          const after = "value" in editor ? editor.value : editor.textContent;
          if (accepted && after !== before) return true;
          if ("value" in editor) {
            const start = Number.isInteger(editor.selectionStart) ? editor.selectionStart : editor.value.length;
            const end = Number.isInteger(editor.selectionEnd) ? editor.selectionEnd : editor.value.length;
            editor.value = editor.value.slice(0, start) + text + editor.value.slice(end);
            editor.selectionStart = editor.selectionEnd = start + text.length;
          } else {
            const p = document.createElement("p");
            p.textContent = text;
            editor.appendChild(p);
          }
          editor.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        },
        _insertContextReference(note) {
          const text = (0, import_context_packet_tools.formatContextReference)(note);
          if (!text) return;
          if (this._insertTextIntoEditor(text)) {
            NativeUI.showToast(NativeUI.t("上下文引用已插入", "Context reference inserted"));
          }
        },
        _insertPinnedContextPacket(notes) {
          const text = (0, import_context_packet_tools.formatContextPacket)(notes.slice(0, 8), {
            label: "Pinned Gemini context packet"
          });
          if (!text) return;
          if (this._insertTextIntoEditor(text)) {
            NativeUI.showToast(NativeUI.t("置顶上下文包已插入", "Pinned context packet inserted"));
          }
        },
        _makeContextInsertButton(note) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer;border-radius:4px;";
          btn.title = NativeUI.t("插入本地上下文引用", "Insert local context reference");
          btn.setAttribute("aria-label", NativeUI.t("插入本地上下文引用", "Insert local context reference"));
          btn.appendChild(createIcon("copy", 12));
          btn.onclick = (e) => {
            e.stopPropagation();
            this._insertContextReference(note);
          };
          return btn;
        },
        _exportNotes() {
          const data = (0, import_chat_notes_store.serializeNotesExport)(this.data, { nowIso: (/* @__PURE__ */ new Date()).toISOString() });
          const blob = new Blob([data], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `primer-pp-notes-${(0, import_date_utils5.formatLocalDate)(/* @__PURE__ */ new Date())}.json`;
          a.click();
          URL.revokeObjectURL(url);
          NativeUI.showToast(NativeUI.t("笔记已导出", "Notes exported"));
        },
        _importNotes() {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".json";
          input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
              try {
                const imported = JSON.parse(ev.target.result);
                const result = (0, import_chat_notes_store.mergeNotesImport)(this.data, imported, { nowIso: (/* @__PURE__ */ new Date()).toISOString() });
                if (result.importedNotes === 0) throw new Error("Invalid format");
                this.data = result.data;
                this._save();
                PanelUI.renderDetailsPane();
                NativeUI.showToast(NativeUI.t(`已导入 ${result.importedNotes} 条笔记`, `Imported ${result.importedNotes} notes`));
              } catch {
                NativeUI.showToast(NativeUI.t("导入失败: 格式无效", "Import failed: invalid format"));
              }
            };
            reader.readAsText(file);
          };
          input.click();
        },
        _getCurrentChatRef() {
          const chatId = Core.getChatId();
          if (!chatId) return null;
          const chats = Core.scanSidebarChats(true);
          const fromSidebar = chats.find((chat) => chat.id === chatId);
          return {
            id: chatId,
            title: fromSidebar?.title || document.title || chatId,
            href: fromSidebar?.href || `/app/${chatId}`
          };
        },
        _renderCurrentChatEditor(container, current) {
          const existing = current ? this.data.notes[current.id] : null;
          const title = document.createElement("div");
          title.className = "section-title";
          title.textContent = NativeUI.t("当前对话", "Current Chat");
          container.appendChild(title);
          if (!current) {
            const hint = document.createElement("div");
            hint.className = "detail-row";
            hint.textContent = NativeUI.t("打开一个对话后可保存笔记。", "Open a chat to save notes.");
            container.appendChild(hint);
            return;
          }
          const header = document.createElement("div");
          header.className = "detail-row";
          header.style.alignItems = "center";
          const label = document.createElement("span");
          label.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
          label.textContent = current.title;
          label.title = current.title;
          const insertBtn = this._makeContextInsertButton({
            chatId: current.id,
            title: existing?.title || current.title,
            href: existing?.href || current.href,
            note: existing?.note || ""
          });
          const pinBtn = document.createElement("span");
          pinBtn.style.cssText = `display:inline-flex;cursor:pointer;color:${existing?.pinned ? "var(--accent)" : "inherit"};`;
          pinBtn.title = existing?.pinned ? "Unpin current chat" : "Pin current chat";
          pinBtn.appendChild(createIcon("pin", 12));
          pinBtn.onclick = (e) => {
            e.stopPropagation();
            this.data = (0, import_chat_notes_store.toggleChatPin)(this.data, current);
            this._save();
            PanelUI.renderDetailsPane();
          };
          header.appendChild(label);
          header.appendChild(insertBtn);
          header.appendChild(pinBtn);
          container.appendChild(header);
          const noteArea = document.createElement("textarea");
          noteArea.style.cssText = "width:100%;height:92px;box-sizing:border-box;border-radius:6px;border:1px solid var(--divider,rgba(255,255,255,0.1));background:var(--input-bg,rgba(255,255,255,0.05));color:var(--text-main,#fff);font-size:11px;padding:8px;resize:vertical;font-family:inherit;";
          noteArea.placeholder = NativeUI.t("本地笔记，只保存在浏览器里...", "Local note, saved only in this browser...");
          noteArea.value = existing?.note || "";
          container.appendChild(noteArea);
          const actions = document.createElement("div");
          actions.style.cssText = "display:flex;gap:6px;margin:6px 0 10px;";
          const saveBtn = document.createElement("button");
          saveBtn.className = "g-btn";
          saveBtn.style.flex = "1";
          saveBtn.textContent = NativeUI.t("保存笔记", "Save Note");
          saveBtn.onclick = (e) => {
            e.stopPropagation();
            this.data = (0, import_chat_notes_store.upsertChatNote)(this.data, current, {
              note: noteArea.value,
              pinned: this.data.notes[current.id]?.pinned
            });
            this._save();
            NativeUI.showToast(NativeUI.t("笔记已保存", "Note saved"));
            PanelUI.renderDetailsPane();
          };
          const deleteBtn = document.createElement("button");
          deleteBtn.className = "g-btn";
          deleteBtn.style.flex = "1";
          deleteBtn.textContent = NativeUI.t("删除", "Delete");
          deleteBtn.onclick = (e) => {
            e.stopPropagation();
            this.data = (0, import_chat_notes_store.deleteChatNote)(this.data, current.id);
            this._save();
            PanelUI.renderDetailsPane();
          };
          actions.appendChild(saveBtn);
          actions.appendChild(deleteBtn);
          container.appendChild(actions);
        },
        _renderPinnedNotes(container) {
          const pinned = (0, import_chat_notes_store.getPinnedNotes)(this.data);
          const title = document.createElement("div");
          title.className = "section-title";
          title.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px;";
          const titleLabel = document.createElement("span");
          titleLabel.textContent = NativeUI.t("置顶对话", "Pinned Chats");
          title.appendChild(titleLabel);
          container.appendChild(title);
          if (pinned.length === 0) {
            const empty = document.createElement("div");
            empty.className = "detail-row";
            empty.textContent = NativeUI.t("暂无置顶。", "No pinned chats yet.");
            container.appendChild(empty);
            return;
          }
          const packetBtn = document.createElement("button");
          packetBtn.type = "button";
          packetBtn.style.cssText = "display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:5px;border:1px solid var(--divider,rgba(255,255,255,0.1));background:var(--btn-bg,rgba(255,255,255,0.05));color:var(--text-sub,#9aa0a6);font-size:10px;cursor:pointer;";
          packetBtn.title = NativeUI.t("插入置顶上下文包", "Insert pinned context packet");
          packetBtn.setAttribute("aria-label", NativeUI.t("插入置顶上下文包", "Insert pinned context packet"));
          packetBtn.appendChild(createIcon("copy", 11));
          packetBtn.appendChild(document.createTextNode(NativeUI.t("包", "Packet")));
          packetBtn.onclick = (e) => {
            e.stopPropagation();
            this._insertPinnedContextPacket(pinned);
          };
          title.appendChild(packetBtn);
          pinned.slice(0, 8).forEach((note) => {
            const row = document.createElement("div");
            row.className = "detail-row";
            row.title = note.note || note.title;
            const text = document.createElement("span");
            text.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
            text.textContent = note.note ? `${note.title} - ${note.note.slice(0, 40)}` : note.title;
            row.appendChild(text);
            row.appendChild(this._makeContextInsertButton(note));
            row.onclick = (e) => {
              e.stopPropagation();
              if (note.href) window.location.href = note.href;
            };
            container.appendChild(row);
          });
        },
        renderToDetailsPane(container) {
          const stats = (0, import_chat_notes_store.getNotesStats)(this.data);
          const title = document.createElement("div");
          title.className = "section-title";
          title.style.cssText = "display:flex;justify-content:space-between;align-items:center;";
          const label = document.createElement("span");
          label.textContent = "Chat Notes";
          const count = document.createElement("span");
          count.style.opacity = "0.7";
          count.textContent = `${stats.total}/${stats.pinned}`;
          title.appendChild(label);
          title.appendChild(count);
          container.appendChild(title);
          this._renderCurrentChatEditor(container, this._getCurrentChatRef());
          this._renderPinnedNotes(container);
          const ioRow = document.createElement("div");
          ioRow.style.cssText = "display:flex;gap:6px;margin-top:8px;";
          const exportBtn = document.createElement("button");
          exportBtn.style.cssText = "flex:1;font-size:10px;padding:4px 8px;border-radius:6px;border:1px solid var(--divider,rgba(255,255,255,0.1));background:var(--btn-bg,rgba(255,255,255,0.05));color:var(--text-sub,#9aa0a6);cursor:pointer;";
          exportBtn.textContent = NativeUI.t("导出", "Export");
          exportBtn.onclick = (e) => {
            e.stopPropagation();
            this._exportNotes();
          };
          const importBtn = document.createElement("button");
          importBtn.style.cssText = "flex:1;font-size:10px;padding:4px 8px;border-radius:6px;border:1px solid var(--divider,rgba(255,255,255,0.1));background:var(--btn-bg,rgba(255,255,255,0.05));color:var(--text-sub,#9aa0a6);cursor:pointer;";
          importBtn.textContent = NativeUI.t("导入", "Import");
          importBtn.onclick = (e) => {
            e.stopPropagation();
            this._importNotes();
          };
          ioRow.appendChild(exportBtn);
          ioRow.appendChild(importBtn);
          container.appendChild(ioRow);
        },
        getOnboarding() {
          return {
            zh: {
              rant: "Gemini 的对话列表只有标题和时间。你想记住“这段架构结论以后要复用”，只能靠脑子或外部笔记。",
              features: "为每个 Gemini 对话保存本地笔记和置顶标记，并可手动把本地标题、链接、ID 与笔记作为单条引用或置顶上下文包插入输入框。数据只写入浏览器本地存储，不同步到远端。",
              guide: "打开一个对话，在面板的 Chat Notes 标签里写笔记或置顶。点击复制图标可把本地引用包插入当前输入框，也可把置顶列表打包插入；置顶列表可快速回到重要对话。"
            },
            en: {
              rant: "Gemini gives you titles and timestamps, but not a durable place to mark why a chat matters.",
              features: "Adds local per-chat notes and pins, plus explicit context-reference insertion for local titles, links, IDs, and notes as single references or pinned context packets. Data stays in browser storage and is not synced to a backend.",
              guide: "Open a chat, use the Chat Notes tab to save a note or pin it. Click the copy icon to insert a local reference packet into the current composer, or package the pinned list before returning to important chats."
            }
          };
        }
      };
    }
  });

  // src/native_ui_styles.js
  function injectNativeUIStyles() {
    GM_addStyle(`
        /* ============================================ */
        /* Sidebar injections (Gemini-native colors)    */
        /* ============================================ */

        .gc-filter-bar {
            display: flex;
            gap: 4px;
            padding: 6px 12px;
            overflow-x: auto;
            align-items: center;
            flex-shrink: 0;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
            max-height: 36px;
            align-self: start;
            animation: gcFadeIn 0.2s ease-out;
        }
        .gc-filter-bar::-webkit-scrollbar { display: none; }

        .gc-filter-tab {
            padding: 4px 12px;
            border-radius: 14px;
            font-size: 12px;
            font-family: 'Google Sans', Roboto, sans-serif;
            white-space: nowrap;
            cursor: pointer;
            border: none;
            background: transparent;
            color: #9aa0a6;
            font-weight: 400;
            transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                        color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                        opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            line-height: 1.4;
            user-select: none;
            opacity: 0.7;
        }
        .gc-filter-tab:hover {
            background: rgba(255,255,255,0.06);
            color: #e8eaed;
            opacity: 1;
        }
        .gc-filter-tab:focus-visible,
        .gc-sidebar-btn:focus-visible,
        .gc-input-btn:focus-visible,
        .gc-header-btn:focus-visible,
        .gc-quote-fab:focus-visible {
            outline: 2px solid #8ab4f8;
            outline-offset: 2px;
        }
        .gc-filter-tab.active {
            font-weight: 500;
            opacity: 1;
        }

        .gc-sidebar-toolbar {
            padding: 4px 12px;
            max-height: 40px;
            align-self: start;
            animation: gcFadeIn 0.2s ease-out;
        }

        .gc-sidebar-btn {
            background: transparent;
            border: none;
            color: #9aa0a6;
            border-radius: 14px;
            padding: 5px 14px;
            font-size: 12px;
            font-family: 'Google Sans', Roboto, sans-serif;
            cursor: pointer;
            transition: background 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                        color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                        opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            opacity: 0.6;
        }
        .gc-sidebar-btn:hover {
            color: #e8eaed;
            background: rgba(255,255,255,0.06);
            opacity: 1;
        }
        .gc-sidebar-btn.full-width {
            width: 100%;
        }
        .gc-sidebar-btn.danger {
            background: rgba(234,67,53,0.15);
            color: #f28b82;
            border: none;
        }
        .gc-sidebar-btn.danger:hover {
            background: rgba(234,67,53,0.25);
        }

        .gc-sidebar-toolbar-active {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .gc-count-label {
            font-size: 11px;
            color: #8ab4f8;
            flex: 1;
            text-align: center;
            font-weight: 500;
        }

        .gc-batch-check {
            width: 16px;
            height: 16px;
            border-radius: 4px;
            border: 2px solid #5f6368;
            background: transparent;
            flex-shrink: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            color: #fff;
            cursor: pointer;
            margin-right: 6px;
            vertical-align: middle;
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .gc-batch-check[data-checked="true"] {
            border-color: #8ab4f8;
            background: #8ab4f8;
        }

        /* ============================================ */
        /* Input area injections (Gemini-native colors) */
        /* ============================================ */

        .gc-input-btn {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: transparent;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            color: #9aa0a6;
        }
        .gc-input-btn:hover {
            background: rgba(128,128,128,0.15);
            color: #e8eaed;
        }
        .gc-input-btn:active {
            transform: scale(0.92);
        }

        .gc-tweaks-dots {
            display: flex;
            gap: 4px;
            position: absolute;
            bottom: 8px;
            right: 8px;
            pointer-events: none;
            z-index: 1;
        }

        .gc-tweaks-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #555;
            transition: background 0.3s;
        }
        .gc-tweaks-dot.on {
            background: #8ab4f8;
            animation: gcDotPulse 2.5s infinite;
        }
        @keyframes gcDotPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .gc-send-hint {
            position: absolute;
            bottom: 8px;
            right: 36px;
            font-size: 11px;
            color: #9aa0a6;
            opacity: 0.6;
            pointer-events: none;
            z-index: 1;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            background: rgba(255,255,255,0.06);
            padding: 2px 6px;
            border-radius: 4px;
        }

        /* ============================================ */
        /* Chat header injections (Gemini-native)       */
        /* ============================================ */

        .gc-header-btn {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: transparent;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.7;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            color: #9aa0a6;
        }
        .gc-header-btn:hover {
            opacity: 1;
            background: rgba(128, 128, 128, 0.15);
        }
        .gc-header-btn:active {
            transform: scale(0.92);
        }

        /* ============================================ */
        /* Model lock indicator (Gemini-native)         */
        /* ============================================ */

        .gc-model-lock {
            font-size: 9px;
            color: #9aa0a6;
            margin-left: 2px;
            cursor: default;
            user-select: none;
            display: inline-flex;
            align-items: center;
            opacity: 0.5;
        }

        /* ============================================ */
        /* Quote reply FAB (Gemini-native accent)       */
        /* ============================================ */

        .gc-quote-fab {
            position: fixed;
            z-index: 2147483646;
            background: #8ab4f8;
            color: #fff;
            padding: 5px 12px;
            border-radius: 16px;
            font-size: 12px;
            font-weight: 600;
            font-family: 'Google Sans', Roboto, sans-serif;
            cursor: pointer;
            box-shadow: 0 2px 12px rgba(0,0,0,0.3);
            user-select: none;
            transition: opacity 0.15s, transform 0.15s;
            opacity: 0;
            transform: scale(0.9);
        }
        .gc-quote-fab.visible {
            opacity: 1;
            transform: scale(1);
        }

        /* ============================================ */
        /* Toast notification (theme vars OK — floats)  */
        /* ============================================ */

        .gc-toast {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%) translateY(10px);
            background: var(--bg, #303134);
            color: var(--text-main, #e8eaed);
            border: 1px solid var(--border, rgba(255,255,255,0.12));
            padding: 10px 24px;
            border-radius: 14px;
            font-size: 13px;
            font-family: 'Google Sans', Roboto, sans-serif;
            z-index: 2147483647;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            opacity: 0;
            transition: opacity 0.2s, transform 0.2s;
        }
        .gc-toast.visible {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }

        /* Shared entrance animation for native UI injections */
        @keyframes gcFadeIn {
            from { opacity: 0; }
            to   { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
            .gc-filter-bar,
            .gc-filter-tab,
            .gc-sidebar-toolbar,
            .gc-sidebar-btn,
            .gc-batch-check,
            .gc-input-btn,
            .gc-tweaks-dot,
            .gc-header-btn,
            .gc-quote-fab,
            .gc-toast,
            .gc-tour-overlay,
            .gc-tour-tooltip {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
                scroll-behavior: auto !important;
            }
        }
    `);
  }
  var init_native_ui_styles = __esm({
    "src/native_ui_styles.js"() {
    }
  });

  // src/main.js
  var require_main = __commonJS({
    "src/main.js"() {
      init_constants();
      init_logger();
      init_core();
      init_state();
      init_module_registry();
      init_native_ui();
      init_dom_watcher();
      init_panel_ui();
      init_guided_tour();
      init_gemini();
      init_debug_utils();
      init_counter();
      init_export();
      init_folders();
      init_prompt_vault();
      init_default_model();
      init_batch_delete();
      init_quote_reply();
      init_ui_tweaks();
      init_chat_notes();
      init_message_queue();
      init_native_ui_styles();
      ModuleRegistry.register(CounterModule);
      ModuleRegistry.register(ExportModule);
      ModuleRegistry.register(FoldersModule);
      ModuleRegistry.register(PromptVaultModule);
      ModuleRegistry.register(DefaultModelModule);
      ModuleRegistry.register(BatchDeleteModule);
      ModuleRegistry.register(QuoteReplyModule);
      ModuleRegistry.register(UITweaksModule);
      ModuleRegistry.register(ChatNotesModule);
      ModuleRegistry.register(MessageQueueModule);
      function getPrimerProbeReport() {
        const detailsPane = document.getElementById("g-details-pane");
        return {
          app: APP_NAME,
          version: VERSION,
          generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          adapter: GeminiAdapter.getRuntimeProbeReport(),
          modules: {
            registered: Object.keys(ModuleRegistry.modules).sort(),
            enabled: Array.from(ModuleRegistry.enabledModules).sort()
          },
          localUI: {
            panelPresent: !!document.getElementById(PANEL_ID),
            detailsPanePresent: !!detailsPane,
            detailsPaneExpanded: !!detailsPane?.classList.contains("expanded"),
            exportButtonPresent: !!document.getElementById("gc-export-native")
          }
        };
      }
      window.__PRIMER_PP_GET_PROBE_REPORT__ = getPrimerProbeReport;
      var lastDetectedUser = null;
      function lazyDetect() {
        try {
          const detected = Core.detectUser();
          if (detected !== lastDetectedUser) {
            Logger.debug("User detection changed", { detected });
            lastDetectedUser = detected;
          }
          if (detected && detected !== getCurrentUser()) {
            let guestState = null;
            if (getCurrentUser() === TEMP_USER && ModuleRegistry.isEnabled("counter")) {
              try {
                guestState = JSON.parse(JSON.stringify(CounterModule.state));
              } catch (e) {
                guestState = null;
              }
            }
            setCurrentUser(detected);
            Core.registerUser(detected);
            Logger.info("User switched", { currentUser: detected });
            if (getInspectingUser() === TEMP_USER || getInspectingUser() === getCurrentUser()) {
              setInspectingUser(getCurrentUser());
            }
            ModuleRegistry.notifyUserChange(getInspectingUser());
            if (guestState && (guestState.total > 0 || Object.keys(guestState.chats || {}).length > 0)) {
              const cm = CounterModule;
              cm.state.total += typeof guestState.total === "number" ? guestState.total : 0;
              cm.state.totalChatsCreated += typeof guestState.totalChatsCreated === "number" ? guestState.totalChatsCreated : 0;
              for (const [day, counts] of Object.entries(guestState.dailyCounts || {})) {
                if (typeof counts !== "object" || !counts) continue;
                if (!cm.state.dailyCounts[day]) {
                  cm.state.dailyCounts[day] = counts;
                } else {
                  cm.state.dailyCounts[day].messages += typeof counts.messages === "number" ? counts.messages : 0;
                  cm.state.dailyCounts[day].chats += typeof counts.chats === "number" ? counts.chats : 0;
                  if (counts.byModel && typeof counts.byModel === "object") {
                    if (!cm.state.dailyCounts[day].byModel) {
                      cm.state.dailyCounts[day].byModel = { flash: 0, thinking: 0, pro: 0 };
                    }
                    cm.state.dailyCounts[day].byModel.flash += typeof counts.byModel.flash === "number" ? counts.byModel.flash : 0;
                    cm.state.dailyCounts[day].byModel.thinking += typeof counts.byModel.thinking === "number" ? counts.byModel.thinking : 0;
                    cm.state.dailyCounts[day].byModel.pro += typeof counts.byModel.pro === "number" ? counts.byModel.pro : 0;
                  }
                }
              }
              for (const [cid, count] of Object.entries(guestState.chats || {})) {
                cm.state.chats[cid] = (cm.state.chats[cid] || 0) + (typeof count === "number" ? count : 0);
              }
              Logger.info(`Merged ${guestState.total} messages from Guest session to ${getCurrentUser()}`);
              cm.saveData();
              if (document.getElementById(PANEL_ID)) PanelUI.update();
            }
          }
          if (ModuleRegistry.isEnabled("counter")) {
            const cm = CounterModule;
            const newAcct = cm.detectAccountType();
            if (newAcct !== cm.accountType) {
              cm.accountType = newAcct;
              if (document.getElementById(PANEL_ID)) PanelUI.update();
            }
          }
        } catch (e) {
          Logger.error("lazyDetect error", e);
        }
      }
      function onModelMutation() {
        if (!ModuleRegistry.isEnabled("counter")) return;
        const cm = CounterModule;
        const newModel = cm.detectModel();
        if (newModel !== cm.currentModel) {
          cm.currentModel = newModel;
          if (document.getElementById(PANEL_ID)) PanelUI.update();
        }
      }
      function onSidebarChange() {
        Core.invalidateSidebarCache();
        NativeUI.markDirtyByZone("sidebar");
        NativeUI.tick();
      }
      function onInputAreaChange() {
        NativeUI.markDirtyByZone("input");
        NativeUI.tick();
      }
      function onHeaderChange() {
        NativeUI.markDirtyByZone("header");
        NativeUI.tick();
      }
      function onPanelRemoved() {
        if (ModuleRegistry.isEnabled("counter")) {
          PanelUI.create();
        }
      }
      function onDOMStructureChange() {
        Core.invalidateSidebarCache();
        if (ModuleRegistry.isEnabled("counter")) {
          PanelUI.create();
        }
        NativeUI.markAllDirty();
        NativeUI.tick();
      }
      PanelUI.injectStyles();
      injectNativeUIStyles();
      ModuleRegistry.init();
      DOMWatcher.init();
      Core._updateAutoListener(Core.getTheme());
      DOMWatcher.register("model-mutation", {
        match: (m) => GeminiAdapter.matchesModelMutation(m),
        callback: onModelMutation,
        debounce: TIMINGS.MODEL_MUTATION_DEBOUNCE
      });
      DOMWatcher.register("sidebar-structure", {
        match: (m) => GeminiAdapter.matchesSidebarMutation(m),
        callback: onSidebarChange,
        debounce: TIMINGS.NATIVEUI_DEBOUNCE
      });
      DOMWatcher.register("input-structure", {
        match: (m) => GeminiAdapter.matchesInputAreaMutation(m),
        callback: onInputAreaChange,
        debounce: TIMINGS.NATIVEUI_DEBOUNCE
      });
      DOMWatcher.register("header-structure", {
        match: (m) => GeminiAdapter.matchesHeaderMutation(m),
        callback: onHeaderChange,
        debounce: TIMINGS.NATIVEUI_DEBOUNCE
      });
      DOMWatcher.register("panel-guard", {
        match: (m) => {
          if (m.type !== "childList" || !m.removedNodes?.length) return false;
          for (const n of m.removedNodes) {
            if (n.id === PANEL_ID) return true;
          }
          return false;
        },
        callback: onPanelRemoved,
        debounce: 500
      });
      function startOnboardingQueue() {
        let seen;
        try {
          seen = GM_getValue(GLOBAL_KEYS.ONBOARDING, {});
        } catch (e) {
          seen = {};
        }
        const queue = [];
        ModuleRegistry.enabledModules.forEach((id) => {
          const mod = ModuleRegistry.modules[id];
          if (!seen[id] && typeof mod?.getOnboarding === "function") {
            queue.push(id);
            seen[id] = true;
          }
        });
        if (queue.length === 0) return;
        try {
          GM_setValue(GLOBAL_KEYS.ONBOARDING, seen);
        } catch (e) {
        }
        let i = 0;
        function showNext() {
          if (i >= queue.length) return;
          const id = queue[i++];
          PanelUI.showOnboarding(id);
          let check = null;
          let timeout = null;
          const cleanup = () => {
            if (check) clearInterval(check);
            if (timeout) clearTimeout(timeout);
          };
          check = setInterval(() => {
            if (!document.querySelector("#gemini-onboarding-modal, .onboarding-overlay")) {
              cleanup();
              setTimeout(showNext, 500);
            }
          }, 300);
          timeout = setTimeout(cleanup, 1e4);
        }
        setTimeout(showNext, 500);
      }
      function startProgressiveDisclosure() {
        if (!GuidedTour.hasSeen()) {
          setTimeout(() => GuidedTour.start(startOnboardingQueue), 800);
        } else {
          startOnboardingQueue();
        }
      }
      function waitForGeminiReady(cb, maxWait = 1e4) {
        const start = Date.now();
        (function check() {
          if (GeminiAdapter.isReady()) cb();
          else if (Date.now() - start < maxWait) requestAnimationFrame(check);
          else cb();
        })();
      }
      lazyDetect();
      waitForGeminiReady(() => {
        onDOMStructureChange();
        startProgressiveDisclosure();
      });
      var pollTimer = setInterval(lazyDetect, TIMINGS.SLOW_POLL);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          if (!pollTimer) pollTimer = setInterval(lazyDetect, TIMINGS.SLOW_POLL);
          lazyDetect();
          onModelMutation();
          const user = getInspectingUser();
          if (user && user !== TEMP_USER && ModuleRegistry.isEnabled("counter")) {
            CounterModule.loadDataForUser(user);
          }
        } else {
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
          try {
            CounterModule.flushPendingSave?.();
          } catch (e) {
          }
        }
      });
      window.addEventListener("pagehide", () => {
        try {
          CounterModule.flushPendingSave?.();
        } catch (e) {
        }
      });
      GM_registerMenuCommand("🧰 Debug: Show Detected User", () => {
        debugShowDetectedUser();
      });
      GM_registerMenuCommand("🧰 Debug: Dump Storage Keys", () => {
        debugDumpStorageKeys();
      });
      GM_registerMenuCommand("🧰 Debug: Export All Storage", () => {
        debugExportAllStorage();
      });
      GM_registerMenuCommand("🧰 Debug: Export Adapter Probe", () => {
        debugExportAdapterProbe();
      });
      GM_registerMenuCommand("🧰 Debug: Export Legacy Data", () => {
        debugExportLegacyData();
      });
      GM_registerMenuCommand("🧰 Debug: Export Logs", () => {
        debugExportLogs();
      });
      GM_registerMenuCommand("🧰 Debug: Dump Gemini Storage", () => {
        debugDumpGeminiStores();
      });
      GM_registerMenuCommand("🔄 Reset Position", () => {
        GM_setValue(GLOBAL_KEYS.POS, DEFAULT_POS);
        location.reload();
      });
    }
  });
  require_main();
})();
