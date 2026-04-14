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
  let editingMaterialId = null;

  const resetForm = () => {
    editingMaterialId = null;
    form.reset();
    document.getElementById("extra").value = "0";
    formTitle.textContent = "Add Material";
    submitButton.textContent = "Save Material";
    setVisible(cancelEditButton, false);
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
                ${item.is_archived ? '<button type="button" class="btn btn-sm btn-outline-success restore-material" data-id="' + item.id + '">Restore</button>' : '<button type="button" class="btn btn-sm btn-outline-primary edit-material" data-id="' + item.id + '">Edit</button><button type="button" class="btn btn-sm btn-outline-danger archive-material" data-id="' + item.id + '">Archive</button>'}
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
          window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (error) {
          showAlert(alert, error.message);
        }
      });
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
  showArchivedToggle.addEventListener("change", loadMaterials);

  resetForm();
  await loadMaterials();
}

if (document.body.dataset.page === "materials") {
  initMaterialsPage();
}
