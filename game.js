"use strict";

let nextId = 1;
let tickId = null;
let worldTickId = null;
let storageRenderCount = -1;
let storageSortMode = "new";
const equipmentFilterRarities = new Set();
const equipmentFilterOptions = new Set();
let equipmentFilterOpen = false;
const openEquipmentSlotsByMemberId = new Map();
const storageFilterKinds = new Set();
const storageFilterRarities = new Set();
const storageFilterOptions = new Set();
const storageOptionCountFilterValues = new Set(["oneOption", "twoOptions", "threeOptions"]);
let storageFilterOpen = false;
let storageAutoSellOpen = false;
let storageBulkSellMode = false;
let storageBulkDismantleMode = false;
let storageFusionMode = false;
// 装備合成UIは現状非公開。合成ロジックは将来用に保持する。
const storageFusionUiEnabled = false;
let storageOptionEnhanceMode = false;
let storageFusionMessage = "";
let storageResultDetailMessage = "";
let storageResultDetailOpen = false;
let storageDismantleResultDetailMessage = "";
let storageDismantleResultOpen = false;
let storageDismantleConfirmState = null;
let storageBulkSellModalState = null;
let storageBulkDismantleModalState = null;
let storageSellConfirmState = null;
let dropToastSerial = 1;
const selectedStorageSellUids = new Set();
const selectedStorageDismantleUids = new Set();
let selectedStorageFusionTargetUid = null;
const selectedStorageFusionMaterialUids = new Set();
const openDetailPartyIds = new Set();
const selectedDetailTabByMemberId = new Map();
const selectedDetailMemberByPartyId = new Map();
const SHORTCUT_REDUCTION_RATE = 0.1;
const MIN_MISSION_DURATION_MS = 5000;
const DEVELOPER_MISSION_DURATION_MS = 6000;
registerDropEquipmentItems();
let state = {
  parties: [defaultParty("pt1", "第一小隊"), defaultParty("pt2", "第二小隊")],
  stats: { gold: 0 },
  areaClears: {},
  storage: [],
  equipmentResearch: {},
  optionFragments: {},
  autoSell: { common: false, uncommon: false },
  records: defaultRecords(),
  developerMode: false,
  areaDetailModalState: null,
};

