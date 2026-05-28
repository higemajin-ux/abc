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
    name: "旅人一式",
    setId: "traveler",
    requiredCount: 3,
    displayLines: ["放置時間 -10%", "LUC +10"],
    missionDurationKey: "traveler",
    missionDurationRate: 0.1,
    bonus: {
      luc: 10,
    },
  },
];

function emptyEquipmentBonus() {
  return { maxHp: 0, atk: 0, def: 0, dex: 0, luc: 0, criticalRate: 0, criticalDamage: 0 };
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
  const equipment = ensureCharacterEquipment(character || {});
  const equippedItems = Object.values(equipment)
    .map((entry) => resolveEquippedItem(entry))
    .filter(Boolean);
  const equippedIds = new Set(equippedItems.map((item) => item.id).filter(Boolean));
  return SET_BONUSES.filter((set) => {
    if (Array.isArray(set.items) && set.items.length) {
      return set.items.every((itemId) => equippedIds.has(itemId));
    }
    if (set.setId) {
      const count = equippedItems.filter((item) => item.setId === set.setId).length;
      return count >= Math.max(1, Number(set.requiredCount) || 1);
    }
    return false;
  });
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
    if (option.id === "defenseUp") optionBonus.defenseUpDef += level;
    if (option.id === "defensePercent") optionBonus.defensePercentRate += (1 + level * 2) * 0.01;
    if (option.id === "criticalRate") optionBonus.criticalRate += level * 0.01;
    if (option.id === "criticalDamage") optionBonus.criticalDamage += level * 0.1;
  }
  return optionBonus;
}

function equipmentPlusValue(item, key) {
  const baseValue = Number(item?.[key]) || 0;
  const plus = Math.max(0, Number(item?.plus) || 0);
  if (!baseValue || plus <= 0) return baseValue;
  return baseValue + plus;
}

function characterBaseStatMap(character, baseAtkOverride = null) {
  const level = Math.max(1, Number(character?.level) || 1);
  const job = JOB_STATS?.[character?.job] || {};
  return {
    maxHp: (job.maxHp || 0) + (level - 1) * 5,
    atk: baseAtkOverride == null ? characterBaseAtk(character) : Number(baseAtkOverride) || 0,
    def: (job.def || 0) + Math.floor((level - 1) * 0.8),
    dex: character?.baseDex ?? character?.dex ?? job.dex ?? 0,
    luc: character?.baseLuc ?? character?.luc ?? job.luc ?? 0,
  };
}

function getEquipmentStatBreakdown(character, baseAtkOverride = null) {
  if (!character) {
    return {
      base: emptyEquipmentBonus(),
      equipment: emptyEquipmentBonus(),
      option: emptyEquipmentBonus(),
      total: emptyEquipmentBonus(),
    };
  }
  const base = characterBaseStatMap(character, baseAtkOverride);
  const equipment = ensureCharacterEquipment(character);
  const optionBonus = {
    maxHp: 0,
    attackUpAtk: 0,
    attackPercentRate: 0,
    defenseUpDef: 0,
    defensePercentRate: 0,
    hpPercentRate: 0,
    criticalRate: 0,
    criticalDamage: 0,
  };
  const equipmentBonus = Object.values(equipment).reduce(
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
    equipmentBonus.maxHp += set.bonus.maxHp || 0;
    equipmentBonus.atk += set.bonus.atk || 0;
    equipmentBonus.def += set.bonus.def || 0;
    equipmentBonus.dex += set.bonus.dex || 0;
    equipmentBonus.luc += set.bonus.luc || 0;
  }

  const optionStatBonus = emptyEquipmentBonus();
  optionStatBonus.atk += Math.round(base.atk * optionBonus.attackPercentRate);
  optionStatBonus.atk += optionBonus.attackUpAtk;
  optionStatBonus.def += optionBonus.defenseUpDef;
  optionStatBonus.def += Math.round(base.def * optionBonus.defensePercentRate);
  optionStatBonus.maxHp += optionBonus.maxHp;
  const hpPercentBase = Math.max(0, base.maxHp + equipmentBonus.maxHp + optionBonus.maxHp);
  optionStatBonus.maxHp += Math.round(hpPercentBase * optionBonus.hpPercentRate);
  optionStatBonus.criticalRate += optionBonus.criticalRate;
  optionStatBonus.criticalDamage += optionBonus.criticalDamage;

  return {
    base,
    equipment: equipmentBonus,
    option: optionStatBonus,
    total: {
      maxHp: base.maxHp + equipmentBonus.maxHp + optionStatBonus.maxHp,
      atk: base.atk + equipmentBonus.atk + optionStatBonus.atk,
      def: base.def + equipmentBonus.def + optionStatBonus.def,
      dex: base.dex + equipmentBonus.dex + optionStatBonus.dex,
      luc: base.luc + equipmentBonus.luc + optionStatBonus.luc,
      criticalRate: optionStatBonus.criticalRate,
      criticalDamage: optionStatBonus.criticalDamage,
    },
  };
}

function getEquipmentBonus(character, baseAtkOverride = null) {
  if (!character) return emptyEquipmentBonus();
  const breakdown = getEquipmentStatBreakdown(character, baseAtkOverride);
  return {
    maxHp: breakdown.equipment.maxHp + breakdown.option.maxHp,
    atk: breakdown.equipment.atk + breakdown.option.atk,
    def: breakdown.equipment.def + breakdown.option.def,
    dex: breakdown.equipment.dex + breakdown.option.dex,
    luc: breakdown.equipment.luc + breakdown.option.luc,
    criticalRate: breakdown.total.criticalRate,
    criticalDamage: breakdown.total.criticalDamage,
  };
}

function formatEquipmentLine(item) {
  if (!item) return "なし";
  const labels = { maxHp: "HP", atk: "ATK", def: "DEF", dex: "DEX", luc: "LUC" };
  const parts = ["maxHp", "atk", "def", "dex", "luc"]
    .filter((key) => item[key])
    .map((key) => `${labels[key]}+${item[key]}`);
  return parts.length ? `${item.name}（${parts.join(" / ")}）` : item.name;
}
