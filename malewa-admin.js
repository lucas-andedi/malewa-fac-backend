// malewa-admin.js — privileged helper for the Hermes WhatsApp ordering bot.
//
// Runs server-side (NOT exposed to the agent). Talks directly to the malewa-fac
// database via the backend's own Prisma client so the bot can:
//   • ensure a single service account (role "agent") used to place orders;
//   • find-or-create a client user by phone WITHOUT OTP/SMS.
//
// It NEVER modifies an existing user's password or status — for existing
// customers it only reads their id (orders are placed on their behalf by the
// agent account). Output is a single JSON line on stdout.
//
// Must live in the malewa-fac-backend dir so require() resolves @prisma/client
// and bcryptjs, and dotenv loads DATABASE_URL from ./.env.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

function out(o) { console.log(JSON.stringify(o)); }
function norm(p) { return String(p || '').replace(/[^0-9+]/g, ''); }

(async () => {
  const cmd = process.argv[2];
  try {
    if (cmd === 'ensure-agent') {
      const email = process.argv[3];
      const password = process.argv[4];
      const phone = process.argv[5] || 'wabot-service-agent';
      const hash = await bcrypt.hash(password, 10);
      let u = await prisma.user.findUnique({ where: { email } });
      if (!u) {
        u = await prisma.user.create({
          data: { name: 'WhatsApp Bot', email, phone, passwordHash: hash, role: 'agent', status: 'active' },
        });
        out({ ok: true, created: true, id: u.id });
      } else {
        // Keep the service account usable: known password, agent role, active.
        u = await prisma.user.update({
          where: { id: u.id },
          data: { passwordHash: hash, role: 'agent', status: 'active' },
        });
        out({ ok: true, created: false, id: u.id });
      }
    } else if (cmd === 'ensure-client') {
      const phone = norm(process.argv[3]);
      const name = process.argv[4] || ('Client ' + phone);
      const institutionCode = process.argv[5] || null;
      if (!phone) { out({ ok: false, error: 'phone required' }); process.exit(2); }

      const existing = await prisma.user.findUnique({ where: { phone } });
      if (existing) {
        // Never touch an existing account — just return its id.
        out({ ok: true, existed: true, id: existing.id, status: existing.status });
        return;
      }
      let institutionId = null;
      if (institutionCode) {
        const inst = await prisma.institution.findUnique({ where: { code: institutionCode } });
        if (inst) institutionId = inst.id;
      }
      const u = await prisma.user.create({
        data: {
          name, phone, role: 'client', status: 'active',
          ...(institutionId ? { institutionId } : {}),
        },
      });
      out({ ok: true, existed: false, id: u.id });
    } else {
      out({ ok: false, error: 'unknown command: ' + cmd });
      process.exit(2);
    }
  } catch (e) {
    out({ ok: false, error: String((e && e.message) || e) });
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
