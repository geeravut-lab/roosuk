import type {
  ConditionParams,
  BrainParams,
  GoalKind,
  SleepParams,
} from "./kinds";
import type {
  GoalProgram,
  ProgramContext,
  ProgramTask,
  TaskKind,
} from "./program";
import type { MealType } from "./meals";

/**
 * The program used when the model cannot (no AI quota, a failure, an answer that broke a
 * rule): plain, safe habit advice in Thai and English. Same shape as an AI program, so
 * everything after it works the same. Content, like the Thai food table — not UI chrome.
 */
type L = { th: string; en: string };
const pick = (l: L, lang: "th" | "en") => l[lang];

const task = (kind: TaskKind, th: string, en: string): [TaskKind, L] => [
  kind,
  { th, en },
];

const MEAL_IDEAS: Record<MealType, L[]> = {
  breakfast: [
    {
      th: "ไข่ต้ม 2 ฟอง + ผลไม้ + นมจืดหรือนมถั่วเหลืองไม่หวาน",
      en: "2 boiled eggs, fruit, plain milk or unsweetened soy milk",
    },
    {
      th: "โจ๊กหรือข้าวต้มใส่ไข่ ปรุงรสไม่เค็มจัด",
      en: "Rice porridge with an egg, lightly seasoned",
    },
  ],
  lunch: [
    {
      th: "ข้าวสวย 1 จาน + ต้มจืดหรือแกงใสใส่ผักเยอะ + ปลาหรืออกไก่ย่าง",
      en: "A plate of rice with a clear soup full of vegetables and grilled fish or chicken breast",
    },
    {
      th: "ก๋วยเตี๋ยวน้ำใสใส่ผักและเนื้อสัตว์ ไม่เติมน้ำตาลเพิ่ม",
      en: "Clear-broth noodles with vegetables and meat, no extra sugar",
    },
  ],
  dinner: [
    {
      th: "ผัดผักหลายชนิด + ปลานึ่งหรือย่าง + ข้าวพอประมาณ",
      en: "Mixed stir-fried vegetables, steamed or grilled fish, a moderate amount of rice",
    },
    {
      th: "ยำหรือสลัดอกไก่ ผักสดเยอะ น้ำสลัดแต่น้อย",
      en: "Chicken-breast salad with plenty of vegetables and a little dressing",
    },
  ],
  snack: [
    { th: "ผลไม้สดหนึ่งกำมือ", en: "A handful of fresh fruit" },
    {
      th: "โยเกิร์ตรสธรรมชาติหรือถั่วไม่ใส่เกลือ",
      en: "Plain yoghurt or unsalted nuts",
    },
  ],
};

const DOCTOR: L = {
  th: "แผนนี้เป็นแนวทางสร้างนิสัยทั่วไป ไม่ใช่การรักษา ควรทำตามคำแนะนำของแพทย์ของคุณเสมอ",
  en: "This is general habit guidance, not treatment. Always follow your own doctor's advice.",
};
const EMERGENCY: L = {
  th: "ถ้ามีอาการรุนแรงหรือผิดปกติฉับพลัน ให้พบแพทย์ทันทีหรือโทร 1669",
  en: "If you have severe or sudden symptoms, see a doctor at once or call 1669.",
};

