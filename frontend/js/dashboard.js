async function initDashboard() {
  const loader = document.getElementById("dashboardLoader");
  const alert = document.getElementById("dashboardAlert");
  const tableBody = document.getElementById("formulationsTableBody");
  const typeFilter = document.getElementById("filterType");
  const seasonFilter = document.getElementById("filterSeason");
  const searchInput = document.getElementById("searchFormulations");
  const withoutForToggle = document.getElementById("dashboardWithoutFor");
  const showArchivedToggle = document.getElementById("showArchivedFormulations");
  const formulationsCount = document.getElementById("summaryFormulations");
  const avgSalePrice = document.getElementById("summarySalePrice");
  const avgFinalCost = document.getElementById("summaryFinalCost");
  const avgProfit = document.getElementById("summaryProfit");
  const lowestMargin = document.getElementById("summaryLowestMargin");
  const lowestMarginValue = document.getElementById("summaryLowestMarginValue");
  const detailPanel = document.getElementById("detailPanel");
  const detailEmpty = document.getElementById("detailEmpty");
  const detailEditLink = document.getElementById("detailEditLink");
  const detailDuplicateButton = document.getElementById("detailDuplicateButton");
  const detailArchiveButton = document.getElementById("detailArchiveButton");
  const detailRestoreButton = document.getElementById("detailRestoreButton");
  const materialsAlert = document.getElementById("dashboardMaterialsAlert");
  const materialsLoader = document.getElementById("dashboardMaterialsLoader");
  const materialsTableBody = document.getElementById("dashboardMaterialsTableBody");
  const sortButtons = document.querySelectorAll(".sort-button");

  let selectedFormulationId = null;
  let lastLoadedItems = [];
  let sortState = { key: "name", direction: "asc" };

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

  const renderDetail = (item) => {
    if (!item) {
      selectedFormulationId = null;
      setVisible(detailPanel, false);
      setVisible(detailEmpty, true);
      setVisible(detailEditLink, false);
      setVisible(detailDuplicateButton, false);
      setVisible(detailArchiveButton, false);
      setVisible(detailRestoreButton, false);
      syncSelectedRow();
      return;
    }

    selectedFormulationId = item.id;
    setVisible(detailEmpty, false);
    setVisible(detailPanel, true);
    setVisible(detailEditLink, !item.is_archived);
    setVisible(detailDuplicateButton, true);
    setVisible(detailArchiveButton, !item.is_archived);
    setVisible(detailRestoreButton, item.is_archived);
    detailEditLink.href = `/add-formulation?id=${item.id}`;
    detailDuplicateButton.onclick = () => duplicateFormulation(item);
    detailArchiveButton.onclick = () => toggleArchiveFormulation(item, true);
    detailRestoreButton.onclick = () => toggleArchiveFormulation(item, false);

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
    const coatingItems = item.coating_items || [];
    setText(
      "detailMaterialCount",
      coatingItems.length ? `${item.items.length + coatingItems.length} material entries` : `${item.items.length} material entries`
    );
    document.getElementById("detailItems").innerHTML = [
      renderMaterialGroup("Base Materials", item.items),
      coatingItems.length ? renderMaterialGroup(`Coating Materials (${decimal(item.coating_percent)}%)`, coatingItems) : "",
    ].join("");
    syncSelectedRow();
  };

  const renderKpis = (items) => {
    formulationsCount.textContent = String(items.length);
    if (!items.length) {
      avgSalePrice.textContent = currency(0);
      avgFinalCost.textContent = currency(0);
      avgProfit.textContent = currency(0);
      lowestMargin.textContent = "-";
      lowestMarginValue.textContent = "0.00%";
      return;
    }
    avgSalePrice.textContent = currency(items.reduce((sum, item) => sum + item.sale_price, 0) / items.length);
    avgFinalCost.textContent = currency(items.reduce((sum, item) => sum + item.final_cost, 0) / items.length);
    avgProfit.textContent = currency(items.reduce((sum, item) => sum + item.profit, 0) / items.length);
    const lowest = [...items].sort((a, b) => a.profit_percent_cost - b.profit_percent_cost)[0];
    lowestMargin.textContent = lowest.name;
    lowestMarginValue.textContent = `${decimal(lowest.profit_percent_cost)}%`;
  };

  const renderRows = (items) => {
    lastLoadedItems = items;
    renderKpis(items);

    if (!items.length) {
      tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-5">No formulations found.</td></tr>';
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
              <div class="table-row-summary">Final ${currency(item.final_cost)} | Sale ${currency(item.sale_price)} | Profit ${currency(item.profit)}</div>
            </td>
            <td>${item.season}</td>
            <td>${currency(item.final_cost)}</td>
            <td>${currency(item.sale_price)}</td>
            <td>${currency(item.profit)}</td>
            <td>${decimal(item.profit_percent_cost)}%</td>
            <td class="text-end">
              <div class="d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-sm btn-outline-secondary duplicate-formulation">Duplicate</button>
                ${
                  item.is_archived
                    ? '<button type="button" class="btn btn-sm btn-outline-success restore-formulation">Restore</button>'
                    : '<button type="button" class="btn btn-sm btn-outline-danger archive-formulation">Archive</button>'
                }
                ${item.is_archived ? "" : `<a class="btn btn-sm btn-outline-primary" href="/add-formulation?id=${item.id}">Edit</a>`}
              </div>
            </td>
          </tr>
        `
      )
      .join("");

    tableBody.querySelectorAll("tr[data-formulation-id]").forEach((row) => {
      const formulation = sortedItems.find((entry) => entry.id === row.dataset.formulationId);
      row.addEventListener("mouseenter", () => {
        if (!selectedFormulationId) renderDetail(formulation);
      });
      row.addEventListener("click", (event) => {
        if (event.target.closest("a, button")) return;
        renderDetail(formulation);
      });
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
      const data = await api.getFormulations({
        type: typeFilter.value,
        season: seasonFilter.value,
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
  withoutForToggle.addEventListener("change", loadFormulations);
  showArchivedToggle.addEventListener("change", loadFormulations);
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

  syncSortIndicators();
  await Promise.all([loadFormulations(), loadMaterials()]);
}

if (document.body.dataset.page === "dashboard") {
  initDashboard();
}