function $(id) {
  return document.getElementById(id);
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${nextId++}`;
}

function formatClock(ts) {
  return new Date(ts).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function clearButtonFocus(button) {
  if (button && typeof button.blur === "function") button.blur();
}

function defaultStats() {
  return { gold: 0, kills: 0, missionsStarted: 0, missionsCleared: 0 };
}

function defaultGuildStats() {
  return { gold: 0 };
}

function defaultOptionFragments() {
  return {};
}

function defaultEquipmentResearch() {
  return {};
}

function nextStorageUid() {
  return uid("storage");
}

function cloneEquipmentOptions(options) {
  return Array.isArray(options) ? options.map((option) => ({ ...option })) : undefined;
}

function cloneEquipmentOptionIds(optionIds) {
  return Array.isArray(optionIds) ? optionIds.filter(Boolean).map((id) => String(id)) : undefined;
}

function normalizeEquipmentItem(item, base = {}) {
  if (!item?.id && !base?.id) return null;
  const merged = {
    ...base,
    ...item,
    options: cloneEquipmentOptions(item?.options) ?? cloneEquipmentOptions(base?.options),
    optionCandidates: cloneEquipmentOptionIds(item?.optionCandidates) ?? cloneEquipmentOptionIds(base?.optionCandidates),
  };
  return {
    ...merged,
    rarity: normalizeRarity(merged.rarity || base.rarity),
    sellGold: merged.sellGold || base.sellGold || 0,
  };
}

function registerEquipmentItem(item) {
  if (!item?.id) return null;
  const base = EQUIPMENT_ITEMS[item.id] || EQUIPMENT_DROPS.find((drop) => drop.id === item.id) || {};
  const normalized = normalizeEquipmentItem(item, base);
  EQUIPMENT_ITEMS[normalized.id] = normalized;
  return normalized;
}

function registerDropEquipmentItems() {
  (EQUIPMENT_DROPS || []).forEach(registerEquipmentItem);
}

function storageItemFromEquipment(item) {
  const base = EQUIPMENT_ITEMS[item?.id] || EQUIPMENT_DROPS.find((drop) => drop.id === item?.id) || {};
  const normalized = normalizeEquipmentItem(item, base);
  if (!normalized) return null;
  return {
    ...normalized,
    ...(normalized.options ? { options: cloneEquipmentOptions(normalized.options) } : {}),
    ...(normalized.optionCandidates ? { optionCandidates: cloneEquipmentOptionIds(normalized.optionCandidates) } : {}),
    rarity: normalizeRarity(normalized.rarity),
    sellGold: normalized.sellGold || 0,
    locked: !!item.locked,
    storageUid: item?.storageUid || nextStorageUid(),
    storedAt: Date.now(),
  };
}

function storageItemFromEquipmentId(itemId) {
  if (!itemId) return null;
  if (typeof itemId === "object") return storageItemFromEquipment(itemId);
  return storageItemFromEquipment(EQUIPMENT_ITEMS[itemId] || EQUIPMENT_DROPS.find((drop) => drop.id === itemId));
}

function hasItemInstanceData(item) {
  if (!item || typeof item !== "object") return false;
  return (
    (Array.isArray(item.options) && item.options.length > 0) ||
    (Array.isArray(item.optionCandidates) && item.optionCandidates.length > 0) ||
    Number(item.plus) > 0 ||
    Number(item.enhance) > 0
  );
}

function equipmentStatLine(item) {
  if (!item) return "";
  const labels = { maxHp: "HP", atk: "ATK", def: "DEF", dex: "DEX", luc: "LUC" };
  const parts = ["maxHp", "atk", "def", "dex", "luc"]
    .map((key) => ({ key, value: equipmentStatValue(item, key) }))
    .filter(({ value }) => value)
    .map(({ key, value }) => `${labels[key]}${value > 0 ? "+" : ""}${value}`);
  return parts.length ? parts.join(" / ") : "性能なし";
}

function equipmentStatValue(item, key) {
  const baseValue = Number(item?.[key]) || 0;
  const plus = Math.max(0, Number(item?.plus) || 0);
  if (!baseValue || plus <= 0) return baseValue;
  return baseValue + plus;
}

function equipmentDisplayName(item) {
  const name = item?.name || "名称不明の装備";
  const plus = Math.max(0, Number(item?.plus) || 0);
  return plus > 0 ? `${name}+${plus}` : name;
}

function equipmentSetDisplayName(item) {
  const setId = item?.setId;
  if (!setId) return "";
  if (Array.isArray(SET_BONUSES)) {
    const matched = SET_BONUSES.find((set) => set?.setId === setId);
    if (matched?.name) return matched.name;
  }
  return String(setId);
}

function equipmentSetLabelHtml(item) {
  const label = equipmentSetDisplayName(item);
  return label ? `<span class="equipment-set-label">${label}</span>` : "";
}

function equipmentSelectionOptionCount(item) {
  return Array.isArray(item?.options) ? item.options.length : 0;
}

function compareEquipmentSelectionEntries(a, b) {
  const rarityDiff = rarityRank(b?.item?.rarity) - rarityRank(a?.item?.rarity);
  if (rarityDiff) return rarityDiff;
  const optionedDiff = Number(equipmentSelectionOptionCount(b?.item) > 0) - Number(equipmentSelectionOptionCount(a?.item) > 0);
  if (optionedDiff) return optionedDiff;
  const optionCountDiff = equipmentSelectionOptionCount(b?.item) - equipmentSelectionOptionCount(a?.item);
  if (optionCountDiff) return optionCountDiff;
  const plusDiff = (Number(b?.item?.plus) || 0) - (Number(a?.item?.plus) || 0);
  if (plusDiff) return plusDiff;
  return String(a?.item?.name || a?.item?.id || "").localeCompare(String(b?.item?.name || b?.item?.id || ""), "ja")
    || ((Number(a?.index) || 0) - (Number(b?.index) || 0));
}

function equipmentStorageLine(item) {
  const sellGold = equipmentSellGoldValue(item);
  return `${equipmentStatLine(item)} / 売却 ${sellGold}G`;
}

function equipmentFilterMatches(item) {
  const rarityMatch = !equipmentFilterRarities.size || [...equipmentFilterRarities].some((rarity) => {
    if (rarity === "set") return isSetEquipmentItem(item);
    return normalizeRarity(item?.rarity) === rarity;
  });
  const optionMatch = !equipmentFilterOptions.size || (Array.isArray(item?.options) && item.options.some((option) => equipmentFilterOptions.has(String(option?.id || ""))));
  return rarityMatch && optionMatch;
}

function equipmentFilterButton(value, label) {
  const active = equipmentFilterRarities.has(value);
  return `<button type="button" class="storage-filter-btn ${active ? "active" : ""}" data-equipment-filter="${value}">${label}</button>`;
}

function equipmentFilterOptionButton(value, label) {
  const active = equipmentFilterOptions.has(value);
  return `<button type="button" class="storage-filter-btn ${active ? "active" : ""}" data-equipment-filter-option="${value}">${label}</button>`;
}

function equipmentFilterActiveCount() {
  return equipmentFilterRarities.size + equipmentFilterOptions.size;
}

function equipmentFilterPanelHtml() {
  return `<div class="storage-popover storage-filter-panel equipment-filter-panel" ${equipmentFilterOpen ? "" : "hidden"} aria-label="装備候補フィルター">
    <div class="storage-filter-panel-title">整理条件</div>
    <div class="storage-filter-panel-group">
      <div class="storage-filter-panel-label">レアリティ：</div>
      <div class="storage-filters">
        ${equipmentFilterButton("common", "ノーマル")}
        ${equipmentFilterButton("uncommon", "アンコモン")}
        ${equipmentFilterButton("rare", "レア")}
        ${equipmentFilterButton("epic", "エピック")}
        ${equipmentFilterButton("legendary", "レジェンド")}
        ${equipmentFilterButton("set", "セット")}
      </div>
    </div>
    <div class="storage-filter-panel-group">
      <div class="storage-filter-panel-label">オプション：</div>
      <div class="storage-filters">
        ${equipmentFilterOptionButton("attackUp", "攻撃")}
        ${equipmentFilterOptionButton("attackPercent", "攻撃%")}
        ${equipmentFilterOptionButton("hpUp", "HP")}
        ${equipmentFilterOptionButton("hpPercent", "HP%")}
        ${equipmentFilterOptionButton("defenseUp", "DEF")}
        ${equipmentFilterOptionButton("defensePercent", "DEF%")}
        ${equipmentFilterOptionButton("criticalRate", "クリ率")}
        ${equipmentFilterOptionButton("criticalDamage", "クリダメ")}
        ${equipmentFilterOptionButton("poisonStrike", "毒")}
        ${equipmentFilterOptionButton("blindStrike", "盲目")}
      </div>
    </div>
    <div class="equipment-filter-panel-actions">
      <button type="button" class="storage-bulk-cancel-btn" data-equipment-filter-reset>リセット</button>
      <button type="button" class="storage-bulk-cancel-btn" data-equipment-filter-close>閉じる</button>
    </div>
  </div>`;
}

function isEquipmentSlotOpen(memberId, slot) {
  return openEquipmentSlotsByMemberId.get(String(memberId)) === String(slot);
}

function closeEquipmentSlotSelection(memberId) {
  openEquipmentSlotsByMemberId.delete(String(memberId));
  equipmentFilterOpen = false;
}

function equipmentCandidateCategoryLabel(item) {
  return equipmentSlotLabel(item?.slot || "");
}

function equipmentCandidateHeaderHtml(item) {
  const rarity = normalizeRarity(item?.rarity);
  const category = equipmentCandidateCategoryLabel(item);
  const sellGold = equipmentSellGoldValue(item);
  return `<span class="equip-choice-head equip-choice-head-split">
    <span class="equip-choice-head-main">
      <strong class="storage-item ${rarityClassName(rarity)}">${equipmentDisplayName(item)}</strong>
      <span><span class="equip-choice-rarity">${rarity}</span>${category ? ` / <span class="equip-choice-category">${category}</span>` : ""}</span>
    </span>
    <span class="equip-choice-head-side">
      <span class="equip-choice-rarity">${rarity}</span>
      <span>売却 ${sellGold}G</span>
    </span>
  </span>`;
}

function equipmentPrimaryStatKey(slot) {
  return slot === "weapon" ? "atk" : slot === "armor" ? "def" : slot === "accessory" ? "luc" : "";
}

function equipmentPrimaryStatLabel(slot) {
  return slot === "weapon" ? "ATK" : slot === "armor" ? "DEF" : slot === "accessory" ? "LUC" : "";
}

function buildEquipmentCompareContext(member, slot, item) {
  if (!member || !slot || typeof getEquipmentStatBreakdown !== "function") return null;
  const currentEquipment = { ...ensureCharacterEquipment(member) };
  const compareMember = {
    ...member,
    equipment: {
      ...currentEquipment,
      [slot]: item ? storageItemFromEquipment(item) : null,
    },
  };
  return {
    currentBreakdown: getEquipmentStatBreakdown(member),
    nextBreakdown: getEquipmentStatBreakdown(compareMember),
    currentRates: typeof getEquipmentStatusStrikeRates === "function" ? getEquipmentStatusStrikeRates(member) : null,
    nextRates: typeof getEquipmentStatusStrikeRates === "function" ? getEquipmentStatusStrikeRates(compareMember) : null,
  };
}

function equipmentCompareValueFromContext(compareContext, compareKey) {
  if (!compareContext || !compareKey) return null;
  if (compareKey === "criticalRate" || compareKey === "criticalDamage") {
    const currentValue = Number(compareContext.currentBreakdown?.total?.[compareKey]);
    const nextValue = Number(compareContext.nextBreakdown?.total?.[compareKey]);
    if (!Number.isFinite(currentValue) || !Number.isFinite(nextValue)) return null;
    return {
      currentValue: Math.round(currentValue * 100),
      nextValue: Math.round(nextValue * 100),
    };
  }
  if (compareKey === "blind" || compareKey === "poison") {
    const currentValue = Number(compareContext.currentRates?.[compareKey]);
    const nextValue = Number(compareContext.nextRates?.[compareKey]);
    if (!Number.isFinite(currentValue) || !Number.isFinite(nextValue)) return null;
    return {
      currentValue: Math.round(currentValue * 100),
      nextValue: Math.round(nextValue * 100),
    };
  }
  const currentValue = Number(compareContext.currentBreakdown?.total?.[compareKey]);
  const nextValue = Number(compareContext.nextBreakdown?.total?.[compareKey]);
  if (!Number.isFinite(currentValue) || !Number.isFinite(nextValue)) return null;
  return { currentValue, nextValue };
}

function equipmentOptionCompareKey(optionId) {
  if (optionId === "attackUp" || optionId === "attackPercent") return "atk";
  if (optionId === "hpUp" || optionId === "hpPercent") return "maxHp";
  if (optionId === "defenseUp" || optionId === "defensePercent") return "def";
  if (optionId === "criticalRate") return "criticalRate";
  if (optionId === "criticalDamage") return "criticalDamage";
  if (optionId === "blindStrike") return "blind";
  if (optionId === "poisonStrike") return "poison";
  return "";
}

function equipmentCompareValueClass(currentValue, nextValue) {
  if (nextValue > currentValue) return "up";
  if (nextValue < currentValue) return "down";
  return "same";
}

function equipmentCompareHtml(currentValue, nextValue) {
  const compareClass = equipmentCompareValueClass(currentValue, nextValue);
  return `<span class="equip-choice-compare ${compareClass}">[${currentValue}→${nextValue}]</span>`;
}

function equipmentPrimaryStatCandidateHtml(item, equippedItem, slot, compareContext = null) {
  const statKey = equipmentPrimaryStatKey(slot);
  const statLabel = equipmentPrimaryStatLabel(slot);
  if (!item || !statKey || !statLabel) return equipmentStatLine(item);
  const itemValue = Number(equipmentStatValue(item, statKey)) || 0;
  const totalCompare = equipmentCompareValueFromContext(compareContext, statKey);
  const currentValue = totalCompare?.currentValue ?? (equippedItem ? (Number(equipmentStatValue(equippedItem, statKey)) || 0) : 0);
  const nextValue = totalCompare?.nextValue ?? itemValue;
  const itemValueText = `${statLabel}${itemValue > 0 ? "+" : ""}${itemValue}`;
  return `${itemValueText} ${equipmentCompareHtml(currentValue, nextValue)}`;
}

function isSetEquipmentItem(item) {
  return !!item?.setId || normalizeRarity(item?.rarity) === "set";
}

function isRareOrBetterEquipmentItem(item) {
  return ["rare", "set", "epic", "legendary", "artifact"].includes(normalizeRarity(item?.rarity));
}

function hasEquipmentOptions(item) {
  return Array.isArray(item?.options) && item.options.length > 0;
}

function shouldShowDropToast(item) {
  return !!item && (isRareOrBetterEquipmentItem(item) || hasEquipmentOptions(item) || isSetEquipmentItem(item));
}

function equipmentToastName(item) {
  return `${equipmentDisplayName(item)}${isSetEquipmentItem(item) ? "（S）" : ""}`;
}

function equipmentToastOptionLine(item) {
  const options = Array.isArray(item?.options) ? item.options : [];
  const parts = options
    .map((option) => {
      const meta = OPTION_MASTER?.[option?.id];
      if (!meta?.name) return "";
      const level = Number(option?.level) || 0;
      return `【${meta.name}${level > 0 ? `Lv${level}` : ""}】`;
    })
    .filter(Boolean);
  return parts.join("");
}

function equipmentToastLineHtml(item) {
  if (!item) return "";
  const rarityClass = typeof rarityClassName === "function" ? rarityClassName(item.rarity) : "";
  const optionLine = equipmentToastOptionLine(item);
  return `<li class="drop-toast-item"><span class="drop-toast-item-name ${rarityClass}">${equipmentToastName(item)}</span>${optionLine ? `<span class="drop-toast-item-option">${optionLine}</span>` : ""}</li>`;
}

function equipmentToastSummaryKey(item) {
  if (!item) return "";
  return JSON.stringify({
    id: item.id || "",
    rarity: normalizeRarity(item.rarity),
    plus: Math.max(0, Number(item.plus) || 0),
    setId: item.setId || "",
    options: Array.isArray(item.options)
      ? item.options.map((option) => ({
        id: String(option?.id || ""),
        level: Number(option?.level) || 0,
      }))
      : [],
  });
}

function summarizeToastItems(items, sold = false) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const grouped = new Map();
  for (const item of list) {
    const normalized = storageItemFromEquipment(item) || item;
    const key = equipmentToastSummaryKey(normalized);
    const current = grouped.get(key);
    if (current) {
      current.count += 1;
      if (sold) current.gold += equipmentSellGoldValue(item);
      continue;
    }
    grouped.set(key, {
      item: normalized,
      count: 1,
      gold: sold ? equipmentSellGoldValue(item) : 0,
    });
  }
  return [...grouped.values()];
}

function equipmentToastSummaryLineHtml(summary, sold = false) {
  if (!summary?.item) return "";
  const rarityClass = typeof rarityClassName === "function" ? rarityClassName(summary.item.rarity) : "";
  const optionLine = equipmentToastOptionLine(summary.item);
  const countText = ` ×${summary.count}`;
  const goldText = sold ? ` +${summary.gold}G` : "";
  return `<li class="drop-toast-item"><span class="drop-toast-item-name ${rarityClass}">${equipmentToastName(summary.item)}</span>${optionLine ? `<span class="drop-toast-item-option">${optionLine}</span>` : ""}<span class="drop-toast-item-option">${countText}${goldText}</span></li>`;
}

function ensureDropToastRoot() {
  let root = $("drop-toast-root");
  if (root) return root;
  root = document.createElement("div");
  root.id = "drop-toast-root";
  root.className = "drop-toast-root";
  document.body.appendChild(root);
  return root;
}

function showDropToast(items, title = "今回の納品") {
  const deliveryItems = Array.isArray(items?.deliveryItems) ? items.deliveryItems : Array.isArray(items) ? items : [items];
  const autoSellItems = Array.isArray(items?.autoSellItems) ? items.autoSellItems : [];
  const deliverySummary = summarizeToastItems(deliveryItems, false);
  const autoSellSummary = summarizeToastItems(autoSellItems, true);
  if (!deliverySummary.length && !autoSellSummary.length) return;
  const root = ensureDropToastRoot();
  const toast = document.createElement("div");
  toast.className = "drop-toast";
  toast.dataset.toastId = String(dropToastSerial++);
  const sections = [];
  if (deliverySummary.length) {
    sections.push(`<div class="drop-toast-subtitle">納品：</div><ul class="drop-toast-list">${deliverySummary.map((entry) => equipmentToastSummaryLineHtml(entry, false)).join("")}</ul>`);
  }
  if (autoSellSummary.length) {
    sections.push(`<div class="drop-toast-subtitle">自動売却：</div><ul class="drop-toast-list">${autoSellSummary.map((entry) => equipmentToastSummaryLineHtml(entry, true)).join("")}</ul>`);
  }
  toast.innerHTML = `<div class="drop-toast-title">${title}</div>${sections.join("")}`;
  root.appendChild(toast);
  while (root.children.length > 4) {
    root.firstElementChild?.remove();
  }
  const closeToast = () => {
    if (!toast.isConnected) return;
    toast.remove();
  };
  toast.addEventListener("click", closeToast);
  window.setTimeout(closeToast, 7900);
}

function formatEquipmentOptionDetail(option, meta, level) {
  if (typeof meta?.format === "function") return meta.format(level);
  if (option?.id === "attackUp") return `ATK+${level * 2}`;
  if (option?.id === "attackPercent") return `${level * 5}%`;
  if (option?.id === "hpUp") return `HP+${level * 5}`;
  if (option?.id === "hpPercent") return `${level * 5}%`;
  if (option?.id === "defenseUp") return `DEF+${level}`;
  if (option?.id === "defensePercent") return `${1 + level * 2}%`;
  if (option?.id === "criticalRate") return `${level}%`;
  if (option?.id === "criticalDamage") return `${level * 10}%`;
  if (option?.id === "blindStrike") return `${level * 5}%`;
  if (option?.id === "poisonStrike") return `${level * 5}%`;
  return "";
}

function formatEquipmentOptionCandidate(optionId) {
  const meta = OPTION_MASTER?.[optionId];
  if (!meta?.name) return String(optionId);
  const option = { id: optionId, level: 1 };
  const detail = formatEquipmentOptionDetail(option, meta, 1);
  const text = `${meta.name}Lv1`;
  return detail ? `${text}（${detail}）` : text;
}

function equipmentOptionCompareValue(option) {
  const level = Math.max(0, Number(option?.level) || 0);
  if (option?.id === "attackUp") return level * 2;
  if (option?.id === "attackPercent") return level * 5;
  if (option?.id === "hpUp") return level * 5;
  if (option?.id === "hpPercent") return level * 5;
  if (option?.id === "defenseUp") return level;
  if (option?.id === "defensePercent") return 1 + level * 2;
  if (option?.id === "criticalRate") return level;
  if (option?.id === "criticalDamage") return level * 10;
  if (option?.id === "blindStrike") return level * 5;
  if (option?.id === "poisonStrike") return level * 5;
  return 0;
}

function equipmentOptionCompareHtml(option, equippedItem, compareContext = null) {
  const compareKey = equipmentOptionCompareKey(option?.id);
  const totalCompare = equipmentCompareValueFromContext(compareContext, compareKey);
  if (totalCompare) {
    return ` ${equipmentCompareHtml(totalCompare.currentValue, totalCompare.nextValue)}`;
  }
  if (!option || !equippedItem) return "";
  const equippedOptions = Array.isArray(equippedItem?.options) ? equippedItem.options : [];
  const currentOption = equippedOptions.find((entry) => String(entry?.id || "") === String(option?.id || ""));
  const currentValue = equipmentOptionCompareValue(currentOption);
  const nextValue = equipmentOptionCompareValue(option);
  return ` ${equipmentCompareHtml(currentValue, nextValue)}`;
}

function equipmentOptionLineText(option) {
  const meta = OPTION_MASTER?.[option?.id];
  if (!meta?.name) return "";
  const level = Number(option?.level) || 0;
  const detail = level > 0 ? formatEquipmentOptionDetail(option, meta, level) : "";
  const text = level > 0 ? `${meta.name}Lv${level}` : meta.name;
  return detail ? `${text}（${detail}）` : text;
}

function equipmentOptionLostHtml(option, compareContext = null) {
  if (!option) return "";
  const text = equipmentOptionLineText(option);
  if (!text) return "";
  const compareKey = equipmentOptionCompareKey(option?.id);
  const totalCompare = equipmentCompareValueFromContext(compareContext, compareKey);
  if (totalCompare) {
    return `<span class="equip-choice-option-lost">${text} ${equipmentCompareHtml(totalCompare.currentValue, totalCompare.nextValue)}</span>`;
  }
  const currentValue = equipmentOptionCompareValue(option);
  return `<span class="equip-choice-option-lost">${text} ${equipmentCompareHtml(currentValue, 0)}</span>`;
}

function canFixEquipmentOption(item) {
  return (Array.isArray(item?.options) ? item.options.length : 0) < 3;
}

function equipmentOptionCandidatesStorageHtml(item, context = {}) {
  const optionCandidates = Array.isArray(item?.optionCandidates) ? item.optionCandidates : [];
  if (!optionCandidates.length) return "";
  const canFix = canFixEquipmentOption(item);
  const storageIndex = typeof context?.storageIndex === "number" ? context.storageIndex : null;
  const lines = optionCandidates
    .map((optionId) => {
      const text = formatEquipmentOptionCandidate(optionId);
      if (!text) return "";
      if (storageIndex == null) return text;
      return `<button type="button" class="storage-lock-btn" data-storage-option-fix="${storageIndex}" data-option-id="${String(optionId)}" ${canFix ? "" : "disabled"}>${text}</button>`;
    })
    .filter(Boolean);
  if (!lines.length) return "";
  return `<div class="storage-effect storage-option-effect">成長候補<br>1つ選んでください<br><br>${lines.join("<br>")}</div>`;
}

function equipmentOptionsStorageHtml(item, context = {}) {
  const options = Array.isArray(item?.options) ? item.options : [];
  const compareEquippedItem = context?.compareEquippedItem || null;
  const compareContext = context?.compareContext || null;
  const compareEquippedOptions = Array.isArray(compareEquippedItem?.options) ? compareEquippedItem.options : [];
  const lines = options
    .map((option) => {
      const text = equipmentOptionLineText(option);
      if (!text) return "";
      const compareHtml = equipmentOptionCompareHtml(option, compareEquippedItem, compareContext);
      return `${text}${compareHtml}`;
    })
    .filter(Boolean);
  const currentOnlyLines = compareEquippedOptions
    .filter((equippedOption) => !options.some((option) => String(option?.id || "") === String(equippedOption?.id || "")))
    .map((option) => equipmentOptionLostHtml(option, compareContext))
    .filter(Boolean);
  const mergedLines = [...lines, ...currentOnlyLines];
  const optionsHtml = mergedLines.length ? `<div class="storage-effect storage-option-effect">${mergedLines.join("<br>")}</div>` : "";
  return `${optionsHtml}${equipmentOptionCandidatesStorageHtml(item, context)}`;
}

function equipmentOptionNameLevelLine(item) {
  const options = Array.isArray(item?.options) ? item.options : [];
  const lines = options
    .map((option) => {
      const meta = OPTION_MASTER?.[option?.id];
      if (!meta?.name) return "";
      const level = Number(option?.level) || 0;
      return level > 0 ? `${meta.name}Lv${level}` : meta.name;
    })
    .filter(Boolean);
  return lines.join(" / ");
}

function ensureEquipmentResearch(target = state) {
  const source =
    target.equipmentResearch && typeof target.equipmentResearch === "object" && !Array.isArray(target.equipmentResearch)
      ? target.equipmentResearch
      : defaultEquipmentResearch();
  target.equipmentResearch = Object.fromEntries(
    Object.entries(source)
      .filter(([equipmentId]) => !!equipmentId)
      .map(([equipmentId, value]) => [
        String(equipmentId),
        Math.min(100, Math.max(0, Math.floor(Number(value) || 0))),
      ])
  );
  return target.equipmentResearch;
}

function equipmentResearchProgress(itemOrId, target = state) {
  const equipmentId = typeof itemOrId === "string" ? itemOrId : itemOrId?.id;
  if (!equipmentId) return 0;
  const research = ensureEquipmentResearch(target);
  return Math.min(100, Math.max(0, Math.floor(Number(research[equipmentId]) || 0)));
}

function gainEquipmentResearch(itemOrId, amount = 1, target = state) {
  const equipmentId = typeof itemOrId === "string" ? itemOrId : itemOrId?.id;
  if (!equipmentId) return 0;
  const research = ensureEquipmentResearch(target);
  const currentValue = Math.min(100, Math.max(0, Math.floor(Number(research[equipmentId]) || 0)));
  const nextValue = Math.min(100, currentValue + Math.max(0, Math.floor(Number(amount) || 0)));
  research[equipmentId] = nextValue;
  return nextValue;
}

function equipmentResearchStorageHtml(item) {
  const progress = equipmentResearchProgress(item);
  return `<div class="records-effect">研究進捗：${progress}%</div>`;
}

function setStorageResultMessage(message = "", detailMessage = "") {
  storageFusionMessage = message;
  storageResultDetailMessage = detailMessage;
  storageResultDetailOpen = false;
}

function setStorageDismantleResult(detailMessage = "") {
  storageDismantleResultDetailMessage = detailMessage;
  storageDismantleResultOpen = !!detailMessage;
}

function openStorageDismantleConfirm(state) {
  storageDismantleConfirmState = state ? { ...state } : null;
}

function closeStorageDismantleConfirm() {
  storageDismantleConfirmState = null;
}

function openStorageBulkSellModal(state) {
  storageBulkSellModalState = state ? { ...state } : null;
}

function closeStorageBulkSellModal() {
  storageBulkSellModalState = null;
}

function openStorageBulkDismantleModal(state) {
  storageBulkDismantleModalState = state ? { ...state } : null;
}

function closeStorageBulkDismantleModal() {
  storageBulkDismantleModalState = null;
}

function openStorageSellConfirm(state) {
  storageSellConfirmState = state ? { ...state } : null;
}

function closeStorageSellConfirm() {
  storageSellConfirmState = null;
}

function defaultAutoSellSettings() {
  return { common: false, uncommon: false };
}

function formatMissionDurationLabel(durationMs) {
  const seconds = Math.max(0, Number(durationMs) || 0) / 1000;
  const rounded = Math.round(seconds * 10) / 10;
  return `${rounded.toFixed(1)}秒`;
}

function openAreaDetailModal(areaId, partyId = null) {
  if (!areaId || !AREAS?.[areaId]) return;
  state.areaDetailModalState = {
    areaId: String(areaId),
    partyId: partyId ? String(partyId) : null,
  };
  renderPartySection();
}

function closeAreaDetailModal() {
  if (!state.areaDetailModalState) return;
  state.areaDetailModalState = null;
  renderPartySection();
}

function missionDurationEffectsForParty(party) {
  if (!party) return [];
  const effects = [];
  const seen = new Set();
  for (const member of party.members || []) {
    for (const set of (typeof getActiveSetBonuses === "function" ? getActiveSetBonuses(member) : []) || []) {
      const key = set?.missionDurationKey || set?.setId || (Array.isArray(set?.items) ? set.items.join("|") : set?.name || "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const rate = Math.max(0, Number(set?.missionDurationRate) || 0);
      if (rate > 0) effects.push({ key, rate });
    }
  }
  const shortcutEffect = missionDurationShortcutRateForParty(party);
  if (shortcutEffect && !seen.has(shortcutEffect.key) && shortcutEffect.rate > 0) effects.push(shortcutEffect);
  return effects;
}

function missionDurationReductionRateForParty(party) {
  const rate = missionDurationEffectsForParty(party).reduce((sum, effect) => sum + effect.rate, 0);
  return Math.min(rate, 0.9);
}

function missionDurationShortcutRateForParty(party) {
  if (!party || typeof isSkillEnabled !== "function") return null;
  const area = getArea(party.selectedArea);
  const areaShortcutRate = Number.isFinite(area?.shortcutRate) ? area.shortcutRate : 1;
  if (areaShortcutRate <= 0) return null;
  const hasShortcutScout = (party.members || []).some((member) => member?.hp > 0 && isSkillEnabled(member, "shortcutFind"));
  if (!hasShortcutScout) return null;
  return {
    key: "shortcutFind",
    rate: SHORTCUT_REDUCTION_RATE * areaShortcutRate,
  };
}

function ensureAutoSellSettings(target = state) {
  const defaults = defaultAutoSellSettings();
  target.autoSell = { ...defaults, ...(target.autoSell || {}) };
  target.autoSell.common = !!target.autoSell.common;
  target.autoSell.uncommon = !!target.autoSell.uncommon;
  return target.autoSell;
}

function defaultRecords() {
  return { equipment: [], enemies: {} };
}

function ensureRecords(target = state) {
  target.records = { ...defaultRecords(), ...(target.records || {}) };
  const equipment = Array.isArray(target.records.equipment) ? target.records.equipment : [];
  target.records.equipment = [...new Set(equipment.filter(Boolean))];
  target.records.enemies = Object.fromEntries(
    Object.entries(target.records.enemies || {})
      .filter(([enemyId]) => !!enemyId)
      .map(([enemyId, record]) => [enemyId, { kills: Math.max(0, Number(record?.kills) || 0) }])
  );
  return target.records;
}

function ensureDeveloperMode(target = state) {
  target.developerMode = target.developerMode === true;
  return target.developerMode;
}

function ensureGuildStats(target = state) {
  target.stats = { ...defaultGuildStats(), ...(target.stats || {}) };
  target.stats.gold = Math.max(0, Number(target.stats.gold) || 0);
  return target.stats;
}

function ensureOptionFragments(target = state) {
  target.optionFragments =
    target.optionFragments && typeof target.optionFragments === "object" && !Array.isArray(target.optionFragments)
      ? { ...target.optionFragments }
      : defaultOptionFragments();
  return target.optionFragments;
}

function ensureStorageUids(target = state) {
  if (!Array.isArray(target.storage)) target.storage = [];
  target.storage = target.storage.map((item) => {
    if (!item || item.storageUid) return item;
    return { ...item, storageUid: nextStorageUid() };
  });
  return target.storage;
}

function recordEquipment(item, target = state) {
  if (!item?.id) return false;
  const records = ensureRecords(target);
  if (records.equipment.includes(item.id)) return false;
  records.equipment.push(item.id);
  return true;
}

function recordEquippedEquipment(party, target = state) {
  for (const member of party?.members || []) {
    const equipment = ensureCharacterEquipment(member);
    for (const { key } of EQUIPMENT_SLOTS) {
      const item = storageItemFromEquipmentId(equipment?.[key]);
      if (!item?.id) continue;
      recordEquipment(item, target);
    }
  }
}

function recordEnemyKill(enemy, target = state) {
  if (!enemy?.id) return false;
  const records = ensureRecords(target);
  const current = records.enemies[enemy.id]?.kills || 0;
  records.enemies[enemy.id] = { kills: current + 1 };
  return true;
}

function wasAutoSoldDrop(item) {
  return item?.autoSold === true || (item?.autoSold == null && shouldAutoSellDrop(item));
}

function defaultParty(id, name) {
  const members = (PARTY_TEMPLATES[id] || PARTY_TEMPLATES.pt1).map((m) => createMember(m));
  return {
    id,
    name,
    members,
    hero: members[0],
    selectedArea: "plainEntrance",
    mission: null,
    dispatches: [],
    expandedDispatchIds: [],
    lastReport: null,
    stats: defaultStats(),
  };
}

function getParty(id) {
  return state.parties.find((p) => p.id === id);
}

function getArea(id) {
  return AREAS[id] || AREAS.plain;
}

function isAreaUnlocked(id) {
  const area = getArea(id);
  return !area.unlockAfter || (state.areaClears[area.unlockAfter] || 0) > 0;
}

function getUnlockHint(id) {
  const area = getArea(id);
  if (!area.unlockAfter) return "解放済";
  return `${AREAS[area.unlockAfter].name}を1回クリア`;
}

function areaDetailModalHtml() {
  const modalState = state.areaDetailModalState;
  if (!modalState?.areaId) return "";
  const area = AREAS?.[modalState.areaId];
  if (!area) return "";
  const party = modalState.partyId ? getParty(modalState.partyId) : null;
  const durationLabel = formatMissionDurationLabel(party ? missionDurationMs(area, party) : area.durationMs);
  const recommendedLevel = Number.isFinite(Number(area.recommendedLevel)) ? Number(area.recommendedLevel) : "-";
  const enemyNames = (area.monsters || [])
    .map((enemyId) => MONSTERS?.[enemyId]?.name)
    .filter(Boolean);
  const bossName = area.boss ? MONSTERS?.[area.boss]?.name || "-" : "-";
  const description = area.description || "-";
  return `<div class="storage-confirm-modal-backdrop area-detail-modal-backdrop" data-area-detail-modal-root data-area-detail-close>
    <div class="storage-confirm-modal area-detail-modal" role="dialog" aria-modal="true" aria-label="派遣先詳細">
      <div class="storage-confirm-modal-title">派遣先詳細</div>
      <div class="storage-confirm-modal-body area-detail-modal-body">
        <div class="area-detail-row"><strong>派遣先名：</strong>${area.name}</div>
        <div class="area-detail-row"><strong>推奨Lv：</strong>${recommendedLevel}</div>
        <div class="area-detail-row"><strong>派遣時間：</strong>${durationLabel}</div>
        <div class="area-detail-row"><strong>出現敵：</strong>${enemyNames.length ? enemyNames.join("、") : "-"}</div>
        <div class="area-detail-row"><strong>ボス：</strong>${bossName}</div>
        <div class="area-detail-row"><strong>説明：</strong>${description}</div>
      </div>
      <div class="storage-confirm-modal-actions">
        <button type="button" class="storage-bulk-cancel-btn" data-area-detail-close>閉じる</button>
      </div>
    </div>
  </div>`;
}

function ensureValidSelectedArea(party) {
  if (!isAreaUnlocked(party.selectedArea)) {
    party.selectedArea = AREA_ORDER.find(isAreaUnlocked) || "plainEntrance";
  }
}

const LEGACY_AREA_STAGE_MAP = {
  swamp: ["sunkenPier", "reedWaterway", "blackwaterPool"],
  ruins: ["outerGarden", "crackedCorridor", "sealedBelfry"],
  canyon: ["windCutPass", "cliffPath", "redMoonWatch"],
  glacier: ["frostMarker", "icefield", "fangDrift"],
  volcano: ["volcanoRim", "lavaCave", "flameBed"],
};

function syncLegacyAreaClears(target = state) {
  if (!target.areaClears || typeof target.areaClears !== "object") target.areaClears = {};
  Object.entries(LEGACY_AREA_STAGE_MAP).forEach(([legacyId, stageIds]) => {
    const legacyClears = Math.max(0, Number(target.areaClears?.[legacyId]) || 0);
    if (!legacyClears) return;
    stageIds.forEach((stageId) => {
      target.areaClears[stageId] = Math.max(legacyClears, Math.max(0, Number(target.areaClears?.[stageId]) || 0));
    });
  });
  return target.areaClears;
}

function recordAreaClear(areaId) {
  state.areaClears[areaId] = (state.areaClears[areaId] || 0) + 1;
  syncLegacyAreaClears();
}

function shouldBossAppear(area) {
  return !!area.boss;
}

function chooseBoss(area) {
  return MONSTERS[area.boss] || MONSTERS[pick(area.monsters)];
}

function generateBattle(area, party) {
  const encounters = [];
  const normalCount = clamp(area.difficulty + roll(0, 1), 1, 4);
  const speechState = {};
  const shortcutEvents = buildShortcutExplorationEvents(party.members, area);
  const dispatchMembersSnapshot = snapshotPartyHp(party.members);

  for (let i = 0; i < normalCount; i += 1) {
    encounters.push(runEncounter(party.members, MONSTERS[pick(area.monsters)], area, speechState, party.name));
    if (party.members.every((member) => member.hp <= 0)) break;
  }

  const stoppedByDraw = encounters.at(-1)?.draw && party.members.every((member) => member.hp <= 0);
  const failedBeforeBoss =
    (party.members.every((member) => member.hp <= 0) && !stoppedByDraw) ||
    encounters.some((encounter) => !encounter.victory && !encounter.draw);
  if (!failedBeforeBoss && !stoppedByDraw) {
    encounters.push(runEncounter(party.members, chooseBoss(area), area, speechState, party.name));
  }

  const noRewards = encounters.some((encounter) => encounter.draw);
  const failed = failedBeforeBoss || encounters.some((encounter) => !encounter.victory && !encounter.draw);
  const treasureEvents = encounterExplorationEvents(encounters, "treasureFind");
  const trapEvents = encounterExplorationEvents(encounters, "trapDisarm");
  const treasureDropRolls = !noRewards && treasureEvents.length ? rollTreasureEquipmentDrops(party.members, encounters, treasureEvents.length) : [];
  const extraEquipmentDrops = treasureDropRolls.filter(Boolean);
  treasureEvents.forEach((event, index) => {
    const item = treasureDropRolls[index];
    event.text += item
      ? `<br>宝箱の中から${dropNameHtml(item)}を見つけた。${treasureRarityTagHtml(item)}`
      : "<br>中に使える物は残っていなかった。";
  });
  const trapDisarmed = trapEvents.length > 0;
  const shortcutFound = shortcutEvents.length > 0;

  return {
    encounters,
    treasureEvents,
    trapEvents,
    shortcutEvents,
    dispatchMembersSnapshot,
    extraEquipmentDrops,
    trapDisarmed,
    noRewards,
    kills: noRewards ? 0 : encounters.reduce((sum, e) => sum + e.kills, 0),
    xp: noRewards ? 0 : encounters.reduce((sum, e) => sum + e.xp, 0),
    gold: noRewards ? 0 : encounters.reduce((sum, e) => sum + e.gold, 0) + extraEquipmentDrops.reduce((sum, item) => sum + (wasAutoSoldDrop(item) ? equipmentSellGoldValue(item) : 0), 0),
    failed,
    forcedReturn: failed && party.members.every((member) => member.hp <= 0),
    shortcutFound,
  };
}

function encounterExplorationEvents(encounters, skillId) {
  return (encounters || []).flatMap((encounter) =>
    (encounter.explorationEvents || []).filter((event) => event?.skillId === skillId)
  );
}

function rollTreasureEquipmentDrops(members, encounters, count = 1) {
  const victories = (encounters || []).filter((encounter) => encounter?.victory && encounter.monster);
  return Array.from({ length: count }, () => {
    const encounter = pick(victories);
    return encounter ? rollEquipmentDrop(members, encounter.monster) : null;
  });
}

function treasureRarityTagHtml(item) {
  const rarity = normalizeRarity(item?.rarity);
  if (!["rare", "epic", "legendary", "artifact"].includes(rarity)) return "";
  return ` <span class="${rarityClassName(rarity)}">[${rarity.toUpperCase()}]</span>`;
}

function shortcutMissionReductionMs(area, rewards, party = null) {
  return 0;
}

function missionDurationMs(area, party = null) {
  const baseDurationMs = Math.max(0, Number(area?.durationMs) || 0);
  const reducedDurationMs = Math.round(baseDurationMs * (1 - missionDurationReductionRateForParty(party)));
  return Math.max(1000, reducedDurationMs);
}

function battleSummary(encounter) {
  const result = encounter.draw ? "相打ち" : encounter.victory ? "討伐成功" : "撤退";
  const label = encounter.label || encounter.monster?.name || "敵";
  if (encounter.draw) return `${label}: ${result} / 報酬なし`;
  return `${label}: ${result} / ${encounter.xp}XP / ${encounter.gold}G`;
}

function buildDeliveryBoxHtml(rewards) {
  const names = [
    ...(rewards?.encounters || []).map((encounter) => encounter?.equipmentDrop),
    ...(rewards?.extraEquipmentDrops || []),
  ]
    .filter(Boolean)
    .map((drop) => {
      const item = storageItemFromEquipment(drop) || drop;
      const suffix = wasAutoSoldDrop(drop) ? "（売却）" : "";
      return `${dropNameHtml(item)}${suffix}`;
    });
  if (!names.length) return "";
  return `今回の冒険で装備を持ち帰った。<br>納品箱：<br>${names.map((name) => `・${name}`).join("<br>")}`;
}

function buildMvpLine(party, rewards) {
  const stats = new Map(
    party.members.map((member) => [member.name, { member, score: 0 }])
  );
  const names = [...stats.keys()].sort((a, b) => b.length - a.length);
  let actorName = null;

  const addScore = (name, amount) => {
    const stat = stats.get(name);
    if (!stat || amount <= 0) return;
    stat.score += amount;
  };

  for (const encounter of rewards.encounters || []) {
    for (const event of encounter.events || []) {
      const text = event.text || "";
      const starter = names.find((name) => text.startsWith(name));
      if (starter) actorName = starter;
      else if (text.includes("の攻撃。")) actorName = null;

      const damage = text.match(/に(\d+)ダメージ/);
      if (damage && actorName) addScore(actorName, Math.ceil(Number(damage[1]) / 10));

      const healing = text.match(/HPが(\d+)回復/);
      if (healing && actorName) addScore(actorName, Math.ceil(Number(healing[1]) / 8));

      if (text.includes("を討伐") && actorName) addScore(actorName, 8);
      if (text.includes("かばった") && starter) addScore(starter, 5);
      if (text.includes("奇襲を使った") && starter) addScore(starter, 4);
      if (/(魔力障壁|集中|挑発|鉄壁|盾を構え|状態が安定|応急手当|リザラ|リザレクト)/.test(text) && starter) {
        addScore(starter, 3);
      }
      if (/(毒に侵された|猛毒化|火傷を負った|動きが鈍った)/.test(text) && actorName) {
        addScore(actorName, 4);
      }
    }
  }

  const best = [...stats.values()].sort((a, b) => b.score - a.score)[0];
  if (!best || best.score <= 0) return null;
  return `今回もっとも活躍したのは${best.member.name}だったようだ。`;
}

function reportAuthorName(party, mvpLine, returnEvents) {
  const mvpName = mvpLine?.match(/^今回もっとも活躍したのは(.+)だったようだ。$/)?.[1];
  if (mvpName) return mvpName;

  const returnSpeaker = returnEvents
    .map((event) => event.text?.split("「")[0])
    .find((name) => party.members.some((member) => member.name === name));
  if (returnSpeaker) return returnSpeaker;

  return party.members.find((member) => member.hp > 0)?.name || party.members[0]?.name || null;
}

function snapshotMembers(members) {
  return members.map((member) => ({
    id: member.id,
    hp: member.hp,
    maxHp: member.maxHp,
  }));
}

function applyMembersSnapshot(party, snapshot) {
  if (!snapshot?.length) return false;
  const byId = new Map(snapshot.map((member) => [member.id, member]));
  let changed = false;
  for (const member of party.members) {
    const snap = byId.get(member.id);
    if (!snap) continue;
    const nextHp = clamp(snap.hp, 0, member.maxHp);
    if (member.hp !== nextHp) {
      member.hp = nextHp;
      changed = true;
    }
  }
  party.hero = party.members[0];
  return changed;
}

function isShortcutEvent(event) {
  return event?.skillId === "shortcutFind";
}

function shortcutExplorationEvents(rewards) {
  return (rewards?.shortcutEvents || []).map((event) => ({
    event,
    snapshot: rewards.dispatchMembersSnapshot,
  }));
}

function dispatchExplorationEvents(rewards) {
  return [];
}

function randomDispatchEventTime(startedAt, endsAt, offset = 0) {
  const span = Math.max(1, endsAt - startedAt);
  const timestamp = startedAt + Math.floor(span * (0.22 + Math.random() * 0.62)) + offset;
  return Math.min(Math.max(startedAt + 2 + offset, timestamp), endsAt - 1);
}

function normalExplorationEvents(encounter) {
  return (encounter.explorationEvents || []).filter((event) => !isShortcutEvent(event));
}

function buildScheduledJournal(party, area, rewards, startedAt, endsAt) {
  const entries = [];
  const span = endsAt - startedAt;
  entries.push({
    id: uid("entry"),
    timestamp: startedAt + 350,
    type: "flavor",
    title: `${party.name}、${area.name}へ出発。`,
    shown: false,
  });

  shortcutExplorationEvents(rewards).forEach(({ event, snapshot }, eventIndex) => {
    entries.push({
      id: uid("entry"),
      timestamp: startedAt + 351 + eventIndex,
      type: "flavor",
      title: event.text,
      debug: event.debug,
      membersSnapshot: snapshot,
      shown: false,
    });
  });

  area.flavor.forEach((text, index) => {
    entries.push({
      id: uid("entry"),
      timestamp: startedAt + Math.floor(span * (0.18 + index * 0.14)),
      type: "flavor",
      title: text,
      shown: false,
    });
  });

  dispatchExplorationEvents(rewards).forEach(({ event, snapshot }, eventIndex) => {
    entries.push({
      id: uid("entry"),
      timestamp: randomDispatchEventTime(startedAt, endsAt, eventIndex),
      type: "flavor",
      title: event.text,
      debug: event.debug,
      membersSnapshot: snapshot,
      shown: false,
    });
  });

  rewards.encounters.forEach((encounter, index) => {
    const lastIndex = Math.max(1, rewards.encounters.length - 1);
    const ratio = 0.3 + (index / lastIndex) * 0.48;
    const battleTime = startedAt + Math.floor(span * ratio);
    if (encounter.enemy?.boss || encounter.monster?.boss) {
      const preludeTime = startedAt + Math.floor(span * Math.max(0.2, ratio - 0.08));
      entries.push({
        id: uid("entry"),
        timestamp: preludeTime,
        type: "flavor",
        title: "……空気が重い",
        membersSnapshot: encounter.startMembersSnapshot,
        shown: false,
      });
      (encounter.bossPreludeEvents || []).forEach((event, eventIndex) => {
        entries.push({
          id: uid("entry"),
          timestamp: preludeTime + eventIndex + 1,
          type: "flavor",
          title: event.text,
          membersSnapshot: encounter.startMembersSnapshot,
          shown: false,
        });
      });
    }
    const explorationEvents = normalExplorationEvents(encounter);
    explorationEvents.forEach((event, eventIndex) => {
      entries.push({
        id: uid("entry"),
        timestamp: Math.max(startedAt, battleTime - explorationEvents.length + eventIndex),
        type: "flavor",
        title: event.text,
        debug: event.debug,
        membersSnapshot: event.membersSnapshot || encounter.startMembersSnapshot,
        shown: false,
      });
    });
    entries.push({
      id: uid("entry"),
      timestamp: battleTime,
      type: "battle",
      title: `${encounter.label || encounter.monster.name}との戦闘記録（${encounter.draw ? "相打ち" : encounter.victory ? "勝利" : "撤退"}）`,
      monsterBoss: !!encounter.monster.boss,
      monsterRare: !!encounter.monster.rare && !encounter.monster.boss,
      battleDetail: encounter.events,
      summary: battleSummary(encounter),
      membersSnapshot: encounter.membersSnapshot,
      shown: false,
    });
  });

  entries.push({
    id: uid("entry"),
    timestamp: endsAt,
    type: "return",
    title: rewards.noRewards ? "相打ち報告（全戦闘記録▼）" : `帰還報告（全戦闘記録▼）`,
    battleDetail: rewards.encounters.flatMap((e) => e.events),
    summary: rewards.noRewards ? "相打ち / 報酬なし" : `${rewards.kills}体討伐、${rewards.gold}G、${rewards.xp}XPを獲得`,
    mvpLine: buildMvpLine(party, rewards),
    deliveryBox: buildDeliveryBoxHtml(rewards),
    membersSnapshot: rewards.encounters.at(-1)?.membersSnapshot,
    shown: false,
  });

  return entries.sort((a, b) => a.timestamp - b.timestamp);
}

function buildScheduledJournalV2(party, area, rewards, startedAt, endsAt) {
  const entries = [];
  const span = endsAt - startedAt;
  let forcedReturnAt = endsAt;
  const encounterCount = rewards.encounters.length;
  const encounterRatios = rewards.encounters.map((_, index) => {
    const slot = (index + 1) / (encounterCount + 1);
    const jitter = (Math.random() - 0.5) * 0.12;
    return clamp(0.1 + slot * 0.75 + jitter, 0.1, 0.85);
  });
  entries.push({
    id: uid("entry"),
    timestamp: startedAt,
    type: "flavor",
    title: `${party.name}、${area.name}へ出発。`,
    shown: false,
  });

  shortcutExplorationEvents(rewards).forEach(({ event, snapshot }, eventIndex) => {
    entries.push({
      id: uid("entry"),
      timestamp: startedAt + 1 + eventIndex,
      type: "flavor",
      title: event.text,
      debug: event.debug,
      membersSnapshot: snapshot,
      shown: false,
    });
  });

  if (!rewards.forcedReturn) {
    area.flavor.forEach((text, index) => {
      entries.push({
        id: uid("entry"),
        timestamp: startedAt + Math.floor(span * (0.18 + index * 0.14)),
        type: "flavor",
        title: text,
        shown: false,
      });
    });
  }

  dispatchExplorationEvents(rewards).forEach(({ event, snapshot }, eventIndex) => {
    entries.push({
      id: uid("entry"),
      timestamp: randomDispatchEventTime(startedAt, endsAt, eventIndex),
      type: "flavor",
      title: event.text,
      debug: event.debug,
      membersSnapshot: snapshot,
      shown: false,
    });
  });

  rewards.encounters.forEach((encounter, index) => {
    const ratio = encounterRatios[index];
    const battleTime = startedAt + Math.floor(span * ratio);
    if (rewards.forcedReturn && index === rewards.encounters.length - 1) {
      forcedReturnAt = battleTime + 1;
    }
    if (encounter.enemy?.boss || encounter.monster?.boss) {
      const preludeTime = startedAt + Math.floor(span * Math.max(0.2, ratio - 0.08));
      entries.push({
        id: uid("entry"),
        timestamp: preludeTime,
        type: "flavor",
        title: "……空気が重い",
        membersSnapshot: encounter.startMembersSnapshot,
        shown: false,
      });
      (encounter.bossPreludeEvents || []).forEach((event, eventIndex) => {
        entries.push({
          id: uid("entry"),
          timestamp: preludeTime + eventIndex + 1,
          type: "flavor",
          title: event.text,
          membersSnapshot: encounter.startMembersSnapshot,
          shown: false,
        });
      });
    }
    const explorationEvents = normalExplorationEvents(encounter);
    explorationEvents.forEach((event, eventIndex) => {
      entries.push({
        id: uid("entry"),
        timestamp: Math.max(startedAt, battleTime - explorationEvents.length + eventIndex),
        type: "flavor",
        title: event.text,
        debug: event.debug,
        membersSnapshot: event.membersSnapshot || encounter.startMembersSnapshot,
        shown: false,
      });
    });
    entries.push({
      id: uid("entry"),
      timestamp: battleTime,
      type: "battle",
      title: `${encounter.label || encounter.monster.name}との戦闘記録（${encounter.draw ? "相打ち" : encounter.victory ? "勝利" : "撤退"}）`,
      monsterBoss: !!encounter.monster.boss,
      monsterRare: !!encounter.monster.rare && !encounter.monster.boss,
      battleDetail: encounter.events,
      summary: battleSummary(encounter),
      membersSnapshot: encounter.membersSnapshot,
      shown: false,
    });
  });

  if (rewards.forcedReturn) {
    entries.push({
      id: uid("entry"),
      timestamp: forcedReturnAt,
      type: "flavor",
      title: "全員のHPが尽き、全滅した。",
      forceReturn: true,
      shown: false,
    });
  }

  const returnTime = rewards.forcedReturn ? forcedReturnAt : endsAt;
  const returnMembersSnapshot = rewards.encounters.at(-1)?.membersSnapshot;
  const mvpLine = buildMvpLine(party, rewards);
  const returnEvents = buildReturnEvents(party.members, returnMembersSnapshot, mvpLine);
  const deliveryBox = buildDeliveryBoxHtml(rewards);
  const reportAuthor = reportAuthorName(party, mvpLine, returnEvents);
  returnEvents.forEach((event, eventIndex) => {
    entries.push({
      id: uid("entry"),
      timestamp: Math.max(startedAt, returnTime - returnEvents.length + eventIndex),
      type: "flavor",
      title: event.text,
      membersSnapshot: returnMembersSnapshot,
      shown: false,
    });
  });

  entries.push({
    id: uid("entry"),
    timestamp: returnTime,
    type: "return",
    title: rewards.noRewards ? "相打ち報告（全戦闘記録▼）" : rewards.forcedReturn ? "全滅により強制帰還（全戦闘記録▼）" : "帰還報告（全戦闘記録▼）",
    battleDetail: rewards.encounters.flatMap((e) => e.events),
    reportAuthor,
    summary: rewards.noRewards
      ? "相打ち / 報酬なし"
      : rewards.forcedReturn
      ? `全滅により強制帰還 / ${rewards.kills}体討伐 / ${rewards.gold}G / ${rewards.xp}XP`
      : `${rewards.kills}体討伐、${rewards.gold}G、${rewards.xp}XPを獲得`,
    mvpLine,
    deliveryBox,
    membersSnapshot: rewards.encounters.at(-1)?.membersSnapshot,
    shown: false,
  });

  return entries.sort((a, b) => a.timestamp - b.timestamp);
}

function getActiveDispatch(party) {
  return party.dispatches.find((d) => d.status === "active") || null;
}

function trimDispatches(party) {
  if (party.dispatches.length <= MAX_DISPATCH_HISTORY) return;
  const removed = party.dispatches.splice(MAX_DISPATCH_HISTORY);
  const removedIds = new Set(removed.map((d) => d.id));
  party.expandedDispatchIds = (party.expandedDispatchIds || []).filter((id) => !removedIds.has(id));
}

function revealDueEntries(party) {
  const dispatch = getActiveDispatch(party);
  if (!dispatch || !party.mission) return false;

  const now = Date.now();
  let changed = false;
  for (const entry of party.mission.journal) {
    if (entry.shown || entry.timestamp > now) continue;
    entry.shown = true;
    dispatch.entries.push({ ...entry });
    if (applyMembersSnapshot(party, entry.membersSnapshot)) {
      changed = true;
    }
    if (entry.forceReturn) {
      party.mission.failed = true;
      party.mission.endsAt = entry.timestamp;
    }
    changed = true;
  }
  return changed;
}

function applyMemberXp(member, xp, levelUps) {
  member.xp += xp;
  while (member.xp >= member.xpToNext) {
    member.xp -= member.xpToNext;
    member.level += 1;
    member.xpToNext = Math.floor(member.xpToNext * 1.35);
    syncMemberStats(member);
    member.hp = member.maxHp;
    levelUps.push({ name: member.name, level: member.level });
  }
}

function applyRewards(party, area, rewards) {
  const s = party.stats;
  ensureGuildStats().gold += rewards.gold;
  s.kills += rewards.kills;
  if (!rewards.noRewards) s.missionsCleared += 1;
  recordEnemyKills(rewards);
  if (!rewards.noRewards) storeEquipmentDrops(rewards, party?.name);

  const levelUps = [];
  const xpEach = rewards.noRewards ? 0 : Math.max(1, Math.floor(rewards.xp / party.members.length));
  party.members.forEach((member) => {
    applyMemberXp(member, xpEach, levelUps);
    member.hp = member.maxHp;
  });
  party.hero = party.members[0];

  const names = [
    ...new Set(
      rewards.encounters.flatMap((encounter) =>
        (encounter.monsters?.length ? encounter.monsters : [encounter.monster]).map((monster) => monster?.name).filter(Boolean)
      )
    ),
  ];
  party.lastReport = {
    areaName: area.name,
    monsters: names.join("、"),
    ...rewards,
    levelUps,
  };
}

function recordEnemyKills(rewards) {
  for (const encounter of rewards?.encounters || []) {
    if (!encounter?.victory) continue;
    const monsters = encounter.monsters?.length ? encounter.monsters : [encounter.monster];
    monsters.filter(Boolean).forEach((monster) => recordEnemyKill(monster));
  }
}

function storeEquipmentDrops(rewards, partyName = "") {
  if (!state.storage) state.storage = [];
  const drops = [
    ...(rewards?.encounters || []).map((encounter) => encounter?.equipmentDrop),
    ...(rewards?.extraEquipmentDrops || []),
  ];
  const deliveryItems = [];
  const autoSellItems = [];
  for (const item of drops) {
    const storedItem = storageItemFromEquipment(item);
    recordEquipment(storedItem);
    gainEquipmentResearch(storedItem);
    if (!item || !storedItem) continue;
    if (wasAutoSoldDrop(item)) {
      autoSellItems.push(storedItem);
      continue;
    }
    deliveryItems.push(storedItem);
    state.storage.push({ ...storedItem, foundBy: item.finderName || "" });
  }
  showDropToast(
    { deliveryItems, autoSellItems },
    partyName ? `${partyName}が帰還した。` : "小隊が帰還した。"
  );
}

function findMemberById(memberId) {
  return findPartyMemberById(memberId)?.member || null;
}

function findPartyMemberById(memberId) {
  for (const party of state.parties) {
    const member = party.members.find((m) => m.id === memberId);
    if (member) return { party, member };
  }
  return null;
}

function equipStorageItem(index, memberId, targetSlot) {
  if (!state.storage?.length) return;
  const storedItem = storageItemFromEquipment(state.storage[index]);
  const found = findPartyMemberById(memberId);
  const member = found?.member;
  if (!storedItem || !member) return;

  const slot = storedItem.slot === "accessory" ? targetSlot : storedItem.slot;
  if (!isEquipmentSlot(slot)) return;
  if (storedItem.slot !== "accessory" && slot !== storedItem.slot) return;

  const equipment = ensureCharacterEquipment(member);
  const previousItem = storageItemFromEquipmentId(equipment[slot]);
  state.storage.splice(index, 1);
  equipment[slot] = hasItemInstanceData(storedItem) ? storageItemFromEquipment(storedItem) : storedItem.id;
  if (previousItem) state.storage.push(previousItem);
  closeEquipmentSlotSelection(memberId);
  syncMemberStats(member);
  storageRenderCount = -1;
  if (found.party) openDetailPartyIds.add(found.party.id);
  saveGame();
  renderAll();
}

function unequipMemberItem(memberId, slot) {
  if (!isEquipmentSlot(slot)) return;
  const found = findPartyMemberById(memberId);
  const member = found?.member;
  if (!member) return;

  const equipment = ensureCharacterEquipment(member);
  const itemId = equipment[slot];
  const removedItem = storageItemFromEquipmentId(itemId);
  if (!removedItem) return;

  equipment[slot] = null;
  if (!state.storage) state.storage = [];
  state.storage.push(removedItem);
  closeEquipmentSlotSelection(memberId);
  syncMemberStats(member);
  storageRenderCount = -1;
  if (found.party) openDetailPartyIds.add(found.party.id);
  saveGame();
  renderAll();
}

function sellStorageItem(index) {
  return sellStorageItemByIndex(index);
}

function sellStorageItemByIndex(index, { deferRender = false } = {}) {
  if (!state.storage?.length) return;
  const storedItem = storageItemFromEquipment(state.storage[index]);
  if (!storedItem || storedItem.locked) return false;

  const sellGold = equipmentSellGoldValue(storedItem);
  ensureGuildStats().gold += sellGold;
  state.storage.splice(index, 1);
  storageRenderCount = -1;
  if (!deferRender) {
    saveGame();
    renderAll();
  }
  return true;
}

function fixStorageItemOptionCandidate(index, optionId) {
  if (!state.storage?.length || typeof index !== "number") return false;
  const storedItem = storageItemFromEquipment(state.storage[index]);
  if (!storedItem) return false;
  const optionCandidates = Array.isArray(storedItem.optionCandidates) ? storedItem.optionCandidates.map((id) => String(id)) : [];
  if (!optionCandidates.includes(String(optionId))) return false;
  if (!canFixEquipmentOption(storedItem)) return false;

  const nextOptions = Array.isArray(storedItem.options) ? storedItem.options.map((option) => ({ ...option })) : [];
  nextOptions.push({ id: String(optionId), level: 1 });
  state.storage[index] = storageItemFromEquipment({
    ...storedItem,
    options: nextOptions,
    optionCandidates: [],
  });
  storageRenderCount = -1;
  saveGame();
  renderAll();
  return true;
}

function toggleStorageLock(index) {
  if (!state.storage?.length || !state.storage[index]) return;
  state.storage[index].locked = !state.storage[index].locked;
  storageRenderCount = -1;
  saveGame();
  renderAll();
}

function missionProgress(party) {
  if (!party.mission) return 0;
  const { startedAt, endsAt } = party.mission;
  const total = endsAt - startedAt;
  return total <= 0 ? 100 : clamp(((Date.now() - startedAt) / total) * 100, 0, 100);
}

function progressStage(progress) {
  if (progress <= 35) return { key: "explore", label: "探索中" };
  if (progress <= 70) return { key: "danger", label: "危険区域" };
  if (progress <= 90) return { key: "boss", label: "ボス接近" };
  return { key: "return", label: "帰還準備" };
}

function progressLabel(party) {
  if (!party.mission) return "冒険へ行く";
  const progress = Math.round(missionProgress(party));
  return `${progressStage(progress).label} ${progress}%`;
}

function applyProgressState(wrap, party) {
  const bar = wrap.querySelector(".btn-progress");
  const label = wrap.querySelector(".btn-label");
  if (!party?.mission || !bar) return;

  const progress = missionProgress(party);
  const stage = progressStage(progress);
  bar.style.width = `${progress}%`;
  bar.className = `btn-progress progress-${stage.key}`;
  if (label) label.textContent = `${stage.label} ${Math.round(progress)}%`;
}

function startMission(partyId) {
  const party = getParty(partyId);
  if (!party || party.mission) return;

  ensureValidSelectedArea(party);
  if (!isAreaUnlocked(party.selectedArea)) return;

  const area = getArea(party.selectedArea);
  party.members.forEach((member) => {
    if (member.hp <= 0) member.hp = member.maxHp;
  });
  const startMembersSnapshot = snapshotMembers(party.members);
  const rewards = generateBattle(area, party);
  const now = Date.now();
  const plannedEndsAt = now + missionDurationMs(area, party);
  const endsAt = plannedEndsAt - shortcutMissionReductionMs(area, rewards, party);
  const dispatchId = uid("dispatch");
  applyMembersSnapshot(party, startMembersSnapshot);

  party.dispatches.unshift({
    id: dispatchId,
    areaId: area.id,
    areaName: area.name,
    startedAt: now,
    endsAt,
    status: "active",
    entries: [],
  });
  trimDispatches(party);

  party.mission = {
    dispatchId,
    areaId: area.id,
    startedAt: now,
    endsAt,
    plannedEndsAt,
    rewards,
    failed: false,
    startMembersSnapshot,
    journal: buildScheduledJournalV2(party, area, rewards, now, endsAt),
  };

  party.stats.missionsStarted += 1;
  revealDueEntries(party);

  saveGame();
  renderPartyCard(party);
  renderReports();
  renderLogs();
  ensureTick();
}

function completeMission(party) {
  if (!party.mission) return;

  const area = getArea(party.mission.areaId);
  const dispatch = party.dispatches.find((d) => d.id === party.mission.dispatchId);
  revealDueEntries(party);

  if (dispatch) {
    dispatch.status = "complete";
    dispatch.endsAt = party.mission.endsAt;
    dispatch.summary = party.mission.journal.find((e) => e.type === "return")?.summary;
  }

  const missionFailed = party.mission.failed;

  if (!missionFailed && !party.mission.rewards?.noRewards) {
    recordAreaClear(area.id);
  }
  applyRewards(party, area, party.mission.rewards);
  party.mission = null;

  saveGame();
  updatePartyCards();
  renderReports();
  renderStages();
  renderWorldSituation();
  storageRenderCount = -1;
  renderStorage();
  renderRecordsSection();
  renderStats();
  renderLogs();
}

function processMissions() {
  let dirty = false;
  const dirtyPartyIds = new Set();
  for (const party of state.parties) {
    if (!party.mission) continue;
    if (revealDueEntries(party)) {
      dirty = true;
      dirtyPartyIds.add(party.id);
    }
    if (party.mission.failed) {
      completeMission(party);
    }
    else if (Date.now() >= party.mission.endsAt) {
      party.mission.failed = !!party.mission.rewards?.failed;
      completeMission(party);
    }
  }

  updateProgressBars();
  if (dirtyPartyIds.size) updatePartyCards(dirtyPartyIds);
  if (dirty) renderLogs();
  if (!state.parties.some((p) => p.mission)) stopTick();
}

function updateProgressBars() {
  document.querySelectorAll("[data-progress]").forEach((wrap) => {
    const party = getParty(wrap.dataset.progress);
    applyProgressState(wrap, party);
  });
}

function currentDispatchLabel(dispatch) {
  if (dispatch.status === "active") return `いまの派遣（${dispatch.areaName}）`;
  return `直近の派遣（${dispatch.areaName}）`;
}

function pastDispatchLabel(pastIndex, dispatch) {
  return `${pastIndex}回前の派遣（${dispatch.areaName}）`;
}

function entryButtonHtml(entry, open) {
  const monsterTag = entry.monsterBoss
    ? '<span class="enemy-tag boss-tag">[BOSS]</span>'
    : entry.monsterRare
      ? '<span class="enemy-tag rare-tag">[RARE]</span>'
      : "";
  const debug = state.developerMode && entry.debug?.length
    ? `<br><span class="log-debug">[DEBUG]</span>${entry.debug.map((line) => `<br><span class="log-debug">${line}</span>`).join("")}`
    : "";
  let title = entry.title;
  if (entry.type === "return") {
    title = title.replace(/（全戦闘記録[▼▲]）$/, "");
    title += open ? "（全戦闘記録▲）" : "（全戦闘記録▼）";
  } else if (entry.battleDetail?.length) {
    title += open ? " ▲" : " ▼";
  }
  return `<span class="time">${formatClock(entry.timestamp)}</span>${title}${debug}${monsterTag}`;
}

function renderLogEntry(entry) {
  const hasBattle = entry.battleDetail?.length > 0;
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    "log-entry" +
    (entry.type === "flavor" ? " flavor" : "") +
    (entry.type === "battle" ? " battle" : "") +
    (hasBattle ? " clickable" : "");

  btn.innerHTML = entryButtonHtml(entry, false);
  li.appendChild(btn);

  if (hasBattle) {
    const detail = document.createElement("div");
    detail.className = "battle-detail";
    detail.innerHTML = entry.type === "return" && entry.reportAuthor
      ? `<p>${entry.reportAuthor}からの報告</p>`
      : "";
    const detailEvents = entry.type === "battle"
      ? entry.battleDetail.filter((ev) => !isEquipmentDropEvent(ev))
      : entry.battleDetail;
    detail.innerHTML += detailEvents
      .map((ev, index, events) => `<p class="${battleEventClass(ev, events[index - 1])}">${ev.text}</p>`)
      .join("");
    if (entry.summary && entry.type === "return") {
      detail.innerHTML += `<p><strong>合計:</strong> ${entry.summary}</p>`;
    }
    if (entry.mvpLine && entry.type === "return") {
      detail.innerHTML += `<p>${entry.mvpLine}</p>`;
    }
    li.appendChild(detail);
    if (entry.deliveryBox && entry.type === "return") {
      const delivery = document.createElement("div");
      delivery.className = "delivery-box";
      delivery.innerHTML = entry.deliveryBox;
      li.appendChild(delivery);
    }
    btn.addEventListener("click", () => {
      const open = detail.classList.toggle("open");
      btn.innerHTML = entryButtonHtml(entry, open);
    });
  }

  return li;
}

function isEquipmentDropEvent(event) {
  const text = event?.text || "";
  return /rarity-[a-z]+/.test(text) && /(見つけた|売却した|売却)/.test(text);
}

function battleEventClass(event, prevEvent = null) {
  const kind = event.kind || "";
  const classes = kind.split(/\s+/).filter(Boolean);
  if (kind === "turn-separator" || kind === "action-break") return kind;
  if (kind === "intro") return kind;
  if (classes.includes("initial-hp")) return kind;
  if ((event.text || "").includes("hp-text")) {
    const prevClasses = (prevEvent?.kind || "").split(/\s+/);
    return classes.includes("enemy-action") || prevClasses.includes("enemy-action")
      ? `${kind} enemy-action enemy-hp`.trim()
      : `${kind} ally-action ally-hp`.trim();
  }
  if (classes.includes("enemy-action")) return kind;
  return `${kind} ally-action`.trim();
}

function appendEntriesToList(ul, entries) {
  if (!entries.length) {
    ul.innerHTML = '<li class="log-empty">ログ待機中...</li>';
    return;
  }
  [...entries]
    .sort((a, b) => {
      const timeDiff = b.timestamp - a.timestamp;
      if (timeDiff) return timeDiff;
      if (a.type === "return" && b.type !== "return") return -1;
      if (b.type === "return" && a.type !== "return") return 1;
      return 0;
    })
    .forEach((entry) => ul.appendChild(renderLogEntry(entry)));
}

function renderCurrentDispatchLog(root, party) {
  const dispatch = party.dispatches[0];
  if (!dispatch) {
    root.innerHTML = '<p class="log-empty">まだログがありません</p>';
    return;
  }

  const cap = document.createElement("p");
  cap.className = "current-dispatch-label";
  cap.textContent = currentDispatchLabel(dispatch);
  if (dispatch.status === "active") cap.textContent += ` · ${formatClock(dispatch.endsAt)}まで`;
  root.appendChild(cap);

  const ul = document.createElement("ul");
  ul.className = "adventure-log";
  appendEntriesToList(ul, dispatch.entries);
  root.appendChild(ul);
}

function renderPastDispatchLog(root, party) {
  const past = party.dispatches.slice(1);
  if (!past.length) {
    root.innerHTML = '<p class="log-empty">過去の派遣はありません</p>';
    return;
  }

  past.forEach((dispatch, i) => {
    const pastIndex = i + 1;
    const expanded = (party.expandedDispatchIds || []).includes(dispatch.id);
    const group = document.createElement("div");
    group.className = "dispatch-group" + (expanded ? "" : " collapsed");

    const head = document.createElement("button");
    head.type = "button";
    head.className = "dispatch-head";
    const sub = dispatch.summary ? dispatch.summary : `${formatClock(dispatch.endsAt)} 帰還`;
    head.innerHTML = `${pastDispatchLabel(pastIndex, dispatch)}<br><span class="sub">${sub}</span>`;
    head.addEventListener("click", () => {
      if (!party.expandedDispatchIds) party.expandedDispatchIds = [];
      const ids = party.expandedDispatchIds;
      const idx = ids.indexOf(dispatch.id);
      if (idx >= 0) ids.splice(idx, 1);
      else ids.push(dispatch.id);
      saveGame();
      renderLogs();
    });

    const body = document.createElement("div");
    body.className = "dispatch-body";
    const ul = document.createElement("ul");
    ul.className = "adventure-log";
    appendEntriesToList(ul, dispatch.entries);
    body.appendChild(ul);
    group.appendChild(head);
    group.appendChild(body);
    root.appendChild(group);
  });
}

function memberChips(party) {
  const selectedMemberId = selectedDetailMemberByPartyId.has(party.id)
    ? selectedDetailMemberByPartyId.get(party.id)
    : party.members[0]?.id;
  return party.members
    .map((m) => {
      const hpRate = m.maxHp > 0 ? (m.hp / m.maxHp) * 100 : 0;
      let hpClass = "hp-safe";
      let hpText = `${m.hp}/${m.maxHp}`;
      if (m.hp <= 0) {
        hpClass = "hp-down";
        hpText = "戦闘不能";
      } else if (hpRate < 30) {
        hpClass = "hp-danger";
      } else if (hpRate < 50) {
        hpClass = "hp-caution";
      } else if (hpRate < 70) {
        hpClass = "hp-warn";
      }
      return `<button type="button" class="member-chip ${hpClass}${selectedMemberId === m.id ? " active" : ""}" data-member-detail-open="${m.id}" aria-pressed="${selectedMemberId === m.id ? "true" : "false"}">
        <span class="member-name">${m.name}</span>
        <span class="member-job">${JOB_LABELS[m.job]}</span>
        <span class="member-hp">${hpText}</span>
      </button>`;
    })
    .join("");
}

function memberStatValue(value) {
  return value == null ? "-" : value;
}

function memberEquipmentBonusValue(member, key) {
  return getEquipmentBonus(member)?.[key] || 0;
}

function memberEquipmentBreakdown(member) {
  return typeof getEquipmentStatBreakdown === "function"
    ? getEquipmentStatBreakdown(member)
    : null;
}

function signedValueText(value, suffix = "") {
  const num = Number(value) || 0;
  const sign = num >= 0 ? "+" : "-";
  return `${sign}${Math.abs(num)}${suffix}`;
}

function percentValueText(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function memberStatBreakdownData(member, key) {
  const breakdown = memberEquipmentBreakdown(member);
  if (!breakdown) {
    const total = Number(member?.[key]);
    return Number.isFinite(total) ? { total, base: total, equipment: 0, option: 0 } : null;
  }
  const total = Number(breakdown.total?.[key]);
  const base = Number(breakdown.base?.[key]);
  const equipment = Number(breakdown.equipment?.[key]);
  const option = Number(breakdown.option?.[key]);
  if (![total, base, equipment, option].every(Number.isFinite)) return null;
  return { total, base, equipment, option };
}

function memberStatLineHtml(member, key, label) {
  const data = memberStatBreakdownData(member, key);
  if (!data) {
    return `<div class="member-stat-row">
      <span class="member-stat-label">${label}</span>
      <strong class="member-stat-total">-</strong>
      <span class="member-stat-part">-</span>
      <span class="member-stat-part">-</span>
      <span class="member-stat-part">-</span>
    </div>`;
  }
  return `<div class="member-stat-row">
    <span class="member-stat-label">${label}</span>
    <strong class="member-stat-total">${data.total}</strong>
    <span class="member-stat-part">${data.base}</span>
    <span class="member-stat-part">${signedValueText(data.equipment)}</span>
    <span class="member-stat-part">${signedValueText(data.option)}</span>
  </div>`;
}

function memberStatHeaderHtml() {
  return `<div class="member-stat-row member-stat-row-header" aria-hidden="true">
    <span class="member-stat-label"></span>
    <span class="member-stat-total"></span>
    <span class="member-stat-part">基礎</span>
    <span class="member-stat-part">装備</span>
    <span class="member-stat-part">OP</span>
  </div>`;
}

function memberCriticalStatRowsHtml(member) {
  const breakdown = memberEquipmentBreakdown(member);
  const criticalRate = percentValueText(breakdown?.total?.criticalRate || member?.criticalRate || 0);
  const criticalDamage = percentValueText(breakdown?.total?.criticalDamage || 0);
  return `<div class="member-stat-row">
    <span class="member-stat-label">CRI</span>
    <strong class="member-stat-total">${criticalRate}</strong>
    <span class="member-stat-part">0%</span>
    <span class="member-stat-part">+0%</span>
    <span class="member-stat-part">+${criticalRate}</span>
  </div>
  <div class="member-stat-row">
    <span class="member-stat-label">CRD</span>
    <strong class="member-stat-total">${criticalDamage}</strong>
    <span class="member-stat-part">0%</span>
    <span class="member-stat-part">+0%</span>
    <span class="member-stat-part">+${criticalDamage}</span>
  </div>`;
}

function memberStatusStrikeRateText(member) {
  const rates = typeof getEquipmentStatusStrikeRates === "function"
    ? getEquipmentStatusStrikeRates(member)
    : { poison: 0, blind: 0 };
  const parts = [];
  if (rates.poison > 0) parts.push(`毒${Math.round(rates.poison * 100)}%`);
  if (rates.blind > 0) parts.push(`盲目${Math.round(rates.blind * 100)}%`);
  return parts.length ? `付与率：${parts.join(" / ")}` : "";
}

function memberExtraInfoItemHtml(label, value) {
  return `<li><span>${label}</span><strong>${value}</strong></li>`;
}

function memberStatusAilmentBoxHtml(member) {
  const rates = typeof getEquipmentStatusStrikeRates === "function"
    ? getEquipmentStatusStrikeRates(member)
    : { poison: 0, blind: 0 };
  const items = [
    ["毒", percentValueText(rates.poison || 0)],
    ["麻痺", "0%"],
    ["盲目", percentValueText(rates.blind || 0)],
    ["睡眠", "0%"],
    ["凍結", "0%"],
    ["出血", "0%"],
  ];
  return `<div class="member-extra-box">
    <div class="member-extra-title">状態異常</div>
    <ul class="member-extra-list">${items.map(([label, value]) => memberExtraInfoItemHtml(label, value)).join("")}</ul>
  </div>`;
}

function memberResistanceBoxHtml() {
  const items = [
    ["火耐性", "0%"],
    ["水耐性", "0%"],
    ["草耐性", "0%"],
  ];
  return `<div class="member-extra-box">
    <div class="member-extra-title">耐性・装備効果</div>
    <ul class="member-extra-list">${items.map(([label, value]) => memberExtraInfoItemHtml(label, value)).join("")}</ul>
  </div>`;
}

function memberSetSummaryLines(member) {
  const sets = typeof getActiveSetBonuses === "function" ? getActiveSetBonuses(member) : [];
  if (!sets.length) return ["なし"];
  const [set] = sets;
  const lines = [set.name];
  if (Array.isArray(set.displayLines) && set.displayLines.length) {
    return lines.concat(set.displayLines).slice(0, 3);
  }
  const labels = { maxHp: "HP", atk: "ATK", def: "DEF", dex: "DEX", luc: "LUC" };
  for (const key of ["maxHp", "atk", "def", "dex", "luc"]) {
    if (!set?.bonus?.[key]) continue;
    lines.push(`${labels[key]} ${signedValueText(set.bonus[key])}`);
  }
  return lines.slice(0, 3);
}

function memberSetBoxHtml(member) {
  const lines = memberSetSummaryLines(member);
  const noteHtml = lines[0] !== "なし" ? '<li class="member-extra-set-note">※重複不可</li>' : "";
  return `<div class="member-extra-box member-extra-box-set">
    <div class="member-extra-title">セット装備</div>
    <ul class="member-extra-list member-extra-set-list">${lines.map((text) => `<li><strong>${text}</strong></li>`).join("")}${noteHtml}</ul>
  </div>`;
}

function memberExtraInfoGridHtml(member) {
  return `<div class="member-extra-grid">
    ${memberStatusAilmentBoxHtml(member)}
    ${memberResistanceBoxHtml()}
    ${memberSetBoxHtml(member)}
  </div>`;
}

function memberFormation(member) {
  return member.formation || "中衛";
}

function selectedMemberDetailTab(memberId) {
  return selectedDetailTabByMemberId.get(memberId) || "status";
}

function selectedDetailMember(party) {
  const selectedMemberId = selectedDetailMemberByPartyId.get(party.id);
  return party.members.find((member) => member.id === selectedMemberId) || party.members[0] || null;
}

function memberOverviewHtml(member, partyId) {
  return `<div class="member-detail-head">
    <div class="member-detail-head-top">
      <strong>${member.name}　Lv${member.level || 1}</strong>
      <button type="button" class="member-detail-close" data-party-detail-close="${partyId}">閉じる</button>
    </div>
    <span>${JOB_LABELS[member.job] || member.job}</span>
    <span class="member-formation">【${memberFormation(member)}】</span>
  </div>`;
}

function memberStatusPanelHtml(member) {
  return `<div class="member-detail-panel member-detail-panel-status">
    <div class="member-stat-grid">
      ${memberStatHeaderHtml()}
      ${memberStatLineHtml(member, "maxHp", "HP")}
      ${memberStatLineHtml(member, "atk", "ATK")}
      ${memberStatLineHtml(member, "def", "DEF")}
      ${memberStatLineHtml(member, "dex", "DEX")}
      ${memberStatLineHtml(member, "luc", "LUC")}
      ${memberCriticalStatRowsHtml(member)}
    </div>
    ${memberExtraInfoGridHtml(member)}
  </div>`;
}

function memberEquipmentPanelHtml(member) {
  return `<div class="member-detail-panel member-detail-panel-equipment">
    <div class="member-equipment">${EQUIPMENT_SLOTS.map(({ key }) => equipmentSlotRowHtml(member, key)).join("")}</div>
  </div>`;
}

function memberSkillPanelHtml(member) {
  return `<div class="member-detail-panel member-detail-panel-skills">
    ${memberSkillListHtml(member)}
  </div>`;
}

function memberDetailTabsHtml(member) {
  const selectedTab = selectedMemberDetailTab(member.id);
  const tabs = [
    { key: "status", label: "ステータス" },
    { key: "equipment", label: "装備" },
    { key: "skills", label: "スキル" },
  ];
  return `<div class="member-detail-tabs" role="tablist" aria-label="${member.name}の詳細切替">
    ${tabs
      .map(
        (tab) => `<button type="button" class="member-detail-tab${selectedTab === tab.key ? " active" : ""}" data-member-id="${member.id}" data-detail-tab="${tab.key}" role="tab" aria-selected="${selectedTab === tab.key ? "true" : "false"}">${tab.label}</button>`
      )
      .join("")}
  </div>`;
}

function equipmentSlotLabel(slot) {
  return EQUIPMENT_SLOTS.find(({ key }) => key === slot)?.label || slot;
}

function equipmentSlotKind(slot) {
  return EQUIPMENT_SLOTS.find(({ key }) => key === slot)?.kind || slot;
}

function isEquipmentSlot(slot) {
  return EQUIPMENT_SLOTS.some(({ key }) => key === slot);
}

function equipmentCandidateList(member, slot) {
  const kind = equipmentSlotKind(slot);
  const equipment = ensureCharacterEquipment(member);
  const equippedItem = storageItemFromEquipmentId(equipment[slot]);
  const hasItem = !!equippedItem;
  const candidates = (state.storage || [])
    .map((rawItem, index) => ({ item: storageItemFromEquipment(rawItem), index }))
    .filter(({ item }) => item?.slot === kind)
    .filter(({ item }) => equipmentFilterMatches(item))
    .sort(compareEquipmentSelectionEntries);

  const currentChoice = hasItem
    ? `<div class="equip-choice-current ${rarityClassName(equippedItem.rarity)}" aria-disabled="true">
        <span class="equip-choice-head"><strong>現在：${equipmentDisplayName(equippedItem)}</strong><span>${normalizeRarity(equippedItem.rarity)}</span></span>
        ${equipmentSetLabelHtml(equippedItem)}
        <span class="equip-choice-meta">${equipmentStatLine(equippedItem)}</span>
        ${equipmentOptionsStorageHtml(equippedItem)}
      </div>`
    : "";

  const removeChoice = hasItem
    ? `<button type="button" class="equip-choice-btn unequip-choice-btn" data-unequip="true" data-member-id="${member.id}" data-slot="${slot}">
        <span class="equip-choice-head"><strong>なし</strong><span>解除</span></span>
        <span class="equip-choice-meta">装備を外す</span>
      </button>`
    : "";
  const filterActive = equipmentFilterActiveCount() > 0;
  const filterChoice = `<div class="equipment-filter-anchor">
        <button type="button" class="equip-choice-btn equip-choice-control-btn" data-equipment-filter-toggle aria-expanded="${equipmentFilterOpen}">
          <span class="equip-choice-head"><strong>フィルター</strong></span>
          <span class="equip-choice-meta ${filterActive ? "equipment-filter-active" : "equipment-filter-inactive"}">${filterActive ? "選択中" : "未選択"}</span>
        </button>
        ${equipmentFilterPanelHtml()}
      </div>`;

  const currentRow = currentChoice
    ? `<div class="equipment-candidate-row equipment-candidate-current-row">${currentChoice}</div>`
    : "";
  const actionRow = `<div class="equipment-candidate-row equipment-candidate-action-row">${removeChoice}${filterChoice}</div>`;
  const emptyHtml = !candidates.length ? '<p class="equipment-empty">保管庫に候補はありません</p>' : "";

  return currentRow + actionRow + emptyHtml + candidates
    .map(({ item, index }) => {
      const compareContext = buildEquipmentCompareContext(member, slot, item);
      return `<button type="button" class="equip-choice-btn ${rarityClassName(item.rarity)}" data-storage-index="${index}" data-member-id="${member.id}" data-slot="${slot}">
        ${equipmentCandidateHeaderHtml(item)}
        ${equipmentSetLabelHtml(item)}
        <span class="equip-choice-meta">${equipmentPrimaryStatCandidateHtml(item, equippedItem, slot, compareContext)}</span>
        ${equipmentOptionsStorageHtml(item, { compareEquippedItem: equippedItem, compareContext })}
      </button>`;
    })
    .join("");
}

function equipmentSlotHtml(member, slot) {
  const equipment = ensureCharacterEquipment(member);
  const item = storageItemFromEquipmentId(equipment[slot]);
  const rarity = normalizeRarity(item?.rarity);
  const name = item ? equipmentDisplayName(item) : "なし";
  const optionLine = item ? equipmentOptionNameLevelLine(item) : "";
  return `<div class="member-equipment-slot">
    <button type="button" class="equip-slot-btn" data-member-id="${member.id}" data-slot="${slot}">
      <span>${equipmentSlotLabel(slot)}</span>
      <div class="equip-slot-main">
        <strong class="${rarityClassName(rarity)}">${name}</strong>
        ${item ? equipmentSetLabelHtml(item) : ""}
        ${item ? `<small class="equip-slot-meta">${equipmentStatLine(item)}</small>` : ""}
        ${optionLine ? `<small class="equip-slot-option">${optionLine}</small>` : ""}
      </div>
    </button>
  </div>`;
}

function equipmentSlotRowHtml(member, slot) {
  return `<div class="member-equipment-entry">
    ${equipmentSlotHtml(member, slot)}
    <div class="equipment-candidates" ${isEquipmentSlotOpen(member.id, slot) ? "" : "hidden"}>${equipmentCandidateList(member, slot)}</div>
  </div>`;
}

function skillDebugHtml(skill) {
  const debugInfo = typeof SKILL_DEBUG_INFO === "object" ? SKILL_DEBUG_INFO : {};
  const lines = skill?.debug || debugInfo[skill?.id] || [];
  if (!state.developerMode || !lines.length) return "";
  return `<div class="skill-debug"><strong>[詳細条件]</strong>${lines.map((line) => `<span>${line}</span>`).join("")}</div>`;
}

function skillDescriptionHtml(skill) {
  const effectLines = Array.isArray(skill?.effectLines) ? skill.effectLines.filter(Boolean) : [];
  const fallbackLines = effectLines.length ? effectLines : skill?.description ? [skill.description] : [];
  if (!fallbackLines.length && !skill?.noteLine) return "";
  const linesHtml = fallbackLines.map((line) => `<span class="skill-description-line">${line}</span>`).join("");
  const noteHtml = skill?.noteLine ? `<span class="skill-description-note">${skill.noteLine}</span>` : "";
  return `<div class="skill-description">${linesHtml}${noteHtml}</div>`;
}

function skillTypeHtml(skill) {
  const labels = { active: "【アクティブ】", passive: "【パッシブ】" };
  const label = labels[skill?.type];
  return label ? `<span class="skill-type">${label}</span>` : "";
}

function memberSkillListHtml(member) {
  const skills = JOB_SKILLS?.[member.job] || [];
  if (!skills.length) return "";
  const settings = normalizeSkillSettings(member);
  return `<div class="member-skills">
    <div class="member-skills-title">スキル：</div>
    <ul>
      ${skills
        .map(
          (skill) => {
            const learned = typeof isSkillLearned === "function" ? isSkillLearned(member, skill) : true;
            const requiredLevel = Math.max(1, Number(skill?.requiredLevel) || 1);
            const learnNote = learned ? "" : `<span class="skill-description-note">Lv${requiredLevel}で習得</span>`;
            return `<li data-skill-id="${skill.id}" class="${learned ? "skill-learned" : "skill-unlearned"}">
              <label>
                <input type="checkbox" class="skill-toggle" data-member-id="${member.id}" data-skill-id="${skill.id}" ${learned && settings[skill.id] !== false ? "checked" : ""} ${learned ? "" : "disabled"}>
                <strong>${skill.name}</strong>
                ${skillTypeHtml(skill)}
              </label>
              ${skillDescriptionHtml(skill)}
              ${learnNote}
              ${skillDebugHtml(skill)}
            </li>`;
          }
        )
        .join("")}
    </ul>
  </div>`;
}

function setMemberSkillSetting(memberId, skillId, enabled) {
  const member = findMemberById(memberId);
  if (!member || !skillId) return;
  member.skillSettings = normalizeSkillSettings(member);
  member.skillSettings[skillId] = !!enabled;
  saveGame();
}

function memberDetails(party) {
  const m = selectedDetailMember(party);
  if (!m) return "";
  return `<div class="member-detail-card ${!party.mission && m.hp <= 0 ? "down" : ""}">
        ${memberOverviewHtml(m, party.id)}
        ${memberDetailTabsHtml(m)}
        <div class="member-detail-panels">
          <div class="member-detail-tab-panel" ${selectedMemberDetailTab(m.id) === "status" ? "" : "hidden"} data-member-id="${m.id}" data-detail-panel="status">${memberStatusPanelHtml(m)}</div>
          <div class="member-detail-tab-panel" ${selectedMemberDetailTab(m.id) === "equipment" ? "" : "hidden"} data-member-id="${m.id}" data-detail-panel="equipment">${memberEquipmentPanelHtml(m)}</div>
          <div class="member-detail-tab-panel" ${selectedMemberDetailTab(m.id) === "skills" ? "" : "hidden"} data-member-id="${m.id}" data-detail-panel="skills">${memberSkillPanelHtml(m)}</div>
        </div>
      </div>`;
}

function areaOptions(party, selected) {
  return AREA_ORDER.map((id) => {
    const a = AREAS[id];
    const unlocked = isAreaUnlocked(id);
    const actualDurationMs = missionDurationMs(a, party);
    const label = unlocked ? `${a.name}（${formatMissionDurationLabel(actualDurationMs)}）` : a.name;
    return `<option value="${id}" ${id === selected ? "selected" : ""} ${unlocked ? "" : "disabled"}>${label}</option>`;
  }).join("");
}

function updatePartyCards(targetPartyIds = null) {
  const targetIds = targetPartyIds ? new Set([...targetPartyIds].map(String)) : null;
  document.querySelectorAll("[data-party-card]").forEach((card) => {
    const partyId = String(card.dataset.partyCard || "");
    if (targetIds && !targetIds.has(partyId)) return;
    const party = getParty(partyId);
    if (!party) return;
    renderPartyCard(party);
  });
}

function createPartyCard(party) {
  const on = !!party.mission;
  const area = on ? getArea(party.mission.areaId) : getArea(party.selectedArea);
  const card = document.createElement("div");
  card.className = "party-card" + (on ? " on-mission-card" : "");
  card.dataset.partyCard = party.id;
  card.innerHTML = renderPartyCardContent(party, on, area);

  if (!on) {
    card.querySelector(".area-select").addEventListener("change", (e) => {
      party.selectedArea = e.target.value;
      saveGame();
    });
  }
  const detailToggle = card.querySelector(".detail-toggle");
  const memberDetailsRoot = card.querySelector(".member-details");
  if (memberDetailsRoot && openDetailPartyIds.has(party.id)) {
    memberDetailsRoot.removeAttribute("hidden");
    detailToggle?.setAttribute("aria-expanded", "true");
    if (detailToggle) detailToggle.textContent = "閉じる";
  }
  detailToggle?.addEventListener("click", () => {
    if (!memberDetailsRoot) return;
    const open = memberDetailsRoot.hasAttribute("hidden");
    memberDetailsRoot.toggleAttribute("hidden", !open);
    detailToggle.setAttribute("aria-expanded", String(open));
    detailToggle.textContent = open ? "閉じる" : "詳細";
    if (open) openDetailPartyIds.add(party.id);
    else openDetailPartyIds.delete(party.id);
  });
  card.querySelectorAll("[data-member-detail-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const memberId = button.dataset.memberDetailOpen;
      if (!memberId) return;
      const selectedMemberId = selectedDetailMemberByPartyId.get(party.id);
      if (selectedMemberId === memberId && openDetailPartyIds.has(party.id)) {
        selectedDetailMemberByPartyId.set(party.id, null);
        openDetailPartyIds.delete(party.id);
      } else {
        selectedDetailMemberByPartyId.set(party.id, memberId);
        openDetailPartyIds.add(party.id);
      }
      renderPartyCard(party);
    });
  });
  card.querySelectorAll("[data-party-detail-close]").forEach((button) => {
    button.addEventListener("click", () => {
      openDetailPartyIds.delete(party.id);
      renderPartyCard(party);
    });
  });
  card.querySelectorAll(".equip-slot-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const memberId = String(button.dataset.memberId || "");
      const slot = String(button.dataset.slot || "");
      const open = !isEquipmentSlotOpen(memberId, slot);
      openEquipmentSlotsByMemberId.delete(memberId);
      equipmentFilterOpen = false;
      if (open) openEquipmentSlotsByMemberId.set(memberId, slot);
      renderPartyCard(party);
    });
  });
  card.querySelectorAll(".member-detail-tab").forEach((button) => {
    button.addEventListener("click", () => {
      const memberId = button.dataset.memberId;
      const tab = button.dataset.detailTab || "status";
      selectedDetailTabByMemberId.set(memberId, tab);
      const memberCard = button.closest(".member-detail-card");
      if (!memberCard) return;
      memberCard.querySelectorAll(".member-detail-tab").forEach((tabButton) => {
        const active = tabButton === button;
        tabButton.classList.toggle("active", active);
        tabButton.setAttribute("aria-selected", String(active));
      });
      memberCard.querySelectorAll(".member-detail-tab-panel").forEach((panel) => {
        panel.toggleAttribute("hidden", panel.dataset.detailPanel !== tab);
      });
    });
  });
  card.querySelectorAll(".equip-choice-btn").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.equipmentFilterToggle !== undefined) return;
      if (button.dataset.unequip === "true") {
        unequipMemberItem(button.dataset.memberId, button.dataset.slot);
        return;
      }
      equipStorageItem(Number(button.dataset.storageIndex), button.dataset.memberId, button.dataset.slot);
    });
  });
  card.querySelectorAll("[data-equipment-filter-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      clearButtonFocus(button);
      equipmentFilterOpen = !equipmentFilterOpen;
      renderPartyCard(party);
    });
  });
  card.querySelectorAll("[data-equipment-filter-close]").forEach((button) => {
    button.addEventListener("click", () => {
      clearButtonFocus(button);
      equipmentFilterOpen = false;
      renderPartyCard(party);
    });
  });
  card.querySelectorAll("[data-equipment-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      clearButtonFocus(button);
      const value = button.dataset.equipmentFilter || "all";
      if (equipmentFilterRarities.has(value)) {
        equipmentFilterRarities.delete(value);
      } else {
        equipmentFilterRarities.add(value);
      }
      renderPartyCard(party);
    });
  });
  card.querySelectorAll("[data-equipment-filter-option]").forEach((button) => {
    button.addEventListener("click", () => {
      clearButtonFocus(button);
      const value = button.dataset.equipmentFilterOption || "";
      if (!value) return;
      if (equipmentFilterOptions.has(value)) {
        equipmentFilterOptions.delete(value);
      } else {
        equipmentFilterOptions.add(value);
      }
      renderPartyCard(party);
    });
  });
  card.querySelectorAll("[data-equipment-filter-reset]").forEach((button) => {
    button.addEventListener("click", () => {
      clearButtonFocus(button);
      equipmentFilterRarities.clear();
      equipmentFilterOptions.clear();
      renderPartyCard(party);
    });
  });
  card.querySelectorAll(".skill-toggle").forEach((input) => {
    input.addEventListener("change", () => {
      setMemberSkillSetting(input.dataset.memberId, input.dataset.skillId, input.checked);
    });
  });
  card.querySelectorAll("[data-area-detail-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const currentAreaId = party.mission?.areaId || card.querySelector(".area-select")?.value || party.selectedArea || button.dataset.areaDetailOpen;
      if (!currentAreaId) return;
      openAreaDetailModal(currentAreaId, party.id);
    });
  });
  card.querySelector(".dispatch-btn")?.addEventListener("click", () => startMission(party.id));
  return card;
}

function renderPartyCardContent(party, on, area) {
  return `
      ${renderPartySummarySection(party, on, area)}
      ${renderMemberSection(party)}
      ${renderExpeditionSection(party, on, area)}
    `;
}

function renderPartySummarySection(party, on, area) {
  const leader = party.members?.[0] || party.hero || {};
  return `
      <div class="party-card-head">
        <h3>${party.name}</h3>
      </div>
      <div class="row"><span>隊長 ${leader.name || "-"}</span><span class="muted">Lv.${leader.level || 1}</span></div>
      <div class="row">
        <span class="${on ? "status-mission" : "status-idle"}">${on ? `${area.name}で戦闘中` : "派遣待機中"}</span>
        <span class="muted leader-hp">HP ${leader.hp ?? "-"}/${leader.maxHp ?? "-"}</span>
      </div>
    `;
}

function renderMemberSection(party) {
  return `
      <div class="member-list">${memberChips(party)}</div>
      <div class="member-details" hidden>${memberDetails(party)}</div>
    `;
}

function renderExpeditionSection(party, on, area) {
  return `
      <div class="eta">帰還予定：${on ? formatClock(party.mission.endsAt) : "--"}</div>
      <label class="field-label">派遣先</label>
      <select class="area-select" ${on ? "disabled" : ""}>${areaOptions(party, party.selectedArea)}</select>
      <button type="button" class="ghost area-detail-btn" data-area-detail-open="${area.id}">詳細</button>
      <div class="dispatch-wrap" data-progress="${party.id}">
        <button type="button" class="primary dispatch-btn ${on ? "on-mission" : ""}" ${on ? "disabled" : ""}>
          <span class="btn-progress ${on ? `progress-${progressStage(missionProgress(party)).key}` : ""}" style="width:${on ? missionProgress(party) : 0}%"></span>
          <span class="btn-label">${progressLabel(party)}</span>
        </button>
      </div>
    `;
}

function renderPartyCard(party) {
  const current = document.querySelector(`[data-party-card="${party.id}"]`);
  const next = createPartyCard(party);
  if (current) current.replaceWith(next);
  else $("parties-root").appendChild(next);
}

function renderParties() {
  const root = $("parties-root");
  if (!root) return;
  root.innerHTML = "";

  for (const party of state.parties) {
    root.appendChild(createPartyCard(party));
  }
}

function renderPartySection() {
  renderParties();
  document.querySelector("[data-area-detail-modal-root]")?.remove();
  const modalHtml = areaDetailModalHtml();
  if (!modalHtml) return;
  document.body.insertAdjacentHTML("beforeend", modalHtml);
  const modalRoot = document.querySelector("[data-area-detail-modal-root]");
  modalRoot?.querySelectorAll("[data-area-detail-close]").forEach((button) => {
    button.addEventListener("click", () => closeAreaDetailModal());
  });
  modalRoot?.addEventListener("click", (event) => {
    if (event.target === modalRoot) closeAreaDetailModal();
  });
  modalRoot?.querySelector(".area-detail-modal")?.addEventListener("click", (event) => {
    event.stopPropagation();
  });
}

function updateDeveloperButton() {
  const button = $("developer-btn");
  if (!button) return;
  button.classList.toggle("active", !!state.developerMode);
  button.setAttribute("aria-pressed", String(!!state.developerMode));
}

function toggleDeveloperMode() {
  state.developerMode = !state.developerMode;
  saveGame();
  updateDeveloperButton();
  renderPartySection();
}

function renderReports() {
  const root = $("reports-root");
  if (!root) return;
  root.innerHTML = state.parties
    .map((p) => {
      const r = p.lastReport;
      const body = r
        ? `<strong>${p.name}</strong>が<strong>${r.areaName}</strong>から帰還。<br>${r.monsters} など <strong>${r.kills}</strong> 体、<strong>${r.gold}</strong> G、<strong>${r.xp}</strong> XP` +
          (r.levelUps?.length ? ` → ${r.levelUps.map((u) => `${u.name} Lv.${u.level}`).join("、")}` : "")
        : "まだ帰還していません";
      return `<div class="sub-panel"><h3>${p.name}</h3><p class="report">${body}</p></div>`;
    })
    .join("");
}

function renderReportSection() {
  renderReports();
}

function renderStats() {
  const root = $("stats-root");
  if (!root) return;
  const guildGold = ensureGuildStats().gold;
  const guildPanel = `<div class="sub-panel"><h3>ギルド資金</h3>
        <div class="stats">
          <div class="stat-cell"><div class="label">ゴールド</div>${guildGold} G</div>
        </div></div>`;
  const partyPanels = state.parties
    .map((p) => {
      const s = p.stats;
      return `<div class="sub-panel"><h3>${p.name}</h3>
        <div class="stats">
          <div class="stat-cell"><div class="label">討伐</div>${s.kills} 体</div>
          <div class="stat-cell"><div class="label">派遣</div>${s.missionsStarted} 回</div>
          <div class="stat-cell"><div class="label">完了</div>${s.missionsCleared} 回</div>
        </div></div>`;
    })
    .join("");
  root.innerHTML = guildPanel + partyPanels;
}

function renderStatsSection() {
  renderStats();
}

function storageGroupKey(item, fallback) {
  if (typeof fallback === "string" && fallback.startsWith("equipped-")) return fallback;
  if (item?.options?.length || item?.optionCandidates?.length) return `optioned-${fallback}`;
  if (item?.locked) return `locked-${fallback}`;
  if (Number(item?.plus) > 0 || Number(item?.enhance) > 0) {
    return `${item?.id || "item"}:plus-${Number(item?.plus) || 0}:enhance-${Number(item?.enhance) || 0}`;
  }
  return item?.id || `item-${fallback}`;
}

function rarityRank(rarity) {
  return ["common", "uncommon", "rare", "set", "epic", "legendary", "artifact"].indexOf(normalizeRarity(rarity));
}

function storageSlotRank(slot) {
  const index = EQUIPMENT_SLOTS.findIndex(({ key, kind }) => key === slot || kind === slot);
  return index >= 0 ? index : EQUIPMENT_SLOTS.length;
}

function compareStorageGroups(a, b) {
  if (storageSortMode === "rarity") {
    return rarityRank(b.item.rarity) - rarityRank(a.item.rarity) || b.latestIndex - a.latestIndex;
  }
  if (storageSortMode === "type") {
    return storageSlotRank(a.item.slot) - storageSlotRank(b.item.slot) || a.item.name.localeCompare(b.item.name, "ja");
  }
  if (storageSortMode === "name") {
    return a.item.name.localeCompare(b.item.name, "ja") || b.latestIndex - a.latestIndex;
  }
  return b.latestIndex - a.latestIndex;
}

function storageFilterMatches(item) {
  const kindMatch = !storageFilterKinds.size || [...storageFilterKinds].some((kind) => {
    if (kind === "weapon") return item?.slot === "weapon";
    if (kind === "armor") return item?.slot === "armor";
    if (kind === "accessory") return item?.slot === "accessory";
    if (kind === "relic") return item?.slot === "relic";
    return false;
  });
  const rarityMatch = !storageFilterRarities.size || [...storageFilterRarities].some((rarity) => {
    if (rarity === "set") return isSetEquipmentItem(item);
    return normalizeRarity(item?.rarity) === rarity;
  });
  const hasFixedOptions = hasEquipmentOptions(item);
  const optionStateFilter = storageFilterOptions.has("hasOptions")
    ? "hasOptions"
    : storageFilterOptions.has("noOptions")
      ? "noOptions"
      : "";
  const optionStateMatch = !optionStateFilter ||
    (optionStateFilter === "hasOptions" ? hasFixedOptions : !hasFixedOptions);
  const optionCount = Array.isArray(item?.options) ? item.options.length : 0;
  const optionCountFilter = [...storageFilterOptions].find((filter) => storageOptionCountFilterValues.has(filter)) || "";
  const optionCountMatch = !optionCountFilter ||
    (optionCountFilter === "oneOption" ? optionCount === 1
      : optionCountFilter === "twoOptions" ? optionCount === 2
      : optionCount >= 3);
  const optionIds = [...storageFilterOptions].filter((filter) =>
    filter !== "hasOptions" &&
    filter !== "noOptions" &&
    !storageOptionCountFilterValues.has(filter)
  );
  const optionMatch = !optionIds.length || (hasFixedOptions && item.options.some((option) => optionIds.includes(String(option?.id || ""))));
  return kindMatch && rarityMatch && optionStateMatch && optionCountMatch && optionMatch;
}

function filteredStorageEntries(items) {
  return [
    ...items
      .map((rawItem, index) => ({ rawItem, storageIndex: index, item: storageItemFromEquipment(rawItem) }))
      .filter(({ item }) => item && storageFilterMatches(item)),
    ...equippedStorageEntries().filter(({ item }) => item && storageFilterMatches(item)),
  ];
}

function equippedStorageEntries() {
  const entries = [];
  for (const party of state.parties || []) {
    for (const member of party.members || []) {
      const equipment = ensureCharacterEquipment(member);
      for (const { key: slot } of EQUIPMENT_SLOTS) {
        const item = storageItemFromEquipmentId(equipment?.[slot]);
        if (!item) continue;
        entries.push({
          item,
          storageIndex: `equipped-${member.id}-${slot}`,
          equippedBy: member.name,
          equippedMemberId: member.id,
          equippedSlot: slot,
        });
      }
    }
  }
  return entries;
}

function storageCountHtml(items) {
  const lockedCount = items.filter((item) => !!item?.locked).length;
  return `<div class="storage-counts">
    <span>装備保管：${items.length}</span>
    <span>保護：${lockedCount}</span>
  </div>`;
}

function storageOptionFragmentsSummaryHtml() {
  const fragments = ensureOptionFragments();
  const lines = Object.entries(fragments)
    .map(([fragmentId, amount]) => {
      const count = Math.max(0, Number(amount) || 0);
      if (!fragmentId || count <= 0) return "";
      const label = OPTION_MASTER?.[fragmentId]?.name || fragmentId;
      return `${label} ×${count}`;
    })
    .filter(Boolean);
  const text = lines.length ? lines.join(" / ") : "なし";
  return `<div class="storage-option-fragments muted">OPかけら：${text}</div>`;
}

function storageFilterButton(value, label, group = "kind") {
  const active = group === "kind"
    ? (value === "all" ? storageFilterKinds.size === 0 : storageFilterKinds.has(value))
    : group === "rarity"
      ? storageFilterRarities.has(value)
      : storageFilterOptions.has(value);
  return `<button type="button" class="storage-filter-btn ${active ? "active" : ""}" data-storage-filter="${value}" data-storage-filter-group="${group}">${label}</button>`;
}

function storageFilterActiveCount() {
  return storageFilterKinds.size + storageFilterRarities.size + storageFilterOptions.size;
}

function isStorageEntrySelectable(entry) {
  return typeof entry?.index === "number" && !entry?.locked && !entry?.equippedBy;
}

function canSellStorageEquipmentByUid(uid) {
  const entry = storageStateEntryByUid(uid);
  if (!entry || typeof entry.storageIndex !== "number") return false;
  if (storageEntryLocked(entry)) return false;
  if (equippedStorageEntryByUid(uid)) return false;
  return true;
}

function selectedStorageSellCount(visibleEntries) {
  return visibleEntries
    .filter((entry) => selectedStorageSellUids.has(String(storageEntryUid(entry) || "")))
    .filter((entry) => canSellStorageEquipmentByUid(storageEntryUid(entry)))
    .length;
}

function syncSelectedStorageSellUids(visibleEntries) {
  const validIds = new Set(
    visibleEntries
      .filter((entry) => canSellStorageEquipmentByUid(storageEntryUid(entry)))
      .map((entry) => String(storageEntryUid(entry) || ""))
      .filter(Boolean)
  );
  [...selectedStorageSellUids].forEach((id) => {
    if (!validIds.has(id)) selectedStorageSellUids.delete(id);
  });
}

function cancelStorageBulkSellMode() {
  storageBulkSellMode = false;
  selectedStorageSellUids.clear();
}

function isStorageDismantleEntrySelectable(entry) {
  return canDismantleStorageEquipmentByUid(storageEntryUid(entry));
}

function selectedStorageDismantleCount(visibleEntries) {
  return visibleEntries
    .filter((entry) => selectedStorageDismantleUids.has(String(storageEntryUid(entry) || "")))
    .filter(isStorageDismantleEntrySelectable)
    .length;
}

function syncSelectedStorageDismantleUids(visibleEntries) {
  const validIds = new Set(
    visibleEntries
      .filter(isStorageDismantleEntrySelectable)
      .map((entry) => String(storageEntryUid(entry) || ""))
      .filter(Boolean)
  );
  [...selectedStorageDismantleUids].forEach((id) => {
    if (!validIds.has(id)) selectedStorageDismantleUids.delete(id);
  });
}

function cancelStorageBulkDismantleMode() {
  storageBulkDismantleMode = false;
  selectedStorageDismantleUids.clear();
}

function cancelStorageOptionEnhanceMode() {
  storageOptionEnhanceMode = false;
}

function storageEntryUid(entry) {
  return entry?.item?.storageUid || entry?.rawItem?.storageUid || null;
}

function storageEntryIndex(entry) {
  return typeof entry?.storageIndex === "number" ? entry.storageIndex : entry?.index;
}

function storageEntryLocked(entry) {
  return !!entry?.rawItem?.locked || !!entry?.locked;
}

function storageStateEntryByUid(uid) {
  if (!uid) return null;
  const index = (state.storage || []).findIndex((item) => String(item?.storageUid) === String(uid));
  if (index < 0) return null;
  const rawItem = state.storage[index];
  const item = storageItemFromEquipment(rawItem);
  if (!item) return null;
  return { rawItem, storageIndex: index, index, item, locked: !!rawItem?.locked };
}

function equippedStorageEntryByUid(uid) {
  if (!uid) return null;
  return equippedStorageEntries().find((entry) => String(entry?.item?.storageUid || "") === String(uid)) || null;
}

function canDismantleStorageEquipmentByUid(uid) {
  const entry = storageStateEntryByUid(uid);
  if (!entry || typeof entry.storageIndex !== "number") return false;
  if (storageEntryLocked(entry)) return false;
  if (equippedStorageEntryByUid(uid)) return false;
  if (!hasEquipmentOptions(entry.item)) return false;
  return true;
}

function optionEnhanceRequiredFragments(currentLevel) {
  if (Math.max(0, Number(currentLevel) || 0) >= 10) return 0;
  return 10;
}

function canDisplayStorageOptionEnhanceEntry(entry) {
  return typeof entry?.storageIndex === "number" &&
    !entry?.equippedBy &&
    !equippedStorageEntryByUid(storageEntryUid(entry)) &&
    hasEquipmentOptions(entry?.item);
}

function canEnhanceStorageEquipmentOptionByUid(uid, optionIndex, target = state) {
  const entry = storageStateEntryByUid(uid);
  if (!entry || typeof entry.storageIndex !== "number") {
    return { ok: false, reason: "not_found" };
  }

  const item = entry.item;
  const options = Array.isArray(item?.options) ? item.options : [];
  if (!options.length) {
    return { ok: false, reason: "no_options" };
  }

  const normalizedIndex = Number(optionIndex);
  if (!Number.isInteger(normalizedIndex) || normalizedIndex < 0 || normalizedIndex >= options.length) {
    return { ok: false, reason: "invalid_option_index" };
  }

  const option = options[normalizedIndex];
  const optionId = String(option?.id || "");
  const currentLevel = Math.max(0, Number(option?.level) || 0);
  if (!optionId) {
    return { ok: false, reason: "invalid_option" };
  }
  if (currentLevel <= 0) {
    return {
      ok: false,
      reason: "invalid_option_level",
      optionId,
      currentLevel,
    };
  }
  if (currentLevel >= 10) {
    return {
      ok: false,
      reason: "max_level",
      optionId,
      currentLevel,
      nextLevel: currentLevel,
      requiredFragments: 0,
      currentFragments: Math.max(0, Number(ensureOptionFragments(target)[optionId]) || 0),
    };
  }

  const requiredFragments = optionEnhanceRequiredFragments(currentLevel);
  const currentFragments = Math.max(0, Number(ensureOptionFragments(target)[optionId]) || 0);
  if (currentFragments < requiredFragments) {
    return {
      ok: false,
      reason: "not_enough_fragments",
      optionId,
      currentLevel,
      nextLevel: currentLevel + 1,
      requiredFragments,
      currentFragments,
    };
  }

  return {
    ok: true,
    optionId,
    currentLevel,
    nextLevel: currentLevel + 1,
    requiredFragments,
    currentFragments,
  };
}

function enhanceStorageEquipmentOptionByUid(uid, optionIndex, target = state) {
  const preview = canEnhanceStorageEquipmentOptionByUid(uid, optionIndex, target);
  if (!preview?.ok) return preview;

  const entry = storageStateEntryByUid(uid);
  if (!entry || typeof entry.storageIndex !== "number") {
    return { ok: false, reason: "not_found" };
  }

  const item = entry.item;
  const normalizedIndex = Number(optionIndex);
  const options = Array.isArray(item?.options) ? item.options.map((option) => ({ ...option })) : [];
  const targetOption = options[normalizedIndex];
  if (!targetOption) {
    return { ok: false, reason: "invalid_option_index" };
  }

  const optionId = String(targetOption?.id || preview.optionId || "");
  const previousLevel = Math.max(0, Number(targetOption?.level) || 0);
  const newLevel = previousLevel + 1;
  const spentFragments = Math.max(0, Number(preview.requiredFragments) || 0);
  const fragments = ensureOptionFragments(target);
  const currentFragments = Math.max(0, Number(fragments[optionId]) || 0);
  if (!optionId) {
    return { ok: false, reason: "invalid_option" };
  }
  if (currentFragments < spentFragments) {
    return {
      ok: false,
      reason: "not_enough_fragments",
      optionId,
      previousLevel,
      newLevel,
      requiredFragments: spentFragments,
      currentFragments,
    };
  }

  targetOption.level = Math.min(10, newLevel);
  fragments[optionId] = currentFragments - spentFragments;

  const nextItem = storageItemFromEquipment({
    ...item,
    options,
    storageUid: entry.rawItem?.storageUid || item.storageUid || uid,
    locked: !!entry.rawItem?.locked,
  });

  if (target === state) {
    state.storage[entry.storageIndex] = nextItem;
    storageRenderCount = -1;
    saveGame();
  } else if (Array.isArray(target.storage)) {
    target.storage[entry.storageIndex] = nextItem;
  }

  return {
    ok: true,
    itemName: equipmentDisplayName(nextItem),
    optionId,
    previousLevel,
    newLevel: targetOption.level,
    spentFragments,
    remainingFragments: Math.max(0, Number(fragments[optionId]) || 0),
  };
}

function optionEnhanceLabel(option) {
  const optionId = String(option?.id || "");
  const level = Math.max(0, Number(option?.level) || 0);
  const name = OPTION_MASTER?.[optionId]?.name || optionId || "不明OP";
  return `${name} Lv${level}`;
}

function optionEnhanceConfirmMessage(uid, optionIndex) {
  const entry = storageStateEntryByUid(uid);
  const itemName = entry?.item ? equipmentDisplayName(entry.item) : "この装備";
  const option = Array.isArray(entry?.item?.options) ? entry.item.options[Number(optionIndex)] : null;
  const preview = canEnhanceStorageEquipmentOptionByUid(uid, optionIndex);
  const optionText = option ? optionEnhanceLabel(option) : `OP #${optionIndex}`;
  const costText = preview?.requiredFragments ? `${preview.optionId}のかけら ${preview.requiredFragments}個` : "必要かけら";
  return `${itemName} の ${optionText} を強化しますか？\n${costText} を消費します。`;
}