const WEEK_ACTIVE: L[] = [
  { th: "เดินเร็วหรือขยับตัวต่อเนื่อง", en: "Brisk walk or steady movement" },
  { th: "ยืดเหยียดหรือโยคะเบาๆ", en: "Stretching or gentle yoga" },
  {
    th: "ออกกำลังด้วยน้ำหนักตัวเบาๆ (สควอต ดันพื้นกับผนัง)",
    en: "Light bodyweight work (squats, wall push-ups)",
  },
  { th: "วันพัก เดินเบาๆ", en: "Rest day, easy walking" },
  { th: "เดินเร็วหรือปั่นจักรยาน", en: "Brisk walk or cycling" },
  {
    th: "กิจกรรมที่ชอบ เช่น ว่ายน้ำ เต้น เดินสวน",
    en: "Something you enjoy: swimming, dancing, a park walk",
  },
  {
    th: "พักผ่อน และวางแผนอาหารของสัปดาห์หน้า",
    en: "Rest, and plan next week's meals",
  },
];
const WEEK_CALM: L[] = [
  {
    th: "เริ่มสัปดาห์ด้วยเวลาตื่นนอนที่คงที่",
    en: "Start the week with a steady wake-up time",
  },
  {
    th: "ทบทวนว่าเมื่อวานนอนหลับเป็นอย่างไร",
    en: "Look back at how last night's sleep felt",
  },
  {
    th: "ลองผ่อนคลาย 10 นาทีก่อนนอน",
    en: "Try 10 minutes of winding down before bed",
  },
  { th: "ลดเวลาหน้าจอตอนเย็น", en: "Cut evening screen time" },
  {
    th: "ขยับตัวกลางแจ้งช่วงเช้าหรือเย็น",
    en: "Move outdoors in the morning or evening",
  },
  {
    th: "วันหยุด: ตื่นเวลาใกล้เคียงวันธรรมดา",
    en: "Days off: wake close to your usual time",
  },
  {
    th: "ทบทวนสัปดาห์และเลือกสิ่งที่ได้ผลไว้ทำต่อ",
    en: "Review the week and keep what worked",
  },
];

function buildTasks(rows: [TaskKind, L][], lang: "th" | "en"): ProgramTask[] {
  return rows
    .slice(0, 6)
    .map(([kind, l], i) => ({ key: `t${i + 1}`, kind, text: pick(l, lang) }));
}

function weightProgram(c: ProgramContext): GoalProgram {
  const lang = c.lang;
  const t = c.targets;
  const dir = (c.params as { direction?: string }).direction;
  const rows: [TaskKind, L][] = [
    task(
      "habit",
      "บันทึกอาหารอย่างน้อย 2 มื้อ (ไม่บังคับ แต่ยิ่งบันทึก แผนยิ่งใกล้ความจริง)",
      "Log at least 2 meals (optional, but the more you log the closer the plan gets)",
    ),
    task(
      "move",
      `ขยับตัวให้ได้ราว ${t.activeMinutes ?? 30} นาที เช่น เดินเร็ว ปั่นจักรยาน เต้น`,
      `Be active for about ${t.activeMinutes ?? 30} minutes: brisk walk, cycling, dancing`,
    ),
    task(
      "meal",
      "กินโปรตีนทุกมื้อ (ไข่ ปลา เต้าหู้ เนื้อสัตว์ไม่ติดมัน)",
      "Have some protein at every meal (egg, fish, tofu, lean meat)",
    ),
  ];
  if (dir === "lose")
    rows.push(
      task(
        "meal",
        "เลือกน้ำเปล่าหรือชาไม่หวานแทนเครื่องดื่มหวาน",
        "Choose water or unsweetened tea instead of sweet drinks",
      ),
    );
  else if (dir === "gain")
    rows.push(
      task(
        "meal",
        "เพิ่มของว่างที่มีประโยชน์ 1–2 ครั้ง เช่น นมจืด ถั่ว กล้วย",
        "Add 1–2 nourishing snacks: milk, nuts, a banana",
      ),
    );
  else
    rows.push(
      task(
        "meal",
        "กินให้ครบ 3 มื้อ มีผักและผลไม้ทุกวัน",
        "Eat three meals with vegetables and fruit every day",
      ),
    );
  if (t.waterMl)
    rows.push(
      task(
        "habit",
        `ดื่มน้ำให้ได้ราว ${t.waterMl} มล. ตลอดวัน`,
        `Drink about ${t.waterMl} ml of water through the day`,
      ),
    );
  rows.push(task("sleep", "นอนให้พอราว 7–8 ชั่วโมง", "Sleep about 7–8 hours"));
  const slots = Object.keys(MEAL_IDEAS) as MealType[];
  return {
    summary: pick(
      c.targets.caution
        ? {
            th: "แผนนี้ตั้งจังหวะเบาๆ และค่อยเป็นค่อยไปเพื่อความปลอดภัย เน้นนิสัยเล็กๆ ที่ทำได้ทุกวัน",
            en: "This plan keeps a gentle, gradual pace for safety, built on small habits you can do every day.",
          }
        : {
            th: "แผนรายวันที่เน้นนิสัยเล็กๆ ที่ทำได้จริง: กินให้พอดี ขยับตัว ดื่มน้ำ และนอนให้พอ ตัวเลขเป้าหมายแสดงอยู่ด้านบน",
            en: "A daily plan built on small habits: eat well, move, drink water and sleep enough. Your numbers are shown above.",
          },
      lang,
    ),
    tasks: buildTasks(rows, lang),
    mealIdeas: slots.map((slot) => ({
      slot,
      ideas: MEAL_IDEAS[slot].map((x) => pick(x, lang)),
    })),
    week: WEEK_ACTIVE.map((w, i) => ({ day: i + 1, focus: pick(w, lang) })),
    tips: [
      pick(
        {
          th: "ค่อยๆ เปลี่ยนทีละอย่าง สม่ำเสมอสำคัญกว่าทำให้เป๊ะ",
          en: "Change one thing at a time; steady beats perfect.",
        },
        lang,
      ),
      pick(
        {
          th: "วันที่พลาดไม่เป็นไร กลับมาทำต่อวันถัดไป",
          en: "A slip is fine; pick it up again tomorrow.",
        },
        lang,
      ),
    ],
    watchOuts: [pick(DOCTOR, lang), pick(EMERGENCY, lang)],
  };
}

