"use strict";

function cloneEquippedItemOptions(options) {
  return Array.isArray(options) ? options.map((option) => ({ ...option })) : undefined;
}

function cloneEquippedItem(item) {
  if (!item || typeof item !== "object") return item;
  return {
    ...item,
    ...(item.options ? { options: cloneEquippedItemOptions(item.options) } : {}),
  };
}

function equipmentEntryId(entry) {
  if (!entry) return null;
  return typeof entry === "string" ? entry : entry.id || null;
}

function resolveEquippedItem(entry) {
  const itemId = equipmentEntryId(entry);
  if (!itemId) return null;
  const base = EQUIPMENT_ITEMS[itemId] || EQUIPMENT_DROPS.find((drop) => drop.id === itemId);
  if (!base && typeof entry !== "object") return null;
  const source = typeof entry === "object" ? entry : base;
  return {
    ...(base || {}),
    ...(source || {}),
    ...(source?.options ? { options: cloneEquippedItemOptions(source.options) } : base?.options ? { options: cloneEquippedItemOptions(base.options) } : {}),
  };
}

function ensureCharacterEquipment(character) {
  const defaults = DEFAULT_EQUIPMENT_BY_MEMBER[character.id] || DEFAULT_EQUIPMENT_BY_JOB[character.job] || {};
  if (!character.equipment) character.equipment = {};
  for (const { key: slot } of EQUIPMENT_SLOTS) {
    const current = character.equipment[slot];
    if (current == null && Object.prototype.hasOwnProperty.call(character.equipment, slot)) {
      character.equipment[slot] = null;
    } else {
      const resolved = resolveEquippedItem(current);
      character.equipment[slot] = resolved ? (typeof current === "string" ? resolved.id : cloneEquippedItem(resolved)) : defaults[slot] || null;
    }
  }
  return character.equipment;
}

function formatSetBonusLine(set) {
  const labels = { maxHp: "HP", atk: "ATK", def: "DEF", dex: "DEX", luc: "LUC" };
  const parts = ["maxHp", "atk", "def", "dex", "luc"]
    .filter((key) => set.bonus[key])
    .map((key) => `${labels[key]}+${set.bonus[key]}`);
  return parts.length ? `${set.name}<br>${parts.join(" ")}` : set.name;
}

function formatActiveSetBonuses(character) {
  const sets = getActiveSetBonuses(character);
  if (!sets.length) return "";
  return `<div class="member-set-bonus"><span>セット効果：</span><strong>${sets
    .map(formatSetBonusLine)
    .join("<br>")}</strong></div>`;
}

const SET_BONUSES = [
  {
    name: "失われた玉座",
    items: ["blackKingRing", "kinglessSword"],
    bonus: {
      atk: 2,
      luc: 3,
    },
  },
  {
    name: "灰の継承者",
    items: ["ashGrimoire", "ashenVestment"],
    bonus: {
      luc: 3,
      maxHp: 5,
    },
  },
  {
    name: "巡礼の誓い",
    items: ["pilgrimStaff", "pilgrimVestment", "pilgrimShoes"],
    bonus: {
      maxHp: 5,
      luc: 2,
    },
  },
];

function emptyEquipmentBonus() {
  return { maxHp: 0, atk: 0, def: 0, dex: 0, luc: 0, criticalRate: 0 };
}

function characterBaseAtk(character, fallback = 0) {
  const jobAtk = JOB_STATS?.[character?.job]?.atk;
  if (!Number.isFinite(jobAtk)) return Number(fallback) || 0;
  const level = Math.max(1, Number(character?.level) || 1);
  return jobAtk + Math.floor((level - 1) * 1.5);
}

function equipmentIds(character) {
  const equipment = ensureCharacterEquipment(character || {});
  return EQUIPMENT_SLOTS.map(({ key }) => equipmentEntryId(equipment[key])).filter(Boolean);
}

function getActiveSetBonuses(character) {
  const equipped = new Set(equipmentIds(character));
  return SET_BONUSES.filter((set) =>
    set.items.every((itemId) => equipped.has(itemId))
  );
}

