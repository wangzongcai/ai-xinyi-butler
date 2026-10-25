// =====================================================================
// 贺卡背景图的 Prompt 构建（M9-02）
// 独立成文件的原因：Edge Function 与本地出图测试脚本（scripts/test-card-image.mjs）
// 共用同一份提示词，避免测试与线上各写一套而悄悄漂移。
// 本文件是纯函数，不读环境变量、不发网络请求。
// =====================================================================

export interface CardInput {
  /** birthday 生日 / anniversary 纪念日 / festival 节日 / contact 通用联系人 */
  scene?: string;
  festivalName?: string;
  festivalCode?: string;
  /** 纪念日名称（如「结婚纪念日」），只用于挑选画面意象，不含姓名 */
  anniversaryName?: string;
  relationship?: string;
}

/**
 * 画面规格：把「一个场景画什么」拆成 5 个维度。
 * 拆开写是为了让每个节日都能给出具体物件与配色，而不是一句泛泛的风格词。
 */
interface StyleSpec {
  /** 画面主题（一句话定调） */
  theme: string;
  /** 关键元素（模型最敏感的部分，写具体物件） */
  elements: string;
  /** 光线与氛围 */
  light: string;
  /** 配色（主色 + 点缀色） */
  palette: string;
  /** 材质与画面质感 */
  medium: string;
}

// =====================================================================
// 场景 → 画面规格
// 节日按 code 匹配（名称可能被后台改写，code 更稳定），生日 / 纪念日 / 通用另设。
// =====================================================================

/** 12 个内置节日的画面规格。 */
const FESTIVAL_STYLES: Record<string, StyleSpec> = {
  new_year: {
    theme: "跨年夜的金色光斑与烟火",
    elements: "远处升起的细碎烟花、漂浮的金色光点、两只香槟杯的柔焦剪影、垂落的缎带",
    light: "夜色中的暖金逆光，光晕柔和扩散，不刺眼",
    palette: "深靛蓝夜空 + 香槟金，点缀少量银白",
    medium: "精致夜景摄影质感，柔和散景与细腻胶片颗粒",
  },
  spring_festival: {
    theme: "中国春节的年味与暖意",
    elements: "悬挂的红灯笼、剪纸窗花、斜伸的梅花枝、金色祥云纹样、散落的红色纸片",
    light: "暖黄灯光从侧上方照下，红金表面有柔和反光",
    palette: "中国红 + 鎏金 + 少量墨黑压暗",
    medium: "新中式年画与静物摄影融合质感，纸纹与金箔细节清晰",
  },
  lantern: {
    theme: "元宵夜的灯与月",
    elements: "悬挂的圆形花灯、一轮暖色满月、白瓷碗里的汤圆与木勺、成串的小灯",
    light: "夜色里温柔的暖黄灯光，灯纸透光",
    palette: "暖橙 + 绛红 + 黛蓝夜色",
    medium: "细腻插画质感，灯笼纸面的纤维纹理",
  },
  valentines_day: {
    theme: "情人节的心动氛围",
    elements: "盛放的深红玫瑰、丝缎缎带、柔和的心形光斑、半开的巧克力礼盒",
    light: "柔和的侧逆光，花瓣边缘有细微高光与半透明感",
    palette: "玫瑰粉 + 酒红 + 香槟金",
    medium: "高级静物摄影质感，浅景深，花瓣与缎面的材质层次清晰",
  },
  womens_day: {
    theme: "妇女节的春日花意",
    elements: "郁金香与洋桔梗花束、舒展的嫩绿枝叶、飘落的花瓣",
    light: "清晨明亮柔光，通透干净",
    palette: "奶油白 + 蜜桃粉 + 新绿",
    medium: "明亮通透的花艺摄影质感，花瓣脉络细腻",
  },
  mothers_day: {
    theme: "母亲节的安静温情",
    elements: "康乃馨花束、冒着热气的茶杯、一小团针织毛线、洒在桌面上的窗光",
    light: "午后斜射的暖阳，落下柔和的长影",
    palette: "奶油色 + 浅粉 + 蜜糖棕",
    medium: "温暖家居摄影质感，棉麻织物与木纹肌理",
  },
  fathers_day: {
    theme: "父亲节的沉稳力量",
    elements: "胡桃木桌面、深色钢笔与摊开的笔记本、一杯黑咖啡、墨绿盆栽",
    light: "低角度暖光，木质与皮革纹理被侧光勾勒",
    palette: "胡桃木棕 + 墨绿 + 暖金",
    medium: "质感静物摄影，木纹与皮面细节扎实",
  },
  dragon_boat: {
    theme: "端午的草木清香",
    elements: "棉线捆扎的粽叶粽子、艾草与菖蒲、绣花香囊、远处水波上的龙舟剪影",
    light: "夏日水边的明亮自然光，水面有细碎高光",
    palette: "青翠绿 + 艾草灰绿 + 米白",
    medium: "清新自然的静物摄影质感，叶脉清晰",
  },
  qixi: {
    theme: "七夕的星河之夜",
    elements: "淡银河与漫天星点、鹊桥剪影、两盏漂浮的小灯笼、飘动的丝带",
    light: "月光与星光的冷调主光，暖色灯笼作点缀",
    palette: "深蓝紫 + 银白 + 暖金点缀",
    medium: "梦幻星空插画质感，细腻星尘颗粒与光晕",
  },
  mid_autumn: {
    theme: "中秋的团圆月色",
    elements: "一轮暖色满月、桂花枝与飘落的桂花、白瓷盘里的月饼、一套茶盏",
    light: "柔和月色与暖黄灯光交织，月晕朦胧",
    palette: "暖金 + 米白 + 深蓝夜空",
    medium: "新中式插画质感，月色晕染与纸纹肌理",
  },
  chongyang: {
    theme: "重阳的秋山菊意",
    elements: "金菊小丛、层叠远山、茱萸枝、薄雾中的石阶",
    light: "秋日低角度暖光穿过薄雾，空气感明显",
    palette: "金黄 + 赭石 + 雾灰",
    medium: "写意山水插画质感，留白与纸本肌理",
  },
  christmas: {
    theme: "圣诞的暖灯与松雪",
    elements: "松枝与松果、暖黄色灯串、红色丝绒缎带、窗外飘落的雪与冷蓝夜色",
    light: "室内暖黄灯光与窗外冷蓝雪光对比",
    palette: "松绿 + 正红 + 暖金",
    medium: "精致节日静物摄影质感，暖光散景与绒面细节",
  },
};

