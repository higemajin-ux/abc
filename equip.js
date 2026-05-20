"use strict";

function ensureCharacterEquipment(character) {
  const defaults = DEFAULT_EQUIPMENT_BY_MEMBER[character.id] || DEFAULT_EQUIPMENT_BY_JOB[character.job] || {};
  if (!character.equipment) character.equipment = {};
  character.equipment.weapon = EQUIPMENT_ITEMS[character.equipment.weapon] ? character.equipment.weapon : defaults.weapon || null;
  character.equipment.armor = EQUIPMENT_ITEMS[character.equipment.armor] ? character.equipment.armor : defaults.armor || null;
  character.equipment.accessory1 = EQUIPMENT_ITEMS[character.equipment.accessory1] ? character.equipment.accessory1 : defaults.accessory1 || null;
  character.equipment.accessory2 = EQUIPMENT_ITEMS[character.equipment.accessory2] ? character.equipment.accessory2 : defaults.accessory2 || null;
  return character.equipment;
}

function getEquipmentBonus(character) {
  const equipment = ensureCharacterEquipment(character);
  return Object.values(equipment).reduce(
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
    { maxHp: 0, atk: 0, def: 0, dex: 0, luc: 0 }
  );
}

function formatEquipmentLine(item) {
  if (!item) return "なし";
  const labels = { maxHp: "HP", atk: "ATK", def: "DEF", dex: "DEX", luc: "LUC" };
  const parts = ["maxHp", "atk", "def", "dex", "luc"]
    .filter((key) => item[key])
    .map((key) => `${labels[key]}+${item[key]}`);
  return parts.length ? `${item.name}（${parts.join(" / ")}）` : item.name;
}
