async function initProfitCalculatorPage() {
  const alert = document.getElementById("profitCalculatorAlert");
  const form = document.getElementById("profitOrderForm");
  const formTitle = document.getElementById("profitOrderFormTitle");
  const partyNameInput = document.getElementById("partyName");
  const partySuggestions = document.getElementById("partySuggestions");
  const rowsContainer = document.getElementById("profitOrderRows");
  const addRowButton = document.getElementById("addProfitOrderRow");
  const resetButton = document.getElementById("resetProfitOrder");
  const saveButton = document.getElementById("saveProfitOrder");
  const cancelEditButton = document.getElementById("cancelProfitOrderEdit");
  const ordersEmpty = document.getElementById("profitOrdersEmpty");
  const ordersList = document.getElementById("profitOrdersList");

  let formulations = [];
  let editingOrderId = null;

  const formatDateTime = (value) =>
    new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));

  const formulationOptions = () =>
    ['<option value="">Select product</option>']
      .concat(formulations.map((item) => `<option value="${item.id}">${item.name}</option>`))
      .join("");

  const updateSummary = () => {
    let totalQty = 0;
    let totalCost = 0;
    let totalSale = 0;
    let totalProfit = 0;

    Array.from(rowsContainer.querySelectorAll(".profit-order-row")).forEach((row) => {
      const costPrice = Number(row.querySelector(".order-cost-price").value || 0);
      const sellingPrice = Number(row.querySelector(".order-selling-price").value || 0);
      const quantity = Number(row.querySelector(".order-quantity").value || 0);
      const lineCost = costPrice * quantity;
      const lineSale = sellingPrice * quantity;
      const lineProfit = lineSale - lineCost;
      row.querySelector(".order-line-profit").textContent = currency(lineProfit);
      totalQty += quantity;
      totalCost += lineCost;
      totalSale += lineSale;
      totalProfit += lineProfit;
    });

    setText("orderTotalQty", `${decimal(totalQty)} kg`);
    setText("orderTotalCost", currency(totalCost));
    setText("orderTotalSale", currency(totalSale));
    setText("orderTotalProfit", currency(totalProfit));
    setText("orderMarginPercent", `${decimal(totalSale ? (totalProfit / totalSale) * 100 : 0)}%`);
  };

  const renderOrders = (orders) => {
    setVisible(ordersEmpty, !orders.length);
    ordersList.innerHTML = orders
      .map(
        (order) => `
          <article class="comparison-card">
            <div class="d-flex justify-content-between align-items-start gap-3 mb-3 section-header-wrap">
              <div>
                <h3 class="h6 mb-1">${order.party_name}</h3>
                <div class="text-muted small">${formatDateTime(order.created_at)}</div>
              </div>
              <div class="text-end small">
                <div class="fw-semibold">${decimal(order.total_quantity_kg)} kg</div>
                <div class="text-muted">Profit ${currency(order.total_profit)}</div>
                <div class="text-muted">Margin ${decimal(order.margin_percent)}%</div>
              </div>
            </div>
            <div class="d-flex justify-content-end mb-3">
              <button type="button" class="btn btn-sm btn-outline-primary edit-profit-order" data-id="${order.id}">Edit Order</button>
            </div>
            <div class="comparison-metrics mb-3">
              <div><span>Total Cost</span><strong>${currency(order.total_cost)}</strong></div>
              <div><span>Total Sale</span><strong>${currency(order.total_sale)}</strong></div>
              <div><span>Total Profit</span><strong>${currency(order.total_profit)}</strong></div>
              <div><span>Margin %</span><strong>${decimal(order.margin_percent)}%</strong></div>
              <div><span>Rows</span><strong>${order.items.length}</strong></div>
            </div>
            <div class="table-responsive">
              <table class="table align-middle mb-0">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Cost</th>
                    <th>Sale</th>
                    <th>Qty</th>
                    <th>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  ${order.items
                    .map(
                      (item) => `
                        <tr>
                          <td class="fw-semibold">${item.formulation_name}</td>
                          <td>${currency(item.cost_price)}</td>
                          <td>${currency(item.selling_price)}</td>
                          <td>${decimal(item.quantity_kg)} kg</td>
                          <td>${currency(item.profit)}</td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </article>
        `
      )
      .join("");

    ordersList.querySelectorAll(".edit-profit-order").forEach((button) => {
      button.addEventListener("click", () => {
        const order = orders.find((entry) => entry.id === button.dataset.id);
        if (order) populateOrderForEdit(order);
      });
    });
  };

  const loadOrders = async () => {
    try {
      const orders = await api.getProfitOrders();
      renderOrders(orders);
    } catch (error) {
      showAlert(alert, error.message);
    }
  };

  const syncRowFromFormulation = (row) => {
    const formulation = formulations.find((item) => item.id === row.querySelector(".order-formulation").value);
    if (!formulation) {
      row.querySelector(".order-cost-price").value = "";
      row.querySelector(".order-selling-price").value = "";
      updateSummary();
      return;
    }

    row.querySelector(".order-cost-price").value = formulation.final_cost;
    row.querySelector(".order-selling-price").value = formulation.sale_price;
    updateSummary();
  };

  const addOrderRow = (prefill = null) => {
    const row = document.createElement("div");
    row.className = "item-row border rounded-4 p-3 bg-light-subtle profit-order-row";
    row.innerHTML = `
      <div class="row g-3 align-items-end">
        <div class="col-md-4">
          <label class="form-label">Product</label>
          <select class="form-select order-formulation" required>
            ${formulationOptions()}
          </select>
        </div>
        <div class="col-md-2">
          <label class="form-label">Cost Price</label>
          <input type="number" class="form-control order-cost-price" step="0.01" readonly />
        </div>
        <div class="col-md-2">
          <label class="form-label">Selling Price</label>
          <input type="number" class="form-control order-selling-price" step="0.01" min="0" required />
        </div>
        <div class="col-md-2">
          <label class="form-label">Qty (kg)</label>
          <input type="number" class="form-control order-quantity" step="0.01" min="0.01" required />
        </div>
        <div class="col-md-2">
          <label class="form-label">Line Profit</label>
          <div class="form-control bg-white order-line-profit">₹0.00</div>
        </div>
        <div class="col-12 d-flex justify-content-end">
          <button type="button" class="btn btn-outline-danger btn-sm remove-order-row">Remove Row</button>
        </div>
      </div>
    `;

    row.querySelector(".order-formulation").addEventListener("change", () => syncRowFromFormulation(row));
    row.querySelector(".order-selling-price").addEventListener("input", updateSummary);
    row.querySelector(".order-quantity").addEventListener("input", updateSummary);
    row.querySelector(".remove-order-row").addEventListener("click", () => {
      row.remove();
      if (!rowsContainer.children.length) addOrderRow();
      updateSummary();
    });

    rowsContainer.appendChild(row);
    if (prefill) {
      row.querySelector(".order-formulation").value = prefill.formulation_id || "";
      syncRowFromFormulation(row);
      if (typeof prefill.cost_price === "number") row.querySelector(".order-cost-price").value = prefill.cost_price;
      row.querySelector(".order-selling-price").value = prefill.selling_price ?? "";
      row.querySelector(".order-quantity").value = prefill.quantity_kg ?? "";
    }
  };

  const resetForm = () => {
    hideAlert(alert);
    editingOrderId = null;
    form.reset();
    rowsContainer.innerHTML = "";
    addOrderRow();
    updateSummary();
    setVisible(partySuggestions, false);
    partySuggestions.innerHTML = "";
    formTitle.textContent = "Order Details";
    saveButton.textContent = "Save Order";
    setVisible(cancelEditButton, false);
  };

  const collectItems = () =>
    Array.from(rowsContainer.querySelectorAll(".profit-order-row"))
      .map((row) => ({
        formulation_id: row.querySelector(".order-formulation").value,
        selling_price: Number(row.querySelector(".order-selling-price").value),
        quantity_kg: Number(row.querySelector(".order-quantity").value),
      }))
      .filter((item) => item.formulation_id && item.selling_price >= 0 && item.quantity_kg > 0);

  const renderPartySuggestions = (parties) => {
    if (!parties.length || !partyNameInput.value.trim()) {
      partySuggestions.innerHTML = "";
      setVisible(partySuggestions, false);
      return;
    }

    partySuggestions.innerHTML = parties
      .map(
        (party) => `
          <button type="button" class="party-suggestion-item" data-name="${party.name}">
            ${party.name}
          </button>
        `
      )
      .join("");
    setVisible(partySuggestions, true);
    partySuggestions.querySelectorAll(".party-suggestion-item").forEach((button) => {
      button.addEventListener("click", () => {
        partyNameInput.value = button.dataset.name;
        setVisible(partySuggestions, false);
      });
    });
  };

  const loadPartySuggestions = async (query) => {
    const trimmed = query.trim();
    if (!trimmed) {
      renderPartySuggestions([]);
      return;
    }
    try {
      const parties = await api.getParties(trimmed);
      renderPartySuggestions(parties);
    } catch (_) {
      renderPartySuggestions([]);
    }
  };

  addRowButton.addEventListener("click", addOrderRow);
  resetButton.addEventListener("click", resetForm);
  cancelEditButton.addEventListener("click", resetForm);
  partyNameInput.addEventListener("focus", () => {
    if (partyNameInput.value.trim()) loadPartySuggestions(partyNameInput.value);
  });
  partyNameInput.addEventListener("input", () => {
    window.clearTimeout(partyNameInput._timer);
    partyNameInput._timer = window.setTimeout(() => loadPartySuggestions(partyNameInput.value), 180);
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".party-suggest-wrap")) {
      setVisible(partySuggestions, false);
    }
  });

  const populateOrderForEdit = (order) => {
    hideAlert(alert);
    editingOrderId = order.id;
    partyNameInput.value = order.party_name;
    rowsContainer.innerHTML = "";
    order.items.forEach((item) => addOrderRow(item));
    if (!order.items.length) addOrderRow();
    updateSummary();
    formTitle.textContent = "Edit Order";
    saveButton.textContent = "Update Order";
    setVisible(cancelEditButton, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideAlert(alert);
    const payload = {
      party_name: partyNameInput.value.trim(),
      items: collectItems(),
    };

    if (!payload.party_name) {
      return showAlert(alert, "Party name is required.", "warning");
    }
    if (!payload.items.length) {
      return showAlert(alert, "Add at least one valid order row.", "warning");
    }

    try {
      const saved = editingOrderId
        ? await api.updateProfitOrder(editingOrderId, payload)
        : await api.createProfitOrder(payload);
      showAlert(alert, editingOrderId ? `Order updated for ${saved.party_name}.` : `Order saved for ${saved.party_name}.`, "success");
      resetForm();
      await Promise.all([loadOrders(), loadPartySuggestions("")]);
    } catch (error) {
      showAlert(alert, error.message);
    }
  });

  formulations = (await api.getFormulations({ without_for: true })).filter((item) => !item.is_archived);
  addOrderRow();
  await loadOrders();
}

if (document.body.dataset.page === "profit-calculator") {
  initProfitCalculatorPage();
}
