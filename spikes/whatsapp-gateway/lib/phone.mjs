// Phone helpers. Numbers are digits with country code, no "+" (WhatsApp's form).

export const digitsOnly = (s) => String(s ?? '').replace(/\D/g, '');

// Never print a full number: keep country prefix and last two digits.
export const mask = (phone) => {
  const d = digitsOnly(phone);
  if (d.length < 6) return '***';
  return `${d.slice(0, 3)}${'*'.repeat(d.length - 5)}${d.slice(-2)}`;
};

export const toUserJid = (phone) => `${digitsOnly(phone)}@s.whatsapp.net`;

// Phone number of a JID, or null when it is not a phone-number JID (LID, group, broadcast).
export const phoneOfJid = (jid) => {
  if (!jid || !jid.endsWith('@s.whatsapp.net')) return null;
  return digitsOnly(jid.split('@')[0].split(':')[0]);
};

export const loadAllowlist = (csv) => new Set(String(csv ?? '').split(',').map(digitsOnly).filter(Boolean));