function getEquipmentStatusStrikeRates(character) {
  if (!character) return { blind: 0, poison: 0 };
  const equipment = ensureCharacterEquipment(character);
  return Object.values(equipment).reduce(
    (rates, entry) => {
      const item = resolveEquippedItem(entry);
      if (!item) return rates;
      for (const option of item.options || []) {
        const level = Number(option?.level) || 0;
        if (level <= 0) continue;
        if (option.id === "blindStrike") rates.blind += level * 0.05;
        if (option.id === "poisonStrike") rates.poison += level * 0.05;
      }
      return rates;
    },
    { blind: 0, poison: 0 }
  );
}

function applyEquipmentOptionBonus(optionBonus, item) {
  const options = Array.isArray(item?.options) ? item.options : [];
  for (const option of options) {
    const level = Number(option?.level) || 0;
    if (level <= 0) continue;
    if (option.id === "attackUp") optionBonus.attackUpAtk += level * 2;
    if (option.id === "attackPercent") optionBonus.attackPercentRate += level * 0.05;
    if (option.id === "hpUp") optionBonus.maxHp += level * 5;
    if (option.id === "hpPercent") optionBonus.hpPercentRate += level * 0.05;
    if (option.id === "criticalRate") optionBonus.criticalRate += level * 0.01;
  }
  return optionBonus;
}

function equipmentPlusValue(item, key) {
  const baseValue = Number(item?.[key]) || 0;
  const plus = Math.max(0, Number(item?.plus) || 0);
  if (!baseValue || plus <= 0) return baseValue;
  return baseValue + plus;
}

function getEquipmentBonus(character, baseAtkOverride = null) {
  if (!character) return emptyEquipmentBonus();
  const equipment = ensureCharacterEquipment(character);
  const optionBonus = { maxHp: 0, attackUpAtk: 0, attackPercentRate: 0, hpPercentRate: 0, criticalRate: 0 };
  const bonus = Object.values(equipment).reduce(
    (bonus, entry) => {
      const item = resolveEquippedItem(entry);
      if (!item) return bonus;
      bonus.maxHp += equipmentPlusValue(item, "maxHp");
      bonus.atk += equipmentPlusValue(item, "atk");
      bonus.def += equipmentPlusValue(item, "def");
      bonus.dex += equipmentPlusValue(item, "dex");
      bonus.luc += equipmentPlusValue(item, "luc");
      applyEquipmentOptionBonus(optionBonus, item);
      return bonus;
    },
    emptyEquipmentBonus()
  );

  for (const set of getActiveSetBonuses(character)) {
    bonus.maxHp += set.bonus.maxHp || 0;
    bonus.atk += set.bonus.atk || 0;
    bonus.def += set.bonus.def || 0;
    bonus.dex += set.bonus.dex || 0;
    bonus.luc += set.bonus.luc || 0;
  }

  const baseAtk = characterBaseAtk(character, baseAtkOverride);
  if (optionBonus.attackPercentRate > 0 && baseAtk > 0) {
    bonus.atk += Math.round(baseAtk * optionBonus.attackPercentRate);
  }
  const jobBaseMaxHp = (JOB_STATS?.[character?.job]?.maxHp || 0) + (Math.max(1, Number(character?.level) || 1) - 1) * 5;
  const hpPercentBase = Math.max(0, jobBaseMaxHp + bonus.maxHp + optionBonus.maxHp);
  if (optionBonus.hpPercentRate > 0 && hpPercentBase > 0) {
    bonus.maxHp += Math.round(hpPercentBase * optionBonus.hpPercentRate);
  }
  bonus.atk += optionBonus.attackUpAtk;
  bonus.maxHp += optionBonus.maxHp;
  bonus.criticalRate += optionBonus.criticalRate;

  return bonus;
}

function formatEquipmentLine(item) {
  if (!item) return "なし";
  const labels = { maxHp: "HP", atk: "ATK", def: "DEF", dex: "DEX", luc: "LUC" };
  const parts = ["maxHp", "atk", "def", "dex", "luc"]
    .filter((key) => item[key])
    .map((key) => `${labels[key]}+${item[key]}`);
  return parts.length ? `${item.name}（${parts.join(" / ")}）` : item.name;
}
