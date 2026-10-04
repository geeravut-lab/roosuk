/**
 * Grounding table for Food Scan (docs/ROOSUK-MASTER-PLAN.md §8.1 layer 2): the
 * model only IDENTIFIES the dish and the portion; when the dish is in this
 * table the numbers come from here, not from the model's imagination.
 *
 * Values are APPROXIMATE typical amounts for one common street/restaurant
 * serving (rounded), compiled for a draft and NOT yet reviewed by a dietitian —
 * the review is a pre-launch item (master plan §13). They are always shown to
 * the user as estimates. Dishes the model cannot match fall back to its own
 * estimate, flagged as "AI estimate".
 */
export interface FoodEntry {
  key: string;
  th: string;
  en: string;
  /** What "1 serving" is, e.g. "plate" — shown next to the portion. */
  unit: "plate" | "bowl" | "cup" | "piece" | "glass" | "skewer" | "serving";
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

const f = (
  key: string,
  th: string,
  en: string,
  unit: FoodEntry["unit"],
  kcal: number,
  protein_g: number,
  carbs_g: number,
  fat_g: number,
): FoodEntry => ({ key, th, en, unit, kcal, protein_g, carbs_g, fat_g });

export const THAI_FOODS: readonly FoodEntry[] = [
  f("steamed_rice", "ข้าวสวย", "Steamed rice", "bowl", 200, 4, 44, 0.5),
  f("sticky_rice", "ข้าวเหนียว", "Sticky rice", "serving", 200, 4, 44, 0.5),
  f("fried_rice", "ข้าวผัด", "Fried rice", "plate", 520, 14, 70, 20),
  f(
    "basil_pork_rice",
    "ข้าวกะเพราหมูสับ",
    "Basil pork with rice",
    "plate",
    560,
    22,
    62,
    24,
  ),
  f(
    "basil_pork_rice_egg",
    "ข้าวกะเพราหมูสับไข่ดาว",
    "Basil pork with rice and fried egg",
    "plate",
    650,
    28,
    62,
    33,
  ),
  f(
    "chicken_rice",
    "ข้าวมันไก่",
    "Hainanese chicken rice",
    "plate",
    620,
    27,
    78,
    21,
  ),
  f(
    "khao_man_gai_fried",
    "ข้าวมันไก่ทอด",
    "Fried chicken rice",
    "plate",
    700,
    28,
    78,
    29,
  ),
  f(
    "pork_leg_rice",
    "ข้าวขาหมู",
    "Stewed pork leg with rice",
    "plate",
    690,
    27,
    70,
    32,
  ),
  f(
    "crispy_pork_rice",
    "ข้าวหมูกรอบ",
    "Crispy pork with rice",
    "plate",
    700,
    26,
    65,
    38,
  ),
  f(
    "red_pork_rice",
    "ข้าวหมูแดง",
    "Red pork with rice",
    "plate",
    560,
    24,
    75,
    17,
  ),
  f(
    "green_curry_rice",
    "ข้าวแกงเขียวหวานไก่",
    "Green curry chicken with rice",
    "plate",
    600,
    24,
    62,
    30,
  ),
  f("curry_rice", "ข้าวราดแกง", "Curry over rice", "plate", 560, 20, 65, 24),
  f(
    "omelet_rice",
    "ข้าวไข่เจียว",
    "Omelette with rice",
    "plate",
    560,
    18,
    55,
    30,
  ),
  f("pad_thai", "ผัดไทย", "Pad Thai", "plate", 600, 22, 80, 21),
  f("pad_see_ew", "ผัดซีอิ๊ว", "Pad see ew", "plate", 600, 20, 82, 21),
  f(
    "drunken_noodles",
    "ผัดขี้เมา",
    "Drunken noodles",
    "plate",
    600,
    22,
    75,
    24,
  ),
  f("boat_noodles", "ก๋วยเตี๋ยวเรือ", "Boat noodles", "bowl", 250, 14, 32, 7),
  f(
    "noodle_soup_pork",
    "ก๋วยเตี๋ยวหมู",
    "Pork noodle soup",
    "bowl",
    350,
    20,
    45,
    9,
  ),
  f(
    "tom_yum_noodle",
    "ก๋วยเตี๋ยวต้มยำ",
    "Tom yum noodles",
    "bowl",
    400,
    22,
    50,
    12,
  ),
  f(
    "egg_noodle_bbq_pork",
    "บะหมี่หมูแดง",
    "Egg noodles with red pork",
    "bowl",
    420,
    22,
    60,
    11,
  ),
  f("khao_soi", "ข้าวซอย", "Khao soi", "bowl", 650, 28, 62, 33),
  f("tom_yum_goong", "ต้มยำกุ้ง", "Tom yum goong", "bowl", 120, 14, 8, 4),
  f(
    "tom_kha_gai",
    "ต้มข่าไก่",
    "Chicken in coconut soup",
    "bowl",
    300,
    16,
    8,
    23,
  ),
  f(
    "green_curry",
    "แกงเขียวหวานไก่",
    "Green curry with chicken",
    "bowl",
    350,
    20,
    12,
    26,
  ),
  f(
    "massaman",
    "แกงมัสมั่นไก่",
    "Massaman curry with chicken",
    "bowl",
    450,
    22,
    25,
    30,
  ),
  f("papaya_salad", "ส้มตำไทย", "Papaya salad", "plate", 120, 4, 22, 3),
  f("larb_pork", "ลาบหมู", "Spicy minced pork salad", "plate", 220, 22, 8, 12),
  f(
    "grilled_pork_neck",
    "คอหมูย่าง",
    "Grilled pork neck",
    "serving",
    350,
    25,
    4,
    26,
  ),
  f("grilled_chicken", "ไก่ย่าง", "Grilled chicken", "piece", 250, 28, 3, 14),
  f("pork_satay", "หมูสะเต๊ะ", "Pork satay", "skewer", 70, 6, 3, 4),
  f("fried_egg", "ไข่ดาว", "Fried egg", "piece", 90, 6, 0.5, 7),
  f("boiled_egg", "ไข่ต้ม", "Boiled egg", "piece", 75, 6, 0.5, 5),
  f("omelet", "ไข่เจียว", "Thai omelette", "piece", 200, 11, 1, 17),
  f("spring_roll", "ปอเปี๊ยะทอด", "Fried spring roll", "piece", 80, 2, 8, 5),
  f(
    "mango_sticky_rice",
    "ข้าวเหนียวมะม่วง",
    "Mango sticky rice",
    "plate",
    450,
    6,
    80,
    12,
  ),
  f("banana", "กล้วยหอม", "Banana", "piece", 90, 1, 23, 0.3),
  f("fruit_plate", "ผลไม้รวม", "Mixed fruit", "plate", 100, 1, 25, 0.5),
  f("thai_iced_tea", "ชาไทยเย็น", "Thai iced tea", "glass", 250, 2, 40, 9),
  f(
    "iced_coffee_sweet",
    "กาแฟเย็นหวาน",
    "Sweet iced coffee",
    "glass",
    200,
    3,
    32,
    7,
  ),
  f("soft_drink", "น้ำอัดลม", "Soft drink", "glass", 140, 0, 35, 0),
  f("plain_water", "น้ำเปล่า", "Plain water", "glass", 0, 0, 0, 0),
  f("white_bread", "ขนมปังขาว", "White bread", "piece", 75, 2.5, 14, 1),
  f("salad_plain", "สลัดผัก", "Vegetable salad", "bowl", 80, 3, 10, 3),
];

const BY_KEY = new Map(THAI_FOODS.map((x) => [x.key, x]));

export function foodByKey(key: string): FoodEntry | undefined {
  return BY_KEY.get(key);
}