function handleStorageOptionEnhance(uid, optionIndex) {
  const preview = canEnhanceStorageEquipmentOptionByUid(uid, optionIndex);
  if (!preview?.ok) return;
  if (!confirm(optionEnhanceConfirmMessage(uid, optionIndex))) return;
  const result = enhanceStorageEquipmentOptionByUid(uid, optionIndex);
  if (!result?.ok) return;
  setStorageResultMessage(`${result.itemName} の ${OPTION_MASTER?.[result.optionId]?.name || result.optionId} を Lv${result.newLevel} に強化した`);
  storageRenderCount = -1;
  renderStorage();
}

function dismantlePreviewForStorageEquipmentByUid(uid) {
  if (!canDismantleStorageEquipmentByUid(uid)) return [];
  const entry = storageStateEntryByUid(uid);
  if (!entry?.item) return [];
  return (Array.isArray(entry.item.options) ? entry.item.options : [])
    .map((option) => {
      const optionId = String(option?.id || "");
      const level = Math.max(0, Number(option?.level) || 0);
      if (!optionId || level <= 0) return null;
      return { fragmentId: optionId, optionId, level };
    })
    .filter(Boolean);
}

function addOptionFragmentsFromPreview(preview, target = state) {
  const fragments = ensureOptionFragments(target);
  const entries = Array.isArray(preview) ? preview : [];
  entries.forEach((entry) => {
    const fragmentId = String(entry?.fragmentId || "");
    const level = Math.max(0, Number(entry?.level) || 0);
    if (!fragmentId || level <= 0) return;
    fragments[fragmentId] = Math.max(0, Number(fragments[fragmentId]) || 0) + level;
  });
  return fragments;
}

