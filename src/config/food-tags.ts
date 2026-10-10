/**
 * What a dish tends to contain that matters for a few long-term conditions. DRAFT: rough,
 * rounded groupings for one common serving — NOT reviewed by a dietitian or doctor (a
 * pre-launch item, master plan §13). They only drive gentle "keep an eye on this" notes
 * and are never shown as a diagnosis, a dose or a ban on a food.
 */
export const FOOD_TAGS = [
  "purine_high",
  "purine_mod",
  "alcohol",
  "sugar_high",
  "sodium_high",
  "fried",
  "satfat_high",
  "refined_carb",
] as const;
export type FoodTag = (typeof FOOD_TAGS)[number];

/** Tags of the dishes in the Thai food table (src/config/thai-foods.ts), by catalog key. */
export const CATALOG_TAGS: Record<string, readonly FoodTag[]> = {
  steamed_rice: ["refined_carb"],
  sticky_rice: ["refined_carb"],
  fried_rice: ["refined_carb", "sodium_high"],
  curry_rice: ["satfat_high", "sodium_high", "refined_carb"],
  pad_thai: ["refined_carb", "sodium_high", "sugar_high"],
  pad_see_ew: ["refined_carb", "sodium_high"],
  boat_noodles: ["purine_mod", "sodium_high", "refined_carb"],
  khao_soi: ["satfat_high", "sodium_high", "refined_carb"],
  tom_yum_goong: ["purine_mod", "sodium_high"],
  papaya_salad: ["sodium_high"],
  larb_pork: ["purine_mod", "sodium_high"],
  grilled_chicken: ["purine_mod"],
  pork_satay: ["purine_mod", "satfat_high"],
  spring_roll: ["fried"],
  thai_iced_tea: ["sugar_high"],
  soft_drink: ["sugar_high"],
  white_bread: ["refined_carb"],
  basil_pork_rice: ["purine_mod", "sodium_high", "refined_carb"],
  basil_pork_rice_egg: ["purine_mod", "sodium_high", "refined_carb"],
  chicken_rice: ["purine_mod", "refined_carb"],
  khao_man_gai_fried: ["fried", "purine_mod", "refined_carb"],
  pork_leg_rice: ["satfat_high", "purine_mod", "sodium_high", "refined_carb"],
  crispy_pork_rice: ["fried", "satfat_high", "purine_mod", "refined_carb"],
  red_pork_rice: ["sugar_high", "sodium_high", "purine_mod", "refined_carb"],
  green_curry_rice: ["satfat_high", "sodium_high", "refined_carb"],
  omelet_rice: ["refined_carb"],
  drunken_noodles: ["sodium_high", "refined_carb"],
  noodle_soup_pork: ["sodium_high", "purine_mod", "refined_carb"],
  tom_yum_noodle: ["sodium_high", "purine_mod", "refined_carb"],
  egg_noodle_bbq_pork: ["sodium_high", "purine_mod", "refined_carb"],
  tom_kha_gai: ["satfat_high", "sodium_high"],
  green_curry: ["satfat_high", "sodium_high"],
  massaman: ["satfat_high", "sodium_high"],
  grilled_pork_neck: ["satfat_high", "purine_mod"],
  mango_sticky_rice: ["sugar_high", "satfat_high", "refined_carb"],
  iced_coffee_sweet: ["sugar_high"],
};

/**
 * For a name the table does not know (a photo the model described, a barcode product):
 * words, Thai and English, that point to a tag. Thai has no spaces, so these match as text.
 */
export const NAME_PATTERNS: Record<FoodTag, RegExp> = {
  purine_high:
    /เครื่องใน|ตับหมู|ตับไก่|ไส้อ่อน|เซี่ยงจี้|กึ๋น|ซาร์ดีน|ปลากะตัก|แอนโชวี|หอยแมลงภู่|หอยนางรม|หอยเชลล์|หอยแครง|ไข่ปลา|ซุปกระดูก|น้ำสต๊อก|เลือดหมู|ต้มเลือด|liver|organ meat|offal|sardine|anchov|mussel|oyster|scallop|bone broth/i,
  purine_mod:
    /กุ้ง|ปู(?!น)|ปลาหมึก|หอย|เนื้อวัว|เนื้อ(?!ไก่|หมู)|ย่างหมู|ขาหมู|shrimp|prawn|crab|squid|clam|beef|lamb/i,
  alcohol:
    /เบียร์|เหล้า|วิสกี้|ไวน์|สุรา|ค็อกเทล|โซจู|สาเก|beer|wine|whisk|vodka|cocktail|liquor|sake|soju|rum\b|gin\b/i,
  sugar_high:
    /ชาเย็น|ชานม|ไข่มุก|น้ำอัดลม|โกโก้|กาแฟเย็น|น้ำหวาน|น้ำผลไม้|เค้ก|ไอศกรีม|ขนมหวาน|ลูกอม|น้ำเชื่อม|บัวลอย|ทองหยิบ|boba|bubble tea|soda|soft drink|cola|milk tea|cake|ice cream|dessert|candy|juice|sweetened/i,
  sodium_high:
    /บะหมี่กึ่งสำเร็จรูป|มาม่า|ปลาร้า|ปลาเค็ม|ไข่เค็ม|แฮม|ไส้กรอก|แหนม|ผักดอง|กะปิ|เนื้อเค็ม|instant noodle|sausage|ham\b|salted|pickled|bacon|processed meat/i,
  fried: /ทอด|กรอบ|fried|crispy|deep[- ]?fried|tempura/i,
  satfat_high:
    /กะทิ|หมูสามชั้น|มันหมู|หนังไก่|เนย|ครีม|coconut milk|pork belly|butter|cream|fatty/i,
  refined_carb:
    /ขนมปังขาว|ก๋วยเตี๋ยว|บะหมี่|เส้น|พาสต้า|white bread|noodle|pasta|croissant|bagel/i,
};

/** A name that says the sugar (or salt) is left out must not be counted. */
export const SUGAR_FREE =
  /ไม่หวาน|ไม่ใส่น้ำตาล|ไร้น้ำตาล|ซีโร่|zero|sugar[- ]?free|unsweetened|no sugar|diet\b/i;
