/**
 * UI dictionary. Plain data — no React import — so server code, route
 * metadata and client components can all read it.
 *
 * Thai is the source of truth: `en satisfies Dict` makes a missing or extra
 * key a compile error, so the UI can never show a raw key or an empty string.
 * Server code returns error CODES (`err_*` keys), never sentences; the client
 * turns them into text with `errorText`.
 */
export type Lang = "th" | "en";

export const LANGS: readonly Lang[] = ["th", "en"];
export const DEFAULT_LANG: Lang = "th";
export const LANG_COOKIE = "roosuk-lang";

export function isLang(value: unknown): value is Lang {
  return value === "th" || value === "en";
}

const th = {
  // ── common
  appName: "รู้สุข",
  tagline: "AI ที่รู้จักสุขภาพของคุณ",
  loading: "กำลังโหลด…",
  save: "บันทึก",
  cancel: "ยกเลิก",
  continue: "ดำเนินการต่อ",
  close: "ปิด",
  language: "ภาษา",
  langThai: "ไทย",
  langEnglish: "English",
  comingSoonTitle: "กำลังพัฒนา",
  comingSoonBody:
    "ฟีเจอร์นี้อยู่ระหว่างการพัฒนา และจะเปิดให้ใช้งานในเร็ว ๆ นี้",
  skipToContent: "ข้ามไปยังเนื้อหา",

  // ── navigation
  navToday: "วันนี้",
  navTimeline: "ไทม์ไลน์",
  navScan: "สแกน",
  navAsk: "ถาม AI",
  navMore: "เพิ่มเติม",
  navMoreTitle: "เมนูทั้งหมด",
  navSettings: "ตั้งค่า",
  navAdmin: "ผู้ดูแลระบบ",
  navManual: "คู่มือการใช้งาน",
  navGroupDaily: "ประจำวัน",
  navGroupAccount: "บัญชี",
  navGroupAdmin: "ผู้ดูแล",
  navMainLabel: "เมนูหลัก",
  navMobileLabel: "เมนูด้านล่าง",

  // ── landing
  landingHeadline: "AI ที่รู้จักสุขภาพของคุณ",
  landingSub: "ถ่ายรูปอาหาร อัปโหลดผลตรวจ แล้วรู้ว่าวันนี้ควรใส่ใจเรื่องอะไร",
  landingCtaStart: "เริ่มต้นใช้งานฟรี",
  landingCtaLogin: "เข้าสู่ระบบ",
  landingTrial: "ทดลองใช้ฟีเจอร์ครบทุกอย่าง 14 วัน",
  landingDisclaimer:
    "รู้สุขไม่ใช่บริการทางการแพทย์และไม่วินิจฉัยโรค ข้อมูลทั้งหมดเป็นเพียงข้อมูลประกอบการดูแลสุขภาพ หากมีความกังวลควรปรึกษาแพทย์",
  landingPrivacy: "นโยบายความเป็นส่วนตัว",
  landingTerms: "ข้อกำหนดการใช้งาน",

  // ── auth
  authTitleLogin: "เข้าสู่ระบบ",
  authTitleSignup: "สมัครสมาชิก",
  authEmail: "อีเมล",
  authPassword: "รหัสผ่าน",
  authPasswordHint: "อย่างน้อย 8 ตัวอักษร",
  authDisplayName: "ชื่อที่ใช้แสดง (ไม่บังคับ)",
  authSubmitLogin: "เข้าสู่ระบบ",
  authSubmitSignup: "สมัครสมาชิก",
  authSwitchToSignup: "ยังไม่มีบัญชี? สมัครสมาชิก",
  authSwitchToLogin: "มีบัญชีแล้ว? เข้าสู่ระบบ",
  authOr: "หรือ",
  authGoogle: "ดำเนินการต่อด้วย Google",
  authLine: "ดำเนินการต่อด้วย LINE",
  authCheckEmailTitle: "ตรวจสอบอีเมลของคุณ",
  authCheckEmailBody:
    "เราส่งลิงก์ยืนยันไปที่อีเมลของคุณแล้ว กดลิงก์นั้นเพื่อเริ่มใช้งาน",
  authSignOut: "ออกจากระบบ",
  authBackHome: "กลับหน้าแรก",

  // ── error codes (returned by server actions / routes)
  err_unknown: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
  err_invalid_input: "กรุณาตรวจสอบข้อมูลที่กรอกอีกครั้ง",
  err_invalid_credentials: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  err_email_taken: "อีเมลนี้มีบัญชีอยู่แล้ว ลองเข้าสู่ระบบแทน",
  err_weak_password: "รหัสผ่านง่ายเกินไป กรุณาตั้งให้ยาวและเดายากขึ้น",
  err_email_not_confirmed: "กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ",
  err_rate_limited: "ลองบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  err_not_signed_in: "กรุณาเข้าสู่ระบบก่อน",
  err_forbidden: "คุณไม่มีสิทธิ์ทำรายการนี้",
  err_oauth_failed: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  err_line_failed: "เข้าสู่ระบบด้วย LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  err_line_unavailable: "ยังไม่เปิดให้เข้าสู่ระบบด้วย LINE",
  err_line_already_linked: "บัญชี LINE นี้เชื่อมกับผู้ใช้อื่นอยู่แล้ว",
  err_consent_required: "กรุณายอมรับข้อที่จำเป็นทั้งหมดก่อนเริ่มใช้งาน",
  err_save_failed: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  err_not_configured: "ระบบยังตั้งค่าไม่เสร็จ กรุณาติดต่อผู้ดูแล",
  err_feature_off: "ฟีเจอร์นี้ปิดใช้งานชั่วคราว",
  err_quota_exhausted:
    "ใช้สิทธิ์ของแพ็กเกจนี้ครบแล้ว กรุณารอรอบถัดไปหรืออัปเกรดแพ็กเกจ",
  err_fair_use:
    "เดือนนี้มีการใช้งานถี่เกินกว่าที่กำหนด กรุณาลองใหม่เดือนหน้าหรือติดต่อทีมงาน",
  err_ai_suspended: "บัญชีนี้ถูกระงับการใช้ AI ชั่วคราว กรุณาติดต่อทีมงาน",
  err_quota_unavailable: "ตรวจสอบสิทธิ์การใช้งานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",

  // ── plans & usage
  navSubscription: "แพ็กเกจ",
  subTitle: "แพ็กเกจของคุณ",
  subCurrentPlan: "แพ็กเกจปัจจุบัน",
  planName_free: "Free-lite",
  planName_gold: "Gold",
  planName_premium: "Premium",
  subTrialActive: "กำลังทดลองใช้ Premium",
  subTrialDaysLeft: "เหลืออีก {days} วัน (ถึง {date})",
  subTrialEnded:
    "ช่วงทดลองใช้ Premium สิ้นสุดแล้ว ตอนนี้คุณอยู่ในแพ็กเกจ Free-lite ข้อมูลที่บันทึกไว้ยังอยู่ครบ",
  subPaidUntil: "ใช้งานได้ถึง {date}",
  subSuspended: "บัญชีนี้ถูกระงับการใช้ AI ชั่วคราว กรุณาติดต่อทีมงาน",
  subUsageTitle: "การใช้ AI ของคุณ",
  subUsageUnlimited: "ไม่จำกัด",
  subUsageOf: "{used} / {limit} ครั้ง",
  subUsageUsedOnly: "ใช้ไปแล้ว {used} ครั้ง",
  subUsagePerMonth: "ต่อเดือน",
  subUsagePerMonths: "ต่อ {n} เดือน",
  subUsageFull: "ครบแล้ว",
  feature_healthQuiz: "แบบประเมินสุขภาพ",
  feature_aiChat: "ถาม AI",
  feature_foodSnap: "สแกนอาหาร",
  feature_labImport: "สแกนผลแล็บ",
  subPlansTitle: "เปรียบเทียบแพ็กเกจ",
  subPriceFree: "ฟรี",
  subPricePerMonth: "฿{price} / เดือน",
  subPricePerYear: "฿{price} / ปี",
  subYourPlanTag: "แพ็กเกจของคุณ",
  subTimeline: "ไทม์ไลน์ย้อนหลัง",
  subTimelineMonths: "{n} เดือน",
  subVault: "คลังเอกสาร",
  subVaultFiles: "{n} ไฟล์",
  subUnlimited: "ไม่จำกัด",
  subPassport: "Health Passport และสรุปก่อนพบแพทย์",
  subAgent: "AI Health Agent",
  subFamily: "แชร์กับครอบครัว",
  subFamilyMembers: "เพิ่มได้ {n} คน",
  subIncluded: "มี",
  subNotIncluded: "ไม่มี",
  subPayCta: "ชำระเงินด้วย PromptPay — เร็ว ๆ นี้",
  subPayNote:
    "การชำระเงินกำลังพัฒนา ระหว่างนี้คุณใช้งานตามสิทธิ์ของแพ็กเกจปัจจุบันได้ตามปกติ",
  todayTrialBanner: "กำลังทดลองใช้ Premium เหลืออีก {days} วัน",
  todayTrialLink: "ดูแพ็กเกจ",

  // ── consent
  consentTitle: "ก่อนเริ่มใช้งานรู้สุข",
  consentIntro:
    "รู้สุขดูแลข้อมูลสุขภาพของคุณซึ่งเป็นข้อมูลอ่อนไหว เราจึงขอความยินยอมเป็นรายข้อ คุณดูและเปลี่ยนการตัดสินใจได้ภายหลังในหน้าตั้งค่า",
  consentPolicyVersion: "นโยบายฉบับวันที่",
  consentReadPrivacy: "อ่านนโยบายความเป็นส่วนตัว",
  consentReadTerms: "อ่านข้อกำหนดการใช้งาน",
  consentRequiredTag: "จำเป็น",
  consentOptionalTag: "ไม่บังคับ",
  consentSubmit: "ยืนยันและเริ่มใช้งาน",
  consent_terms_privacy:
    "ฉันได้อ่านและยอมรับข้อกำหนดการใช้งานและนโยบายความเป็นส่วนตัว",
  consent_not_medical_service:
    "ฉันเข้าใจว่ารู้สุขไม่ใช่บริการทางการแพทย์ และ AI ไม่วินิจฉัยโรคหรือแทนที่คำแนะนำของแพทย์",
  consent_sensitive_health_data:
    "ฉันยินยอมให้เก็บและประมวลผลข้อมูลสุขภาพของฉัน (ข้อมูลอ่อนไหว) เพื่อให้บริการของรู้สุข",
  consent_ai_processing_cross_border:
    "ฉันยินยอมให้ส่งข้อความ รูปภาพ และข้อมูลที่จำเป็นไปประมวลผลกับผู้ให้บริการ AI ซึ่งอยู่ต่างประเทศ",
  consent_data_region:
    "ฉันรับทราบว่าข้อมูลของฉันถูกเก็บบนเซิร์ฟเวอร์ที่ประเทศ{country} ({region})",
  consent_photos: "ฉันยินยอมให้เก็บรูปอาหารและรูปเอกสารที่ฉันอัปโหลด",
  consent_marketing: "ฉันต้องการรับข่าวสารและโปรโมชันจากรู้สุข",

  // ── settings
  settingsTitle: "ตั้งค่า",
  settingsAccount: "บัญชี",
  settingsEmail: "อีเมล",
  settingsSignInMethods: "การเข้าสู่ระบบด้วย LINE",
  settingsLinkLine: "เชื่อมบัญชี LINE",
  settingsLineLinked: "เชื่อมกับ LINE แล้ว",
  settingsLineHint:
    "เชื่อมแล้วจะเข้าสู่ระบบด้วย LINE ได้ และรับการแจ้งเตือนทาง LINE ได้ในอนาคต",
  settingsLanguage: "ภาษา",
  settingsConsentTitle: "ความยินยอมที่ให้ไว้",
  settingsConsentVersion: "ฉบับวันที่",
  settingsConsentGranted: "ยินยอม",
  settingsConsentDeclined: "ไม่ยินยอม",

  // ── admin
  adminTitle: "ผู้ดูแลระบบ",
  adminFlagsTitle: "สวิตช์ฟีเจอร์",
  adminFlagsHint:
    "ปิดสวิตช์แล้วฟีเจอร์จะหยุดทำงานจริงที่ฝั่งเซิร์ฟเวอร์ มีผลภายใน 1 นาที",
  adminFlagOn: "เปิดอยู่",
  adminFlagOff: "ปิดอยู่",
  adminFlagToggleOn: "เปิด",
  adminFlagToggleOff: "ปิด",
  flag_food_scan: "สแกนอาหาร",
  flag_lab_scan: "สแกนผลแล็บ",
  flag_health_agent: "AI Health Agent",
  flag_wearables: "เชื่อมอุปกรณ์สวมใส่",
  flag_family: "ครอบครัว",
  flag_marketplace: "มาร์เก็ตเพลส",
  flag_booking: "จองตรวจสุขภาพ",
  flag_voice: "สั่งงานด้วยเสียง",

  // ── legal (DRAFT — needs legal + medical-advisor review before launch)
  legalDraftNotice:
    "ร่างเอกสาร — ต้องให้ผู้เชี่ยวชาญด้านกฎหมายและแพทย์ที่ปรึกษาตรวจสอบก่อนเปิดใช้งานจริง",
  privacyTitle: "นโยบายความเป็นส่วนตัว",
  privacy_s1_title: "ข้อมูลที่เรารวบรวม",
  privacy_s1_body:
    "ข้อมูลบัญชี (อีเมลหรือบัญชี Google/LINE ที่คุณใช้เข้าสู่ระบบ ชื่อที่แสดง) ข้อมูลสุขภาพที่คุณให้เรา (เช่น รูปอาหาร ผลตรวจสุขภาพ การบันทึกประจำวัน) และข้อมูลการใช้งานแอปแบบไม่ระบุรายละเอียดส่วนตัว",
  privacy_s2_title: "เราใช้ข้อมูลเพื่ออะไร",
  privacy_s2_body:
    "เพื่อสรุปและอธิบายข้อมูลสุขภาพของคุณ แสดงแนวโน้ม แนะนำสิ่งที่ควรใส่ใจ และช่วยคุณเตรียมตัวคุยกับแพทย์ เราไม่ใช้ AI วินิจฉัยโรค",
  privacy_s3_title: "ผู้ให้บริการที่ประมวลผลข้อมูลแทนเรา",
  privacy_s3_body:
    "ข้อมูลของคุณเก็บบน Supabase ที่เซิร์ฟเวอร์ประเทศ{country} ({region}) และเมื่อคุณใช้ฟีเจอร์ AI ข้อความหรือรูปที่จำเป็นจะถูกส่งไปประมวลผลกับผู้ให้บริการ AI ในต่างประเทศ (Anthropic และ Google) ผ่านบริการ API แบบเสียเงิน",
  privacy_s4_title: "ระยะเวลาเก็บข้อมูล",
  privacy_s4_body:
    "เก็บไว้จนกว่าคุณจะลบบัญชี ข้อมูลธุรกรรมการเงินที่กฎหมายกำหนดให้เก็บจะถูกตัดข้อมูลระบุตัวตนออกแทนการลบ",
  privacy_s5_title: "สิทธิของคุณ",
  privacy_s5_body:
    "คุณมีสิทธิขอสำเนา แก้ไข ลบข้อมูล และถอนความยินยอมได้ตลอดเวลา โดยทำเองได้ในหน้าตั้งค่า (กำลังพัฒนา)",
  privacy_s6_title: "ติดต่อเรา",
  privacy_s6_body:
    "[ใส่ช่องทางติดต่อผู้ควบคุมข้อมูลส่วนบุคคลก่อนเปิดใช้งานจริง]",
  termsTitle: "ข้อกำหนดการใช้งาน",
  terms_s1_title: "รู้สุขไม่ใช่บริการทางการแพทย์",
  terms_s1_body:
    "รู้สุขให้ข้อมูลเพื่อประกอบการดูแลสุขภาพ ไม่ใช่การวินิจฉัย การรักษา หรือคำแนะนำทางการแพทย์ การตัดสินใจเกี่ยวกับสุขภาพควรปรึกษาแพทย์เสมอ",
  terms_s2_title: "ข้อมูลจาก AI อาจคลาดเคลื่อน",
  terms_s2_body:
    "AI อาจอ่านรูปหรือเอกสารผิดพลาด คุณควรตรวจสอบค่าที่ระบบอ่านได้ก่อนบันทึก และไม่ควรใช้ผลจาก AI แทนการตัดสินใจของแพทย์",
  terms_s3_title: "กรณีฉุกเฉิน",
  terms_s3_body:
    "หากมีอาการรุนแรงหรือฉุกเฉิน เช่น เจ็บหน้าอก หายใจลำบาก โทร 1669 ทันที หากรู้สึกอยากทำร้ายตัวเอง โทรสายด่วนสุขภาพจิต 1323",
  terms_s4_title: "แพ็กเกจและการชำระเงิน",
  terms_s4_body:
    "รายละเอียดแพ็กเกจ ราคา และเงื่อนไขการใช้งานจะแสดงในหน้าแพ็กเกจก่อนที่คุณจะชำระเงิน",
} as const;