function mergeOptionFragmentPreviews(previews) {
  const totals = new Map();
  (Array.isArray(previews) ? previews : []).forEach((fragment) => {
    const fragmentId = String(fragment?.fragmentId || "");
    const level = Math.max(0, Number(fragment?.level) || 0);
    if (!fragmentId || level <= 0) return;
    totals.set(fragmentId, (totals.get(fragmentId) || 0) + level);
  });
  return [...totals.entries()].map(([fragmentId, level]) => ({ fragmentId, optionId: fragmentId, level }));
}

function optionFragmentPreviewLine(fragment) {
  const fragmentId = String(fragment?.fragmentId || "");
  const level = Math.max(0, Number(fragment?.level) || 0);
  if (!fragmentId || level <= 0) return "";
  const label = OPTION_MASTER?.[fragmentId]?.name || fragmentId;
  return `${label}のかけら +${level}`;
}

function dismantleStorageEquipmentByUid(uid, target = state) {
  const entry = storageStateEntryByUid(uid);
  if (!entry || typeof entry.storageIndex !== "number") {
    return { ok: false, reason: "not_found" };
  }
  if (!canDismantleStorageEquipmentByUid(uid)) {
    return { ok: false, reason: "not_dismantlable" };
  }
  const fragments = dismantlePreviewForStorageEquipmentByUid(uid);
  if (!fragments.length) {
    return { ok: false, reason: "no_fragments" };
  }
  addOptionFragmentsFromPreview(fragments, target);
  target.storage.splice(entry.storageIndex, 1);
  if (target === state) {
    if (selectedStorageFusionTargetUid === String(uid)) selectedStorageFusionTargetUid = null;
    selectedStorageFusionMaterialUids.delete(String(uid));
    saveGame();
  }
  return {
    ok: true,
    itemName: equipmentDisplayName(entry.item),
    fragments,
  };
}

