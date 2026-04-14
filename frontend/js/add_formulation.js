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
  const versionHistorySection = document.getElementById("versionHistorySection");
  const versionHistoryList = document.getElementById("versionHistoryList");
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
      if (!container.children.length) addMaterialRow(container);
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
    if (enabled && !coatingItemsContainer.children.length) addCoatingRow();
    if (!enabled) {
      coatingPercentInput.value = "0";
      coatingItemsContainer.innerHTML = "";
    }
  };

  const updatePreviewFields = (data) => {
    setText("previewTotalQty", decimal(data.total_qty));
    setText("previewTotalAmount", currency(data.total_amount));
    setText("previewPricePerKg", currency(data.price_per_kg));
    setText("previewMisc", currency(data.misc));
    setText("previewFinalCost", currency(data.final_cost));
    setText("previewSalePrice", currency(data.sale_price));
    setText("previewProfit", currency(data.profit));
    setText("previewProfitPercent", `${decimal(data.profit_percent_sale)}%`);
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
    if (!items.length) return resetPreview();

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

  const versionDate = (value) =>
    new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));

  const renderVersionItems = (title, items) => `
    <div class="mt-3">
      <div class="fw-semibold mb-2">${title}</div>
      <div class="d-grid gap-2">
        ${items
          .map(
            (item) => `
              <div class="detail-item">
                <div>
                  <div class="fw-semibold">${item.name}</div>
                  <div class="text-muted small">${currency(item.amount_per_kg || 0)} / kg</div>
                </div>
                <div class="text-end">
                  <div class="fw-semibold">${decimal(item.quantity)} kg</div>
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;

  const renderVersions = (formulation) => {
    const versions = formulation.versions || [];
    setVisible(versionHistorySection, versions.length > 0);
    if (!versions.length) {
      versionHistoryList.innerHTML = "";
      return;
    }

    const orderedVersions = [...versions].sort((left, right) => right.version - left.version);
    versionHistoryList.innerHTML = orderedVersions
      .map(
        (version) => `
          <div class="border rounded-4 p-3 bg-light-subtle">
            <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
              <div>
                <div class="fw-semibold">Version ${version.version}</div>
                <div class="text-muted small">${versionDate(version.created_at)}</div>
              </div>
              <div class="text-end small text-muted">
                <div>${version.type} | ${version.season}</div>
                <div>Fixed Profit: ${currency(version.fixed_profit)}</div>
              </div>
            </div>
            ${renderVersionItems("Base Materials", version.items)}
            ${
              version.coating_items && version.coating_items.length
                ? renderVersionItems(`Coating Materials (${decimal(version.coating_percent)}%)`, version.coating_items)
                : ""
            }
          </div>
        `
      )
      .join("");
  };

  const loadMaterials = async () => {
    materials = (await api.getMaterials()).filter((material) => !material.is_archived);
    if (!itemsContainer.children.length) {
      itemsContainer.innerHTML = "";
      addItemRow();
    }
  };

  const populateFormulation = async () => {
    if (!formulationId) return;
    const formulation = await api.getFormulation(formulationId);
    pageTitle.textContent = "Edit Formulation";
    pageSubtitle.textContent = `Update a formulation and recompute costing live. Saved versions: ${formulation.version_count}.`;
    submitButton.textContent = "Update Formulation";
    setVisible(backToDashboard, true);
    document.getElementById("formulationName").value = formulation.name;
    document.getElementById("formulationType").value = formulation.type;
    document.getElementById("formulationSeason").value = formulation.season;
    document.getElementById("fixedProfit").value = formulation.fixed_profit;
    itemsContainer.innerHTML = "";
    formulation.items.forEach((item) => addItemRow({ material_id: item.material_id, quantity: item.quantity }));
    enableCoating.checked = Boolean(formulation.coating_items && formulation.coating_items.length);
    syncCoatingState();
    coatingItemsContainer.innerHTML = "";
    coatingPercentInput.value = formulation.coating_percent || 0;
    (formulation.coating_items || []).forEach((item) => addCoatingRow({ material_id: item.material_id, quantity: item.quantity }));
    renderVersions(formulation);
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
    if (!items.length) return showAlert(alert, "Add at least one valid material row.", "warning");
    if (enableCoating.checked && (!coating_items.length || coating_percent <= 0 || coating_percent > 100)) {
      return showAlert(alert, "Provide coating materials and a coating percentage greater than 0 and at most 100.", "warning");
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

if (document.body.dataset.page === "add-formulation") {
  initAddFormulationPage();
}
