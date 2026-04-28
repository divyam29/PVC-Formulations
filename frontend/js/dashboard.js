async function initDashboard() {
  const loader = document.getElementById("dashboardLoader");
  const alert = document.getElementById("dashboardAlert");
  const tableBody = document.getElementById("formulationsTableBody");
  const typeFilter = document.getElementById("filterType");
  const seasonFilterSummary = document.getElementById("seasonFilterSummary");
  const seasonFilterDropdown = document.getElementById("seasonFilterDropdown");
  const seasonFilterCheckboxes = document.querySelectorAll(".season-filter-checkbox");
  const searchInput = document.getElementById("searchFormulations");
  const clearFiltersButton = document.getElementById("clearFilters");
  const withoutForToggle = document.getElementById("dashboardWithoutFor");
  const showArchivedToggle = document.getElementById("showArchivedFormulations");
  const compareFormulationA = document.getElementById("compareFormulationA");
  const compareFormulationB = document.getElementById("compareFormulationB");
  const comparisonEmpty = document.getElementById("comparisonEmpty");
  const comparisonPanel = document.getElementById("comparisonPanel");
  const detailPanel = document.getElementById("detailPanel");
  const detailEmpty = document.getElementById("detailEmpty");
  const detailEditLink = document.getElementById("detailEditLink");
  const detailExportCsvLink = document.getElementById("detailExportCsvLink");
  const detailDuplicateButton = document.getElementById("detailDuplicateButton");
  const detailArchiveButton = document.getElementById("detailArchiveButton");
  const detailRestoreButton = document.getElementById("detailRestoreButton");
  const materialsAlert = document.getElementById("dashboardMaterialsAlert");
  const materialsLoader = document.getElementById("dashboardMaterialsLoader");
  const materialsTableBody = document.getElementById("dashboardMaterialsTableBody");
  const whatIfAlert = document.getElementById("whatIfAlert");
  const whatIfFixedProfit = document.getElementById("whatIfFixedProfit");
  const whatIfCoatingPercent = document.getElementById("whatIfCoatingPercent");
  const whatIfItemsContainer = document.getElementById("whatIfItemsContainer");
  const whatIfCoatingGroup = document.getElementById("whatIfCoatingGroup");
  const whatIfCoatingItemsContainer = document.getElementById("whatIfCoatingItemsContainer");
  const whatIfResults = document.getElementById("whatIfResults");
  const runWhatIfButton = document.getElementById("runWhatIf");
  const resetWhatIfButton = document.getElementById("resetWhatIf");
  const sortButtons = document.querySelectorAll(".sort-button");
  const exportAllFormulationDetailsCsv = document.getElementById("exportAllFormulationDetailsCsv");

  let selectedFormulationId = null;
  let lastLoadedItems = [];
  let selectedFormulation = null;
  let sortState = { key: "name", direction: "asc" };
  const filterStorageKey = "dashboardFilters";

  const selectedSeasons = () =>
    Array.from(seasonFilterCheckboxes)
      .filter((input) => input.checked)
      .map((input) => input.value)
      .filter(Boolean);

  const currentFilterState = () => ({
    type: typeFilter.value,
    seasons: selectedSeasons(),
    search: searchInput.value.trim(),
    without_for: withoutForToggle.checked,
    include_archived: showArchivedToggle.checked,
  });

  const saveFilterState = () => {
    window.sessionStorage.setItem(filterStorageKey, JSON.stringify(currentFilterState()));
  };

  const restoreFilterState = () => {
    const raw = window.sessionStorage.getItem(filterStorageKey);
    if (!raw) return;

    try {
      const state = JSON.parse(raw);
      typeFilter.value = state.type || "";
      searchInput.value = state.search || "";
      withoutForToggle.checked = typeof state.without_for === "boolean" ? state.without_for : withoutForToggle.checked;
      showArchivedToggle.checked =
        typeof state.include_archived === "boolean" ? state.include_archived : showArchivedToggle.checked;
      const seasons = new Set(Array.isArray(state.seasons) ? state.seasons : []);
      seasonFilterCheckboxes.forEach((checkbox) => {
        checkbox.checked = seasons.has(checkbox.value);
      });
    } catch (_) {
      window.sessionStorage.removeItem(filterStorageKey);
    }
  };

  const syncSeasonFilterSummary = () => {
    const seasons = selectedSeasons();
    if (!seasonFilterSummary) return;
    seasonFilterSummary.textContent = !seasons.length
      ? "All Seasons"
      : seasons.length === 1
        ? seasons[0]
        : `${seasons.length} Seasons`;
  };

  const resetFilters = () => {
    typeFilter.value = "";
    searchInput.value = "";
    withoutForToggle.checked = true;
    showArchivedToggle.checked = false;
    seasonFilterCheckboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
    syncSeasonFilterSummary();
    saveFilterState();
  };

  const closeRowActionMenus = (exceptMenu = null) => {
    tableBody.querySelectorAll(".row-actions-dropdown[open]").forEach((menu) => {
      if (menu !== exceptMenu) menu.removeAttribute("open");
    });
  };

  const sortValue = (item, key) => {
    if (key === "name" || key === "season") return String(item[key] || "").toLowerCase();
    return Number(item[key] || 0);
  };

  const sortItems = (items) =>
    [...items].sort((left, right) => {
      const leftValue = sortValue(left, sortState.key);
      const rightValue = sortValue(right, sortState.key);
      if (leftValue < rightValue) return sortState.direction === "asc" ? -1 : 1;
      if (leftValue > rightValue) return sortState.direction === "asc" ? 1 : -1;
      return String(left.name).localeCompare(String(right.name));
    });

  const syncSortIndicators = () => {
    sortButtons.forEach((button) => {
      const isActive = button.dataset.sortKey === sortState.key;
      button.classList.toggle("is-active", isActive);
      const arrow = button.querySelector(".sort-arrow");
      if (arrow) arrow.textContent = isActive ? (sortState.direction === "asc" ? "↑" : "↓") : "↑↓";
    });
  };

  const syncSelectedRow = () => {
    tableBody.querySelectorAll("tr[data-formulation-id]").forEach((row) => {
      row.classList.toggle("is-selected", row.dataset.formulationId === selectedFormulationId);
    });
  };

  const renderMaterialGroup = (title, materials) => `
    <div>
      <div class="fw-semibold mb-2">${title}</div>
      <div class="detail-items">
        ${materials
          .map(
            (material) => `
              <div class="detail-item">
                <div><div class="fw-semibold">${material.name}</div></div>
                <div class="text-end"><div class="fw-semibold">${decimal(material.quantity)} kg</div></div>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;

  const renderWhatIfRows = (container, materials) => {
    container.innerHTML = materials
      .map(
        (material, index) => `
          <div class="what-if-row">
            <div class="what-if-row-title">${material.name}</div>
            <div class="row g-2">
              <div class="col-6">
                <label class="form-label small">Qty</label>
                <input class="form-control form-control-sm what-if-quantity" type="number" step="0.01" min="0.01" value="${material.quantity}" data-index="${index}" />
              </div>
              <div class="col-6">
                <label class="form-label small">Unit Price</label>
                <input class="form-control form-control-sm what-if-unit-price" type="number" step="0.01" min="0" value="${material.unit_price}" data-index="${index}" />
              </div>
              <div class="col-6">
                <label class="form-label small">GST</label>
                <input class="form-control form-control-sm what-if-gst" type="number" step="0.01" min="0" value="${material.gst}" data-index="${index}" />
              </div>
              <div class="col-6">
                <label class="form-label small">Extra</label>
                <input class="form-control form-control-sm what-if-extra" type="number" step="0.01" value="${material.extra}" data-index="${index}" />
              </div>
            </div>
          </div>
        `
      )
      .join("");
  };

  const setWhatIfResult = (id, value, suffix = "") => setText(id, `${value}${suffix}`);

  const renderWhatIfResults = (metrics) => {
    setVisible(whatIfResults, true);
    setText("whatIfPricePerKg", currency(metrics.price_per_kg));
    setText("whatIfFinalCost", currency(metrics.final_cost));
    setText("whatIfSalePrice", currency(metrics.sale_price));
    setText("whatIfProfit", currency(metrics.profit));
    setText("whatIfProfitPercentCost", `${decimal(metrics.profit_percent_cost)}%`);
    setText("whatIfProfitPercentSale", `${decimal(metrics.profit_percent_sale)}%`);
  };

  const renderWhatIf = (item) => {
    selectedFormulation = item;
    hideAlert(whatIfAlert);
    setVisible(whatIfResults, false);
    if (!item) {
      whatIfItemsContainer.innerHTML = "";
      whatIfCoatingItemsContainer.innerHTML = "";
      whatIfFixedProfit.value = "";
      whatIfCoatingPercent.value = "";
      setVisible(whatIfCoatingGroup, false);
      return;
    }

    whatIfFixedProfit.value = item.fixed_profit;
    whatIfCoatingPercent.value = item.coating_percent || 0;
    renderWhatIfRows(whatIfItemsContainer, item.items || []);
    const coatingItems = item.coating_items || [];
    setVisible(whatIfCoatingGroup, coatingItems.length > 0);
    renderWhatIfRows(whatIfCoatingItemsContainer, coatingItems);
  };

  const collectWhatIfItems = (container) =>
    Array.from(container.querySelectorAll(".what-if-row")).map((row) => ({
      name: row.querySelector(".what-if-row-title").textContent.trim(),
      quantity: Number(row.querySelector(".what-if-quantity").value),
      unit_price: Number(row.querySelector(".what-if-unit-price").value),
      gst: Number(row.querySelector(".what-if-gst").value),
      extra: Number(row.querySelector(".what-if-extra").value),
    }));

  const runWhatIf = async () => {
    if (!selectedFormulation) return;
    hideAlert(whatIfAlert);
    try {
      const result = await api.calculateFormulationWhatIf({
        type: selectedFormulation.type,
        fixed_profit: Number(whatIfFixedProfit.value || 0),
        without_for: withoutForToggle.checked,
        coating_percent: Number(whatIfCoatingPercent.value || 0),
        items: collectWhatIfItems(whatIfItemsContainer),
        coating_items: collectWhatIfItems(whatIfCoatingItemsContainer),
      });
      renderWhatIfResults(result);
    } catch (error) {
      showAlert(whatIfAlert, error.message);
    }
  };

  const renderComparison = () => {
    const left = lastLoadedItems.find((item) => item.id === compareFormulationA.value);
    const right = lastLoadedItems.find((item) => item.id === compareFormulationB.value);
    if (!left || !right || left.id === right.id) {
      setVisible(comparisonPanel, false);
      setVisible(comparisonEmpty, true);
      return;
    }

    const fill = (suffix, item) => {
      setText(`compareName${suffix}`, item.name);
      setText(`compareSeason${suffix}`, `${item.type} | ${item.season}`);
      setText(`comparePrice${suffix}`, currency(item.price_per_kg));
      setText(`compareFinal${suffix}`, currency(item.final_cost));
      setText(`compareSale${suffix}`, currency(item.sale_price));
      setText(`compareProfit${suffix}`, currency(item.profit));
      setText(`compareProfitCost${suffix}`, `${decimal(item.profit_percent_cost)}%`);
      setText(`compareProfitSale${suffix}`, `${decimal(item.profit_percent_sale)}%`);
    };

    fill("A", left);
    fill("B", right);
    setVisible(comparisonEmpty, false);
    setVisible(comparisonPanel, true);
  };

  const syncComparisonOptions = (items) => {
    const previousA = compareFormulationA.value;
    const previousB = compareFormulationB.value;
    const options = ['<option value="">Select formulation</option>']
      .concat(items.map((item) => `<option value="${item.id}">${item.name}</option>`))
      .join("");
    compareFormulationA.innerHTML = options;
    compareFormulationB.innerHTML = options;
    if (items.some((item) => item.id === previousA)) compareFormulationA.value = previousA;
    if (items.some((item) => item.id === previousB)) compareFormulationB.value = previousB;
    renderComparison();
  };

  const renderDetail = (item) => {
    if (!item) {
      selectedFormulation = null;
      selectedFormulationId = null;
      setVisible(detailPanel, false);
      setVisible(detailEmpty, true);
      setVisible(detailEditLink, false);
      setVisible(detailExportCsvLink, false);
      setVisible(detailDuplicateButton, false);
      setVisible(detailArchiveButton, false);
      setVisible(detailRestoreButton, false);
      renderWhatIf(null);
      syncSelectedRow();
      return;
    }

    selectedFormulationId = item.id;
    setVisible(detailEmpty, false);
    setVisible(detailPanel, true);
    setVisible(detailEditLink, !item.is_archived);
    setVisible(detailExportCsvLink, true);
    setVisible(detailDuplicateButton, true);
    setVisible(detailArchiveButton, !item.is_archived);
    setVisible(detailRestoreButton, item.is_archived);
    detailEditLink.href = `/add-formulation?id=${item.id}`;
    detailExportCsvLink.href = `/exports/formulations/${item.id}.csv?without_for=${withoutForToggle.checked}`;
    detailDuplicateButton.onclick = () => duplicateFormulation(item);
    detailArchiveButton.onclick = () => toggleArchiveFormulation(item, true);
    detailRestoreButton.onclick = () => toggleArchiveFormulation(item, false);

    setText("detailName", item.name);
    setText("detailType", item.type);
    setText("detailSeason", item.season);
    setText("detailPricePerKg", currency(item.price_per_kg));
    setText("detailMisc", currency(item.misc));
    setText("detailFinalCost", currency(item.final_cost));
    setText("detailSalePrice", currency(item.sale_price));
    setText("detailProfit", currency(item.profit));
    setText("detailProfitPercentCost", `${decimal(item.profit_percent_cost)}%`);
    setText("detailProfitPercentSale", `${decimal(item.profit_percent_sale)}%`);
    const coatingItems = item.coating_items || [];
    setText(
      "detailMaterialCount",
      coatingItems.length ? `${item.items.length + coatingItems.length} material entries` : `${item.items.length} material entries`
    );
    document.getElementById("detailItems").innerHTML = [
      renderMaterialGroup("Base Materials", item.items),
      coatingItems.length ? renderMaterialGroup(`Coating Materials (${decimal(item.coating_percent)}%)`, coatingItems) : "",
    ].join("");
    renderWhatIf(item);
    syncSelectedRow();
  };

  const renderRows = (items) => {
    lastLoadedItems = items;
    syncComparisonOptions(items);

    if (!items.length) {
      tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-5">No formulations found.</td></tr>';
      renderDetail(null);
      syncSortIndicators();
      return;
    }

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
            <td class="text-end">
              <details class="row-actions-dropdown">
                <summary class="btn btn-sm btn-outline-secondary row-actions-trigger">Actions</summary>
                <div class="row-actions-menu">
                  <button type="button" class="btn btn-sm btn-outline-secondary duplicate-formulation">Duplicate</button>
                  ${
                    item.is_archived
                      ? '<button type="button" class="btn btn-sm btn-outline-success restore-formulation">Restore</button>'
                      : '<button type="button" class="btn btn-sm btn-outline-danger archive-formulation">Archive</button>'
                  }
                  ${item.is_archived ? "" : `<a class="btn btn-sm btn-outline-primary" href="/add-formulation?id=${item.id}">Edit</a>`}
                </div>
              </details>
            </td>
          </tr>
        `
      )
      .join("");

    tableBody.querySelectorAll("tr[data-formulation-id]").forEach((row) => {
      const formulation = sortedItems.find((entry) => entry.id === row.dataset.formulationId);
      const actionMenu = row.querySelector(".row-actions-dropdown");
      row.addEventListener("mouseenter", () => {
        if (!selectedFormulationId) renderDetail(formulation);
      });
      row.addEventListener("click", (event) => {
        if (event.target.closest("a, button, summary, details")) return;
        renderDetail(formulation);
      });
      if (actionMenu) {
        actionMenu.addEventListener("toggle", () => {
          if (actionMenu.open) closeRowActionMenus(actionMenu);
        });
      }
      row.querySelector(".duplicate-formulation").addEventListener("click", () => duplicateFormulation(formulation));
      const archiveButton = row.querySelector(".archive-formulation");
      if (archiveButton) archiveButton.addEventListener("click", () => toggleArchiveFormulation(formulation, true));
      const restoreButton = row.querySelector(".restore-formulation");
      if (restoreButton) restoreButton.addEventListener("click", () => toggleArchiveFormulation(formulation, false));
    });

    renderDetail(sortedItems.find((item) => item.id === selectedFormulationId) || sortedItems[0]);
    syncSortIndicators();
  };

  const duplicateFormulation = async (item) => {
    const nextName = window.prompt("Duplicate formulation as:", `${item.name} Copy`);
    if (!nextName) return;
    try {
      await api.duplicateFormulation(item.id, { name: nextName.trim() });
      await loadFormulations();
      showAlert(alert, `Duplicated ${item.name}.`, "success");
    } catch (error) {
      showAlert(alert, error.message);
    }
  };

  const toggleArchiveFormulation = async (item, archive) => {
    try {
      if (archive) {
        await api.archiveFormulation(item.id);
        showAlert(alert, `Archived ${item.name}.`, "success");
      } else {
        await api.restoreFormulation(item.id);
        showAlert(alert, `Restored ${item.name}.`, "success");
      }
      await loadFormulations();
    } catch (error) {
      showAlert(alert, error.message);
    }
  };

  const renderMaterials = (items) => {
    if (!items.length) {
      materialsTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-5">No materials found.</td></tr>';
      return;
    }

    materialsTableBody.innerHTML = items
      .map(
        (item) => `
          <tr data-material-id="${item.id}">
            <td class="fw-semibold">${item.name}</td>
            <td><input class="form-control form-control-sm material-unit-price" type="number" step="0.01" min="0" value="${item.unit_price}" ${item.is_archived ? "disabled" : ""} /></td>
            <td>${decimal(item.gst)}%</td>
            <td>${currency(item.extra)}</td>
            <td class="fw-semibold">${currency(item.amount_per_kg)}</td>
            <td class="text-end"><button type="button" class="btn btn-sm btn-primary save-dashboard-material" ${item.is_archived ? "disabled" : ""}>Save Cost</button></td>
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
        if (!material) return showAlert(materialsAlert, "Material not found.");
        const payload = {
          name: material.name,
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
      saveFilterState();
      if (exportAllFormulationDetailsCsv) {
        exportAllFormulationDetailsCsv.href = `/exports/formulations-details.csv?without_for=${withoutForToggle.checked}`;
      }

      const data = await api.getFormulations({
        type: typeFilter.value,
        seasons: selectedSeasons(),
        name: searchInput.value.trim(),
        without_for: withoutForToggle.checked,
        include_archived: showArchivedToggle.checked,
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
  clearFiltersButton.addEventListener("click", async () => {
    resetFilters();
    await loadFormulations();
  });
  withoutForToggle.addEventListener("change", loadFormulations);
  showArchivedToggle.addEventListener("change", loadFormulations);
  compareFormulationA.addEventListener("change", renderComparison);
  compareFormulationB.addEventListener("change", renderComparison);
  if (runWhatIfButton) runWhatIfButton.addEventListener("click", runWhatIf);
  if (resetWhatIfButton) resetWhatIfButton.addEventListener("click", () => renderWhatIf(selectedFormulation));
  seasonFilterCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      syncSeasonFilterSummary();
      saveFilterState();
    });
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".row-actions-dropdown")) closeRowActionMenus();
    if (seasonFilterDropdown && !event.target.closest(".filter-dropdown")) {
      seasonFilterDropdown.removeAttribute("open");
    }
  });
  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchInput._timer);
    searchInput._timer = window.setTimeout(loadFormulations, 250);
  });
  sortButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.sortKey;
      sortState =
        sortState.key === key ? { key, direction: sortState.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" };
      renderRows(lastLoadedItems);
    });
  });
  restoreFilterState();
  syncSeasonFilterSummary();
  syncSortIndicators();
  await Promise.all([loadFormulations(), loadMaterials()]);
}

if (document.body.dataset.page === "dashboard") {
  initDashboard();
}
