Check Asterisk/telephony health (requires VPN).
Steps:
1. ssh asterisk "asterisk -rx 'core show version'"
2. ssh asterisk "asterisk -rx 'sip show peers'" — check SIP registrations
3. ssh asterisk "asterisk -rx 'queue show'" — check queue status
4. Report: Asterisk version, registered peers, queue agents
