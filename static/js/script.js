"use strict";

document.addEventListener("DOMContentLoaded", function () {
  // DOM Elements
  const sidebarLinks = document.querySelectorAll(".sidebar-link[data-target]");
  const allSections = document.querySelectorAll(".page-section");
  const addIncomeBtn = document.querySelector(".add-income-btn");
  const addIncomeForm = document.querySelector(".add-income");
  const addExpensesBtn = document.querySelector(".add-expenses-btn");
  const addExpensesForm = document.querySelector(".add-expenses");
  const formCloseBtn = document.querySelectorAll(".close");
  const overlay = document.querySelector(".overlay");
  const incomeForm = document.getElementById("add-income-form");
  const expenseForm = document.getElementById("add-expense-form");
  const incomeDownloadBtn = document.querySelector(".income-download-btn");
  const expenseDownloadBtn = document.querySelector(".expense-download-btn");
  const logoutLink = document.querySelector(".logout-link");

  // Debug logout click
  logoutLink?.addEventListener("click", (e) => {
    console.log("Logout link clicked, navigating to /logout");
    try {
      window.location.href = "/logout"; // Force navigation
    } catch (error) {
      console.error("Navigation to /logout failed:", error);
      alert("Failed to logout, please try again");
    }
  });

  // Optional: Add feedback for download buttons
  incomeDownloadBtn?.addEventListener("click", (e) => {
    console.log("Income download button clicked");
  });

  expenseDownloadBtn?.addEventListener("click", (e) => {
    console.log("Expense download button clicked");
  });

  // Initialize data
  let incomeData = [];
  let expenseData = [];
  let summaryData = { balance: 0, total_income: 0, total_expense: 0 };
  try {
    const incomeDataEl = document.getElementById("income-data");
    if (incomeDataEl && incomeDataEl.textContent.trim()) {
      incomeData = JSON.parse(incomeDataEl.textContent);
    }
    const expenseDataEl = document.getElementById("expense-data");
    if (expenseDataEl && expenseDataEl.textContent.trim()) {
      expenseData = JSON.parse(expenseDataEl.textContent);
    }
    const summaryDataEl = document.getElementById("summary-data");
    if (summaryDataEl && summaryDataEl.textContent.trim()) {
      summaryData = JSON.parse(summaryDataEl.textContent);
    }
  } catch (e) {
    console.error("Error loading data:", e);
  }

  // Chart instances
  let incomeChartInstance = null;
  let expenseChartInstance = null;
  let overviewChartInstance = null;

  // Initialize active section
  let activeLink = document.querySelector(".sidebar-link.active");
  if (!activeLink) {
    activeLink = document.querySelector(
      ".sidebar-link[data-target='dashboard']"
    );
    if (activeLink) {
      activeLink.classList.add("active");
      const targetSection = document.getElementById("dashboard");
      if (targetSection) {
        allSections.forEach((section) => section.classList.add("hidden"));
        targetSection.classList.remove("hidden");
        renderOverviewChart();
      }
    }
  } else {
    activeLink.click();
  }

  // Sidebar Navigation
  sidebarLinks.forEach((link) => {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      const target = this.getAttribute("data-target");
      if (!target) return;

      // Update active link
      sidebarLinks.forEach((l) => l.classList.remove("active"));
      this.classList.add("active");

      // Hide all sections
      allSections.forEach((section) => {
        section.classList.add("hidden");
      });

      // Show target section
      const targetSection = document.getElementById(target);
      if (targetSection) {
        targetSection.classList.remove("hidden");

        // Render appropriate chart
        if (target === "dashboard") {
          renderOverviewChart();
        } else if (target === "income") {
          renderIncomeChart();
          updateIncomeSourcesList();
        } else if (target === "expense") {
          renderExpenseChart();
          updateExpenseSourcesList();
        }
      }
    });
  });

  // Form Toggles
  addIncomeBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    addIncomeForm.classList.remove("hidden");
    overlay.classList.remove("hidden");
  });

  addExpensesBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    addExpensesForm.classList.remove("hidden");
    overlay.classList.remove("hidden");
  });

  // Close buttons
  formCloseBtn.forEach((button) => {
    button.addEventListener("click", () => {
      addIncomeForm.classList.add("hidden");
      addExpensesForm.classList.add("hidden");
      overlay.classList.add("hidden");
    });
  });

  // Overlay click handler
  overlay?.addEventListener("click", () => {
    addIncomeForm.classList.add("hidden");
    addExpensesForm.classList.add("hidden");
    overlay.classList.add("hidden");
  });

  // Income Form Submission
  incomeForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitButton = incomeForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      const formData = new FormData(incomeForm);
      const response = await fetch("/add-income", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        // Get fresh data from server
        const updatedResponse = await fetch("/data/income?t=" + Date.now());
        if (updatedResponse.ok) {
          incomeData = await updatedResponse.json();
          renderIncomeChart();
          updateIncomeSourcesList();
          incomeForm.reset();
          addIncomeForm.classList.add("hidden");
          overlay.classList.add("hidden");
        } else {
          alert("Failed to refresh income data");
        }
      } else {
        const result = await response.json();
        alert(result.message || "Failed to add income");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("An error occurred while adding income");
    } finally {
      submitButton.disabled = false;
    }
  });

  // Expense Form Submission
  expenseForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitButton = expenseForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      const formData = new FormData(expenseForm);
      const response = await fetch("/add-expense", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        // Get fresh data from server
        const updatedResponse = await fetch("/data/expenses?t=" + Date.now());
        if (updatedResponse.ok) {
          expenseData = await updatedResponse.json();
          renderExpenseChart();
          updateExpenseSourcesList();
          expenseForm.reset();
          addExpensesForm.classList.add("hidden");
          overlay.classList.add("hidden");
        } else {
          alert("Failed to refresh expense data");
        }
      } else {
        const result = await response.json();
        alert(result.message || "Failed to add expense");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("An error occurred while adding expense");
    } finally {
      submitButton.disabled = false;
    }
  });

  // Update Income Sources List
  function updateIncomeSourcesList() {
    const container = document.querySelector(".income-sources-column");
    if (!container) return;

    // Clear existing content
    container.innerHTML = "";

    // Use a Set to track unique entries
    const seen = new Set();

    // Process in reverse to show newest first
    [...incomeData].reverse().forEach((income) => {
      const key = `${income.source}-${income.amount}-${income.date}`;
      if (!seen.has(key)) {
        seen.add(key);
        container.innerHTML += `
                    <div class="income-column">
                        <div class="income-name">${income.source}</div>
                        <div class="income-date">${income.date}</div>
                        <div class="income-value">💹 ₹${income.amount}</div>
                    </div>
                `;
      }
    });
  }

  // Update Expense Sources List
  function updateExpenseSourcesList() {
    const container = document.querySelector(".expense-sources-column");
    if (!container) return;

    // Clear existing content
    container.innerHTML = "";

    // Use a Set to track unique entries
    const seen = new Set();

    // Process in reverse to show newest first
    [...expenseData].reverse().forEach((expense) => {
      const key = `${expense.category}-${expense.amount}-${expense.date}`;
      if (!seen.has(key)) {
        seen.add(key);
        container.innerHTML += `
                    <div class="expense-column">
                        <div class="expense-name">${expense.category}</div>
                        <div class="expense-date">${expense.date}</div>
                        <div class="expense-value">-₹${expense.amount}</div>
                    </ Uploading new file "script.js"div>
                `;
      }
    });
  }

  // Render Overview Chart
  function renderOverviewChart() {
    const ctx = document.getElementById("overviewChart");
    if (!ctx) {
      console.error("Canvas with ID 'overviewChart' not found");
      return;
    }

    if (overviewChartInstance) {
      overviewChartInstance.destroy();
    }

    overviewChartInstance = new Chart(ctx.getContext("2d"), {
      type: "pie",
      data: {
        labels: ["Income", "Expense"],
        datasets: [
          {
            label: "Financial Overview",
            data: [
              summaryData.total_income || 0,
              summaryData.total_expense || 0,
            ],
            backgroundColor: [
              "rgba(26, 47, 220, 0.6)", // Income: Blue
              "rgba(220, 53, 69, 0.6)", // Expense: Red
            ],
            borderColor: ["rgba(26, 47, 220, 1)", "rgba(220, 53, 69, 1)"],
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: "top",
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return `${context.label}: ₹${context.parsed.toFixed(2)}`;
              },
            },
          },
        },
      },
    });
  }

  // Render Income Chart
  function renderIncomeChart() {
    const ctx = document.getElementById("incomeChart");
    if (!ctx) {
      console.error("Canvas with ID 'incomeChart' not found");
      return;
    }

    if (incomeChartInstance) {
      incomeChartInstance.destroy();
    }

    // Aggregate income by date
    const incomeByDate = incomeData.reduce((acc, income) => {
      const date = new Date(income.date).toLocaleDateString();
      acc[date] = (acc[date] || 0) + parseFloat(income.amount);
      return acc;
    }, {});

    const labels = Object.keys(incomeByDate).sort(
      (a, b) => new Date(a) - new Date(b)
    );

    const data = labels.map((date) => incomeByDate[date]);

    incomeChartInstance = new Chart(ctx.getContext("2d"), {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Income (₹)",
            data: data,
            backgroundColor: "rgba(26, 47, 220, 0.6)",
            borderColor: "rgba(26, 47, 220, 1)",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: true },
        },
      },
    });
  }

  // Render Expense Chart
  function renderExpenseChart() {
    const ctx = document.getElementById("expenseChart");
    if (!ctx) {
      console.error("Canvas with ID 'expenseChart' not found");
      return;
    }

    if (expenseChartInstance) {
      expenseChartInstance.destroy();
    }

    // Aggregate expenses by date
    const expenseByDate = expenseData.reduce((acc, expense) => {
      const date = new Date(expense.date).toLocaleDateString();
      acc[date] = (acc[date] || 0) + parseFloat(expense.amount);
      return acc;
    }, {});

    const labels = Object.keys(expenseByDate).sort(
      (a, b) => new Date(a) - new Date(b)
    );

    const data = labels.map((date) => expenseByDate[date]);

    expenseChartInstance = new Chart(ctx.getContext("2d"), {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Expenses (₹)",
            data: data,
            backgroundColor: "rgba(220, 53, 69, 0.6)",
            borderColor: "rgba(220, 53, 69, 1)",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: true },
        },
      },
    });
  }
});