function dismantleConfirmMessage(uid) {
  const entry = storageStateEntryByUid(uid);
  if (!entry?.item) return "この装備を分解しますか？\n装備は失われ、OPかけらを得ます。";
  const preview = dismantlePreviewForStorageEquipmentByUid(uid);
  const lines = preview.map(optionFragmentPreviewLine).filter(Boolean);
  const previewText = lines.length ? `\n最低保証：\n${lines.join("\n")}` : "";
  return `${equipmentDisplayName(entry.item)}を分解しますか？\n装備は失われ、OPかけらを得ます。${previewText}`;
}

function handleStorageItemDismantle(uid) {
  if (!uid || !canDismantleStorageEquipmentByUid(uid)) return;
  openStorageDismantleConfirm({
    mode: "single",
    uid: String(uid),
    message: dismantleConfirmMessage(uid),
  });
  storageRenderCount = -1;
  renderStorage();
}

function executeStorageItemDismantle(uid) {
  const result = dismantleStorageEquipmentByUid(uid);
  if (!result?.ok) return;
  const fragments = mergeOptionFragmentPreviews(Array.isArray(result.fragments) ? result.fragments : []);
  const fragmentText = fragments
    .map(optionFragmentPreviewLine)
    .filter(Boolean)
    .join("\n");
  setStorageResultMessage("", "");
  setStorageDismantleResult(fragmentText);
  storageRenderCount = -1;
  renderStorage();
  renderRecordsSection();
}

function dismantleSelectedStorageItems() {
  const candidateUids = [...selectedStorageDismantleUids]
    .map((uid) => String(uid || ""))
    .filter(Boolean);
  const entries = candidateUids
    .map((uid) => ({ uid, entry: storageStateEntryByUid(uid) }))
    .filter(({ uid, entry }) => uid && entry && canDismantleStorageEquipmentByUid(uid));
  if (!entries.length) return;

  const preview = mergeOptionFragmentPreviews(entries.flatMap(({ uid }) => dismantlePreviewForStorageEquipmentByUid(uid)));
  const previewText = preview.map(optionFragmentPreviewLine).filter(Boolean).join("\n");
  const confirmMessage = `${entries.length}件を分解しますか？\n装備は失われ、OPかけらを得ます。${previewText ? `\n\n最低保証：\n${previewText}` : ""}`;
  openStorageDismantleConfirm({
    mode: "multi",
    uids: entries.map(({ uid }) => String(uid)),
    message: confirmMessage,
  });
  storageRenderCount = -1;
  renderStorage();
}

function executeSelectedStorageDismantle(candidateUids) {
  const results = candidateUids.map((uid) => dismantleStorageEquipmentByUid(uid));
  const successResults = results.filter((result) => result?.ok);
  if (!successResults.length) {
    selectedStorageDismantleUids.clear();
    storageRenderCount = -1;
    renderStorage();
    return;
  }
  const fragments = mergeOptionFragmentPreviews(successResults.flatMap((result) => result.fragments || []));
  const fragmentText = fragments.map(optionFragmentPreviewLine).filter(Boolean).join("\n");
  setStorageResultMessage("", "");
  setStorageDismantleResult(fragmentText);
  selectedStorageDismantleUids.clear();
  storageRenderCount = -1;
  renderStorage();
  renderRecordsSection();
}

function storageFusionTargetEntry(visibleEntries) {
  const visibleEntry = visibleEntries.find((entry) => String(storageEntryUid(entry)) === String(selectedStorageFusionTargetUid));
  return visibleEntry || storageStateEntryByUid(selectedStorageFusionTargetUid);
}

function currentStorageFusionTargetEntry() {
  return storageStateEntryByUid(selectedStorageFusionTargetUid);
}

function isStorageFusionEntrySelectable(entry) {
  const item = entry?.item;
  return (
    typeof storageEntryIndex(entry) === "number" &&
    !entry?.equippedBy &&
    !Number(item?.enhance) &&
    normalizeRarity(item?.rarity) !== "artifact" &&
    Math.max(0, Number(item?.plus) || 0) < 20
  );
}

function isStorageFusionMaterialEntrySelectable(entry, itemId) {
  const item = entry?.item;
  return (
    typeof storageEntryIndex(entry) === "number" &&
    !storageEntryLocked(entry) &&
    !entry?.equippedBy &&
    item?.id === itemId &&
    !Number(item?.enhance) &&
    normalizeRarity(item?.rarity) !== "artifact"
  );
}

function hasOptionedStorageFusionMaterial(targetEntry) {
  const itemId = targetEntry?.item?.id;
  if (!itemId) return false;
  return filteredStorageEntries(state.storage || [])
    .some((entry) =>
      isStorageFusionMaterialEntrySelectable(entry, itemId) &&
      storageEntryIndex(entry) !== storageEntryIndex(targetEntry) &&
      Array.isArray(entry.item?.options) &&
      entry.item.options.length > 0
    );
}

function isStorageFusionTargetEntrySelectable(entry) {
  return isStorageFusionEntrySelectable(entry);
}

function storageFusionOptionLevelTotal(item) {
  return (Array.isArray(item?.options) ? item.options : []).reduce(
    (sum, option) => sum + Math.max(0, Number(option?.level) || 0),
    0
  );
}

function storageFusionSlotRank(slot) {
  if (slot === "weapon") return 0;
  if (slot === "armor") return 1;
  if (slot === "accessory") return 2;
  return 99;
}

function compareStorageFusionTargetEntries(a, b) {
  const lockedDiff = Number(!!b?.item?.locked) - Number(!!a?.item?.locked);
  if (lockedDiff) return lockedDiff;
  const slotDiff = storageFusionSlotRank(a?.item?.slot) - storageFusionSlotRank(b?.item?.slot);
  if (slotDiff) return slotDiff;
  const rarityDiff = rarityRank(b?.item?.rarity) - rarityRank(a?.item?.rarity);
  if (rarityDiff) return rarityDiff;
  const optionDiff = storageFusionOptionLevelTotal(b?.item) - storageFusionOptionLevelTotal(a?.item);
  if (optionDiff) return optionDiff;
  const plusDiff = (Number(b?.item?.plus) || 0) - (Number(a?.item?.plus) || 0);
  if (plusDiff) return plusDiff;
  return String(a?.item?.id || "").localeCompare(String(b?.item?.id || ""), "ja");
}

function compareStorageFusionMaterialEntries(a, b) {
  const rarityDiff = rarityRank(a?.item?.rarity) - rarityRank(b?.item?.rarity);
  if (rarityDiff) return rarityDiff;
  const optionDiff = storageFusionOptionLevelTotal(a?.item) - storageFusionOptionLevelTotal(b?.item);
  if (optionDiff) return optionDiff;
  const plusDiff = (Number(a?.item?.plus) || 0) - (Number(b?.item?.plus) || 0);
  if (plusDiff) return plusDiff;
  return String(a?.item?.id || "").localeCompare(String(b?.item?.id || ""), "ja");
}

function storageFusionRequiredCount(targetEntry) {
  const plus = Math.max(0, Number(targetEntry?.item?.plus) || 0);
  return plus >= 10 ? 5 : 3;
}

function storageFusionAvailableMaterialCount(visibleEntries, targetEntry) {
  const targetItemId = targetEntry?.item?.id;
  if (!targetItemId) return 0;
  return visibleEntries.filter((entry) =>
    isStorageFusionMaterialEntrySelectable(entry, targetItemId) &&
    storageEntryIndex(entry) !== storageEntryIndex(targetEntry)
  ).length;
}

function hasStorageFusionRequiredMaterials(targetEntry, visibleEntries = []) {
  if (!isStorageFusionTargetEntrySelectable(targetEntry)) return false;
  return storageFusionAvailableMaterialCount(visibleEntries, targetEntry) >= storageFusionRequiredCount(targetEntry);
}

function storageFusionGoldCost(targetEntry) {
  const nextPlus = Math.max(0, Number(targetEntry?.item?.plus) || 0) + 1;
  return nextPlus * 100;
}

function selectedStorageFusionMaterialCount(visibleEntries, targetEntry) {
  const targetItemId = targetEntry?.item?.id;
  if (!targetItemId) return 0;
  return visibleEntries.filter((entry) =>
    selectedStorageFusionMaterialUids.has(String(storageEntryUid(entry))) &&
    isStorageFusionMaterialEntrySelectable(entry, targetItemId) &&
    storageEntryIndex(entry) !== storageEntryIndex(targetEntry)
  ).length;
}

function syncSelectedStorageFusionMaterials(visibleEntries, targetEntry) {
  if (!targetEntry) {
    selectedStorageFusionMaterialUids.clear();
    return;
  }
  const validIds = new Set(
    visibleEntries
      .filter((entry) =>
        isStorageFusionMaterialEntrySelectable(entry, targetEntry.item.id) &&
        storageEntryIndex(entry) !== storageEntryIndex(targetEntry)
      )
      .map((entry) => String(storageEntryUid(entry)))
  );
  [...selectedStorageFusionMaterialUids].forEach((id) => {
    if (!validIds.has(id)) selectedStorageFusionMaterialUids.delete(id);
  });
}

function selectedStorageFusionUsesOptionedMaterials(visibleEntries, targetEntry) {
  const targetItemId = targetEntry?.item?.id;
  if (!targetItemId) return false;
  return visibleEntries.some((entry) =>
    selectedStorageFusionMaterialUids.has(String(storageEntryUid(entry))) &&
    isStorageFusionMaterialEntrySelectable(entry, targetItemId) &&
    storageEntryIndex(entry) !== storageEntryIndex(targetEntry) &&
    Array.isArray(entry.item?.options) &&
    entry.item.options.length > 0
  );
}

function canAffordStorageFusion(targetEntry) {
  const gold = ensureGuildStats().gold;
  return gold >= storageFusionGoldCost(targetEntry);
}

function isStorageFusionTargetReady(targetEntry, visibleEntries = []) {
  if (!isStorageFusionTargetEntrySelectable(targetEntry)) return false;
  const requiredCount = storageFusionRequiredCount(targetEntry);
  const materialCount = selectedStorageFusionMaterialCount(visibleEntries, targetEntry);
  return materialCount >= requiredCount && canAffordStorageFusion(targetEntry);
}

function cancelStorageFusionMode() {
  storageFusionMode = false;
  selectedStorageFusionTargetUid = null;
  selectedStorageFusionMaterialUids.clear();
}

function isEquipmentOptionMilestone(plus) {
  return [3, 6, 9].includes(Math.max(0, Number(plus) || 0));
}

function equipmentMilestoneOptionPool(item) {
  const excluded = new Set([
    ...((Array.isArray(item?.optionCandidates) ? item.optionCandidates : []).map((id) => String(id))),
    ...((Array.isArray(item?.options) ? item.options : []).map((option) => String(option?.id)).filter(Boolean)),
  ]);
  return Object.keys(OPTION_MASTER || {}).filter((id) => !excluded.has(String(id)));
}

function rollEquipmentMilestoneCandidates(item, count = 3) {
  const pool = [...equipmentMilestoneOptionPool(item)];
  const results = [];
  const limit = Math.max(0, Number(count) || 0);
  while (pool.length > 0 && results.length < limit) {
    const index = roll(0, pool.length - 1);
    const [picked] = pool.splice(index, 1);
    if (picked) results.push(picked);
  }
  return results;
}

function handleEquipmentOptionMilestone(item) {
  const plus = Math.max(0, Number(item?.plus) || 0);
  if (!isEquipmentOptionMilestone(plus)) return;
  const usedSlots = Array.isArray(item?.options) ? item.options.length : 0;
  const remainingSlots = Math.max(0, 3 - usedSlots);
  if (remainingSlots <= 0) return;
  const nextCandidates = rollEquipmentMilestoneCandidates(item, remainingSlots);
  if (nextCandidates.length) {
    item.optionCandidates = [
      ...((Array.isArray(item?.optionCandidates) ? item.optionCandidates : []).map((id) => String(id))),
      ...nextCandidates,
    ];
  }
  console.log("[equipment-option-milestone]", {
    id: item?.id || null,
    plus,
    optionCandidates: Array.isArray(item?.optionCandidates) ? [...item.optionCandidates] : [],
  });
}