/** 生日场景。 */
const BIRTHDAY_STYLE: StyleSpec = {
  theme: "生日烛光下的温柔时刻",
  elements: "单层奶油蛋糕、点燃的细长蜡烛、漂浮的磨砂气球、系着丝带的礼盒、散落的花瓣与彩纸",
  light: "烛光作为主光源，暖金反光柔和地铺满画面",
  palette: "奶油白 + 蜜桃粉 + 香槟金",
  medium: "精致静物摄影质感，奶油与糖霜纹理清晰，浅景深",
};

/** 纪念日兜底（未命中具体名称时）。 */
const ANNIVERSARY_STYLE: StyleSpec = {
  theme: "纪念日里成双的温柔意象",
  elements: "成对的两只杯子、并排盛开的两朵花、轻轻交叠的缎带、桌面上的柔光",
  light: "傍晚的金色斜光，投下柔和的长影",
  palette: "暮金 + 玫瑰粉 + 米色",
  medium: "复古胶片摄影质感，细腻颗粒，浅景深",
};

/** 通用联系人场景。 */
const CONTACT_STYLE: StyleSpec = {
  theme: "日常里的一份心意",
  elements: "窗台上的绿植与摊开的书、一杯热茶、纱帘投下的柔光窗影",
  light: "清晨透过纱帘的自然光，安静通透",
  palette: "莫兰迪灰绿 + 米白 + 淡木色",
  medium: "安静的生活静物摄影质感，织物与纸页肌理细腻",
};

