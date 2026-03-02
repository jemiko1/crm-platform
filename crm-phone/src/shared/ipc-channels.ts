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

  APP_QUIT: "app:quit",
  APP_SHOW: "app:show",
} as const;