function fuseSelectedStorageGroup(visibleEntries) {
  const targetEntry = storageFusionTargetEntry(visibleEntries);
  if (!targetEntry || !isStorageFusionTargetReady(targetEntry, visibleEntries)) return;
  const requiredCount = storageFusionRequiredCount(targetEntry);
  const goldCost = storageFusionGoldCost(targetEntry);
  const guildStats = ensureGuildStats();
  const targetIndex = storageEntryIndex(targetEntry);
  if (typeof targetIndex !== "number") return;
  let targetUid = storageEntryUid(targetEntry);
  if (!targetUid) {
    targetUid = nextStorageUid();
    targetEntry.item.storageUid = targetUid;
    if (state.storage?.[targetIndex]) state.storage[targetIndex].storageUid = targetUid;
  }
  const materialIndices = visibleEntries
    .filter((entry) =>
      selectedStorageFusionMaterialUids.has(String(storageEntryUid(entry))) &&
      isStorageFusionMaterialEntrySelectable(entry, targetEntry.item.id) &&
      storageEntryIndex(entry) !== targetIndex
    )
    .map((entry) => storageEntryIndex(entry))
    .filter((index) => typeof index === "number")
    .slice(0, requiredCount);
  if (materialIndices.length < requiredCount) return;

  const baseItem = storageItemFromEquipment(state.storage[targetIndex]);
  if (!baseItem) return;
  if (Number(guildStats.gold) < goldCost) return;

  const nextPlus = Math.max(0, Number(baseItem.plus) || 0) + 1;
  state.storage[targetIndex] = storageItemFromEquipment({
    ...baseItem,
    plus: nextPlus,
    locked: !!baseItem.locked,
    storageUid: targetUid,
  });
  handleEquipmentOptionMilestone(state.storage[targetIndex]);
  materialIndices.sort((a, b) => b - a).forEach((index) => {
    state.storage.splice(index, 1);
  });
  const updatedTarget = storageStateEntryByUid(targetUid);
  guildStats.gold -= goldCost;
  setStorageResultMessage(`${equipmentDisplayName({ ...baseItem, plus: nextPlus })} を作成した`);
  selectedStorageFusionTargetUid = storageEntryUid(updatedTarget) || targetUid;
  selectedStorageFusionMaterialUids.clear();
  storageRenderCount = -1;
  saveGame();
  renderAll();
}

function sellSelectedStorageItems() {
  const candidateUids = [...selectedStorageSellUids]
    .map((uid) => String(uid || ""))
    .filter(Boolean);
  const selectedEntries = candidateUids
    .map((uid) => ({ uid, entry: storageStateEntryByUid(uid) }))
    .filter(({ uid, entry }) => uid && entry && canSellStorageEquipmentByUid(uid));
  if (!selectedEntries.length) return;
  const totalGold = selectedEntries.reduce((sum, { entry }) => {
    const item = entry?.item;
    return sum + equipmentSellGoldValue(item);
  }, 0);
  const confirmMessage = `${selectedEntries.length}件を売却しますか？\n\n装備は失われ、ゴールドを得ます。\n\n獲得予定：\n${totalGold}G`;
  openStorageSellConfirm({
    uids: selectedEntries.map(({ uid }) => String(uid)),
    message: confirmMessage,
  });
  storageRenderCount = -1;
  renderStorage();
}

function canBulkSellFilteredStorageEntry(entry) {
  return !!entry && canSellStorageEquipmentByUid(storageEntryUid(entry));
}

function bulkSellFilteredCandidateEntries(visibleEntries) {
  return (Array.isArray(visibleEntries) ? visibleEntries : [])
    .filter((entry) => canBulkSellFilteredStorageEntry(entry))
    .map((entry) => ({ uid: String(storageEntryUid(entry) || ""), entry }))
    .filter(({ uid, entry }) => uid && entry);
}

function bulkSellOptionCategoryLabel(category) {
  if (category === "zero") return "OPなし";
  if (category === "one") return "1OP";
  if (category === "two") return "2OP";
  if (category === "three") return "3OP";
  return "売却対象";
}

function bulkSellOptionCategoryConfirmMessage(category, count, gold) {
  if (category === "three") {
    return `3OP装備 ${count}件を売却します。よろしいですか？\n獲得予定：${gold}G`;
  }
  return `${bulkSellOptionCategoryLabel(category)}装備 ${count}件を売却しますか？\n獲得予定：${gold}G`;
}

function bulkSellOptionCategorySummary(visibleEntries) {
  const summary = {
    zero: { key: "zero", label: "OPなし", count: 0, gold: 0, uids: [] },
    one: { key: "one", label: "1OP", count: 0, gold: 0, uids: [] },
    two: { key: "two", label: "2OP", count: 0, gold: 0, uids: [] },
    three: { key: "three", label: "3OP", count: 0, gold: 0, uids: [] },
  };
  bulkSellFilteredCandidateEntries(visibleEntries).forEach(({ uid, entry }) => {
    const optionCount = Array.isArray(entry?.item?.options) ? entry.item.options.length : 0;
    const category = optionCount <= 0 ? "zero" : optionCount === 1 ? "one" : optionCount === 2 ? "two" : "three";
    summary[category].count += 1;
    summary[category].gold += equipmentSellGoldValue(entry?.item);
    summary[category].uids.push(uid);
  });
  return Object.values(summary);
}

function openStorageBulkSellCategoryModal(visibleEntries) {
  const categories = bulkSellOptionCategorySummary(visibleEntries);
  if (!categories.some((category) => category.count > 0)) return;
  openStorageBulkSellModal({ categories });
  storageRenderCount = -1;
  renderStorage();
}

function canBulkDismantleFilteredStorageEntry(entry) {
  return !!entry && canDismantleStorageEquipmentByUid(storageEntryUid(entry));
}

function bulkDismantleFilteredCandidateEntries(visibleEntries) {
  return (Array.isArray(visibleEntries) ? visibleEntries : [])
    .filter((entry) => canBulkDismantleFilteredStorageEntry(entry))
    .map((entry) => ({ uid: String(storageEntryUid(entry) || ""), entry }))
    .filter(({ uid, entry }) => uid && entry);
}

function bulkDismantleOptionCategoryLabel(category) {
  if (category === "one") return "1OP";
  if (category === "two") return "2OP";
  if (category === "three") return "3OP";
  return "分解対象";
}

function bulkDismantleOptionCategorySummary(visibleEntries) {
  const summary = {
    one: { key: "one", label: "1OP", count: 0, fragmentTotal: 0, uids: [] },
    two: { key: "two", label: "2OP", count: 0, fragmentTotal: 0, uids: [] },
    three: { key: "three", label: "3OP", count: 0, fragmentTotal: 0, uids: [] },
  };
  bulkDismantleFilteredCandidateEntries(visibleEntries).forEach(({ uid }) => {
    const preview = dismantlePreviewForStorageEquipmentByUid(uid);
    const optionCount = preview.length;
    if (optionCount <= 0) return;
    const category = optionCount === 1 ? "one" : optionCount === 2 ? "two" : "three";
    summary[category].count += 1;
    summary[category].fragmentTotal += preview.reduce((sum, fragment) => sum + Math.max(0, Number(fragment?.level) || 0), 0);
    summary[category].uids.push(uid);
  });
  return Object.values(summary);
}

function bulkDismantleOptionCategoryConfirmMessage(category) {
  if (!category) return "このカテゴリの装備を分解しますか？";
  const preview = mergeOptionFragmentPreviews(
    (Array.isArray(category.uids) ? category.uids : []).flatMap((uid) => dismantlePreviewForStorageEquipmentByUid(uid))
  );
  const previewText = preview.map(optionFragmentPreviewLine).filter(Boolean).join("\n");
  return `${bulkDismantleOptionCategoryLabel(category.key)}装備 ${category.count}件を分解しますか？\n\n装備は失われ、OPかけらを得ます。${previewText ? `\n\n最低保証：\n${previewText}` : ""}`;
}

function openStorageBulkDismantleCategoryModal(visibleEntries) {
  const categories = bulkDismantleOptionCategorySummary(visibleEntries);
  if (!categories.some((category) => category.count > 0)) return;
  openStorageBulkDismantleModal({ categories });
  storageRenderCount = -1;
  renderStorage();
}

function executeSelectedStorageSell(candidateUids) {
  const indices = (Array.isArray(candidateUids) ? candidateUids : [])
    .map((uid) => storageStateEntryByUid(uid))
    .filter((entry) => entry && canSellStorageEquipmentByUid(storageEntryUid(entry)))
    .map((entry) => entry.storageIndex)
    .filter((index) => typeof index === "number")
    .sort((a, b) => b - a);
  indices.forEach((index) => {
    sellStorageItemByIndex(index, { deferRender: true });
  });
  selectedStorageSellUids.clear();
  storageRenderCount = -1;
  saveGame();
  renderAll();
}

function isStorageSellGroupableEntry(entry) {
  const item = entry?.item;
  return (
    canSellStorageEquipmentByUid(storageEntryUid(entry)) &&
    !hasEquipmentOptions(item) &&
    !(Array.isArray(item?.optionCandidates) && item.optionCandidates.length > 0)
  );
}

function storageSellGroupKey(entry) {
  const item = entry?.item;
  if (!isStorageSellGroupableEntry(entry) || !item?.id) return "";
  return [
    item.id,
    Number(item?.plus) || 0,
    Number(item?.enhance) || 0,
    equipmentSellGoldValue(item),
  ].join(":");
}

function storageSellDisplayEntries(visibleEntries) {
  const displayEntries = [];
  const groupedByKey = new Map();
  visibleEntries.forEach((entry) => {
    if (!isStorageSellGroupableEntry(entry)) {
      displayEntries.push({ type: "entry", entry });
      return;
    }
    const key = storageSellGroupKey(entry);
    if (!key) {
      displayEntries.push({ type: "entry", entry });
      return;
    }
    let group = groupedByKey.get(key);
    if (!group) {
      group = {
        type: "group",
        key,
        item: entry.item,
        entries: [],
      };
      groupedByKey.set(key, group);
      displayEntries.push(group);
    }
    group.entries.push(entry);
  });
  return displayEntries;
}

function storageDismantleDisplayEntries(visibleEntries) {
  return visibleEntries.filter(isStorageDismantleEntrySelectable);
}

function storageOptionEnhanceDisplayEntries(visibleEntries) {
  return visibleEntries.filter(canDisplayStorageOptionEnhanceEntry);
}

function renderStorageLegacy() {
  const root = $("storage-root");
  if (!root) return;
  const items = state.storage || [];
  if (items.length === storageRenderCount) return;
  storageRenderCount = items.length;
  if (!items.length) {
    root.innerHTML = '<p class="log-empty">保管中の装備はありません</p>';
    return;
  }

  const groups = [];
  const groupByKey = new Map();
  items.forEach((rawItem, index) => {
    const item = storageItemFromEquipment(rawItem);
    if (!item) return;
    const locked = !!item.locked;
    const key = `${item.id || index}:${locked ? "locked" : "free"}`;
    let group = groupByKey.get(key);
    if (!group) {
      group = { item, index, count: 0, locked };
      groupByKey.set(key, group);
      groups.push(group);
    }
    group.count += 1;
  });

  root.innerHTML = `
    <ul class="storage-list">
      ${groups
        .map(({ item, index, count, locked }) => {
          const rarity = normalizeRarity(item?.rarity);
          const name = equipmentDisplayName(item);
          return `<li>
            <div class="storage-info">
              <div class="storage-head">
                <span class="storage-item ${rarityClassName(rarity)}">${name}</span>${count > 1 ? `<span class="storage-count">×${count}</span>` : ""}
                ${locked ? '<span class="storage-lock-label">★ 保護中</span>' : ""}
              </div>
              ${equipmentSetLabelHtml(item)}
              <div class="storage-effect">${equipmentStorageLine(item)}</div>
              ${equipmentOptionsStorageHtml(item, { storageIndex: index })}
            </div>
            <div class="storage-actions">
              <button type="button" class="storage-lock-btn" data-storage-index="${index}">${locked ? "解除" : "保護"}</button>
              <button type="button" class="storage-sell-btn" data-storage-index="${index}" ${locked ? "disabled" : ""}>売却</button>
            </div>
          </li>`;
        })
        .join("")}
    </ul>
  `;

  root.querySelectorAll(".storage-sell-btn").forEach((button) => {
    button.addEventListener("click", () => {
      sellStorageItem(Number(button.dataset.storageIndex));
    });
  });
  root.querySelectorAll(".storage-lock-btn").forEach((button) => {
    button.addEventListener("click", () => {
      toggleStorageLock(Number(button.dataset.storageIndex));
    });
  });
}

function storageSortOptionsHtml(actionHtml = "") {
  const filterActive = storageFilterActiveCount() > 0;
  return `<div class="storage-controls">
    <div class="storage-top-row">
      <label class="storage-sort-control">並び替え
        <select class="storage-sort-select">
          <option value="new" ${storageSortMode === "new" ? "selected" : ""}>新しい順</option>
          <option value="rarity" ${storageSortMode === "rarity" ? "selected" : ""}>rarity順</option>
          <option value="type" ${storageSortMode === "type" ? "selected" : ""}>種類順</option>
          <option value="name" ${storageSortMode === "name" ? "selected" : ""}>名前順</option>
        </select>
      </label>
      <div class="storage-filter-anchor">
        <button type="button" class="storage-organize-btn storage-organize-filter-btn" data-storage-filter-toggle aria-expanded="${storageFilterOpen}">
          <span>整理</span>
          <span class="${filterActive ? "equipment-filter-active" : "equipment-filter-inactive"}">${filterActive ? "選択中" : "未選択"}</span>
        </button>
        ${storageFilterPanelHtml()}
      </div>
    </div>
    <div class="storage-action-row">
      <button type="button" class="storage-organize-btn" data-storage-auto-sell-toggle aria-expanded="${storageAutoSellOpen}">自動売却</button>
      ${actionHtml}
    </div>
  </div>`;
}

function storageFilterPanelHtml() {
  return `<div class="storage-popover storage-filter-panel" ${storageFilterOpen ? "" : "hidden"} aria-label="整理条件">
    <div class="storage-filter-panel-title">整理条件</div>
    <div class="storage-filter-panel-group">
      <div class="storage-filter-panel-label">種類：</div>
      <div class="storage-filters">
        ${storageFilterButton("all", "すべて", "kind")}
        ${storageFilterButton("weapon", "武器", "kind")}
        ${storageFilterButton("armor", "防具", "kind")}
        ${storageFilterButton("accessory", "装飾", "kind")}
        ${storageFilterButton("relic", "遺物", "kind")}
      </div>
    </div>
    <div class="storage-filter-panel-group">
      <div class="storage-filter-panel-label">レアリティ：</div>
      <div class="storage-filters">
        ${storageFilterButton("common", "ノーマル", "rarity")}
        ${storageFilterButton("uncommon", "アンコモン", "rarity")}
        ${storageFilterButton("rare", "レア", "rarity")}
        ${storageFilterButton("epic", "エピック", "rarity")}
        ${storageFilterButton("legendary", "レジェンド", "rarity")}
        ${storageFilterButton("set", "セット", "rarity")}
      </div>
    </div>
    <div class="storage-filter-panel-group">
      <div class="storage-filter-panel-label">オプション：</div>
      <div class="storage-filters">
        ${storageFilterButton("hasOptions", "OP付き", "option")}
        ${storageFilterButton("noOptions", "OPなし", "option")}
        ${storageFilterButton("oneOption", "1OP", "option")}
        ${storageFilterButton("twoOptions", "2OP", "option")}
        ${storageFilterButton("threeOptions", "3OP", "option")}
        ${storageFilterButton("attackUp", "攻撃", "option")}
        ${storageFilterButton("attackPercent", "攻撃%", "option")}
        ${storageFilterButton("hpUp", "HP", "option")}
        ${storageFilterButton("hpPercent", "HP%", "option")}
        ${storageFilterButton("defenseUp", "DEF", "option")}
        ${storageFilterButton("defensePercent", "DEF%", "option")}
        ${storageFilterButton("criticalRate", "クリ率", "option")}
        ${storageFilterButton("criticalDamage", "クリダメ", "option")}
        ${storageFilterButton("poisonStrike", "毒", "option")}
        ${storageFilterButton("blindStrike", "盲目", "option")}
      </div>
    </div>
    <div class="storage-filter-panel-actions">
      <button type="button" class="storage-bulk-cancel-btn" data-storage-filter-reset>リセット</button>
      <button type="button" class="storage-bulk-cancel-btn" data-storage-filter-close>閉じる</button>
    </div>
  </div>`;
}

function storageAutoSellPanelHtml() {
  const autoSell = ensureAutoSellSettings();
  return `<div class="storage-popover storage-auto-sell" ${storageAutoSellOpen ? "" : "hidden"} aria-label="自動売却設定">
    <label><input type="checkbox" data-auto-sell="common" ${autoSell.common ? "checked" : ""}> common</label>
    <label><input type="checkbox" data-auto-sell="uncommon" ${autoSell.uncommon ? "checked" : ""}> uncommon</label>
  </div>`;
}

function storageBulkSellHtml(visibleEntries) {
  const count = selectedStorageSellCount(visibleEntries);
  const bulkSellCount = bulkSellFilteredCandidateEntries(visibleEntries).length;
  if (storageFusionMode || storageBulkDismantleMode || storageOptionEnhanceMode) return "";
  if (!storageBulkSellMode) {
    return `<button type="button" class="storage-bulk-sell-btn" data-storage-bulk-sell-toggle>売却</button>
    <button type="button" class="storage-bulk-sell-btn" data-storage-bulk-sell-filtered ${bulkSellCount ? "" : "disabled"}>一括売却${bulkSellCount ? ` (${bulkSellCount})` : ""}</button>`;
  }
  return `<div class="storage-bulk-sell-actions">
    <button type="button" class="storage-bulk-sell-btn" data-storage-bulk-sell ${count ? "" : "disabled"}>選択した装備を売却${count ? ` (${count})` : ""}</button>
    <button type="button" class="storage-bulk-cancel-btn" data-storage-bulk-cancel>キャンセル</button>
    <span class="muted">売却モード中</span>
  </div>`;
}

function storageBulkDismantleHtml(visibleEntries) {
  const count = selectedStorageDismantleCount(visibleEntries);
  const bulkDismantleCount = bulkDismantleFilteredCandidateEntries(visibleEntries).length;
  if (storageFusionMode || storageBulkSellMode || storageOptionEnhanceMode) return "";
  if (!storageBulkDismantleMode) {
    return `<button type="button" class="storage-bulk-sell-btn" data-storage-bulk-dismantle-toggle>分解</button>
    <button type="button" class="storage-bulk-sell-btn" data-storage-bulk-dismantle-filtered ${bulkDismantleCount ? "" : "disabled"}>一括分解${bulkDismantleCount ? ` (${bulkDismantleCount})` : ""}</button>`;
  }
  return `<div class="storage-bulk-sell-actions">
    <button type="button" class="storage-bulk-sell-btn" data-storage-bulk-dismantle-run ${count ? "" : "disabled"}>選択した装備を分解${count ? ` (${count})` : ""}</button>
    <button type="button" class="storage-bulk-cancel-btn" data-storage-bulk-dismantle-cancel>キャンセル</button>
    <span class="muted">分解モード中</span>
  </div>`;
}

function storageFusionHtml(visibleEntries) {
  if (!storageFusionUiEnabled) return "";
  if (storageBulkSellMode || storageBulkDismantleMode || storageOptionEnhanceMode) return "";
  const selectedEntry = currentStorageFusionTargetEntry();
  if (!storageFusionMode) {
    return '<button type="button" class="storage-bulk-sell-btn" data-storage-fusion-toggle>装備合成</button>';
  }
  const requiredCount = selectedEntry ? storageFusionRequiredCount(selectedEntry) : 3;
  const goldCost = selectedEntry ? storageFusionGoldCost(selectedEntry) : 100;
  const selectedMaterialCount = selectedEntry ? selectedStorageFusionMaterialCount(visibleEntries, selectedEntry) : 0;
  const availableMaterialCount = selectedEntry ? storageFusionAvailableMaterialCount(visibleEntries, selectedEntry) : 0;
  const materialNote = selectedEntry && selectedStorageFusionUsesOptionedMaterials(visibleEntries, selectedEntry)
    ? '<span class="muted">※OP付き装備も素材になります</span>'
    : "";
  const shortageNote = selectedEntry && availableMaterialCount < requiredCount
    ? `<span class="muted">素材候補が足りません (${availableMaterialCount}/${requiredCount})</span>`
    : "";
  const targetNote = selectedEntry
    ? `<span class="muted">STEP2 素材を選択 (${selectedMaterialCount}/${requiredCount})</span><span class="muted"><span class="storage-fusion-badge">育成対象</span>${equipmentDisplayName(selectedEntry.item)} を育成対象に選択中</span>`
    : '<span class="muted">STEP1 強化したい装備を1本選択</span>';
  return `<div class="storage-bulk-sell-actions">
    <button type="button" class="storage-bulk-sell-btn" data-storage-fusion-run ${selectedEntry && isStorageFusionTargetReady(selectedEntry, visibleEntries) ? "" : "disabled"}>合成 (${selectedMaterialCount}/${requiredCount} / ${goldCost}G)</button>
    <button type="button" class="storage-bulk-cancel-btn" data-storage-fusion-cancel>キャンセル</button>
    ${targetNote}
    ${shortageNote}
    ${materialNote}
  </div>`;
}

function storageOptionEnhanceHtml(visibleEntries) {
  if (storageBulkSellMode || storageBulkDismantleMode || storageFusionMode) return "";
  if (!storageOptionEnhanceMode) {
    return '<button type="button" class="storage-bulk-sell-btn" data-storage-option-enhance-toggle>OP強化</button>';
  }
  const availableEntryCount = storageOptionEnhanceDisplayEntries(visibleEntries).length;
  return `<div class="storage-bulk-sell-actions">
    <button type="button" class="storage-bulk-cancel-btn" data-storage-option-enhance-cancel>キャンセル</button>
    <span class="muted">OP強化モード中</span>
    <span class="muted">強化したいOPを選んでください${availableEntryCount ? "" : "（対象なし）"}</span>
  </div>`;
}

function storageFusionTargetPreviewHtml(entry) {
  const item = entry?.item;
  if (!item) return "";
  const locked = storageEntryLocked(entry);
  const equippedBy = entry?.equippedBy;
  const rarity = normalizeRarity(item?.rarity);
  const name = equipmentDisplayName(item);
  return `<div class="storage-fusion-section">
    <div class="storage-fusion-section-title">育成対象</div>
    <ul class="storage-list">
      <li class="storage-fusion-target-preview">
        <div class="storage-info">
          <div class="storage-head">
            <span class="storage-item ${rarityClassName(rarity)}">${name}${equippedBy || locked ? " ★" : ""}</span>
            ${equippedBy ? `<span class="storage-equipped-label">装備中：${equippedBy}</span>` : ""}
            <span class="storage-fusion-badge">育成対象</span>
          </div>
          ${equipmentSetLabelHtml(item)}
          <div class="storage-effect">${equipmentStorageLine(item)}</div>
          ${equipmentOptionsStorageHtml(item, { storageIndex: storageEntryIndex(entry) })}
        </div>
        <div class="storage-actions">
          <button type="button" class="storage-fusion-change-btn" data-storage-fusion-target-reset>変更</button>
        </div>
      </li>
    </ul>
  </div>`;
}

function storageHeaderHtml(items, visibleGroups = [], visibleEntries = []) {
  const messageHtml = storageFusionMessage
    ? `<div class="storage-result-summary"><span class="muted">${storageFusionMessage}</span>${storageResultDetailMessage ? `<button type="button" class="storage-result-detail-btn" data-storage-result-detail-toggle>${storageResultDetailOpen ? "閉じる" : "詳細"}</button>` : ""}</div>${storageResultDetailMessage && storageResultDetailOpen ? `<div class="storage-result-detail">${storageResultDetailMessage.split("\n").map((line) => `<div>${line}</div>`).join("")}</div>` : ""}`
    : "";
  const actionHtml = `${storageBulkSellHtml(visibleEntries)}${storageBulkDismantleHtml(visibleEntries)}${storageFusionHtml(visibleEntries)}${storageOptionEnhanceHtml(visibleEntries)}`;
  return `<div class="storage-toolbar">${storageCountHtml(items)}${storageSortOptionsHtml(actionHtml)}${storageAutoSellPanelHtml()}${messageHtml}${storageOptionFragmentsSummaryHtml()}</div>`;
}

function storageDismantleResultFloatHtml() {
  if (!storageDismantleResultOpen || !storageDismantleResultDetailMessage) return "";
  return `<div class="storage-dismantle-float">
    <div class="storage-dismantle-float-title">獲得かけら</div>
    <div class="storage-dismantle-float-body">${storageDismantleResultDetailMessage.split("\n").map((line) => `<div>${line}</div>`).join("")}</div>
    <button type="button" class="storage-dismantle-float-close" data-storage-dismantle-float-close>閉じる</button>
  </div>`;
}

function storageDismantleConfirmModalHtml() {
  if (!storageDismantleConfirmState?.message) return "";
  return `<div class="storage-confirm-modal-backdrop" data-storage-dismantle-confirm-close>
    <div class="storage-confirm-modal" role="dialog" aria-modal="true" aria-label="分解確認">
      <div class="storage-confirm-modal-title">分解確認</div>
      <div class="storage-confirm-modal-body">${String(storageDismantleConfirmState.message).split("\n").map((line) => `<div>${line || "&nbsp;"}</div>`).join("")}</div>
      <div class="storage-confirm-modal-actions">
        <button type="button" class="storage-bulk-sell-btn" data-storage-dismantle-confirm-run>分解する</button>
        <button type="button" class="storage-bulk-cancel-btn" data-storage-dismantle-confirm-close>やめる</button>
      </div>
    </div>
  </div>`;
}

function storageSellConfirmModalHtml() {
  if (!storageSellConfirmState?.message) return "";
  return `<div class="storage-confirm-modal-backdrop" data-storage-sell-confirm-close>
    <div class="storage-confirm-modal" role="dialog" aria-modal="true" aria-label="売却確認">
      <div class="storage-confirm-modal-title">${storageSellConfirmState.title || "売却確認"}</div>
      <div class="storage-confirm-modal-body">${String(storageSellConfirmState.message).split("\n").map((line) => `<div>${line || "&nbsp;"}</div>`).join("")}</div>
      <div class="storage-confirm-modal-actions">
        <button type="button" class="storage-bulk-sell-btn" data-storage-sell-confirm-run>売却する</button>
        <button type="button" class="storage-bulk-cancel-btn" data-storage-sell-confirm-close>やめる</button>
      </div>
    </div>
  </div>`;
}

