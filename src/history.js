export class History {
  #undo = [];
  #redo = [];
  #limit;

  constructor(limit = 100) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('La limite de l\'historique doit être un entier ≥ 1');
    this.#limit = limit;
  }

  get canUndo() {
    return this.#undo.length > 0;
  }

  get canRedo() {
    return this.#redo.length > 0;
  }

  push(before, after) {
    const b = JSON.stringify(before);
    if (b === JSON.stringify(after)) return false;
    this.#undo.push(b);
    if (this.#undo.length > this.#limit) this.#undo.shift();
    this.#redo.length = 0;
    return true;
  }

  undo(current) {
    if (!this.canUndo) return null;
    this.#redo.push(JSON.stringify(current));
    return JSON.parse(this.#undo.pop());
  }

  redo(current) {
    if (!this.canRedo) return null;
    this.#undo.push(JSON.stringify(current));
    return JSON.parse(this.#redo.pop());
  }

  clear() {
    this.#undo.length = 0;
    this.#redo.length = 0;
  }
}
