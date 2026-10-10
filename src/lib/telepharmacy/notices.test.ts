import { describe, expect, it } from "vitest";
import { dict } from "@/lib/i18n/dict";
import {
  consultMissedNotice,
  consultReminderNotice,
  consultWaitingNotice,
  followUpNotice,
} from "./notices";

const ID = "11111111-1111-4111-8111-111111111111";

describe("notices that leave the app", () => {
  for (const lang of ["th", "en"] as const) {
    const t = dict[lang];
    const all = [
      consultWaitingNotice(t, ID),
      consultReminderNotice(t, lang, ID, new Date("2026-11-18T07:00:00Z")),
      consultMissedNotice(t, ID, "instant"),
      consultMissedNotice(t, ID, "scheduled"),
      followUpNotice(t, ID),
    ];
    it(`${lang}: say that something is waiting or due, never what it is about`, () => {
      for (const n of all) {
        const text = `${n.title}\n${n.body}`;
        // no topic, medicine, product, symptom or advice vocabulary
        expect(text).not.toMatch(
          /paracetamol|พาราเซตามอล|symptom|อาการ|diagnos|วินิจฉัย|advice|คำแนะนำ|allerg|แพ้/i,
        );
        expect(text).not.toContain(ID);
        expect(n.href?.startsWith("/")).toBe(true);
      }
    });
    it(`${lang}: each one can be sent once (a dedupe key per consult)`, () => {
      for (const n of all) expect(n.dedupeKey).toContain(ID);
    });
  }

  it("the waiting call goes to the pharmacist desk; the rest go to the customer's page", () => {
    const t = dict.th;
    expect(consultWaitingNotice(t, ID).href).toBe("/pharmacist");
    expect(consultMissedNotice(t, ID, "instant").href).toBe("/telepharmacy");
    expect(followUpNotice(t, ID).href).toBe("/telepharmacy#follow-up");
  });
});
