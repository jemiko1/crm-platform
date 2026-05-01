export const IPC = {
  AUTH_LOGIN: "auth:login",
  AUTH_LOGOUT: "auth:logout",
  AUTH_GET_SESSION: "auth:get-session",
  AUTH_SESSION_CHANGED: "auth:session-changed",

  PHONE_DIAL: "phone:dial",
  PHONE_ANSWER: "phone:answer",
  PHONE_HANGUP: "phone:hangup",
  PHONE_HOLD: "phone:hold",
  PHONE_UNHOLD: "phone:unhold",
  PHONE_TRANSFER: "phone:transfer",
  PHONE_DTMF: "phone:dtmf",
  PHONE_MUTE: "phone:mute",
  PHONE_UNMUTE: "phone:unmute",

  PHONE_STATE_CHANGED: "phone:state-changed",
  PHONE_INCOMING_CALL: "phone:incoming-call",
  PHONE_SIP_STATUS: "phone:sip-status",

  CONTACT_LOOKUP: "contact:lookup",
  CALL_HISTORY: "call:history",
  DIRECTORY_LIST: "directory:list",

  SIP_STATUS_REPORT: "sip:status-report",
  SIP_FETCH_CREDENTIALS: "sip:fetch-credentials",
  /**
   * Renderer → main: posts a SIP presence heartbeat (or final
   * "unregistered" beat on logout) to the backend. Main owns the
   * authenticated fetch so the JWT never leaves secure context.
   */
  SIP_REPORT_PRESENCE: "sip:report-presence",
  /**
   * Renderer → main → all renderer frames: notifies UI when SIP
   * registration transitions (e.g. red dot during a network blip).
   */
  SIP_REGISTRATION_CHANGED: "sip:registration-changed",
  RENDERER_LOG: "renderer:log",

  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set",

  WIN_SET_ALWAYS_ON_TOP: "win:set-always-on-top",

  APP_QUIT: "app:quit",
  APP_SHOW: "app:show",
  APP_HIDE: "app:hide",
  APP_MINIMIZE: "app:minimize",
  APP_OPEN_EXTERNAL: "app:open-external",
  /**
   * Two-step clean shutdown (v1.14.0). Main process emits PREPARE_QUIT
   * before destroying the window so the renderer can SIP-unregister
   * cleanly (REGISTER Expires:0 → wait for Asterisk ACK). Renderer
   * acknowledges with QUIT_READY when it's done. Main has a 5s timeout
   * fallback in case the renderer is hung — the app exits regardless.
   *
   * Window-close [X] does NOT trigger this flow — only tray Quit and the
   * APP_QUIT IPC do, matching the standard softphone pattern (close =
   * minimize to tray, keep registered; explicit Quit = unregister + exit).
   */
  APP_PREPARE_QUIT: "app:prepare-quit",
  APP_QUIT_READY: "app:quit-ready",

  UPDATE_CHECK: "update:check",
  UPDATE_STATUS: "update:status",
  UPDATE_INSTALL: "update:install",
  UPDATE_GET_VERSION: "update:get-version",

  /**
   * Break / DND channels (v1.10.0). All handlers live in the main
   * process so the JWT never leaves secure context. Break goes through
   * a full SIP unregister on start + re-register on resume; DND only
   * flips the AMI QueuePause flag and leaves SIP alone.
   */
  BREAK_START: "break:start",
  BREAK_END: "break:end",
  BREAK_MY_CURRENT: "break:my-current",
  DND_ENABLE: "dnd:enable",
  DND_DISABLE: "dnd:disable",
  DND_MY_STATE: "dnd:my-state",

  /**
   * Auto-rebind on extension change (v1.13.0). Backend emits
   * `extension:changed` over the /telephony Socket.IO namespace when
   * admin re-links / unlinks / edits / deletes the operator's extension.
   * Main process forwards to renderer via this channel; renderer
   * unregisters old SIP, re-fetches /auth/me, and re-registers with new
   * credentials. Soft-defers if on an active call — never drops one.
   */
  EXTENSION_CHANGED: "extension:changed",
  /**
   * Renderer → main: refresh the persisted session by re-fetching
   * /auth/me. Used by the rebind handler after `extension:changed`,
   * and reused by the SSO handoff flow (PR 3) to apply credentials
   * without restarting the app. Returns the fresh AppLoginResponse.
   */
  SESSION_REFRESH: "session:refresh",
} as const;