function sleepProgram(c: ProgramContext): GoalProgram {
  const lang = c.lang;
  const p = c.params as SleepParams;
  const s = c.targets.sleep!;
  const rows: [TaskKind, L][] = [
    task(
      "sleep",
      `เข้านอนราว ${s.bedtime} และตื่น ${s.wake} ให้เป็นเวลาเดิมทุกวัน รวมวันหยุด`,
      `Go to bed around ${s.bedtime} and wake at ${s.wake}, the same every day including days off`,
    ),
    task(
      "habit",
      "วางมือถือและปิดจอก่อนนอน 30–60 นาที",
      "Put the phone away and switch screens off 30–60 minutes before bed",
    ),
    task(
      "mind",
      "ผ่อนคลาย 5–10 นาที เช่น หายใจช้าๆ ยืดเหยียด",
      "Wind down for 5–10 minutes: slow breathing, stretching",
    ),
    task(
      "move",
      "โดนแสงธรรมชาติช่วงเช้า 10–15 นาที และขยับตัวในตอนกลางวัน",
      "Get 10–15 minutes of morning daylight and move during the day",
    ),
    task(
      "meal",
      "เลี่ยงมื้อหนักและแอลกอฮอล์ใกล้เวลานอน",
      "Avoid heavy meals and alcohol close to bedtime",
    ),
  ];
  if (p.caffeine !== "none")
    rows.splice(
      1,
      0,
      task(
        "habit",
        `งดกาแฟ ชา และเครื่องดื่มชูกำลังหลัง ${s.caffeineCutoff}`,
        `No coffee, tea or energy drinks after ${s.caffeineCutoff}`,
      ),
    );
  const byProblem: Record<SleepParams["problem"], L> = {
    fall_asleep: {
      th: "ถ้านอนไม่หลับเกิน 20 นาที ลุกไปทำกิจกรรมเบาๆ ในที่แสงน้อยแล้วค่อยกลับมานอน",
      en: "If you cannot sleep after about 20 minutes, get up, do something quiet in dim light, then return.",
    },
    wake_night: {
      th: "ห้องนอนควรมืด เงียบ และเย็นสบาย และเลี่ยงดื่มน้ำมากก่อนนอน",
      en: "Keep the bedroom dark, quiet and cool, and avoid large drinks just before bed.",
    },
    wake_early: {
      th: "รักษาเวลาเข้านอนให้สม่ำเสมอ และลดแสงจ้าตอนเย็น",
      en: "Keep a steady bedtime and dim bright lights in the evening.",
    },
    sleepy_day: {
      th: "งีบกลางวันไม่เกิน 20–30 นาทีและไม่เลยบ่ายสาม",
      en: "Keep a daytime nap to 20–30 minutes and before mid-afternoon.",
    },
  };
  return {
    summary: pick(
      {
        th: `แผน ${14} วันเพื่อให้หลับลึกขึ้น: จัดเวลาเข้านอน-ตื่นให้สม่ำเสมอและลดสิ่งที่รบกวนก่อนนอน เป้าหมายราว ${s.hours} ชั่วโมงต่อคืน`,
        en: `A 14-day plan for deeper sleep: steady bed and wake times, fewer disturbances before bed. Aim for about ${s.hours} hours a night.`,
      },
      lang,
    ),
    tasks: buildTasks(rows, lang),
    mealIdeas: [],
    week: WEEK_CALM.map((w, i) => ({ day: i + 1, focus: pick(w, lang) })),
    tips: [pick(byProblem[p.problem], lang)],
    watchOuts: [
      pick(
        {
          th: "ถ้านอนไม่หลับเรื้อรังเกิน 3 สัปดาห์ หรือง่วงจัดตอนกลางวัน กรนดังและหยุดหายใจ ควรปรึกษาแพทย์",
          en: "If poor sleep lasts over 3 weeks, or you are very sleepy by day or snore with pauses in breathing, talk to a doctor.",
        },
        lang,
      ),
      pick(EMERGENCY, lang),
    ],
  };
}

