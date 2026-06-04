const STORAGE_KEY = "codex-command-board-v1";

const COLUMNS = [
  { id: "idea", title: "思いつき" },
  { id: "urgent", title: "至急" },
  { id: "next", title: "次やる" },
  { id: "doing", title: "作業中" },
  { id: "review", title: "確認待ち" },
  { id: "done", title: "完了" },
  { id: "hold", title: "保留" },
];

const boardElement = document.getElementById("board-columns");
const formElement = document.getElementById("card-form");
const cardTextElement = document.getElementById("card-text");
const cardColumnElement = document.getElementById("card-column");
const saveIndicatorElement = document.getElementById("save-indicator");
const cardTemplate = document.getElementById("card-template");

let boardState = loadState();
let draggedCardId = null;
let saveStatusTimer = null;

initialize();

function initialize() {
  populateColumnSelect();
  renderBoard();
  formElement.addEventListener("submit", handleCreateCard);
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

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return createEmptyState();
    }

    const parsed = JSON.parse(raw);
    const normalized = createEmptyState();

    COLUMNS.forEach((column) => {
      const cards = Array.isArray(parsed[column.id]) ? parsed[column.id] : [];
      normalized[column.id] = cards
        .filter((card) => card && typeof card.id === "string" && typeof card.text === "string")
        .map((card) => ({ id: card.id, text: card.text }));
    });

    return normalized;
  } catch (error) {
    setSaveStatus("Storage load error", "error");
    return createEmptyState();
  }
}

function saveState() {
  try {
    setSaveStatus("Saving...", "saving");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boardState));
    setSaveStatus("Saved", "saved");
  } catch (error) {
    setSaveStatus("Save failed", "error");
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

    cardsElement.addEventListener("dragend", () => {
      columnElement.classList.remove("is-drop-target");
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
  const deleteButton = fragment.querySelector(".delete-button");

  cardElement.dataset.cardId = card.id;
  textElement.textContent = card.text;

  deleteButton.addEventListener("click", () => {
    handleDeleteCard(columnId, card.id);
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
