async function initMaterialsPage() {
  const form = document.getElementById("materialForm");
  const tableBody = document.getElementById("materialsTableBody");
  const loader = document.getElementById("materialsLoader");
  const alert = document.getElementById("materialsAlert");
  const formTitle = document.getElementById("materialFormTitle");
  const submitButton = document.getElementById("materialSubmitButton");
  const cancelEditButton = document.getElementById("cancelMaterialEdit");
  const showArchivedToggle = document.getElementById("showArchivedMaterials");
  const exportMaterialsCsv = document.getElementById("exportMaterialsCsv");
  const historySubtitle = document.getElementById("materialHistorySubtitle");
  const historyEmpty = document.getElementById("materialHistoryEmpty");
  const historyPanel = document.getElementById("materialHistoryPanel");
  const historyChart = document.getElementById("materialHistoryChart");
  const historyTableBody = document.getElementById("materialHistoryTableBody");
  const historyLatestAmount = document.getElementById("historyLatestAmount");
  const historyHighestAmount = document.getElementById("historyHighestAmount");
  const historyLowestAmount = document.getElementById("historyLowestAmount");
  let editingMaterialId = null;
  let selectedHistoryMaterialId = null;

  const formatDateTime = (value) =>
    new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));

  const resetForm = () => {
    editingMaterialId = null;
    form.reset();
    document.getElementById("extra").value = "0";
    formTitle.textContent = "Add Material";
    submitButton.textContent = "Save Material";
    setVisible(cancelEditButton, false);
  };

  const renderHistoryChart = (points) => {
    if (!points.length) {
      historyChart.innerHTML = "";
      return;
    }

    const values = points.map((entry) => Number(entry.amount_per_kg || 0));
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    const latestValue = values[values.length - 1];
    const firstValue = values[0];
    const deltaValue = latestValue - firstValue;
    const xStep = points.length > 1 ? 540 / (points.length - 1) : 0;
    const chartTop = 42;
    const chartBottom = 182;
    const chartLeft = 56;
    const chartRight = 592;
    const valueRange = maxValue - minValue || 1;
    const toY = (value) => chartBottom - ((value - minValue) / valueRange) * (chartBottom - chartTop);
    const coords = points.map((entry, index) => ({
      x: chartLeft + index * xStep,
      y: toY(Number(entry.amount_per_kg || 0)),
      value: Number(entry.amount_per_kg || 0),
      recorded_at: entry.recorded_at,
    }));
    const linePath = coords
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");
    const areaPath = `${linePath} L ${chartRight} ${chartBottom} L ${chartLeft} ${chartBottom} Z`;
    const midValue = minValue + valueRange / 2;
    const yTicks = [maxValue, midValue, minValue];
    const gridLines = yTicks
      .map((ratio) => {
        const y = toY(ratio);
        return `
          <line x1="${chartLeft}" y1="${y}" x2="${chartRight}" y2="${y}" class="history-grid-line"></line>
          <text x="${chartLeft - 12}" y="${y + 4}" text-anchor="end" class="history-axis-value">${currency(ratio)}</text>
        `;
      })
      .join("");
    const circles = coords
      .map(
        (point, index) => `
          <g class="history-point-group">
            <circle cx="${point.x}" cy="${point.y}" r="${index === coords.length - 1 ? 6 : 4.5}" class="history-point history-point-core"></circle>
            <circle cx="${point.x}" cy="${point.y}" r="${index === coords.length - 1 ? 12 : 9}" class="history-point history-point-halo"></circle>
          </g>
        `
      )
      .join("");
    const labels = coords
      .map(
        (point, index) =>
          `<text x="${chartLeft + index * xStep}" y="202" text-anchor="middle" class="history-axis-label">${
            points.length > 5
              ? new Date(point.recorded_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
              : new Date(point.recorded_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })
          }</text>`
      )
      .join("");
    const latestPoint = coords[coords.length - 1];
    const deltaLabel = `${deltaValue >= 0 ? "+" : ""}${currency(deltaValue)}`;
    const deltaClass = deltaValue >= 0 ? "history-delta-up" : "history-delta-down";
    const tooltipWidth = 120;
    const tooltipHeight = 44;
    const tooltipX = Math.max(chartLeft, Math.min(chartRight - tooltipWidth, latestPoint.x - 16));
    const tooltipY = Math.max(10, latestPoint.y - 58);

    historyChart.innerHTML = `
      <defs>
        <linearGradient id="historyChartBackdrop" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="rgba(255,255,255,0.92)"></stop>
          <stop offset="100%" stop-color="rgba(237,244,253,0.94)"></stop>
        </linearGradient>
        <linearGradient id="historyAreaFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="rgba(41, 128, 228, 0.30)"></stop>
          <stop offset="60%" stop-color="rgba(41, 128, 228, 0.12)"></stop>
          <stop offset="100%" stop-color="rgba(41, 128, 228, 0.01)"></stop>
        </linearGradient>
        <linearGradient id="historyLineStroke" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#4ca0ff"></stop>
          <stop offset="55%" stop-color="#2476d3"></stop>
          <stop offset="100%" stop-color="#0f4c81"></stop>
        </linearGradient>
        <filter id="historyGlow">
          <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="rgba(36,118,211,0.22)"></feDropShadow>
        </filter>
        <filter id="historyCardShadow">
          <feDropShadow dx="0" dy="16" stdDeviation="14" flood-color="rgba(15,30,56,0.10)"></feDropShadow>
        </filter>
      </defs>
      <rect x="0" y="0" width="640" height="220" rx="24" fill="url(#historyChartBackdrop)" class="history-surface"></rect>
      <rect x="${chartLeft}" y="${chartTop}" width="${chartRight - chartLeft}" height="${chartBottom - chartTop}" rx="18" class="history-plot-surface"></rect>
      ${gridLines}
      <line x1="${chartLeft}" y1="${chartBottom}" x2="${chartRight}" y2="${chartBottom}" class="history-axis-line"></line>
      <path fill="url(#historyAreaFill)" d="${areaPath}"></path>
      <path fill="none" filter="url(#historyGlow)" stroke="url(#historyLineStroke)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" d="${linePath}"></path>
      ${circles}
      ${labels}
      <text x="${chartLeft}" y="24" class="history-value-label">Amount / Kg Trend</text>
      <text x="${chartRight}" y="24" text-anchor="end" class="history-value-label">Latest ${currency(latestValue)}</text>
      <g filter="url(#historyCardShadow)">
        <rect x="${tooltipX}" y="${tooltipY}" width="${tooltipWidth}" height="${tooltipHeight}" rx="14" class="history-tooltip"></rect>
      </g>
      <text x="${tooltipX + 14}" y="${tooltipY + 18}" class="history-tooltip-label">Latest</text>
      <text x="${tooltipX + 14}" y="${tooltipY + 34}" class="history-tooltip-value">${currency(latestValue)}</text>
      <text x="${tooltipX + tooltipWidth - 14}" y="${tooltipY + 34}" text-anchor="end" class="history-tooltip-delta ${deltaClass}">${deltaLabel}</text>
    `;
  };

  const renderHistory = (material, history) => {
    selectedHistoryMaterialId = material.material_id;
    historySubtitle.textContent = `Price history for ${material.name}`;
    setVisible(historyEmpty, false);
    setVisible(historyPanel, true);
    const values = history.map((entry) => Number(entry.amount_per_kg || 0));
    const latestValue = values[values.length - 1] || 0;
    setText("historyLatestAmount", currency(latestValue));
    setText("historyHighestAmount", currency(values.length ? Math.max(...values) : 0));
    setText("historyLowestAmount", currency(values.length ? Math.min(...values) : 0));
    renderHistoryChart(history);
    historyTableBody.innerHTML = history.length
      ? history
          .slice()
          .reverse()
          .map(
            (entry) => `
              <tr>
                <td>${formatDateTime(entry.recorded_at)}</td>
                <td>${currency(entry.unit_price)}</td>
                <td>${decimal(entry.gst)}%</td>
                <td>${currency(entry.extra)}</td>
                <td class="fw-semibold">${currency(entry.amount_per_kg)}</td>
              </tr>
            `
          )
          .join("")
      : '<tr><td colspan="5" class="text-center text-muted py-4">No history found.</td></tr>';
  };

  const loadMaterialHistory = async (materialId) => {
    try {
      const history = await api.getMaterialHistory(materialId);
      renderHistory(history, history.history || []);
    } catch (error) {
      showAlert(alert, error.message);
    }
  };

  const toggleArchive = async (material, archive) => {
    hideAlert(alert);
    try {
      if (archive) {
        await api.archiveMaterial(material.id);
        showAlert(alert, `Archived ${material.name}.`, "success");
      } else {
        await api.restoreMaterial(material.id);
        showAlert(alert, `Restored ${material.name}.`, "success");
      }
      if (editingMaterialId === material.id && archive) {
        resetForm();
      }
      await loadMaterials();
    } catch (error) {
      showAlert(alert, error.message);
    }
  };

  const renderMaterials = (items) => {
    if (!items.length) {
      tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-5">No materials found.</td></tr>';
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
            <td class="text-end">
              <div class="d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-sm btn-outline-secondary history-material" data-id="${item.id}">History</button>
                ${
                  item.is_archived
                    ? `<button type="button" class="btn btn-sm btn-outline-success restore-material" data-id="${item.id}">Restore</button>`
                    : `<button type="button" class="btn btn-sm btn-outline-primary edit-material" data-id="${item.id}">Edit</button><button type="button" class="btn btn-sm btn-outline-danger archive-material" data-id="${item.id}">Archive</button>`
                }
              </div>
            </td>
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
          await loadMaterialHistory(material.id);
          window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (error) {
          showAlert(alert, error.message);
        }
      });
    });

    tableBody.querySelectorAll(".history-material").forEach((button) => {
      button.addEventListener("click", () => loadMaterialHistory(button.dataset.id));
    });

    tableBody.querySelectorAll(".archive-material").forEach((button) => {
      button.addEventListener("click", () => {
        const material = items.find((entry) => entry.id === button.dataset.id);
        if (material) toggleArchive(material, true);
      });
    });

    tableBody.querySelectorAll(".restore-material").forEach((button) => {
      button.addEventListener("click", () => {
        const material = items.find((entry) => entry.id === button.dataset.id);
        if (material) toggleArchive(material, false);
      });
    });
  };

  const loadMaterials = async () => {
    setVisible(loader, true);
    try {
      exportMaterialsCsv.href = `/exports/materials.csv?include_archived=${showArchivedToggle.checked}`;
      const data = await api.getMaterials({ include_archived: showArchivedToggle.checked });
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
      const historyTargetId = editingMaterialId;
      resetForm();
      await loadMaterials();
      if (historyTargetId) {
        await loadMaterialHistory(historyTargetId);
      }
    } catch (error) {
      showAlert(alert, error.message);
    }
  });

  cancelEditButton.addEventListener("click", () => {
    hideAlert(alert);
    resetForm();
  });
  showArchivedToggle.addEventListener("change", loadMaterials);

  resetForm();
  await loadMaterials();
  if (selectedHistoryMaterialId) {
    await loadMaterialHistory(selectedHistoryMaterialId);
  }
}

if (document.body.dataset.page === "materials") {
  initMaterialsPage();
}
