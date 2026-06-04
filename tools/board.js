const STORAGE_KEY = "codex-command-board-v1";

const COLUMNS = [
  { id: "idea", title: "思いつき" },
  { id: "urgent", title: "至急" },
  { id: "next", title: "次やる" },
  { id: "doing", title: "作業中" },
  { id: "done", title: "完了" },
  { id: "hold", title: "保留" },
];

const LEGACY_COLUMN_MIGRATIONS = {
  review: "next",
};

const INITIAL_CARDS = [
  { text: "敵・エリア追加", columnId: "urgent" },
  { text: "ハード難易度とドロップ増加の設計", columnId: "urgent" },
  { text: "状態異常の追加", columnId: "next" },
  { text: "ログ文の整理", columnId: "next" },
  { text: "報告書要素の追加", columnId: "next" },
  { text: "6人PT化", columnId: "hold" },
  { text: "装備枠拡張", columnId: "hold" },
  { text: "記録室/保管庫の別ページ化", columnId: "hold" },
];

const boardElement = document.getElementById("board-columns");
const formElement = document.getElementById("card-form");
const cardTextElement = document.getElementById("card-text");
const cardColumnElement = document.getElementById("card-column");
const saveIndicatorElement = document.getElementById("save-indicator");
const messageStripElement = document.getElementById("message-strip");
const seedButtonElement = document.getElementById("seed-button");
const exportButtonElement = document.getElementById("export-button");
const importButtonElement = document.getElementById("import-button");
const importFileElement = document.getElementById("import-file");
const cardTemplate = document.getElementById("card-template");
const editDialogElement = document.getElementById("edit-dialog");
const editFormElement = document.getElementById("edit-form");
const editTextElement = document.getElementById("edit-text");
const editCancelElement = document.getElementById("edit-cancel");

let boardState = loadState();
let draggedCardId = null;
let saveStatusTimer = null;
let messageTimer = null;
let editingCardRef = null;

initialize();

function initialize() {
  populateColumnSelect();
  renderBoard();

  formElement.addEventListener("submit", handleCreateCard);
  seedButtonElement.addEventListener("click", handleSeedCards);
  exportButtonElement.addEventListener("click", handleExport);
  importButtonElement.addEventListener("click", () => importFileElement.click());
  importFileElement.addEventListener("change", handleImport);
  editFormElement.addEventListener("submit", handleSaveEdit);
  editCancelElement.addEventListener("click", closeEditor);
  editDialogElement.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeEditor();
  });
}

function populateColumnSelect() {
  COLUMNS.forEach((column) => {
    const option = document.createElement("option");
    option.value = column.id;
    option.textContent = column.title;
    cardColumnElement.append(option);
  });

  cardColumnElement.value = COLUMNS[0].id;
}

function createEmptyState() {
  return COLUMNS.reduce((state, column) => {
    state[column.id] = [];
    return state;
  }, {});
}

function createSeedState() {
  const seeded = createEmptyState();

  INITIAL_CARDS.forEach((card) => {
    if (!seeded[card.columnId]) {
      return;
    }

    seeded[card.columnId].push({
      id: createCardId(),
      text: card.text,
    });
  });

  return seeded;
}

function normalizeState(source) {
  const normalized = createEmptyState();

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("Board data must be an object.");
  }

  COLUMNS.forEach((column) => {
    const cards = Array.isArray(source[column.id]) ? source[column.id] : [];

    normalized[column.id] = cards.map((card) => {
      if (!card || typeof card !== "object") {
        throw new Error(`Invalid card in column "${column.id}".`);
      }

      const text = typeof card.text === "string" ? card.text.trim() : "";

      if (!text) {
        throw new Error(`Card text is missing in column "${column.id}".`);
      }

      return {
        id: typeof card.id === "string" && card.id ? card.id : createCardId(),
        text,
      };
    });
  });

  Object.entries(LEGACY_COLUMN_MIGRATIONS).forEach(([legacyColumnId, targetColumnId]) => {
    const legacyCards = Array.isArray(source[legacyColumnId]) ? source[legacyColumnId] : [];

    if (!legacyCards.length || !normalized[targetColumnId]) {
      return;
    }

    const migratedCards = legacyCards.map((card) => {
      if (!card || typeof card !== "object") {
        throw new Error(`Invalid card in column "${legacyColumnId}".`);
      }

      const text = typeof card.text === "string" ? card.text.trim() : "";

      if (!text) {
        throw new Error(`Card text is missing in column "${legacyColumnId}".`);
      }

      return {
        id: typeof card.id === "string" && card.id ? card.id : createCardId(),
        text,
      };
    });

    normalized[targetColumnId] = [...migratedCards, ...normalized[targetColumnId]];
  });

  return normalized;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return createSeedState();
    }

    return normalizeState(JSON.parse(raw));
  } catch (error) {
    setSaveStatus("Storage load error", "error");
    showMessage("保存データの読込に失敗したため、初期カードを表示しました。", "error");
    return createSeedState();
  }
}

