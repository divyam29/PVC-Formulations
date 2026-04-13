const api = {
  async request(path, options = {}) {
    const response = await fetch(path, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });

    if (!response.ok) {
      let detail = "Request failed";
      try {
        const data = await response.json();
        detail = data.detail || detail;
      } catch (_) {
        detail = response.statusText || detail;
      }
      throw new Error(detail);
    }

    return response.json();
  },

  getMaterials() {
    return this.request("/materials");
  },

  createMaterial(payload) {
    return this.request("/materials", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateMaterial(id, payload) {
    return this.request(`/materials/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  getMaterial(id) {
    return this.request(`/materials/${id}`);
  },

  getFormulations(filters = {}) {
    const search = new URLSearchParams();
    if (filters.type) search.set("type", filters.type);
    if (filters.season) search.set("season", filters.season);
    if (typeof filters.without_for === "boolean") search.set("without_for", String(filters.without_for));
    const query = search.toString();
    return this.request(`/formulations${query ? `?${query}` : ""}`);
  },

  createFormulation(payload) {
    return this.request("/formulations", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateFormulation(id, payload) {
    return this.request(`/formulations/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  getFormulation(id) {
    return this.request(`/formulations/${id}`);
  },

  previewFormulation(payload) {
    return this.request("/formulations/preview", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
