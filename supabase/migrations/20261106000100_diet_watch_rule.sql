-- Weekly food-watch nudge (goals module). The conditions live in code
-- (src/lib/goals/watch.ts, src/lib/notify/server.ts); this registers the rule so an admin
-- can switch it at /admin/rules. The seed never overwrites what an admin tuned.
insert into public.automation_rules (key, title, description, enabled, params, sort_order) values
  ('diet_watch', 'แจ้งเมนูที่ควรสังเกตรายสัปดาห์', 'สัปดาห์ละครั้ง ถึงผู้ที่เปิดรับการเตือนและบอกโรคประจำตัวไว้ ถ้าอาหารที่บันทึก 7 วันล่าสุดมีเมนูกลุ่มที่ควรสังเกตมากกว่าเกณฑ์ (ข้อสังเกต ไม่ใช่การวินิจฉัย)', true, '{}', 18)
on conflict do nothing;
