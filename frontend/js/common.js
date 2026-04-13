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
