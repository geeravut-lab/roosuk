-- Phase 2 / more automation rules (K06). The conditions live in code
-- (src/lib/notify/rules.ts); this only registers the rules so an admin can
-- switch them and tune their numbers at /admin/rules.
insert into public.automation_rules (key, title, description, enabled, params, sort_order) values
  ('streak_at_risk', 'เตือนครั้งสุดท้าย: ความต่อเนื่องใกล้ขาด', 'ส่งเตือนช่วงดึก ถึงผู้ที่เปิดรับการเตือนและมีความต่อเนื่องตั้งแต่จำนวนวันที่ตั้งไว้ แต่ยังไม่ได้เช็กอินวันนี้', true, '{"hour": 21, "min_streak": 7}', 12),
  ('monthly_report_ready', 'แจ้งรายงานรายเดือนพร้อมแล้ว', 'ในวันที่ตั้งไว้ของทุกเดือน (และอีก 3 วันถัดไปเผื่อพลาด) แจ้งผู้ที่มีเช็กอินอย่างน้อย 3 วันในเดือนก่อน พร้อมลิงก์ไปรายงาน', true, '{"day": 2}', 14),
  ('checkup_reminder', 'เตือนตรวจประจำปี / ตรวจซ้ำ', 'จากผลตรวจล่าสุดของผู้ใช้: ครบจำนวนเดือนที่ตั้งไว้ → ชวนคุยกับแพทย์เรื่องตรวจประจำปี · หรือมีรายการนอกช่วงและครบจำนวนวัน → ชวนปรึกษาเรื่องตรวจซ้ำ (ไม่วินิจฉัย)', true, '{"annual_months": 12, "recheck_days": 90}', 16)
on conflict do nothing;