/** 节日兜底（未命中具名节日时），保持喜庆但不俗艳。 */
const FESTIVAL_FALLBACK_STYLE: StyleSpec = {
  theme: "温暖喜庆的节日氛围",
  elements: "柔和的金色光点、成簇的暖色花朵、飘落的纸带、模糊的灯串",
  light: "暖金色光晕从侧后方漫过来，柔和扩散",
  palette: "暖金 + 砖红 + 奶油色",
  medium: "精致插画与静物摄影融合质感，光斑细腻",
};

/**
 * 纪念日名称 → 具体意象。用户自定义的「结婚纪念日」「相识纪念日」等，
 * 直接决定画面里摆什么，比只区分「生日 / 纪念日」贴切得多。
 */
const ANNIVERSARY_KEYWORDS: [RegExp, StyleSpec][] = [
  [
    /结婚|婚礼|婚姻|婚|定情/,
    {
      theme: "婚姻纪念日的隽永时刻",
      elements: "两枚交叠的戒指、香槟杯、白色花束、飘落的丝带与花瓣",
      light: "温柔的侧光，金属与玻璃表面有细腻高光",
      palette: "香槟金 + 珍珠白 + 淡玫瑰",
      medium: "高级婚礼静物摄影质感，缎面与花瓣层次细腻",
    },
  ],
  [
    /相识|认识|相遇|初见|第一次|初次/,
    {
      theme: "初遇那天的温柔回忆",
      elements: "两张微微交叠的旧照片、两杯尚有余温的咖啡、一封手写信与干花书签",
      light: "午后窗光斜落，光斑温暖",
      palette: "暖棕 + 米白 + 淡茶色",
      medium: "复古胶片摄影质感，纸张与干花的细节真实",
    },
  ],
  [
    /恋|在一起|交往|告白|表白|牵手|情侣/,
    {
      theme: "相伴时光里的心动",
      elements: "并肩的两人柔焦剪影、盛开的玫瑰、心形暖色光斑、系着缎带的小礼盒",
      light: "黄昏暖光从背后打来，形成柔和轮廓光",
      palette: "玫瑰粉 + 暮金 + 奶白",
      medium: "浪漫胶片摄影质感，光斑虚化细腻",
    },
  ],
  [
    /毕业|校园|同学|入学/,
    {
      theme: "毕业纪念的夏日回忆",
      elements: "旧书与干花书签、夏日树影、飘起的纸飞机、草地上的野花",
      light: "夏日午后的明亮光斑透过树叶",
      palette: "草绿 + 米黄 + 天青",
      medium: "清新柔和的胶片质感，树影斑驳",
    },
  ],
  [
    /宝宝|出生|孩子|满月|周岁/,
    {
      theme: "迎接小生命的柔软时刻",
      elements: "一双小小的婴儿鞋、柔软的毛毯、飘浮的彩色气球、一小束雏菊",
      light: "柔和的散射光，画面明亮干净",
      palette: "奶油白 + 淡蓝 + 浅蜜桃",
      medium: "柔和细腻的摄影质感，织物蓬松感明显",
    },
  ],
];

/** 节日中文名 → 画面规格（没有 code 时兜底）。 */
function festivalStyleByName(name: string | undefined): StyleSpec | null {
  if (!name) return null;
  const pairs: [string, string][] = [
    ["春节", "spring_festival"],
    ["元宵", "lantern"],
    ["情人节", "valentines_day"],
    ["妇女", "womens_day"],
    ["母亲", "mothers_day"],
    ["父亲", "fathers_day"],
    ["端午", "dragon_boat"],
    ["七夕", "qixi"],
    ["中秋", "mid_autumn"],
    ["重阳", "chongyang"],
    ["圣诞", "christmas"],
    ["元旦", "new_year"],
    ["新年", "new_year"],
  ];
  const hit = pairs.find(([keyword]) => name.includes(keyword));
  return hit ? FESTIVAL_STYLES[hit[1]] ?? null : null;
}