function brainProgram(c: ProgramContext): GoalProgram {
  const lang = c.lang;
  const p = c.params as BrainParams;
  const aim: Record<BrainParams["aim"], [TaskKind, L]> = {
    focus: task(
      "habit",
      "ทำงานเป็นช่วง 25–50 นาที แล้วพัก 5–10 นาที",
      "Work in 25–50 minute blocks with 5–10 minute breaks",
    ),
    memory: task(
      "mind",
      "ก่อนนอนทบทวนสิ่งสำคัญของวันและจดสรุปสั้นๆ",
      "Before bed, review the day's key points and note a short summary",
    ),
    stress: task(
      "mind",
      "เขียนระบายความคิดหรือหายใจลึก 5 นาที",
      "Write down your thoughts or breathe deeply for 5 minutes",
    ),
    afternoon_slump: task(
      "move",
      "ลุกเดินหรือยืดเส้น 5–10 นาทีหลังอาหารกลางวัน",
      "Walk or stretch for 5–10 minutes after lunch",
    ),
  };
  const rows: [TaskKind, L][] = [
    aim[p.aim],
    task(
      "move",
      p.sitHours === "gt8"
        ? "ลุกยืดเส้นทุก 1 ชั่วโมง และขยับตัวรวมให้ได้ราว 30 นาที"
        : "ขยับตัวให้ได้ราว 30 นาที เช่น เดินเร็ว",
      p.sitHours === "gt8"
        ? "Stand and stretch every hour and be active about 30 minutes in total"
        : "Be active about 30 minutes, for example a brisk walk",
    ),
    task(
      "meal",
      "กินมื้อเช้าที่มีโปรตีน และกินผักผลไม้หลากสี",
      "Have a breakfast with protein and eat colourful vegetables and fruit",
    ),
    task(
      "habit",
      "ดื่มน้ำให้พอและลดการแจ้งเตือนที่รบกวนตอนทำงาน",
      "Drink enough water and silence distracting notifications while you work",
    ),
    task("sleep", "นอนให้พอราว 7–8 ชั่วโมง", "Sleep about 7–8 hours"),
  ];
  return {
    summary: pick(
      {
        th: "แผน 21 วันเพื่อให้สมองสดใส: นอนให้พอ ขยับตัว กินให้ครบ และจัดช่วงทำงาน-พักให้พอดี",
        en: "A 21-day plan for a sharper mind: enough sleep, movement, balanced meals, and a good work-and-break rhythm.",
      },
      lang,
    ),
    tasks: buildTasks(rows, lang),
    mealIdeas: (["breakfast", "snack"] as MealType[]).map((slot) => ({
      slot,
      ideas: MEAL_IDEAS[slot].map((x) => pick(x, lang)),
    })),
    week: WEEK_CALM.map((w, i) => ({ day: i + 1, focus: pick(w, lang) })),
    tips: [
      pick(
        {
          th: "การนอนและการขยับตัวส่งผลต่อสมาธิมากกว่าที่คิด เริ่มจากสองอย่างนี้ก่อน",
          en: "Sleep and movement affect focus more than people expect; start with those two.",
        },
        lang,
      ),
    ],
    watchOuts: [
      pick(
        {
          th: "ถ้าหลงลืมหรือสับสนผิดปกติ หรือมีอาการทางระบบประสาทใหม่ๆ ควรพบแพทย์",
          en: "If forgetfulness or confusion is unusual, or new neurological symptoms appear, see a doctor.",
        },
        lang,
      ),
      pick(EMERGENCY, lang),
    ],
  };
}

