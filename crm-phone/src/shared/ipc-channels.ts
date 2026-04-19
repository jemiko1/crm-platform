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

  SIP_STATUS_REPORT: "sip:status-report",
  SIP_FETCH_CREDENTIALS: "sip:fetch-credentials",
  RENDERER_LOG: "renderer:log",

  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set",

  WIN_SET_ALWAYS_ON_TOP: "win:set-always-on-top",

  APP_QUIT: "app:quit",
  APP_SHOW: "app:show",
  APP_HIDE: "app:hide",
  APP_OPEN_EXTERNAL: "app:open-external",

  UPDATE_CHECK: "update:check",
  UPDATE_STATUS: "update:status",
  UPDATE_INSTALL: "update:install",
  UPDATE_GET_VERSION: "update:get-version",
} as const;
