"use strict";

function ensureCharacterEquipment(character) {
  const defaults = DEFAULT_EQUIPMENT_BY_MEMBER[character.id] || DEFAULT_EQUIPMENT_BY_JOB[character.job] || {};
  if (!character.equipment) character.equipment = {};
  for (const { key: slot } of EQUIPMENT_SLOTS) {
    const current = character.equipment[slot];
    if (current == null && Object.prototype.hasOwnProperty.call(character.equipment, slot)) {
      character.equipment[slot] = null;
    } else {
      character.equipment[slot] = EQUIPMENT_ITEMS[current] ? current : defaults[slot] || null;
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
  return { maxHp: 0, atk: 0, def: 0, dex: 0, luc: 0 };
}

function equipmentIds(character) {
  const equipment = ensureCharacterEquipment(character || {});
  return EQUIPMENT_SLOTS.map(({ key }) => equipment[key]).filter(Boolean);
}

function getActiveSetBonuses(character) {
  const equipped = new Set(equipmentIds(character));
  return SET_BONUSES.filter((set) =>
    set.items.every((itemId) => equipped.has(itemId))
  );
}

function getEquipmentBonus(character) {
  if (!character) return emptyEquipmentBonus();
  const equipment = ensureCharacterEquipment(character);
  const bonus = Object.values(equipment).reduce(
    (bonus, itemId) => {
      const item = EQUIPMENT_ITEMS[itemId];
      if (!item) return bonus;
      bonus.maxHp += item.maxHp || 0;
      bonus.atk += item.atk || 0;
      bonus.def += item.def || 0;
      bonus.dex += item.dex || 0;
      bonus.luc += item.luc || 0;
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
