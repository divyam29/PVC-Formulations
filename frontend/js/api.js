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

  getMaterials(filters = {}) {
    const search = new URLSearchParams();
    if (typeof filters.include_archived === "boolean") search.set("include_archived", String(filters.include_archived));
    const query = search.toString();
    return this.request(`/materials${query ? `?${query}` : ""}`);
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

  archiveMaterial(id) {
    return this.request(`/materials/${id}/archive`, {
      method: "POST",
    });
  },

  restoreMaterial(id) {
    return this.request(`/materials/${id}/restore`, {
      method: "POST",
    });
  },

  getFormulations(filters = {}) {
    const search = new URLSearchParams();
    if (filters.type) search.set("type", filters.type);
    if (Array.isArray(filters.seasons)) {
      filters.seasons.filter(Boolean).forEach((season) => search.append("season", season));
    } else if (filters.season) {
      search.set("season", filters.season);
    }
    if (filters.name) search.set("name", filters.name);
    if (typeof filters.without_for === "boolean") search.set("without_for", String(filters.without_for));
    if (typeof filters.include_archived === "boolean") search.set("include_archived", String(filters.include_archived));
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

  getFormulation(id, filters = {}) {
    const search = new URLSearchParams();
    if (typeof filters.without_for === "boolean") search.set("without_for", String(filters.without_for));
    const query = search.toString();
    return this.request(`/formulations/${id}${query ? `?${query}` : ""}`);
  },

  duplicateFormulation(id, payload) {
    return this.request(`/formulations/${id}/duplicate`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  archiveFormulation(id) {
    return this.request(`/formulations/${id}/archive`, {
      method: "POST",
    });
  },

  restoreFormulation(id) {
    return this.request(`/formulations/${id}/restore`, {
      method: "POST",
    });
  },

  previewFormulation(payload) {
    return this.request("/formulations/preview", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