/** 按场景挑选画面规格。 */
function styleFor(input: CardInput): StyleSpec {
  if (input.scene === "birthday") return BIRTHDAY_STYLE;
  if (input.scene === "anniversary") {
    const name = input.anniversaryName?.trim();
    if (name) {
      const hit = ANNIVERSARY_KEYWORDS.find(([pattern]) => pattern.test(name));
      if (hit) return hit[1];
    }
    return ANNIVERSARY_STYLE;
  }
  if (input.scene === "festival") {
    return (
      (input.festivalCode ? FESTIVAL_STYLES[input.festivalCode] : undefined) ??
      festivalStyleByName(input.festivalName) ??
      FESTIVAL_FALLBACK_STYLE
    );
  }
  return CONTACT_STYLE;
}

/**
 * 关系 → 情感基调。同一张背景图，送给伴侣和送给客户应该不一样。
 * 只做语气与氛围的微调，不改画面主体。
 */
function relationshipTone(relationship: string | undefined): string | null {
  const r = relationship?.trim();
  if (!r) return null;
  if (/丈夫|妻子|老公|老婆|爱人|男友|女友|男朋友|女朋友|恋人|对象|情侣|宝贝|媳妇/.test(r)) {
    return "亲密伴侣之间，可以浪漫、私密、有温度";
  }
  if (/妈|母亲|爸|父亲|父母|爷爷|奶奶|外公|外婆|长辈/.test(r)) {
    return "送给长辈，温暖、敬重、有家常的烟火气";
  }
  if (/儿子|女儿|孩子|宝宝|侄|甥|孙/.test(r)) {
    return "送给孩子，明亮、柔和、带一点童真";
  }
  if (/同事|领导|老板|客户|合作|商务|老师|同学|合作伙伴/.test(r)) {
    return "职场或商务关系，画面得体、克制、大方，不要过分亲密";
  }
  return "朋友或熟人之间，温暖自然、不逾矩";
}

/**
 * M9-02：Prompt 模板。
 * 结构固定为「主题 + 元素 + 光线 + 配色 + 质感 + 构图 + 禁止项」，
 * 元素与配色写到具体物件与颜色，避免模型退化成一句泛泛的「温暖节日感」。
 */
export function buildPrompt(input: CardInput): string {
  const spec = styleFor(input);
  const tone = relationshipTone(input.relationship);

  // 把节日 / 纪念日名称直接写进 Prompt：模型据此二次确认场景，避免只有风格描述时画跑偏
  const occasion =
    input.scene === "festival" && input.festivalName
      ? `【节日】${input.festivalName}`
      : input.scene === "anniversary" && input.anniversaryName
        ? `【纪念日】${input.anniversaryName}`
        : input.scene === "birthday"
          ? "【场合】生日"
          : null;

  const lines: string[] = [
    "生成一张用于电子贺卡的精美背景插画，竖版 3:4。",
    "",
    ...(occasion ? [occasion] : []),
    `【画面主题】${spec.theme}`,
    `【关键元素】${spec.elements}`,
    `【光线氛围】${spec.light}`,
    `【配色】${spec.palette}`,
    `【质感】${spec.medium}`,
  ];
  if (tone) lines.push(`【情感基调】${tone}`);
  lines.push(
    "",
    "【构图】",
    "1. 竖版 3:4。主体位于画面上部三分之一，靠近视觉中心；",
    "2. 画面下部三分之一保持通透、低对比，留给后期叠加祝福文字；",
    "3. 要有前景、中景、背景三层：前景少量虚化元素，背景柔和光斑，拉开空间感；",
    "4. 主体不贴边，四周留出舒适的呼吸空间。",
    "",
    "【必须避免】",
    "- 不得出现任何文字、拼音、字母、数字、书法、印章、logo、水印、二维码；",
    "- 不出现清晰人脸、手部特写与完整人物全身；",
    "- 不加边框、相框，不模拟卡片排版，不做多图拼贴；",
    "- 不出现恐怖、血腥、暴力、政治与宗教符号；",
    "- 不要大面积单调的纯色渐变，不要平铺直叙的极简构图——画面要有细节、光影层次与材质对比。",
  );
  return lines.join("\n");
}