export type Dict = { [K in keyof typeof th]: string };

const en = {
  appName: "RooSuk",
  tagline: "The AI that knows your health",
  loading: "Loading…",
  save: "Save",
  cancel: "Cancel",
  continue: "Continue",
  close: "Close",
  language: "Language",
  langThai: "ไทย",
  langEnglish: "English",
  comingSoonTitle: "Coming soon",
  comingSoonBody:
    "This feature is under development and will be available soon.",
  skipToContent: "Skip to content",

  navToday: "Today",
  navTimeline: "Timeline",
  navScan: "Scan",
  navAsk: "Ask AI",
  navMore: "More",
  navMoreTitle: "All menus",
  navSettings: "Settings",
  navAdmin: "Admin",
  navManual: "User guide",
  navGroupDaily: "Daily",
  navGroupAccount: "Account",
  navGroupAdmin: "Admin",
  navMainLabel: "Main menu",
  navMobileLabel: "Bottom menu",

  landingHeadline: "The AI that knows your health",
  landingSub:
    "Snap your meals, upload your lab results, and see what deserves your attention today.",
  landingCtaStart: "Start for free",
  landingCtaLogin: "Sign in",
  landingTrial: "Try every feature free for 14 days",
  landingDisclaimer:
    "RooSuk is not a medical service and does not diagnose disease. Everything shown is general health information — talk to a doctor if you have concerns.",
  landingPrivacy: "Privacy policy",
  landingTerms: "Terms of use",

  authTitleLogin: "Sign in",
  authTitleSignup: "Create account",
  authEmail: "Email",
  authPassword: "Password",
  authPasswordHint: "At least 8 characters",
  authDisplayName: "Display name (optional)",
  authSubmitLogin: "Sign in",
  authSubmitSignup: "Create account",
  authSwitchToSignup: "No account yet? Create one",
  authSwitchToLogin: "Already have an account? Sign in",
  authOr: "or",
  authGoogle: "Continue with Google",
  authLine: "Continue with LINE",
  authCheckEmailTitle: "Check your email",
  authCheckEmailBody:
    "We sent a confirmation link to your email. Open it to start using the app.",
  authSignOut: "Sign out",
  authBackHome: "Back to home",

  err_unknown: "Something went wrong. Please try again.",
  err_invalid_input: "Please check the information you entered.",
  err_invalid_credentials: "Incorrect email or password.",
  err_email_taken: "This email already has an account. Try signing in instead.",
  err_weak_password:
    "That password is too weak. Please choose a longer, harder-to-guess one.",
  err_email_not_confirmed: "Please confirm your email before signing in.",
  err_rate_limited: "Too many attempts. Please wait a moment and try again.",
  err_not_signed_in: "Please sign in first.",
  err_forbidden: "You don't have permission to do this.",
  err_oauth_failed: "Sign-in failed. Please try again.",
  err_line_failed: "Sign-in with LINE failed. Please try again.",
  err_line_unavailable: "Sign-in with LINE is not available yet.",
  err_line_already_linked:
    "This LINE account is already linked to another user.",
  err_consent_required: "Please accept all required items before you start.",
  err_save_failed: "Couldn't save. Please try again.",
  err_not_configured:
    "The system isn't fully set up yet. Please contact the administrator.",
  err_feature_off: "This feature is temporarily turned off.",
  err_quota_exhausted:
    "You've used everything your plan includes for now. Please wait for the next period or upgrade.",
  err_fair_use:
    "Usage this month is above the fair-use limit. Please try again next month or contact us.",
  err_ai_suspended:
    "AI is temporarily suspended on this account. Please contact us.",
  err_quota_unavailable:
    "Couldn't check your plan allowance. Please try again.",

  navSubscription: "Plans",
  subTitle: "Your plan",
  subCurrentPlan: "Current plan",
  planName_free: "Free-lite",
  planName_gold: "Gold",
  planName_premium: "Premium",
  subTrialActive: "Premium trial",
  subTrialDaysLeft: "{days} days left (until {date})",
  subTrialEnded:
    "Your Premium trial has ended and you are now on Free-lite. Everything you saved is still here.",
  subPaidUntil: "Active until {date}",
  subSuspended:
    "AI is temporarily suspended on this account. Please contact us.",
  subUsageTitle: "Your AI usage",
  subUsageUnlimited: "Unlimited",
  subUsageOf: "{used} / {limit} uses",
  subUsageUsedOnly: "{used} uses so far",
  subUsagePerMonth: "per month",
  subUsagePerMonths: "per {n} months",
  subUsageFull: "Used up",
  feature_healthQuiz: "Health quiz",
  feature_aiChat: "Ask AI",
  feature_foodSnap: "Food scan",
  feature_labImport: "Lab result scan",
  subPlansTitle: "Compare plans",
  subPriceFree: "Free",
  subPricePerMonth: "฿{price} / month",
  subPricePerYear: "฿{price} / year",
  subYourPlanTag: "Your plan",
  subTimeline: "Timeline history",
  subTimelineMonths: "{n} months",
  subVault: "Document vault",
  subVaultFiles: "{n} files",
  subUnlimited: "Unlimited",
  subPassport: "Health Passport and pre-visit brief",
  subAgent: "AI Health Agent",
  subFamily: "Family sharing",
  subFamilyMembers: "add {n} person",
  subIncluded: "Included",
  subNotIncluded: "Not included",
  subPayCta: "Pay with PromptPay — coming soon",
  subPayNote:
    "Payments are under development. Meanwhile you can keep using everything your current plan includes.",
  todayTrialBanner: "Premium trial: {days} days left",
  todayTrialLink: "See plans",

  consentTitle: "Before you start with RooSuk",
  consentIntro:
    "RooSuk looks after your health data, which is sensitive. We ask for your consent item by item, and you can review or change your choices later in Settings.",
  consentPolicyVersion: "Policy version dated",
  consentReadPrivacy: "Read the privacy policy",
  consentReadTerms: "Read the terms of use",
  consentRequiredTag: "Required",
  consentOptionalTag: "Optional",
  consentSubmit: "Confirm and start",
  consent_terms_privacy:
    "I have read and accept the terms of use and the privacy policy.",
  consent_not_medical_service:
    "I understand RooSuk is not a medical service, and that AI does not diagnose disease or replace a doctor's advice.",
  consent_sensitive_health_data:
    "I consent to my health data (sensitive data) being collected and processed to provide the RooSuk service.",
  consent_ai_processing_cross_border:
    "I consent to my messages, images and necessary data being sent to AI providers located outside Thailand for processing.",
  consent_data_region:
    "I acknowledge my data is stored on servers in {country} ({region}).",
  consent_photos: "I consent to storing the food and document photos I upload.",
  consent_marketing: "I'd like to receive news and promotions from RooSuk.",

  settingsTitle: "Settings",
  settingsAccount: "Account",
  settingsEmail: "Email",
  settingsSignInMethods: "Sign in with LINE",
  settingsLinkLine: "Link your LINE account",
  settingsLineLinked: "Linked with LINE",
  settingsLineHint:
    "Once linked you can sign in with LINE, and receive LINE notifications in the future.",
  settingsLanguage: "Language",
  settingsConsentTitle: "Your consents",
  settingsConsentVersion: "Version dated",
  settingsConsentGranted: "Granted",
  settingsConsentDeclined: "Declined",

  adminTitle: "Admin",
  adminFlagsTitle: "Feature switches",
  adminFlagsHint:
    "Turning a switch off stops the feature on the server, not just in the UI. Takes effect within 1 minute.",
  adminFlagOn: "On",
  adminFlagOff: "Off",
  adminFlagToggleOn: "Turn on",
  adminFlagToggleOff: "Turn off",
  flag_food_scan: "Food scan",
  flag_lab_scan: "Lab result scan",
  flag_health_agent: "AI Health Agent",
  flag_wearables: "Wearable devices",
  flag_family: "Family",
  flag_marketplace: "Marketplace",
  flag_booking: "Check-up booking",
  flag_voice: "Voice input",

  legalDraftNotice:
    "Draft document — must be reviewed by a lawyer and the medical advisor before launch.",
  privacyTitle: "Privacy policy",
  privacy_s1_title: "Information we collect",
  privacy_s1_body:
    "Account information (the email, or Google/LINE account you sign in with, and your display name), the health information you give us (such as food photos, lab results and daily check-ins), and app usage data that does not include personal details.",
  privacy_s2_title: "What we use it for",
  privacy_s2_body:
    "To summarise and explain your health information, show trends, suggest what deserves attention, and help you prepare to talk with a doctor. We do not use AI to diagnose disease.",
  privacy_s3_title: "Providers that process data for us",
  privacy_s3_body:
    "Your data is stored on Supabase servers in {country} ({region}). When you use AI features, the text or images needed are sent to AI providers abroad (Anthropic and Google) through paid API services.",
  privacy_s4_title: "How long we keep it",
  privacy_s4_body:
    "Until you delete your account. Financial transaction records we are legally required to keep are anonymised rather than deleted.",
  privacy_s5_title: "Your rights",
  privacy_s5_body:
    "You may request a copy of, correct or delete your data, and withdraw consent at any time — yourself, from Settings (under development).",
  privacy_s6_title: "Contact us",
  privacy_s6_body: "[Add the data controller's contact details before launch]",
  termsTitle: "Terms of use",
  terms_s1_title: "RooSuk is not a medical service",
  terms_s1_body:
    "RooSuk provides information to support your health care. It is not diagnosis, treatment or medical advice. Always consult a doctor about health decisions.",
  terms_s2_title: "AI output may be wrong",
  terms_s2_body:
    "AI can misread images or documents. Check the values it reads before saving, and never use AI output in place of a doctor's judgement.",
  terms_s3_title: "In an emergency",
  terms_s3_body:
    "If you have severe or urgent symptoms, such as chest pain or difficulty breathing, call 1669 immediately. If you feel like hurting yourself, call the mental health hotline 1323.",
  terms_s4_title: "Plans and payment",
  terms_s4_body:
    "Plan details, prices and conditions are shown on the plans page before you pay.",
} satisfies Dict;

export const dict: Record<Lang, Dict> = { th, en };

/** Fill `{name}` placeholders. Unknown placeholders are left as-is. */
export function fmt(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export type ErrorKey = Extract<keyof Dict, `err_${string}`>;

export function isErrorKey(value: unknown): value is ErrorKey {
  return typeof value === "string" && value.startsWith("err_") && value in th;
}

/** Turn a server error code into text; unknown codes fall back to a generic message. */
export function errorText(code: string | undefined | null, t: Dict): string {
  return isErrorKey(code) ? t[code] : t.err_unknown;
}