const CONDITION_ROWS: Record<string, [TaskKind, L][]> = {
  gout: [
    task(
      "meal",
      "เลือกโปรตีนจากไข่ เต้าหู้ นมไขมันต่ำ แทนเครื่องในและน้ำซุปข้นๆ",
      "Take protein from eggs, tofu and low-fat milk rather than organ meats and rich broths",
    ),
    task(
      "habit",
      "งดหรือจำกัดแอลกอฮอล์ โดยเฉพาะเบียร์",
      "Avoid or limit alcohol, especially beer",
    ),
    task(
      "habit",
      "ดื่มน้ำสะอาดให้พอตลอดวัน (ตามที่แพทย์แนะนำ)",
      "Drink enough water through the day (as your doctor advises)",
    ),
    task(
      "meal",
      "ลดเครื่องดื่มหวานและน้ำผลไม้",
      "Cut sweet drinks and fruit juice",
    ),
    task(
      "move",
      "ขยับเบาๆ ราว 30 นาที (ถ้ามีอาการปวดข้อ ให้พักตามแพทย์สั่ง)",
      "Move gently for about 30 minutes (rest a painful joint as your doctor says)",
    ),
  ],
  diabetes: [
    task(
      "meal",
      "กินข้าว แป้งในปริมาณพอดี และเพิ่มผักในทุกมื้อ",
      "Keep rice and starch to a sensible amount and add vegetables to every meal",
    ),
    task(
      "meal",
      "เลี่ยงเครื่องดื่มหวานและขนมหวาน",
      "Skip sweet drinks and desserts",
    ),
    task(
      "move",
      "เดินหลังอาหาร 10–15 นาที",
      "Take a 10–15 minute walk after meals",
    ),
    task(
      "habit",
      "ตรวจน้ำตาลและพบแพทย์ตามที่แพทย์แนะนำ",
      "Check your sugar and see your doctor as advised",
    ),
  ],
  hypertension: [
    task(
      "meal",
      "ลดเค็ม: ชิมก่อนปรุง ลดน้ำจิ้ม น้ำซุป และอาหารแปรรูป",
      "Cut salt: taste before seasoning, go easy on dips, soups and processed food",
    ),
    task(
      "meal",
      "เพิ่มผักผลไม้ในทุกมื้อ",
      "Add vegetables and fruit to every meal",
    ),
    task("move", "ขยับตัวราว 30 นาที", "Be active about 30 minutes"),
    task(
      "habit",
      "วัดความดันตามที่แพทย์แนะนำ",
      "Measure your blood pressure as your doctor advises",
    ),
  ],
  dyslipidemia: [
    task(
      "meal",
      "เลือกต้ม นึ่ง ย่าง แทนทอด",
      "Choose boiled, steamed or grilled over fried",
    ),
    task(
      "meal",
      "ลดกะทิ มันสัตว์ และหนังสัตว์",
      "Cut coconut milk, animal fat and skin",
    ),
    task(
      "meal",
      "เพิ่มผักและธัญพืชไม่ขัดสี",
      "Add vegetables and whole grains",
    ),
    task("move", "ขยับตัวราว 30 นาที", "Be active about 30 minutes"),
  ],
  fatty_liver: [
    task(
      "habit",
      "ไม่ดื่มแอลกอฮอล์หรือจำกัดตามที่แพทย์แนะนำ",
      "No alcohol, or limit it as your doctor advises",
    ),
    task(
      "meal",
      "ลดเครื่องดื่มหวานและของทอด",
      "Cut sweet drinks and fried food",
    ),
    task("move", "ขยับตัวอย่างน้อย 30 นาที", "Be active at least 30 minutes"),
    task(
      "habit",
      "ดูผลตรวจตับล่าสุดและนัดตรวจติดตามกับแพทย์",
      "Look at your latest liver results and keep follow-up visits",
    ),
  ],
  kidney_disease: [
    task("meal", "ลดเค็มและอาหารแปรรูป", "Cut salt and processed food"),
    task(
      "habit",
      "ถามแพทย์หรือนักกำหนดอาหารว่าโปรตีน น้ำ และโพแทสเซียมที่เหมาะกับคุณคือเท่าไร",
      "Ask your doctor or dietitian what protein, fluid and potassium suit you",
    ),
    task("habit", "ไปพบแพทย์ตามนัด", "Keep your appointments"),
  ],
  heart_disease: [
    task(
      "meal",
      "ลดเค็ม ลดทอด ลดมันสัตว์",
      "Cut salt, fried food and animal fat",
    ),
    task(
      "move",
      "ขยับเบาๆ ตามที่แพทย์อนุญาต",
      "Move gently, as your doctor allows",
    ),
    task(
      "habit",
      "ไปพบแพทย์ตามนัดและสังเกตอาการ",
      "Keep appointments and watch for symptoms",
    ),
  ],
};

