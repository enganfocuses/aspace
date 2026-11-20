import {readEncryptedJournal, validateJournal} from './vault.mjs';

export const JOURNAL_KEY = 'aspace-psychology-journal-v2';

export class LocalJournal {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.data = this.read();
  }

  read() {
    const raw = this.storage.getItem(JOURNAL_KEY);
    return raw ? validateJournal(JSON.parse(raw)) : {v: 1, entries: [], drafts: {}};
  }

  async mutate(change) {
    const next = this.read();
    change(next);
    validateJournal(next);
    try {
      this.storage.setItem(JOURNAL_KEY, JSON.stringify(next));
    } catch {
      throw Error('Не удалось сохранить на устройстве. Проверь свободное место в браузере.');
    }
    this.data = next;
  }

  async import(raw, password, migrating = false) {
    const value = JSON.parse(raw);
    const incoming = value.data ? await readEncryptedJournal(value, password) : validateJournal(value);
    await this.mutate(current => {
      if (migrating && current.legacyImported) return;
      const entries = new Map(current.entries.map(entry => [entry.id, entry]));
      for (const entry of incoming.entries) {
        const existing = entries.get(entry.id);
        if (!existing || (entry.updatedAt ?? '') > (existing.updatedAt ?? '')) entries.set(entry.id, entry);
      }
      current.entries = [...entries.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

      for (const [key, draft] of Object.entries(incoming.drafts)) {
        if (!Object.hasOwn(current.drafts, key)) {
          Object.defineProperty(current.drafts, key, {value: draft, enumerable: true, writable: true, configurable: true});
        } else if (JSON.stringify(current.drafts[key]) !== JSON.stringify(draft)) {
          current.drafts[crypto.randomUUID()] = draft;
        }
      }
      if (migrating) current.legacyImported = true;
    });
  }
}