function storageBulkSellModalHtml() {
  if (!Array.isArray(storageBulkSellModalState?.categories)) return "";
  const rows = storageBulkSellModalState.categories
    .map((category) => `<button type="button" class="storage-bulk-sell-category-btn" data-storage-bulk-sell-category="${category.key}" ${category.count ? "" : "disabled"}>
      <span class="storage-bulk-sell-category-label">${category.label}</span>
      <span class="storage-bulk-sell-category-meta">${category.count}件 / ${category.gold}G</span>
    </button>`)
    .join("");
  return `<div class="storage-confirm-modal-backdrop" data-storage-bulk-sell-modal-close>
    <div class="storage-confirm-modal storage-bulk-sell-modal" role="dialog" aria-modal="true" aria-label="一括売却">
      <div class="storage-confirm-modal-title">一括売却</div>
      <div class="storage-confirm-modal-body">
        <div>売却対象を選んでください。</div>
      </div>
      <div class="storage-bulk-sell-category-list">${rows}</div>
      <div class="storage-confirm-modal-actions">
        <button type="button" class="storage-bulk-cancel-btn" data-storage-bulk-sell-modal-close>やめる</button>
      </div>
    </div>
  </div>`;
}

function storageBulkDismantleModalHtml() {
  if (!Array.isArray(storageBulkDismantleModalState?.categories)) return "";
  const rows = storageBulkDismantleModalState.categories
    .map((category) => `<button type="button" class="storage-bulk-sell-category-btn" data-storage-bulk-dismantle-category="${category.key}" ${category.count ? "" : "disabled"}>
      <span class="storage-bulk-sell-category-label">${category.label}</span>
      <span class="storage-bulk-sell-category-meta">${category.count}件 / 最低保証 ${category.fragmentTotal}個</span>
    </button>`)
    .join("");
  return `<div class="storage-confirm-modal-backdrop" data-storage-bulk-dismantle-modal-close>
    <div class="storage-confirm-modal storage-bulk-sell-modal" role="dialog" aria-modal="true" aria-label="一括分解">
      <div class="storage-confirm-modal-title">一括分解</div>
      <div class="storage-confirm-modal-body">
        <div>分解対象を選んでください。</div>
      </div>
      <div class="storage-bulk-sell-category-list">${rows}</div>
      <div class="storage-confirm-modal-actions">
        <button type="button" class="storage-bulk-cancel-btn" data-storage-bulk-dismantle-modal-close>やめる</button>
      </div>
    </div>
  </div>`;
}

function storageFusionStep2Html(targetEntry, contentHtml) {
  if (!targetEntry) return contentHtml;
  return `${storageFusionTargetPreviewHtml(targetEntry)}<div class="storage-fusion-section-title">素材候補</div>${contentHtml}`;
}

function storageGroups(entries) {
  const groups = [];
  const groupByKey = new Map();
  entries.forEach(({ item, storageIndex, equippedBy, equippedMemberId, equippedSlot }) => {
    if (!item) return;
    const key = storageGroupKey(item, storageIndex);
    let group = groupByKey.get(key);
    if (!group) {
      group = { item, count: 0, entries: [], latestIndex: typeof storageIndex === "number" ? storageIndex : -1 };
      groupByKey.set(key, group);
      groups.push(group);
    }
    group.count += 1;
    if (typeof storageIndex === "number") group.latestIndex = Math.max(group.latestIndex, storageIndex);
    group.entries.push({ item, index: storageIndex, storageUid: item.storageUid, locked: !!item.locked, equippedBy, equippedMemberId, equippedSlot });
  });
  return groups.sort(compareStorageGroups);
}

function storageGroupHtml(group) {
  const { item, count, entries } = group;
  const rarity = normalizeRarity(item?.rarity);
  const name = equipmentDisplayName(item);
  const index = entries[0]?.index;
  const locked = !!entries[0]?.locked;
  const equippedEntry = entries.find((entry) => entry.equippedBy);
  const equippedBy = equippedEntry?.equippedBy;
  return `<li>
    <div class="storage-info">
      <div class="storage-head">
        <span class="storage-item ${rarityClassName(rarity)}">${name}${equippedBy || locked ? " ★" : ""}</span>${!equippedBy && !locked && count > 1 ? `<span class="storage-count">×${count}</span>` : ""}
        ${equippedBy ? `<span class="storage-equipped-label">装備中：${equippedBy}</span>` : ""}
      </div>
      ${equipmentSetLabelHtml(item)}
      <div class="storage-effect">${equipmentStorageLine(item)}</div>
      ${equipmentOptionsStorageHtml(item, { storageIndex: index })}
    </div>
    <div class="storage-actions">
      ${typeof index === "number" ? `<button type="button" class="storage-lock-btn" data-storage-index="${index}">${locked ? "解除" : "保護"}</button>` : ""}
    </div>
  </li>`;
}

function storageFusionEntryHtml(entry) {
  const item = entry?.item;
  if (!item) return "";
  const index = storageEntryIndex(entry);
  const locked = storageEntryLocked(entry);
  const equippedBy = entry?.equippedBy;
  const rarity = normalizeRarity(item?.rarity);
  const name = equipmentDisplayName(item);
  const selectionId = String(storageEntryUid(entry));
  const targetEntry = currentStorageFusionTargetEntry();
  const targetChecked = selectedStorageFusionTargetUid === selectionId;
  const materialSelectable = !!targetEntry &&
    isStorageFusionMaterialEntrySelectable(entry, targetEntry.item.id) &&
    index !== storageEntryIndex(targetEntry);
  const materialChecked = materialSelectable && selectedStorageFusionMaterialUids.has(selectionId);
  const checkboxHtml = targetEntry
    ? `<label class="storage-select">
      <input type="checkbox" class="storage-select-checkbox" data-storage-fusion-material="${selectionId}" ${materialChecked ? "checked" : ""} ${materialSelectable ? "" : "disabled"}>
    </label>`
    : `<label class="storage-select">
      <input type="checkbox" class="storage-select-checkbox" data-storage-fusion-target="${selectionId}" ${targetChecked ? "checked" : ""} ${isStorageFusionTargetEntrySelectable(entry) ? "" : "disabled"}>
    </label>`;
  const fusionLabel = targetChecked
    ? '<span class="storage-fusion-badge">育成対象</span>'
    : materialChecked
      ? '<span class="storage-fusion-badge">素材</span>'
      : "";
  return `<li>
    ${checkboxHtml}
    <div class="storage-info">
      <div class="storage-head">
        <span class="storage-item ${rarityClassName(rarity)}">${name}${equippedBy || locked ? " ★" : ""}</span>
        ${equippedBy ? `<span class="storage-equipped-label">装備中：${equippedBy}</span>` : ""}
        ${fusionLabel}
      </div>
      ${equipmentSetLabelHtml(item)}
      <div class="storage-effect">${equipmentStorageLine(item)}</div>
      ${equipmentOptionsStorageHtml(item, { storageIndex: index })}
    </div>
    <div class="storage-actions">
      ${typeof index === "number" ? `<button type="button" class="storage-lock-btn" data-storage-index="${index}">${locked ? "解除" : "保護"}</button>` : ""}
    </div>
  </li>`;
}

function storageSellGroupHtml(group) {
  const item = group?.item;
  if (!item) return "";
  const rarity = normalizeRarity(item?.rarity);
  const name = equipmentDisplayName(item);
  const count = Array.isArray(group?.entries) ? group.entries.length : 0;
  const sellGold = equipmentSellGoldValue(item);
  const uids = (group.entries || [])
    .map((entry) => String(storageEntryUid(entry) || ""))
    .filter(Boolean);
  const checked = !!uids.length && uids.every((uid) => selectedStorageSellUids.has(uid));
  const value = uids.join(",");
  return `<li>
    <label class="storage-select">
      <input type="checkbox" class="storage-select-checkbox" data-storage-sell-group="${value}" ${checked ? "checked" : ""} ${uids.length ? "" : "disabled"}>
    </label>
    <div class="storage-info">
      <div class="storage-head">
        <span class="storage-item ${rarityClassName(rarity)}">${name}</span>${count > 1 ? `<span class="storage-count">×${count}</span>` : ""}
      </div>
      ${equipmentSetLabelHtml(item)}
      <div class="storage-effect">${equipmentStatLine(item)}</div>
      <div class="storage-effect">売却 ${sellGold}G${count > 1 ? ` ×${count}` : ""}</div>
    </div>
    <div class="storage-actions"></div>
  </li>`;
}

function storageOptionEnhanceOptionsHtml(entry) {
  const uid = String(storageEntryUid(entry) || "");
  const options = Array.isArray(entry?.item?.options) ? entry.item.options : [];
  const lines = options
    .map((option, index) => {
      const preview = canEnhanceStorageEquipmentOptionByUid(uid, index);
      const optionId = String(option?.id || preview?.optionId || "");
      const currentFragments = Math.max(0, Number(preview?.currentFragments) || 0);
      const requiredFragments = Math.max(0, Number(preview?.requiredFragments) || 0);
      const fragmentsText = preview?.reason === "max_level"
        ? "最大Lv"
        : `${currentFragments}/${requiredFragments || optionEnhanceRequiredFragments(option?.level)}`;
      const actionHtml = preview?.ok
        ? `<button type="button" class="storage-option-enhance-btn storage-option-enhance-action" data-storage-option-enhance="${uid}" data-storage-option-index="${index}">強化</button>`
        : `<button type="button" class="storage-option-enhance-btn storage-option-enhance-action storage-option-enhance-action-disabled" disabled>${preview?.reason === "max_level" ? "最大Lv" : preview?.reason === "not_enough_fragments" ? "不足" : "強化不可"}</button>`;
      return `<div class="storage-option-enhance-row">
        <span class="storage-option-enhance-main">${optionEnhanceLabel(option)}</span>
        <span class="storage-option-enhance-fragments">${OPTION_MASTER?.[optionId]?.name || optionId} ${fragmentsText}</span>
        ${actionHtml}
      </div>`;
    })
    .join("");
  return lines ? `<div class="storage-option-enhance-list">${lines}</div>` : "";
}

function storageOptionEnhanceEntryHtml(entry) {
  const item = entry?.item;
  if (!item) return "";
  const locked = storageEntryLocked(entry);
  const rarity = normalizeRarity(item?.rarity);
  const name = equipmentDisplayName(item);
  return `<li>
    <div class="storage-info">
      <div class="storage-head">
        <span class="storage-item ${rarityClassName(rarity)}">${name}${locked ? " ★" : ""}</span>
      </div>
      ${equipmentSetLabelHtml(item)}
      <div class="storage-effect">${equipmentStatLine(item)}</div>
      ${storageOptionEnhanceOptionsHtml(entry)}
    </div>
  </li>`;
}

function storageModeEntryHtml(entry, mode = "dismantle") {
  const item = entry?.item;
  if (!item) return "";
  const index = storageEntryIndex(entry);
  const uid = storageEntryUid(entry);
  const locked = storageEntryLocked(entry);
  const equippedBy = entry?.equippedBy;
  const rarity = normalizeRarity(item?.rarity);
  const name = equipmentDisplayName(item);
  const sellMode = mode === "sell";
  const selectable = sellMode ? canSellStorageEquipmentByUid(uid) : isStorageDismantleEntrySelectable(entry);
  const checked = selectable && (sellMode
    ? selectedStorageSellUids.has(String(uid))
    : selectedStorageDismantleUids.has(String(uid)));
  const dataAttr = sellMode ? "data-storage-sell-select" : "data-storage-dismantle-select";
  const checkboxHtml = `<label class="storage-select">
      <input type="checkbox" class="storage-select-checkbox" ${dataAttr}="${String(uid || "")}" ${checked ? "checked" : ""} ${selectable ? "" : "disabled"}>
    </label>`;
  return `<li>
    ${checkboxHtml}
    <div class="storage-info">
      <div class="storage-head">
        <span class="storage-item ${rarityClassName(rarity)}">${name}${equippedBy || locked ? " ★" : ""}</span>
        ${equippedBy ? `<span class="storage-equipped-label">装備中：${equippedBy}</span>` : ""}
      </div>
      ${equipmentSetLabelHtml(item)}
      <div class="storage-effect">${equipmentStorageLine(item)}</div>
      ${equipmentOptionsStorageHtml(item, { storageIndex: index })}
    </div>
    <div class="storage-actions">
      ${typeof index === "number" ? `<button type="button" class="storage-lock-btn" data-storage-index="${index}">${locked ? "解除" : "保護"}</button>` : ""}
    </div>
  </li>`;
}