function conditionProgram(c: ProgramContext): GoalProgram {
  const lang = c.lang;
  const p = c.params as ConditionParams;
  const rows: [TaskKind, L][] = [
    ...(CONDITION_ROWS[p.condition] ?? []),
    task(
      "habit",
      "บันทึกอาหารอย่างน้อย 2 มื้อ เพื่อให้เราช่วยสังเกตเมนูที่ควรระวัง",
      "Log at least 2 meals so we can help spot dishes worth watching",
    ),
  ];
  return {
    summary: pick(
      {
        th: "แผน 28 วันสำหรับดูแลตัวเองควบคู่กับแพทย์: เน้นนิสัยกินและขยับตัวที่เกี่ยวกับโรคของคุณ และให้ระบบช่วยสังเกตเมนูที่ควรระวังจากอาหารที่คุณบันทึก",
        en: "A 28-day plan to look after yourself alongside your doctor: food and movement habits that matter for your condition, with the app watching for dishes worth a second look.",
      },
      lang,
    ),
    tasks: buildTasks(rows, lang),
    mealIdeas: (["breakfast", "lunch", "dinner"] as MealType[]).map((slot) => ({
      slot,
      ideas: MEAL_IDEAS[slot].map((x) => pick(x, lang)),
    })),
    week: WEEK_ACTIVE.map((w, i) => ({ day: i + 1, focus: pick(w, lang) })),
    tips: [
      pick(
        {
          th: "จดคำถามไว้ถามแพทย์ในนัดครั้งถัดไป และใช้พาสปอร์ตสุขภาพสรุปข้อมูลให้แพทย์",
          en: "Write down questions for your next visit and use the Health Passport to summarise your data for your doctor.",
        },
        lang,
      ),
    ],
    watchOuts: [pick(DOCTOR, lang), pick(EMERGENCY, lang)],
  };
}

/** The standard program for a goal, in the person's language. */
export function templateProgram(c: ProgramContext): GoalProgram {
  const byKind: Record<GoalKind, (c: ProgramContext) => GoalProgram> = {
    weight: weightProgram,
    sleep: sleepProgram,
    brain: brainProgram,
    condition: conditionProgram,
  };
  return byKind[c.kind](c);
}
