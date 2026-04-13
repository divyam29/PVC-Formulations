const page = document.body.dataset.page;

const currency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const decimal = (value) => Number(value || 0).toFixed(2);

const setVisible = (element, visible) => {
  element.classList.toggle("d-none", !visible);
};

const showAlert = (element, message, type = "danger") => {
  element.className = `alert alert-${type}`;
  element.textContent = message;
  element.classList.remove("d-none");
};

const hideAlert = (element) => {
  element.classList.add("d-none");
  element.textContent = "";
};

const setText = (id, value) => {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
};

async function initDashboard() {
  const loader = document.getElementById("dashboardLoader");
  const alert = document.getElementById("dashboardAlert");
  const tableBody = document.getElementById("formulationsTableBody");
  const typeFilter = document.getElementById("filterType");
  const seasonFilter = document.getElementById("filterSeason");
  const withoutForToggle = document.getElementById("dashboardWithoutFor");
  const formulationsCount = document.getElementById("summaryFormulations");
  const avgSalePrice = document.getElementById("summarySalePrice");
  const detailPanel = document.getElementById("detailPanel");
  const detailEmpty = document.getElementById("detailEmpty");
  const detailEditLink = document.getElementById("detailEditLink");
  const materialsAlert = document.getElementById("dashboardMaterialsAlert");
  const materialsLoader = document.getElementById("dashboardMaterialsLoader");
  const materialsTableBody = document.getElementById("dashboardMaterialsTableBody");
  const sortButtons = document.querySelectorAll(".sort-button");

  let selectedFormulationId = null;
  let sortState = { key: "name", direction: "asc" };

  const sortValue = (item, key) => {
    if (key === "name" || key === "season") {
      return String(item[key] || "").toLowerCase();
    }
    return Number(item[key] || 0);
  };

  const sortItems = (items) =>
    [...items].sort((left, right) => {
      const leftValue = sortValue(left, sortState.key);
      const rightValue = sortValue(right, sortState.key);

      if (leftValue < rightValue) {
        return sortState.direction === "asc" ? -1 : 1;
      }
      if (leftValue > rightValue) {
        return sortState.direction === "asc" ? 1 : -1;
      }
      return String(left.name).localeCompare(String(right.name));
    });

  const syncSortIndicators = () => {
    sortButtons.forEach((button) => {
      const isActive = button.dataset.sortKey === sortState.key;
      button.classList.toggle("is-active", isActive);
      const arrow = button.querySelector(".sort-arrow");
      if (arrow) {
        arrow.textContent = isActive ? (sortState.direction === "asc" ? "↑" : "↓") : "↕";
      }
    });
  };

  const syncSelectedRow = () => {
    tableBody.querySelectorAll("tr[data-formulation-id]").forEach((row) => {
      row.classList.toggle("is-selected", row.dataset.formulationId === selectedFormulationId);
    });
  };

  const renderDetail = (item) => {
    if (!item) {
      selectedFormulationId = null;
      setVisible(detailPanel, false);
      setVisible(detailEmpty, true);
      setVisible(detailEditLink, false);
      syncSelectedRow();
      return;
    }

    selectedFormulationId = item.id;
    setVisible(detailEmpty, false);
    setVisible(detailPanel, true);
    setVisible(detailEditLink, true);
    detailEditLink.href = `/add-formulation?id=${item.id}`;

    setText("detailName", item.name);
    setText("detailType", item.type);
    setText("detailSeason", item.season);
    setText("detailTotalQty", decimal(item.total_qty));
    setText("detailTotalAmount", currency(item.total_amount));
    setText("detailPricePerKg", currency(item.price_per_kg));
    setText("detailMisc", currency(item.misc));
    setText("detailFinalCost", currency(item.final_cost));
    setText("detailSalePrice", currency(item.sale_price));
    setText("detailFixedProfit", currency(item.fixed_profit));
    setText("detailProfitPercentCost", `${decimal(item.profit_percent_cost)}%`);
    setText("detailProfitPercentSale", `${decimal(item.profit_percent_sale)}%`);
    setText("detailProfitPercent", `${decimal(item.profit_percent_sale)}%`);
    const coatingItems = item.coating_items || [];
    setText(
      "detailMaterialCount",
      coatingItems.length
      ? `${item.items.length + coatingItems.length} material entries`
      : `${item.items.length} material entries`
    );

    const renderMaterialGroup = (title, materials) => `
      <div>
        <div class="fw-semibold mb-2">${title}</div>
        <div class="detail-items">
          ${materials
            .map(
              (material) => `
                <div class="detail-item">
                  <div>
                    <div class="fw-semibold">${material.name}</div>
                  </div>
                  <div class="text-end">
                    <div class="fw-semibold">${decimal(material.quantity)} kg</div>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    `;

    document.getElementById("detailItems").innerHTML = [
      renderMaterialGroup("Base Materials", item.items),
      coatingItems.length
        ? renderMaterialGroup(`Coating Materials (${decimal(item.coating_percent)}%)`, coatingItems)
        : "",
    ].join("");
    syncSelectedRow();
  };

  const renderRows = (items) => {
    if (!items.length) {
      tableBody.innerHTML =
        '<tr><td colspan="7" class="text-center text-muted py-5">No formulations found.</td></tr>';
      formulationsCount.textContent = "0";
      avgSalePrice.textContent = currency(0);
      renderDetail(null);
      return;
    }

    const avgSale = items.reduce((sum, item) => sum + item.sale_price, 0) / items.length;
    formulationsCount.textContent = String(items.length);
    avgSalePrice.textContent = currency(avgSale);

    const sortedItems = sortItems(items);

    tableBody.innerHTML = sortedItems
      .map(
        (item) => `
          <tr data-formulation-id="${item.id}">
            <td>
              <div class="fw-semibold">${item.name}</div>
            </td>
            <td>${item.season}</td>
            <td>${currency(item.final_cost)}</td>
            <td>${currency(item.sale_price)}</td>
            <td>${currency(item.profit)}</td>
            <td>${decimal(item.profit_percent_cost)}%</td>
            <td class="text-end">
              <a class="btn btn-sm btn-outline-primary" href="/add-formulation?id=${item.id}">Edit</a>
            </td>
          </tr>
        `
      )
      .join("");

    tableBody.querySelectorAll("tr[data-formulation-id]").forEach((row) => {
      const formulation = sortedItems.find((entry) => entry.id === row.dataset.formulationId);
      row.addEventListener("click", () => renderDetail(formulation));
    });

    renderDetail(sortedItems.find((item) => item.id === selectedFormulationId) || sortedItems[0]);
    syncSortIndicators();
  };

  const renderMaterials = (items) => {
    if (!items.length) {
      materialsTableBody.innerHTML =
        '<tr><td colspan="6" class="text-center text-muted py-5">No materials found.</td></tr>';
      return;
    }

    materialsTableBody.innerHTML = items
      .map(
        (item) => `
          <tr data-material-id="${item.id}">
            <td class="fw-semibold">${item.name}</td>
            <td><input class="form-control form-control-sm material-unit-price" type="number" step="0.01" min="0" value="${item.unit_price}" /></td>
            <td>${decimal(item.gst)}%</td>
            <td>${currency(item.extra)}</td>
            <td class="fw-semibold">${currency(item.amount_per_kg)}</td>
            <td class="text-end">
              <button type="button" class="btn btn-sm btn-primary save-dashboard-material">Save Cost</button>
            </td>
          </tr>
        `
      )
      .join("");

    materialsTableBody.querySelectorAll(".save-dashboard-material").forEach((button) => {
      button.addEventListener("click", async () => {
        hideAlert(materialsAlert);
        const row = button.closest("tr");
        const materialId = row.dataset.materialId;
        const material = items.find((entry) => entry.id === materialId);
        if (!material) {
          showAlert(materialsAlert, "Material not found.");
          return;
        }
        const payload = {
          name: row.children[0].textContent.trim(),
          unit_price: Number(row.querySelector(".material-unit-price").value),
          gst: material.gst,
          extra: material.extra,
        };

        try {
          button.disabled = true;
          await api.updateMaterial(materialId, payload);
          showAlert(materialsAlert, `Updated ${payload.name}.`, "success");
          await Promise.all([loadMaterials(), loadFormulations()]);
        } catch (error) {
          showAlert(materialsAlert, error.message);
        } finally {
          button.disabled = false;
        }
      });
    });
  };

  const loadFormulations = async () => {
    hideAlert(alert);
    setVisible(loader, true);
    try {
      const data = await api.getFormulations({
        type: typeFilter.value,
        season: seasonFilter.value,
        without_for: withoutForToggle.checked,
      });
      renderRows(data);
    } catch (error) {
      showAlert(alert, error.message);
    } finally {
      setVisible(loader, false);
    }
  };

  const loadMaterials = async () => {
    hideAlert(materialsAlert);
    setVisible(materialsLoader, true);
    try {
      const data = await api.getMaterials();
      renderMaterials(data);
    } catch (error) {
      showAlert(materialsAlert, error.message);
    } finally {
      setVisible(materialsLoader, false);
    }
  };

  document.getElementById("applyFilters").addEventListener("click", loadFormulations);
  withoutForToggle.addEventListener("change", loadFormulations);
  sortButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.sortKey;
      sortState =
        sortState.key === key
          ? { key, direction: sortState.direction === "asc" ? "desc" : "asc" }
          : { key, direction: "asc" };
      loadFormulations();
    });
  });
  syncSortIndicators();
  await Promise.all([loadFormulations(), loadMaterials()]);
}

async function initMaterialsPage() {
  const form = document.getElementById("materialForm");
  const tableBody = document.getElementById("materialsTableBody");
  const loader = document.getElementById("materialsLoader");
  const alert = document.getElementById("materialsAlert");
  const formTitle = document.getElementById("materialFormTitle");
  const submitButton = document.getElementById("materialSubmitButton");
  const cancelEditButton = document.getElementById("cancelMaterialEdit");
  let editingMaterialId = null;

  const resetForm = () => {
    editingMaterialId = null;
    form.reset();
    document.getElementById("extra").value = "0";
    formTitle.textContent = "Add Material";
    submitButton.textContent = "Save Material";
    setVisible(cancelEditButton, false);
  };

  const renderMaterials = (items) => {
    if (!items.length) {
      tableBody.innerHTML =
        '<tr><td colspan="6" class="text-center text-muted py-5">No materials found.</td></tr>';
      return;
    }

    tableBody.innerHTML = items
      .map(
        (item) => `
          <tr>
            <td class="fw-semibold">${item.name}</td>
            <td>${currency(item.unit_price)}</td>
            <td>${decimal(item.gst)}%</td>
            <td>${currency(item.extra)}</td>
            <td>${currency(item.amount_per_kg)}</td>
            <td class="text-end"><button type="button" class="btn btn-sm btn-outline-primary edit-material" data-id="${item.id}">Edit</button></td>
          </tr>
        `
      )
      .join("");

    tableBody.querySelectorAll(".edit-material").forEach((button) => {
      button.addEventListener("click", async () => {
        hideAlert(alert);
        try {
          const material = await api.getMaterial(button.dataset.id);
          editingMaterialId = material.id;
          document.getElementById("materialName").value = material.name;
          document.getElementById("unitPrice").value = material.unit_price;
          document.getElementById("gst").value = material.gst;
          document.getElementById("extra").value = material.extra;
          formTitle.textContent = "Edit Material";
          submitButton.textContent = "Update Material";
          setVisible(cancelEditButton, true);
          window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (error) {
          showAlert(alert, error.message);
        }
      });
    });
  };

  const loadMaterials = async () => {
    setVisible(loader, true);
    try {
      const data = await api.getMaterials();
      renderMaterials(data);
    } catch (error) {
      showAlert(alert, error.message);
    } finally {
      setVisible(loader, false);
    }
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideAlert(alert);
    const payload = {
      name: document.getElementById("materialName").value.trim(),
      unit_price: Number(document.getElementById("unitPrice").value),
      gst: Number(document.getElementById("gst").value),
      extra: Number(document.getElementById("extra").value),
    };
    try {
      if (editingMaterialId) {
        await api.updateMaterial(editingMaterialId, payload);
        showAlert(alert, "Material updated successfully.", "success");
      } else {
        await api.createMaterial(payload);
        showAlert(alert, "Material saved successfully.", "success");
      }
      resetForm();
      await loadMaterials();
    } catch (error) {
      showAlert(alert, error.message);
    }
  });

  cancelEditButton.addEventListener("click", () => {
    hideAlert(alert);
    resetForm();
  });

  resetForm();
  await loadMaterials();
}

async function initAddFormulationPage() {
  const itemsContainer = document.getElementById("itemsContainer");
  const coatingItemsContainer = document.getElementById("coatingItemsContainer");
  const addRowButton = document.getElementById("addItemRow");
  const addCoatingRowButton = document.getElementById("addCoatingRow");
  const previewButton = document.getElementById("previewButton");
  const form = document.getElementById("formulationForm");
  const alert = document.getElementById("formulationAlert");
  const previewError = document.getElementById("previewError");
  const previewLoader = document.getElementById("previewLoader");
  const pageTitle = document.getElementById("formulationPageTitle");
  const pageSubtitle = document.getElementById("formulationPageSubtitle");
  const submitButton = document.getElementById("formulationSubmitButton");
  const backToDashboard = document.getElementById("backToDashboard");
  const enableCoating = document.getElementById("enableCoating");
  const coatingSection = document.getElementById("coatingSection");
  const coatingPercentInput = document.getElementById("coatingPercent");
  const formulationId = new URLSearchParams(window.location.search).get("id");

  let materials = [];

  const getMaterialOptions = () =>
    materials.map((material) => `<option value="${material.id}">${material.name}</option>`).join("");

  const addMaterialRow = (container, item = {}) => {
    const row = document.createElement("div");
    row.className = "item-row border rounded-4 p-3 bg-light-subtle";
    row.innerHTML = `
      <div class="row g-3 align-items-end">
        <div class="col-md-7">
          <label class="form-label">Material</label>
          <select class="form-select material-select" required>
            <option value="">Select material</option>
            ${getMaterialOptions()}
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label">Quantity</label>
          <input type="number" step="0.01" min="0.01" class="form-control quantity-input" required />
        </div>
        <div class="col-md-2">
          <button type="button" class="btn btn-outline-danger w-100 remove-item">Remove</button>
        </div>
      </div>
    `;

    row.querySelector(".material-select").value = item.material_id || "";
    row.querySelector(".quantity-input").value = item.quantity || "";

    row.querySelector(".remove-item").addEventListener("click", () => {
      row.remove();
      if (!container.children.length) {
        addMaterialRow(container);
      }
      updatePreview();
    });

    row.querySelector(".material-select").addEventListener("change", updatePreview);
    row.querySelector(".quantity-input").addEventListener("input", updatePreview);
    container.appendChild(row);
  };

  const addItemRow = (item = {}) => addMaterialRow(itemsContainer, item);
  const addCoatingRow = (item = {}) => addMaterialRow(coatingItemsContainer, item);

  const collectItemsFromContainer = (container) =>
    Array.from(container.querySelectorAll(".item-row"))
      .map((row) => ({
        material_id: row.querySelector(".material-select").value,
        quantity: Number(row.querySelector(".quantity-input").value),
      }))
      .filter((item) => item.material_id && item.quantity > 0);

  const collectItems = () => collectItemsFromContainer(itemsContainer);
  const collectCoatingItems = () => collectItemsFromContainer(coatingItemsContainer);

  const syncCoatingState = () => {
    const enabled = enableCoating.checked;
    setVisible(coatingSection, enabled);
    if (enabled && !coatingItemsContainer.children.length) {
      addCoatingRow();
    }
    if (!enabled) {
      coatingPercentInput.value = "0";
      coatingItemsContainer.innerHTML = "";
    }
  };

  const updatePreviewFields = (data) => {
    document.getElementById("previewTotalQty").textContent = decimal(data.total_qty);
    document.getElementById("previewTotalAmount").textContent = currency(data.total_amount);
    document.getElementById("previewPricePerKg").textContent = currency(data.price_per_kg);
    document.getElementById("previewMisc").textContent = currency(data.misc);
    document.getElementById("previewFinalCost").textContent = currency(data.final_cost);
    document.getElementById("previewSalePrice").textContent = currency(data.sale_price);
    document.getElementById("previewProfit").textContent = currency(data.profit);
    document.getElementById("previewProfitPercent").textContent = `${decimal(data.profit_percent_sale)}%`;
  };

  const resetPreview = () =>
    updatePreviewFields({
      total_qty: 0,
      total_amount: 0,
      price_per_kg: 0,
      misc: 0,
      final_cost: 0,
      sale_price: 0,
      profit: 0,
      profit_percent_sale: 0,
    });

  const updatePreview = async () => {
    hideAlert(previewError);
    const items = collectItems();
    const coating_items = collectCoatingItems();
    const coating_percent = enableCoating.checked ? Number(coatingPercentInput.value || 0) : 0;
    if (!items.length) {
      resetPreview();
      return;
    }

    setVisible(previewLoader, true);
    try {
      const preview = await api.previewFormulation({
        type: document.getElementById("formulationType").value,
        fixed_profit: Number(document.getElementById("fixedProfit").value || 0),
        coating_percent,
        coating_items,
        items,
      });
      updatePreviewFields(preview);
    } catch (error) {
      showAlert(previewError, error.message, "warning");
    } finally {
      setVisible(previewLoader, false);
    }
  };

  const loadMaterials = async () => {
    materials = await api.getMaterials();
    if (!itemsContainer.children.length) {
      itemsContainer.innerHTML = "";
      addItemRow();
    }
  };

  const populateFormulation = async () => {
    if (!formulationId) return;

    const formulation = await api.getFormulation(formulationId);
    pageTitle.textContent = "Edit Formulation";
    pageSubtitle.textContent = "Update a formulation and recompute costing live.";
    submitButton.textContent = "Update Formulation";
    setVisible(backToDashboard, true);
    document.getElementById("formulationName").value = formulation.name;
    document.getElementById("formulationType").value = formulation.type;
    document.getElementById("formulationSeason").value = formulation.season;
    document.getElementById("fixedProfit").value = formulation.fixed_profit;
    itemsContainer.innerHTML = "";
    formulation.items.forEach((item) => {
      addItemRow({
        material_id: item.material_id,
        quantity: item.quantity,
      });
    });
    enableCoating.checked = Boolean(formulation.coating_items && formulation.coating_items.length);
    syncCoatingState();
    coatingItemsContainer.innerHTML = "";
    coatingPercentInput.value = formulation.coating_percent || 0;
    (formulation.coating_items || []).forEach((item) => {
      addCoatingRow({
        material_id: item.material_id,
        quantity: item.quantity,
      });
    });
  };

  addRowButton.addEventListener("click", () => addItemRow());
  addCoatingRowButton.addEventListener("click", () => addCoatingRow());
  previewButton.addEventListener("click", updatePreview);
  enableCoating.addEventListener("change", () => {
    syncCoatingState();
    updatePreview();
  });
  coatingPercentInput.addEventListener("input", updatePreview);

  document.getElementById("formulationType").addEventListener("change", updatePreview);
  document.getElementById("fixedProfit").addEventListener("input", updatePreview);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideAlert(alert);
    const items = collectItems();
    const coating_items = enableCoating.checked ? collectCoatingItems() : [];
    const coating_percent = enableCoating.checked ? Number(coatingPercentInput.value || 0) : 0;

    if (!items.length) {
      showAlert(alert, "Add at least one valid material row.", "warning");
      return;
    }

    if (enableCoating.checked && (!coating_items.length || coating_percent <= 0 || coating_percent > 100)) {
      showAlert(alert, "Provide coating materials and a coating percentage greater than 0 and at most 100.", "warning");
      return;
    }

    const payload = {
      name: document.getElementById("formulationName").value.trim(),
      type: document.getElementById("formulationType").value,
      season: document.getElementById("formulationSeason").value,
      fixed_profit: Number(document.getElementById("fixedProfit").value || 0),
      coating_percent,
      coating_items,
      items,
    };

    try {
      if (formulationId) {
        await api.updateFormulation(formulationId, payload);
        showAlert(alert, "Formulation updated successfully.", "success");
      } else {
        await api.createFormulation(payload);
        form.reset();
        itemsContainer.innerHTML = "";
        coatingItemsContainer.innerHTML = "";
        enableCoating.checked = false;
        syncCoatingState();
        addItemRow();
        resetPreview();
        showAlert(alert, "Formulation saved successfully.", "success");
      }
    } catch (error) {
      showAlert(alert, error.message);
    }
  });

  try {
    await loadMaterials();
    syncCoatingState();
    await populateFormulation();
    await updatePreview();
  } catch (error) {
    showAlert(alert, `Unable to load materials: ${error.message}`);
  }
}

if (page === "dashboard") {
  initDashboard();
}

if (page === "materials") {
  initMaterialsPage();
}

if (page === "add-formulation") {
  initAddFormulationPage();
}