function bindStorageEvents(root) {
  root.querySelector("[data-storage-filter-toggle]")?.addEventListener("click", () => {
    clearButtonFocus(root.querySelector("[data-storage-filter-toggle]"));
    storageFilterOpen = !storageFilterOpen;
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelector("[data-storage-filter-close]")?.addEventListener("click", () => {
    clearButtonFocus(root.querySelector("[data-storage-filter-close]"));
    storageFilterOpen = false;
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelector("[data-storage-auto-sell-toggle]")?.addEventListener("click", () => {
    storageAutoSellOpen = !storageAutoSellOpen;
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelector("[data-storage-result-detail-toggle]")?.addEventListener("click", () => {
    storageResultDetailOpen = !storageResultDetailOpen;
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelector("[data-storage-dismantle-confirm-run]")?.addEventListener("click", () => {
    const confirmState = storageDismantleConfirmState;
    closeStorageDismantleConfirm();
    if (confirmState?.mode === "single" && confirmState.uid) {
      executeStorageItemDismantle(confirmState.uid);
      return;
    }
    if (confirmState?.mode === "multi" && Array.isArray(confirmState.uids)) {
      executeSelectedStorageDismantle(confirmState.uids);
      return;
    }
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelectorAll("[data-storage-dismantle-confirm-close]").forEach((button) => {
    button.addEventListener("click", () => {
      closeStorageDismantleConfirm();
      storageRenderCount = -1;
      renderStorage();
    });
  });
  root.querySelectorAll("[data-storage-bulk-sell-modal-close]").forEach((button) => {
    button.addEventListener("click", () => {
      closeStorageBulkSellModal();
      storageRenderCount = -1;
      renderStorage();
    });
  });
  root.querySelectorAll("[data-storage-bulk-sell-category]").forEach((button) => {
    button.addEventListener("click", () => {
      const categoryKey = button.dataset.storageBulkSellCategory;
      const category = (storageBulkSellModalState?.categories || []).find((entry) => entry.key === categoryKey);
      if (!category || !category.count) return;
      closeStorageBulkSellModal();
      openStorageSellConfirm({
        mode: `bulkCategory:${category.key}`,
        title: "一括売却確認",
        uids: [...category.uids],
        message: bulkSellOptionCategoryConfirmMessage(category.key, category.count, category.gold),
      });
      storageRenderCount = -1;
      renderStorage();
    });
  });
  root.querySelectorAll("[data-storage-bulk-dismantle-modal-close]").forEach((button) => {
    button.addEventListener("click", () => {
      closeStorageBulkDismantleModal();
      storageRenderCount = -1;
      renderStorage();
    });
  });
  root.querySelectorAll("[data-storage-bulk-dismantle-category]").forEach((button) => {
    button.addEventListener("click", () => {
      const categoryKey = button.dataset.storageBulkDismantleCategory;
      const category = (storageBulkDismantleModalState?.categories || []).find((entry) => entry.key === categoryKey);
      if (!category || !category.count) return;
      closeStorageBulkDismantleModal();
      openStorageDismantleConfirm({
        mode: "multi",
        uids: [...category.uids],
        message: bulkDismantleOptionCategoryConfirmMessage(category),
      });
      storageRenderCount = -1;
      renderStorage();
    });
  });
  root.querySelector("[data-storage-sell-confirm-run]")?.addEventListener("click", () => {
    const confirmState = storageSellConfirmState;
    closeStorageSellConfirm();
    if (Array.isArray(confirmState?.uids)) {
      executeSelectedStorageSell(confirmState.uids);
      return;
    }
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelectorAll("[data-storage-sell-confirm-close]").forEach((button) => {
    button.addEventListener("click", () => {
      closeStorageSellConfirm();
      storageRenderCount = -1;
      renderStorage();
    });
  });
  root.querySelector(".storage-confirm-modal")?.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  root.querySelector("[data-storage-dismantle-float-close]")?.addEventListener("click", () => {
    storageDismantleResultOpen = false;
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelectorAll(".storage-filter-btn").forEach((button) => {
    button.addEventListener("click", () => {
      clearButtonFocus(button);
      const value = button.dataset.storageFilter || "all";
      const group = button.dataset.storageFilterGroup || "kind";
      if (group === "kind") {
        if (value === "all") {
          storageFilterKinds.clear();
        } else if (storageFilterKinds.has(value)) {
          storageFilterKinds.delete(value);
        } else {
          storageFilterKinds.add(value);
        }
      } else if (group === "rarity") {
        if (storageFilterRarities.has(value)) {
          storageFilterRarities.delete(value);
        } else {
          storageFilterRarities.add(value);
        }
      } else if (group === "option") {
        if (storageFilterOptions.has(value)) {
          storageFilterOptions.delete(value);
        } else {
          if (value === "hasOptions") storageFilterOptions.delete("noOptions");
          if (value === "noOptions") storageFilterOptions.delete("hasOptions");
          if (storageOptionCountFilterValues.has(value)) {
            [...storageOptionCountFilterValues].forEach((filter) => storageFilterOptions.delete(filter));
          }
          storageFilterOptions.add(value);
        }
      }
      storageRenderCount = -1;
      renderStorage();
    });
  });
  root.querySelector("[data-storage-filter-reset]")?.addEventListener("click", () => {
    clearButtonFocus(root.querySelector("[data-storage-filter-reset]"));
    storageFilterKinds.clear();
    storageFilterRarities.clear();
    storageFilterOptions.clear();
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelector(".storage-sort-select")?.addEventListener("change", (e) => {
    storageSortMode = e.target.value;
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelectorAll("[data-auto-sell]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.autoSell;
      if (!["common", "uncommon"].includes(key)) return;
      ensureAutoSellSettings()[key] = input.checked;
      storageRenderCount = -1;
      saveGame();
      renderStorage();
    });
  });
  root.querySelectorAll("[data-storage-option-fix]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.storageOptionFix);
      const optionId = button.dataset.optionId;
      if (!optionId) return;
      fixStorageItemOptionCandidate(index, optionId);
    });
  });
  root.querySelectorAll(".storage-select-checkbox").forEach((input) => {
    input.addEventListener("change", () => {
      if (storageFusionMode) {
        const targetId = input.dataset.storageFusionTarget;
        if (targetId) {
          selectedStorageFusionTargetUid = input.checked ? String(targetId) : null;
          selectedStorageFusionMaterialUids.clear();
          storageRenderCount = -1;
          renderStorage();
          return;
        }
        const materialId = input.dataset.storageFusionMaterial;
        if (!materialId) return;
        if (input.checked) selectedStorageFusionMaterialUids.add(String(materialId));
        else selectedStorageFusionMaterialUids.delete(String(materialId));
        storageRenderCount = -1;
        renderStorage();
        return;
      }
      if (storageBulkDismantleMode) {
        const dismantleId = input.dataset.storageDismantleSelect;
        if (!dismantleId) return;
        if (input.checked) selectedStorageDismantleUids.add(String(dismantleId));
        else selectedStorageDismantleUids.delete(String(dismantleId));
        storageRenderCount = -1;
        renderStorage();
        return;
      }
      const sellGroupValue = input.dataset.storageSellGroup;
      if (sellGroupValue) {
        sellGroupValue
          .split(",")
          .map((uid) => String(uid || "").trim())
          .filter(Boolean)
          .forEach((uid) => {
            if (input.checked) selectedStorageSellUids.add(uid);
            else selectedStorageSellUids.delete(uid);
          });
        storageRenderCount = -1;
        renderStorage();
        return;
      }
      const sellId = input.dataset.storageSellSelect;
      if (!sellId) return;
      if (input.checked) selectedStorageSellUids.add(String(sellId));
      else selectedStorageSellUids.delete(String(sellId));
      storageRenderCount = -1;
      renderStorage();
    });
  });
  root.querySelector("[data-storage-bulk-sell-toggle]")?.addEventListener("click", () => {
    storageBulkSellMode = true;
    cancelStorageBulkDismantleMode();
    cancelStorageFusionMode();
    cancelStorageOptionEnhanceMode();
    selectedStorageSellUids.clear();
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelector("[data-storage-bulk-sell]")?.addEventListener("click", () => {
    sellSelectedStorageItems();
  });
  root.querySelector("[data-storage-bulk-sell-filtered]")?.addEventListener("click", () => {
    openStorageBulkSellCategoryModal(filteredStorageEntries(state.storage || []));
  });
  root.querySelector("[data-storage-bulk-cancel]")?.addEventListener("click", () => {
    cancelStorageBulkSellMode();
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelector("[data-storage-bulk-dismantle-toggle]")?.addEventListener("click", () => {
    storageBulkDismantleMode = true;
    cancelStorageBulkSellMode();
    cancelStorageFusionMode();
    cancelStorageOptionEnhanceMode();
    selectedStorageDismantleUids.clear();
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelector("[data-storage-bulk-dismantle-filtered]")?.addEventListener("click", () => {
    openStorageBulkDismantleCategoryModal(filteredStorageEntries(state.storage || []));
  });
  root.querySelector("[data-storage-bulk-dismantle-run]")?.addEventListener("click", () => {
    dismantleSelectedStorageItems();
  });
  root.querySelector("[data-storage-bulk-dismantle-cancel]")?.addEventListener("click", () => {
    cancelStorageBulkDismantleMode();
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelector("[data-storage-fusion-toggle]")?.addEventListener("click", () => {
    storageFusionMode = true;
    cancelStorageBulkSellMode();
    cancelStorageBulkDismantleMode();
    cancelStorageOptionEnhanceMode();
    selectedStorageFusionTargetUid = null;
    selectedStorageFusionMaterialUids.clear();
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelector("[data-storage-fusion-run]")?.addEventListener("click", () => {
    const visibleEntries = filteredStorageEntries(state.storage || []);
    fuseSelectedStorageGroup(visibleEntries);
  });
  root.querySelector("[data-storage-fusion-target-reset]")?.addEventListener("click", () => {
    selectedStorageFusionTargetUid = null;
    selectedStorageFusionMaterialUids.clear();
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelector("[data-storage-fusion-cancel]")?.addEventListener("click", () => {
    cancelStorageFusionMode();
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelector("[data-storage-option-enhance-toggle]")?.addEventListener("click", () => {
    storageOptionEnhanceMode = true;
    cancelStorageBulkSellMode();
    cancelStorageBulkDismantleMode();
    cancelStorageFusionMode();
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelector("[data-storage-option-enhance-cancel]")?.addEventListener("click", () => {
    cancelStorageOptionEnhanceMode();
    storageRenderCount = -1;
    renderStorage();
  });
  root.querySelectorAll("[data-storage-option-enhance]").forEach((button) => {
    button.addEventListener("click", () => {
      handleStorageOptionEnhance(
        String(button.dataset.storageOptionEnhance || ""),
        Number(button.dataset.storageOptionIndex)
      );
    });
  });
  root.querySelectorAll(".storage-lock-btn").forEach((button) => {
    button.addEventListener("click", () => {
      toggleStorageLock(Number(button.dataset.storageIndex));
    });
  });
}

function renderStorageHeaderHtml(items, visibleGroups, visibleEntries) {
  return storageHeaderHtml(items, visibleGroups, visibleEntries);
}

function renderStorageNormalHtml(visibleGroups) {
  return `<ul class="storage-list">${visibleGroups.map(storageGroupHtml).join("")}</ul>`;
}

function renderStorageFusionStep1Html(fusionDisplayEntries) {
  return `<ul class="storage-list">${fusionDisplayEntries.map(storageFusionEntryHtml).join("")}</ul>`;
}

function renderStorageFusionStep2ListHtml(fusionTargetEntry, fusionDisplayEntries) {
  return storageFusionStep2Html(
    fusionTargetEntry,
    `<ul class="storage-list">${fusionDisplayEntries.map(storageFusionEntryHtml).join("")}</ul>`
  );
}

function renderStorageFusionStep2EmptyHtml(fusionTargetEntry, emptyText) {
  return storageFusionStep2Html(fusionTargetEntry, `<p class="log-empty">${emptyText}</p>`);
}

function renderStorage() {
  const root = $("storage-root");
  if (!root) return;
  if (!storageFusionUiEnabled && storageFusionMode) {
    cancelStorageFusionMode();
  }
  const items = state.storage || [];
  const autoSell = ensureAutoSellSettings();
  const equippedKey = equippedStorageEntries().map(({ storageIndex, item }) => `${storageIndex}:${item.id}`).join(",");
  const visibleEntries = filteredStorageEntries(items);
  const visibleGroups = storageGroups(visibleEntries);
  const sellDisplayEntries = storageSellDisplayEntries(visibleEntries);
  const dismantleDisplayEntries = storageDismantleDisplayEntries(visibleEntries);
  const optionEnhanceDisplayEntries = storageOptionEnhanceDisplayEntries(visibleEntries);
  const fusionTargetEntry = currentStorageFusionTargetEntry();
  syncSelectedStorageSellUids(visibleEntries);
  syncSelectedStorageDismantleUids(dismantleDisplayEntries);
  syncSelectedStorageFusionMaterials(visibleEntries, fusionTargetEntry);
  const fusionDisplayEntries = storageFusionMode
    ? fusionTargetEntry
      ? visibleEntries.filter((entry) =>
          isStorageFusionMaterialEntrySelectable(entry, fusionTargetEntry.item.id) &&
          storageEntryIndex(entry) !== storageEntryIndex(fusionTargetEntry)
        ).sort(compareStorageFusionMaterialEntries)
      : visibleEntries
        .filter(isStorageFusionTargetEntrySelectable)
        .filter((entry) => hasStorageFusionRequiredMaterials(entry, visibleEntries))
        .sort(compareStorageFusionTargetEntries)
    : [];
  const selectedKey = [...selectedStorageSellUids].sort().join(",");
  const dismantleSelectedKey = [...selectedStorageDismantleUids].sort().join(",");
  const fusionMaterialKey = [...selectedStorageFusionMaterialUids].sort().join(",");
  const filterKindsKey = [...storageFilterKinds].sort().join(",");
  const filterRaritiesKey = [...storageFilterRarities].sort().join(",");
  const dismantleConfirmKey = storageDismantleConfirmState
    ? `${storageDismantleConfirmState.mode}:${storageDismantleConfirmState.uid || ""}:${Array.isArray(storageDismantleConfirmState.uids) ? storageDismantleConfirmState.uids.join(",") : ""}:${storageDismantleConfirmState.message || ""}`
    : "";
  const bulkSellModalKey = storageBulkSellModalState
    ? (storageBulkSellModalState.categories || [])
      .map((category) => `${category.key}:${category.count}:${category.gold}:${Array.isArray(category.uids) ? category.uids.join(",") : ""}`)
      .join("|")
    : "";
  const bulkDismantleModalKey = storageBulkDismantleModalState
    ? (storageBulkDismantleModalState.categories || [])
      .map((category) => `${category.key}:${category.count}:${category.fragmentTotal}:${Array.isArray(category.uids) ? category.uids.join(",") : ""}`)
      .join("|")
    : "";
  const sellConfirmKey = storageSellConfirmState
    ? `${storageSellConfirmState.mode || ""}:${storageSellConfirmState.title || ""}:${Array.isArray(storageSellConfirmState.uids) ? storageSellConfirmState.uids.join(",") : ""}:${storageSellConfirmState.message || ""}`
    : "";
  const renderKey = `${items.length}:${storageSortMode}:${filterKindsKey}:${filterRaritiesKey}:${autoSell.common}:${autoSell.uncommon}:${storageFilterOpen}:${storageAutoSellOpen}:${equippedKey}:${storageBulkSellMode}:${storageBulkDismantleMode}:${storageFusionMode}:${storageOptionEnhanceMode}:${selectedKey}:${dismantleSelectedKey}:${selectedStorageFusionTargetUid ?? ""}:${fusionMaterialKey}:${storageDismantleResultOpen}:${storageDismantleResultDetailMessage}:${dismantleConfirmKey}:${bulkSellModalKey}:${bulkDismantleModalKey}:${sellConfirmKey}`;
  if (renderKey === storageRenderCount) return;
  storageRenderCount = renderKey;

  const normalDisplayEntries = storageBulkSellMode
    ? sellDisplayEntries
    : storageBulkDismantleMode
      ? dismantleDisplayEntries
      : storageOptionEnhanceMode
        ? optionEnhanceDisplayEntries
        : visibleGroups;
  if ((storageFusionMode ? fusionDisplayEntries : normalDisplayEntries).length === 0) {
    const emptyText = storageFusionMode && fusionTargetEntry
      ? "素材候補はありません"
      : (storageBulkSellMode || storageBulkDismantleMode)
        ? items.length
          ? "条件に合う装備はありません"
          : "保管中の装備はありません"
      : storageOptionEnhanceMode
        ? items.length
          ? "強化対象の装備はありません"
          : "保管中の装備はありません"
      : items.length
        ? "条件に合う装備はありません"
        : "保管中の装備はありません";
    const fusionContentHtml = storageFusionMode && fusionTargetEntry
      ? renderStorageFusionStep2EmptyHtml(fusionTargetEntry, emptyText)
      : `<p class="log-empty">${emptyText}</p>`;
    root.innerHTML = `${renderStorageHeaderHtml(items, visibleGroups, visibleEntries)}${fusionContentHtml}${storageDismantleResultFloatHtml()}${storageDismantleConfirmModalHtml()}${storageBulkSellModalHtml()}${storageBulkDismantleModalHtml()}${storageSellConfirmModalHtml()}`;
    bindStorageEvents(root);
    return;
  }

  const fusionListHtml = storageFusionMode
    ? fusionTargetEntry
      ? renderStorageFusionStep2ListHtml(fusionTargetEntry, fusionDisplayEntries)
      : renderStorageFusionStep1Html(fusionDisplayEntries)
    : storageBulkSellMode
      ? `<ul class="storage-list">${sellDisplayEntries.map((entry) => entry?.type === "group" ? storageSellGroupHtml(entry) : storageModeEntryHtml(entry.entry, "sell")).join("")}</ul>`
    : storageBulkDismantleMode
      ? `<ul class="storage-list">${dismantleDisplayEntries.map((entry) => storageModeEntryHtml(entry, "dismantle")).join("")}</ul>`
    : storageOptionEnhanceMode
      ? `<ul class="storage-list">${optionEnhanceDisplayEntries.map(storageOptionEnhanceEntryHtml).join("")}</ul>`
      : renderStorageNormalHtml(visibleGroups);
  root.innerHTML = `${renderStorageHeaderHtml(items, visibleGroups, visibleEntries)}${fusionListHtml}${storageDismantleResultFloatHtml()}${storageDismantleConfirmModalHtml()}${storageBulkSellModalHtml()}${storageBulkDismantleModalHtml()}${storageSellConfirmModalHtml()}`;
  bindStorageEvents(root);
}

function renderItemSection() {
  renderStorage();
}

function equipmentRecordInfoValue(value, lookup = null) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const labels = values
    .filter(Boolean)
    .map((item) => lookup?.[item]?.name || item);
  return labels.join("、") || "？？？";
}

function equipmentRecordConfiguredInfoValue(value, lookup = null) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const labels = values
    .filter(Boolean)
    .map((item) => lookup?.[item]?.name || item);
  return labels.join("、") || "未設定";
}

function equipmentRecordDropEnemyIds(item) {
  if (item?.dropEnemies) return Array.isArray(item.dropEnemies) ? item.dropEnemies : [item.dropEnemies];
  if (!item?.id) return [];
  return Object.values(MONSTERS || {})
    .filter((enemy) =>
      (enemy?.drops || []).some((drop) => (typeof drop === "string" ? drop : drop?.id) === item.id)
    )
    .map((enemy) => enemy.id)
    .filter(Boolean);
}

function equipmentRecordDropAreaIds(item, enemyIds) {
  if (item?.dropAreas) return Array.isArray(item.dropAreas) ? item.dropAreas : [item.dropAreas];
  const enemies = new Set(enemyIds);
  if (!enemies.size) return [];
  return Object.values(AREAS || {})
    .filter((area) => enemies.has(area?.boss) || (area?.monsters || []).some((enemyId) => enemies.has(enemyId)))
    .map((area) => area.id)
    .filter(Boolean);
}

function equipmentRecordKindLabel(slot) {
  return {
    weapon: "武器",
    armor: "防具",
    accessory: "装飾",
    accessory1: "装飾",
    accessory2: "装飾",
    装飾1: "装飾",
    装飾2: "装飾",
    relic: "遺物",
  }[slot] || slot || "？？？";
}

function equipmentRecordBasePower(item) {
  return ["maxHp", "atk", "def", "dex", "luc"].reduce((sum, key) => sum + (Number(item?.[key]) || 0), 0);
}

function equipmentRecordTypeRank(item) {
  const slot = item?.slot || "";
  const slotKind = EQUIPMENT_SLOTS.find(({ key, kind }) => key === slot || kind === slot)?.kind || slot;
  return {
    weapon: 0,
    armor: 1,
    accessory: 2,
    relic: 3,
  }[slotKind] ?? 99;
}

function equipmentRecordStageRank(item) {
  const areaIds = equipmentRecordDropAreaIds(item, equipmentRecordDropEnemyIds(item));
  if (!areaIds.length) return Number.MAX_SAFE_INTEGER;
  return areaIds.reduce((best, areaId) => {
    const index = AREA_ORDER.indexOf(areaId);
    const rank = index >= 0 ? index : Number.MAX_SAFE_INTEGER;
    return Math.min(best, rank);
  }, Number.MAX_SAFE_INTEGER);
}

function compareEquipmentRecords(a, b) {
  return (
    equipmentRecordTypeRank(a) - equipmentRecordTypeRank(b) ||
    rarityRank(a?.rarity) - rarityRank(b?.rarity) ||
    equipmentRecordStageRank(a) - equipmentRecordStageRank(b) ||
    equipmentRecordBasePower(a) - equipmentRecordBasePower(b) ||
    String(a?.id || "").localeCompare(String(b?.id || ""), "ja")
  );
}

function equipmentRecordHtml(item, discovered = false) {
  const rarity = normalizeRarity(item?.rarity);
  const slot = item?.slot || "unknown";
  const slotKind = EQUIPMENT_SLOTS.find(({ key, kind }) => key === slot || kind === slot)?.kind || slot;
  const slotLabel = equipmentRecordKindLabel(slotKind);
  const metaParts = [rarity];
  if (isSetEquipmentItem(item)) metaParts.push("set");
  metaParts.push(slotLabel);
  const dropEnemyIds = equipmentRecordDropEnemyIds(item);
  const dropAreaIds = equipmentRecordDropAreaIds(item, dropEnemyIds);
  const flavor = item?.flavor || item?.description || "未記録";
  const name = discovered ? equipmentToastName(item) : "？？？";
  const statText = discovered ? equipmentStatLine(item) : "？？？";
  const appearanceText = equipmentRecordConfiguredInfoValue(dropAreaIds, AREAS);
  const appearanceLabel = discovered ? "出現" : "出現条件";
  const dropText = discovered
    ? equipmentRecordConfiguredInfoValue(dropEnemyIds, MONSTERS)
    : (dropEnemyIds.length ? "？？？" : "未設定");
  const descriptionHtml = discovered ? `<p class="records-flavor">説明：${flavor}</p>` : "";
  return `<li>
    <div class="records-info">
      <div class="records-head">
        <span class="records-item ${discovered ? rarityClassName(rarity) : ""}">${name}</span>
        <span class="records-meta">${metaParts.join(" / ")}</span>
      </div>
      ${equipmentResearchStorageHtml(item)}
      <div class="records-effect">性能：${statText}</div>
      <div class="records-effect">${appearanceLabel}：${appearanceText}</div>
      <div class="records-effect">ドロップ：${dropText}</div>
      ${descriptionHtml}
    </div>
  </li>`;
}

function shouldDisplayEquipmentRecord(item, discoveredIds) {
  if (!item?.id) return false;
  if (discoveredIds.has(item.id)) return true;
  const dropEnemyIds = equipmentRecordDropEnemyIds(item);
  const dropAreaIds = equipmentRecordDropAreaIds(item, dropEnemyIds);
  return dropEnemyIds.length > 0 || dropAreaIds.length > 0;
}

function enemyRecordInfoValue(value, lookup = null, fallback = "？？？") {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const labels = values
    .filter(Boolean)
    .map((item) => lookup?.[item]?.name || item);
  return labels.join("、") || fallback;
}

function enemyRecordDropItemId(drop) {
  return typeof drop === "string" ? drop : drop?.id || drop?.itemId || null;
}

function enemyRecordDropItemIds(enemyId, enemy) {
  const explicit = enemy?.dropItems || enemy?.drops || enemy?.dropTable;
  if (explicit?.length) return explicit.map(enemyRecordDropItemId).filter(Boolean);

  return Object.values(EQUIPMENT_ITEMS || {})
    .filter((item) => {
      const enemyIds = Array.isArray(item?.dropEnemies)
        ? item.dropEnemies
        : item?.dropEnemies
          ? [item.dropEnemies]
          : [];
      return enemyIds.includes(enemyId);
    })
    .map((item) => item.id)
    .filter(Boolean);
}

function enemyRecordDropItemsValue(enemyId, enemy) {
  const itemIds = enemyRecordDropItemIds(enemyId, enemy);
  const names = itemIds.map((itemId) => EQUIPMENT_ITEMS?.[itemId]?.name || itemId);
  return [...new Set(names)].join("、") || "？？？";
}

function enemyRecordAreaIds(enemyId) {
  return Object.values(AREAS || {})
    .filter((area) => area?.boss === enemyId || (area?.monsters || []).includes(enemyId))
    .map((area) => area.id)
    .filter(Boolean);
}

function enemyRecordStageRank(enemyId, enemy) {
  const areaIds = Array.isArray(enemy?.recordInfo?.appearance) && enemy.recordInfo.appearance.length
    ? enemy.recordInfo.appearance
    : enemyRecordAreaIds(enemyId);
  if (!areaIds.length) return Number.MAX_SAFE_INTEGER;
  return areaIds.reduce((best, areaId) => {
    const index = AREA_ORDER.indexOf(areaId);
    const rank = index >= 0 ? index : Number.MAX_SAFE_INTEGER;
    return Math.min(best, rank);
  }, Number.MAX_SAFE_INTEGER);
}

function enemyRecordTypeRank(enemy) {
  if (enemy?.boss) return 2;
  if (enemy?.rare) return 1;
  return 0;
}

function enemyRecordDexValue(enemyId, enemy) {
  if (Number.isFinite(enemy?.dex)) return enemy.dex;
  const areaIds = Array.isArray(enemy?.recordInfo?.appearance) && enemy.recordInfo.appearance.length
    ? enemy.recordInfo.appearance
    : enemyRecordAreaIds(enemyId);
  const area = areaIds
    .map((areaId) => AREAS?.[areaId])
    .filter(Boolean)
    .sort((a, b) => {
      const rankA = AREA_ORDER.indexOf(a.id);
      const rankB = AREA_ORDER.indexOf(b.id);
      const safeRankA = rankA >= 0 ? rankA : Number.MAX_SAFE_INTEGER;
      const safeRankB = rankB >= 0 ? rankB : Number.MAX_SAFE_INTEGER;
      return safeRankA - safeRankB;
    })[0];
  return Number.isFinite(area?.difficulty) ? area.difficulty + 4 : null;
}

function enemyRecordHtml(enemyId, record) {
  const enemy = MONSTERS?.[enemyId];
  const kills = Math.max(0, Number(record?.kills) || 0);
  const unlockedName = kills >= 1;
  const unlockedHp = kills >= 5;
  const unlockedAtk = kills >= 10;
  const unlockedDef = kills >= 15;
  const unlockedDex = kills >= 15;
  const def = enemy?.def ?? 0;
  const dex = enemyRecordDexValue(enemyId, enemy);
  const tag = enemy?.boss
    ? '<span class="enemy-tag boss-tag">[BOSS]</span>'
    : enemy?.rare
      ? '<span class="enemy-tag rare-tag">[RARE]</span>'
      : "";
  const info = enemy?.recordInfo || {};
  const appearanceLabel = unlockedName ? "出現" : "出現条件";
  const appearanceText = enemyRecordInfoValue(info.appearance || enemyRecordAreaIds(enemyId), AREAS, "未設定");
  const traitsText = unlockedName ? String(enemy?.traitsText || "").trim() : "";
  return `<li>
    <div class="records-info">
      <div class="records-head">
        <span class="records-item">${unlockedName ? enemy?.name || "名称不明の敵" : "？？？"}</span>${tag}
      </div>
      <div class="records-effect">${appearanceLabel}：${appearanceText}</div>
      ${traitsText ? `<div class="records-effect">特徴：${traitsText}</div>` : ""}
      <div class="records-effect">ドロップ：${enemyRecordDropItemsValue(enemyId, enemy)}</div>
      <div class="records-effect">討伐数：${kills}回</div>
      <div class="records-effect">HP：${unlockedHp ? enemy?.hp ?? "？？？" : "？？？"}</div>
      <div class="records-effect">ATK：${unlockedAtk ? enemy?.atk ?? "？？？" : "？？？"}</div>
      <div class="records-effect">DEF：${unlockedDef ? def : "？？？"}</div>
      <div class="records-effect">DEX：${unlockedDex ? dex ?? "？？？" : "？？？"}</div>
    </div>
  </li>`;
}

function enemyRecordEntries(records) {
  return Object.entries(records.enemies || {})
    .filter(([enemyId, record]) => MONSTERS?.[enemyId] && (record?.kills || 0) > 0)
    .sort((a, b) => {
      const enemyA = MONSTERS[a[0]];
      const enemyB = MONSTERS[b[0]];
      return (
        enemyRecordStageRank(a[0], enemyA) - enemyRecordStageRank(b[0], enemyB) ||
        enemyRecordTypeRank(enemyA) - enemyRecordTypeRank(enemyB) ||
        String(a[0]).localeCompare(String(b[0]), "ja")
      );
    });
}

function renderRecords() {
  const root = $("records-root");
  if (!root) return;
  const records = ensureRecords();
  const discoveredIds = new Set(records.equipment);
  const equipmentTotal = Object.keys(EQUIPMENT_ITEMS || {}).length;
  const enemyTotal = Object.keys(MONSTERS || {}).length;
  const items = Object.values(EQUIPMENT_ITEMS || {})
    .filter((item) => shouldDisplayEquipmentRecord(item, discoveredIds))
    .sort(compareEquipmentRecords);
  const enemies = enemyRecordEntries(records);

  root.innerHTML = `
    <div class="records-section">
      <p class="records-count">装備図録 ${discoveredIds.size} / ${equipmentTotal}</p>
      ${
        items.length
          ? `<ul class="records-list">${items.map((item) => equipmentRecordHtml(item, discoveredIds.has(item.id))).join("")}</ul>`
          : '<p class="log-empty">記録された装備はありません</p>'
      }
    </div>
    <div class="records-section">
      <p class="records-count">敵図録 ${enemies.length} / ${enemyTotal}</p>
      ${
        enemies.length
          ? `<ul class="records-list">${enemies.map(([enemyId, record]) => enemyRecordHtml(enemyId, record)).join("")}</ul>`
          : '<p class="log-empty">記録された敵はありません</p>'
      }
    </div>
  `;
}

function renderRecordsSection() {
  renderRecords();
}

function renderStages() {
  const root = $("stages-root");
  if (!root) return;
  root.innerHTML = AREA_ORDER.map((id) => {
    const a = AREAS[id];
    const unlocked = isAreaUnlocked(id);
    const clears = state.areaClears[id] || 0;
    let cls = "stage-chip";
    if (clears > 0) cls += " cleared";
    else if (unlocked) cls += " unlocked";
    else cls += " locked";
    const hint = unlocked ? (clears > 0 ? `クリア ${clears}回` : "解放済") : getUnlockHint(id);
    return `<span class="${cls}" title="${hint}">${a.name}</span>`;
  }).join("");
}

function renderWorldSituation() {
  const totalClears = Object.values(state.areaClears).reduce((sum, v) => sum + v, 0);
  const progress = clamp(totalClears * 12, 4, 100);
  const bossAreas = AREA_ORDER.map((id) => AREAS[id]).filter((a) => isAreaUnlocked(a.id) && shouldBossAppear(a));
  const root = $("world-root");
  if (!root) return;
  root.innerHTML = `
    <p>${totalClears ? `ギルドの街道安全度は ${progress}% まで回復。` : "街道にはまだ魔物の気配が濃い。"}</p>
    <div class="world-meter"><span style="width:${progress}%"></span></div>
    ${
      bossAreas.length
        ? bossAreas.map((a) => `<p class="boss-alert">${a.name}で強敵の目撃報告。次回派遣は警戒推奨。</p>`).join("")
        : '<p class="muted">大きな脅威の報告はありません。</p>'
    }
  `;
}

function renderLogs() {
  const root = $("logs-root");
  if (!root) return;
  root.innerHTML = "";
  for (const party of state.parties) {
    const panel = document.createElement("div");
    panel.className = "log-panel";
    panel.innerHTML = `<h3>${party.name}</h3>`;

    const current = document.createElement("div");
    renderCurrentDispatchLog(current, party);
    panel.appendChild(current);

    const pastTitle = document.createElement("h3");
    pastTitle.textContent = "過去の派遣";
    pastTitle.style.marginTop = "14px";
    panel.appendChild(pastTitle);

    const past = document.createElement("div");
    renderPastDispatchLog(past, party);
    panel.appendChild(past);
    root.appendChild(panel);
  }
}

function renderExpeditionOverviewSection() {
  renderStages();
  renderWorldSituation();
}

function renderInboxSection() {
  renderLogs();
}

function renderAll() {
  ensureStorageUids();
  state.parties.forEach((p) => {
    ensurePartyShape(p);
    ensureValidSelectedArea(p);
    recordEquippedEquipment(p);
  });
  renderPartySection();
  renderReportSection();
  renderExpeditionOverviewSection();
  renderItemSection();
  renderRecordsSection();
  renderStatsSection();
  renderInboxSection();
}

function ensurePartyShape(party) {
  if (!party.stats) party.stats = defaultStats();
  if (!party.dispatches) party.dispatches = [];
  if (!party.expandedDispatchIds) party.expandedDispatchIds = [];
  const template = party.id === "pt2" ? PARTY_TEMPLATES.pt2 : PARTY_TEMPLATES.pt1;
  if (!party.members) {
    const leaderName = party.hero?.name || (party.id === "pt2" ? "リナ" : "アレン");
    party.members = template.map((m, i) => createMember({ ...m, name: i === 0 ? leaderName : m.name }, party.hero?.level || 1));
  }
  for (const templateMember of template) {
    if (!party.members.some((member) => member.id === templateMember.id)) {
      party.members.push(createMember(templateMember, party.hero?.level || 1));
    }
  }
  party.members = party.members.map((member, index) => {
    const normalized = normalizeMember(member);
    const templateMember = template.find((m) => m.id === member.id) || template[index];
    normalized.formation = member.formation || templateMember?.formation || "中衛";
    return normalized;
  });
  const order = new Map(template.map((member, index) => [member.id, index]));
  party.members.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  party.hero = party.members[0];
}

function migrate(data) {
  if (!data.parties) return data;
  if (!data.storage) data.storage = [];
  ensureEquipmentResearch(data);
  ensureAutoSellSettings(data);
  ensureRecords(data);
  ensureDeveloperMode(data);
  ensureGuildStats(data);
  ensureOptionFragments(data);
  ensureStorageUids(data);
  data.storage = data.storage.map((item) => {
    if (!item || !Object.prototype.hasOwnProperty.call(item, "fixedOptions")) return item;
    const nextItem = { ...item };
    delete nextItem.fixedOptions;
    return nextItem;
  });
  for (const rawItem of data.storage || []) {
    const item = storageItemFromEquipment(rawItem);
    recordEquipment(item, data);
  }

  for (const p of data.parties) {
    ensurePartyShape(p);
    if (p.selectedArea === "plain") p.selectedArea = "plainEntrance";
    if (p.selectedArea === "forest") p.selectedArea = "howlingRoad";
    if (p.selectedArea === "swamp") p.selectedArea = "sunkenPier";
    if (p.selectedArea === "ruins") p.selectedArea = "outerGarden";
    if (p.selectedArea === "canyon") p.selectedArea = "windCutPass";
    if (p.selectedArea === "glacier") p.selectedArea = "frostMarker";
    if (p.selectedArea === "volcano") p.selectedArea = "volcanoRim";
    recordEquippedEquipment(p, data);
    if (p.adventureLog?.length && !p.dispatches.length) {
      p.dispatches.push({
        id: uid("dispatch"),
        areaName: "過去の記録",
        startedAt: 0,
        endsAt: 0,
        status: "complete",
        entries: p.adventureLog,
        summary: "移行データ",
      });
      delete p.adventureLog;
    }
  }

  data.stats.gold += data.parties.reduce((sum, p) => sum + Math.max(0, Number(p?.stats?.gold) || 0), 0);
  data.parties.forEach((p) => {
    if (p?.stats) p.stats.gold = 0;
  });

  if (data.gold != null && data.parties[0]) {
    const p0 = data.parties[0].stats;
    data.stats.gold += data.gold || 0;
    p0.kills += data.totalKills || 0;
    p0.missionsStarted += data.missionsStarted || 0;
    p0.missionsCleared += data.missionsCleared || 0;
  }

  if (!data.areaClears) data.areaClears = {};
  syncLegacyAreaClears(data);
  return data;
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    $("save-hint").textContent = `保存済 ${formatClock(Date.now())}`;
  } catch {
    $("save-hint").textContent = "保存失敗";
  }
}

function exportSaveData() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) {
    $("save-hint").textContent = "書き出すセーブがありません";
    return;
  }
  try {
    JSON.parse(raw);
  } catch {
    $("save-hint").textContent = "セーブ書き出し失敗";
    return;
  }
  const blob = new Blob([raw], { type: "application/json" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  link.href = url;
  link.download = `dispatch-hero-save-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  $("save-hint").textContent = "セーブを書き出しました";
}

function isValidSaveData(data) {
  return !!data && typeof data === "object" && Array.isArray(data.parties);
}

function importSaveData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const parsed = JSON.parse(String(reader.result || ""));
      if (!isValidSaveData(parsed)) throw new Error("invalid save data");
      localStorage.setItem(SAVE_KEY, JSON.stringify(parsed));
      window.location.reload();
    } catch {
      $("save-hint").textContent = "セーブ読み込み失敗";
    }
  });
  reader.addEventListener("error", () => {
    $("save-hint").textContent = "セーブ読み込み失敗";
  });
  reader.readAsText(file);
}

function loadGame() {
  try {
    const raw =
      localStorage.getItem(SAVE_KEY) ||
      localStorage.getItem("dispatch-hero-save-v7") ||
      localStorage.getItem("dispatch-hero-save-v6") ||
      localStorage.getItem("dispatch-hero-save-v5");
    if (!raw) return;
    const data = migrate(JSON.parse(raw));
    if (data.parties) {
      state = {
        parties: data.parties,
        stats: data.stats || defaultGuildStats(),
        areaClears: data.areaClears || {},
        storage: data.storage || [],
        equipmentResearch: data.equipmentResearch || defaultEquipmentResearch(),
        optionFragments: data.optionFragments || defaultOptionFragments(),
        autoSell: data.autoSell || defaultAutoSellSettings(),
        records: data.records || defaultRecords(),
        developerMode: data.developerMode === true,
        areaDetailModalState: null,
      };
      ensureGuildStats();
      ensureEquipmentResearch();
      ensureOptionFragments();
      ensureAutoSellSettings();
      ensureRecords();
      ensureDeveloperMode();
      state.parties.forEach(trimDispatches);
    }
  } catch (e) {
    console.warn(e);
  }
}

function resetGame() {
  if (!confirm("セーブを消して最初からやり直しますか？")) return;
  ["dispatch-hero-save-v8", "dispatch-hero-save-v7", "dispatch-hero-save-v6", "dispatch-hero-save-v5"].forEach((k) =>
    localStorage.removeItem(k)
  );
  state = {
    parties: [defaultParty("pt1", "第一小隊"), defaultParty("pt2", "第二小隊")],
    stats: defaultGuildStats(),
    areaClears: {},
    storage: [],
    equipmentResearch: defaultEquipmentResearch(),
    optionFragments: defaultOptionFragments(),
    autoSell: defaultAutoSellSettings(),
    records: defaultRecords(),
    developerMode: false,
    areaDetailModalState: null,
  };
  nextId = 1;
  storageRenderCount = -1;
  stopTick();
  saveGame();
  updateDeveloperButton();
  renderAll();
}

function ensureTick() {
  if (tickId) return;
  tickId = setInterval(processMissions, 250);
}

function stopTick() {
  if (tickId) {
    clearInterval(tickId);
    tickId = null;
  }
}

function ensureWorldSituationTick() {
  if (worldTickId) return;
  worldTickId = setInterval(renderWorldSituation, 3000);
}

function setupQuickNav() {
  document.querySelectorAll("[data-scroll-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = $(button.dataset.scrollTarget);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

$("reset-btn").addEventListener("click", resetGame);
$("developer-btn")?.addEventListener("click", toggleDeveloperMode);
$("save-export-btn")?.addEventListener("click", exportSaveData);
$("save-import-btn")?.addEventListener("click", () => $("save-import-input")?.click());
$("save-import-input")?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  importSaveData(file);
});
setupQuickNav();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    processMissions();
    updateProgressBars();
  }
});

loadGame();
for (const p of state.parties) {
  ensurePartyShape(p);
  if (p.mission) {
    const area = getArea(p.mission.areaId);
    const d = p.dispatches.find((x) => x.id === p.mission.dispatchId);
    if (!d) {
      p.dispatches.unshift({
        id: p.mission.dispatchId || uid("dispatch"),
        areaId: area.id,
        areaName: area.name,
        startedAt: p.mission.startedAt,
        endsAt: p.mission.endsAt,
        status: "active",
        entries: [],
      });
    }
    if (!p.mission.journal && p.mission.rewards) {
      p.mission.journal = buildScheduledJournalV2(p, area, p.mission.rewards, p.mission.startedAt, p.mission.endsAt);
    }
    revealDueEntries(p);
  }
}
processMissions();
renderAll();
updateDeveloperButton();
ensureWorldSituationTick();
if (state.parties.some((p) => p.mission)) ensureTick();