function saveState() {
  try {
    setSaveStatus("Saving...", "saving");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boardState));
    setSaveStatus("Saved", "saved");
  } catch (error) {
    setSaveStatus("Save failed", "error");
    showMessage("localStorage への保存に失敗しました。", "error");
  }
}

function setSaveStatus(message, status) {
  saveIndicatorElement.textContent = message;
  saveIndicatorElement.classList.remove("is-saving", "is-error");

  if (status === "saving") {
    saveIndicatorElement.classList.add("is-saving");
  }

  if (status === "error") {
    saveIndicatorElement.classList.add("is-error");
  }

  if (saveStatusTimer) {
    window.clearTimeout(saveStatusTimer);
    saveStatusTimer = null;
  }

  if (status === "saved") {
    saveStatusTimer = window.setTimeout(() => {
      saveIndicatorElement.textContent = "Saved";
    }, 1200);
  }
}

function showMessage(message, type = "info") {
  messageStripElement.hidden = false;
  messageStripElement.textContent = message;
  messageStripElement.classList.remove("is-error", "is-success");

  if (type === "error") {
    messageStripElement.classList.add("is-error");
  }

  if (type === "success") {
    messageStripElement.classList.add("is-success");
  }

  if (messageTimer) {
    window.clearTimeout(messageTimer);
  }

  messageTimer = window.setTimeout(() => {
    messageStripElement.hidden = true;
  }, 3000);
}

function handleCreateCard(event) {
  event.preventDefault();

  const text = cardTextElement.value.trim();
  const columnId = cardColumnElement.value;

  if (!text || !boardState[columnId]) {
    return;
  }

  boardState[columnId].unshift({
    id: createCardId(),
    text,
  });

  cardTextElement.value = "";
  saveState();
  renderBoard();
  cardTextElement.focus();
}

function handleSeedCards() {
  const seeded = createSeedState();

  COLUMNS.forEach((column) => {
    boardState[column.id] = [...seeded[column.id], ...boardState[column.id]];
  });

  saveState();
  renderBoard();
  showMessage("初期カードを現在のボードへ追加しました。", "success");
}

