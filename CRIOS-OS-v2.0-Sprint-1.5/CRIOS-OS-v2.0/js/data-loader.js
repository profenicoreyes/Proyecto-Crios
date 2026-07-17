export class DataLoader {
  constructor({ basePath = "./data" } = {}) {
    this.basePath = basePath.replace(/\/$/, "");
    this.cache = new Map();
  }

  async json(fileName, { force = false } = {}) {
    const url = `${this.basePath}/${fileName}`;
    if (!force && this.cache.has(url)) return this.cache.get(url);

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`No se pudo cargar ${url} (${response.status}).`);
    }

    const data = await response.json();
    this.cache.set(url, data);
    return data;
  }
}