function handleExport() {
  const payload = {
    exportedAt: new Date().toISOString(),
    columns: COLUMNS,
    board: boardState,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  link.href = url;
  link.download = `command-board-${stamp}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  showMessage("現在のボードを JSON として書き出しました。", "success");
}

async function handleImport(event) {
  const [file] = event.target.files;
  event.target.value = "";

  if (!file) {
    return;
  }

  if (!window.confirm("現在のボードを上書きしますか？")) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const nextState = normalizeState(parsed.board ?? parsed);

    boardState = nextState;
    saveState();
    renderBoard();
    showMessage("JSON からボードを読み込みました。", "success");
  } catch (error) {
    setSaveStatus("Import error", "error");
    showMessage("JSON形式が不正です。読込できませんでした。", "error");
  }
}

function createCardId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `card-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function handleDeleteCard(columnId, cardId) {
  boardState[columnId] = boardState[columnId].filter((card) => card.id !== cardId);
  saveState();
  renderBoard();
}

function openEditor(columnId, cardId) {
  const card = boardState[columnId]?.find((item) => item.id === cardId);

  if (!card) {
    return;
  }

  editingCardRef = { columnId, cardId };
  editTextElement.value = card.text;
  if (!editDialogElement.open) {
    editDialogElement.showModal();
  }
  editTextElement.focus();
  editTextElement.setSelectionRange(editTextElement.value.length, editTextElement.value.length);
}

function closeEditor() {
  editingCardRef = null;
  editFormElement.reset();
  if (editDialogElement.open) {
    editDialogElement.close();
  }
}

function handleSaveEdit(event) {
  event.preventDefault();

  if (!editingCardRef) {
    closeEditor();
    return;
  }

  const nextText = editTextElement.value.trim();

  if (!nextText) {
    showMessage("カード本文を入力してください。", "error");
    return;
  }

  const cards = boardState[editingCardRef.columnId];
  const card = cards?.find((item) => item.id === editingCardRef.cardId);

  if (!card) {
    closeEditor();
    return;
  }

  card.text = nextText;
  saveState();
  renderBoard();
  closeEditor();
  showMessage("カード本文を更新しました。", "success");
}

function moveCard(cardId, targetColumnId) {
  if (!cardId || !boardState[targetColumnId]) {
    return;
  }

  let movedCard = null;

  COLUMNS.forEach((column) => {
    const cardIndex = boardState[column.id].findIndex((card) => card.id === cardId);

    if (cardIndex >= 0) {
      const [card] = boardState[column.id].splice(cardIndex, 1);
      movedCard = card;
    }
  });

  if (!movedCard) {
    return;
  }

  boardState[targetColumnId].unshift(movedCard);
  saveState();
  renderBoard();
}

function renderBoard() {
  boardElement.textContent = "";

  COLUMNS.forEach((column) => {
    const columnElement = document.createElement("section");
    columnElement.className = "board-column";
    columnElement.dataset.columnId = column.id;

    const headerElement = document.createElement("header");
    headerElement.className = "column-header";

    const titleElement = document.createElement("h2");
    titleElement.className = "column-title";
    titleElement.textContent = column.title;

    const countElement = document.createElement("span");
    countElement.className = "column-count";
    countElement.textContent = `${boardState[column.id].length} cards`;

    headerElement.append(titleElement, countElement);

    const cardsElement = document.createElement("div");
    cardsElement.className = "column-cards";

    cardsElement.addEventListener("dragover", (event) => {
      event.preventDefault();
      columnElement.classList.add("is-drop-target");
    });

    cardsElement.addEventListener("dragleave", (event) => {
      if (!columnElement.contains(event.relatedTarget)) {
        columnElement.classList.remove("is-drop-target");
      }
    });

    cardsElement.addEventListener("drop", (event) => {
      event.preventDefault();
      columnElement.classList.remove("is-drop-target");
      moveCard(draggedCardId, column.id);
      draggedCardId = null;
    });

    if (boardState[column.id].length === 0) {
      const emptyElement = document.createElement("p");
      emptyElement.className = "empty-note";
      emptyElement.textContent = "Drop cards here";
      cardsElement.append(emptyElement);
    } else {
      boardState[column.id].forEach((card) => {
        cardsElement.append(createCardElement(column.id, card));
      });
    }

    columnElement.append(headerElement, cardsElement);
    boardElement.append(columnElement);
  });
}

function createCardElement(columnId, card) {
  const fragment = cardTemplate.content.cloneNode(true);
  const cardElement = fragment.querySelector(".task-card");
  const textElement = fragment.querySelector(".card-text");
  const editButton = fragment.querySelector(".edit-button");
  const deleteButton = fragment.querySelector(".delete-button");

  cardElement.dataset.cardId = card.id;
  textElement.textContent = card.text;

  editButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openEditor(columnId, card.id);
  });

  deleteButton.addEventListener("click", (event) => {
    event.stopPropagation();
    handleDeleteCard(columnId, card.id);
  });

  textElement.addEventListener("click", () => {
    openEditor(columnId, card.id);
  });

  cardElement.addEventListener("click", (event) => {
    if (event.target.closest(".edit-button, .delete-button")) {
      return;
    }

    openEditor(columnId, card.id);
  });

  cardElement.addEventListener("dragstart", (event) => {
    draggedCardId = card.id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", card.id);
    cardElement.classList.add("is-dragging");
  });

  cardElement.addEventListener("dragend", () => {
    draggedCardId = null;
    cardElement.classList.remove("is-dragging");
    document.querySelectorAll(".board-column").forEach((columnElement) => {
      columnElement.classList.remove("is-drop-target");
    });
  });

  return fragment;
}
