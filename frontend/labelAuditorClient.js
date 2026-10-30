/**
 * labelAuditorClient.js
 * ---------------------
 * Client-side handler for Smart Food Label & Regulatory Safety Auditor.
 * Uploads food label photos to FastAPI /api/v1/audit-label, parses JSON response,
 * and updates the audit dashboard (Safety score, dates, additives, allergens).
 */

(function () {
  const ML_SERVICE_URL = "http://localhost:8000";

  // Elements
  const dropZone = document.getElementById("labelDropZone");
  const fileInput = document.getElementById("labelImage");
  const imgPreviewContainer = document.getElementById("imagePreview");
  const imgElement = document.getElementById("labelImgElement");
  const loadingIndicator = document.getElementById("labelAuditLoading");
  const placeholderBox = document.getElementById("labelAuditPlaceholder");
  const dashboard = document.getElementById("labelAuditDashboard");
  const statusBadge = document.getElementById("labelAuditorStatusBadge");

  // Dashboard fields
  const verdictBanner = document.getElementById("auditVerdictBanner");
  const verdictText = document.getElementById("auditVerdictText");
  const expiryTag = document.getElementById("auditExpiryTag");
  const scoreValue = document.getElementById("auditScoreValue");
  const mfgDateEl = document.getElementById("auditMfgDate");
  const expDateEl = document.getElementById("auditExpDate");
  const shelfLifeEl = document.getElementById("auditShelfLife");
  const additivesContainer = document.getElementById("auditAdditivesBadges");
  const allergensContainer = document.getElementById("auditAllergensBadges");
  const flagsList = document.getElementById("auditFlagsList");

  if (!dropZone || !fileInput) return;

  // 1. Drag & drop handlers
  dropZone.addEventListener("click", () => fileInput.click());

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "#2563eb";
    dropZone.style.background = "#eff6ff";
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.style.borderColor = "#94a3b8";
    dropZone.style.background = "#f8fafc";
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "#94a3b8";
    dropZone.style.background = "#f8fafc";
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });

  function handleFileSelected(file) {
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file (PNG, JPG, WebP).");
      return;
    }

    // Display preview
    const reader = new FileReader();
    reader.onload = function (evt) {
      if (imgElement) imgElement.src = evt.target.result;
      if (imgPreviewContainer) imgPreviewContainer.style.display = "block";
    };
    reader.readAsDataURL(file);

    // Send to Audit API
    auditFoodLabel(file);
  }

  async function auditFoodLabel(fileBlob) {
    if (loadingIndicator) loadingIndicator.style.display = "block";
    if (placeholderBox) placeholderBox.style.display = "none";
    if (dashboard) dashboard.style.display = "none";
    if (statusBadge) {
      statusBadge.textContent = "Auditing Label...";
      statusBadge.style.background = "#fef3c7";
      statusBadge.style.color = "#b45309";
    }

    const formData = new FormData();
    formData.append("file", fileBlob, fileBlob.name || "label.jpg");

    try {
      const response = await fetch(`${ML_SERVICE_URL}/api/v1/audit-label`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Audit service returned HTTP ${response.status}`);
      }

      const data = await response.json();
      renderAuditScorecard(data);
    } catch (err) {
      console.warn("Label audit API unreachable or failed:", err);
      if (statusBadge) {
        statusBadge.textContent = "Service Offline";
        statusBadge.style.background = "#fee2e2";
        statusBadge.style.color = "#991b1b";
      }
      if (placeholderBox) {
        placeholderBox.style.display = "block";
        placeholderBox.innerHTML = `
          <div style="color:#ef4444; font-weight:600;"><i class="fas fa-exclamation-triangle"></i> Unable to connect to ML Auditor service on port 8000.</div>
          <small style="color:#64748b;">Ensure <code>uvicorn main:app --port 8000</code> is running.</small>
        `;
      }
    } finally {
      if (loadingIndicator) loadingIndicator.style.display = "none";
    }
  }

  function renderAuditScorecard(result) {
    if (!dashboard) return;
    dashboard.style.display = "block";

    const { safety_score, verdict, verdict_code, dates, additives, allergens, regulatory_flags } = result;

    // 1. Safety Score & Verdict banner styling
    if (scoreValue) scoreValue.textContent = `${safety_score}/100`;
    if (verdictText) verdictText.textContent = verdict;

    if (verdictBanner) {
      if (verdict_code === "safe") {
        verdictBanner.style.background = "#f0fdf4";
        verdictBanner.style.border = "1px solid #86efac";
        verdictBanner.style.color = "#15803d";
      } else if (verdict_code === "caution") {
        verdictBanner.style.background = "#fffbeb";
        verdictBanner.style.border = "1px solid #fde68a";
        verdictBanner.style.color = "#b45309";
      } else {
        verdictBanner.style.background = "#fef2f2";
        verdictBanner.style.border = "1px solid #fca5a5";
        verdictBanner.style.color = "#b91c1c";
      }
    }

    // 2. Shelf Life / Dates
    if (dates) {
      if (mfgDateEl) mfgDateEl.textContent = dates.mfg_date || "Not listed";
      if (expDateEl) expDateEl.textContent = dates.exp_date || "Not listed";
      if (shelfLifeEl) shelfLifeEl.textContent = dates.shelf_life_status || "Unknown";
      if (expiryTag) expiryTag.textContent = dates.shelf_life_status || "Expiry info pending";
    }

    // 3. Additive Badges
    if (additivesContainer) {
      if (!additives || additives.length === 0) {
        additivesContainer.innerHTML = '<span style="color:#64748b; font-size:0.8rem;">No high-risk chemical additives or INS codes detected.</span>';
      } else {
        additivesContainer.innerHTML = additives
          .map((a) => {
            const isHigh = a.risk_level === "High";
            const bg = isHigh ? "#fee2e2" : "#fef3c7";
            const text = isHigh ? "#991b1b" : "#92400e";
            return `
              <span title="${a.description}" style="padding: 3px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; background: ${bg}; color: ${text}; border: 1px solid rgba(0,0,0,0.06);">
                ${a.name} (${a.code}) &bull; ${a.risk_level}
              </span>
            `;
          })
          .join("");
      }
    }

    // 4. Allergen Badges
    if (allergensContainer) {
      if (!allergens || allergens.length === 0) {
        allergensContainer.innerHTML = '<span style="color:#64748b; font-size:0.8rem;">No major allergens (Gluten, Peanuts, Dairy, Soy) explicitly declared.</span>';
      } else {
        allergensContainer.innerHTML = allergens
          .map((alg) => {
            return `
              <span title="${alg.warning}" style="padding: 3px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5;">
                <i class="fas fa-exclamation-circle"></i> ${alg.group}
              </span>
            `;
          })
          .join("");
      }
    }

    // 5. Regulatory Flags
    if (flagsList) {
      if (!regulatory_flags || regulatory_flags.length === 0) {
        flagsList.innerHTML = "<li>All checked ingredients comply with basic standard thresholds.</li>";
      } else {
        flagsList.innerHTML = regulatory_flags.map((f) => `<li>${f}</li>`).join("");
      }
    }

    if (statusBadge) {
      statusBadge.textContent = verdict_code === "safe" ? "Audit Passed" : "Audit Flagged";
      statusBadge.style.background = verdict_code === "safe" ? "#dcfce7" : "#fee2e2";
      statusBadge.style.color = verdict_code === "safe" ? "#166534" : "#991b1b";
    }

    // Auto-populate manual analyzer form fields if present to speed up user flow
    const nameField = document.getElementById("p_name");
    const expField = document.getElementById("p_exp");
    if (dates && dates.exp_date && expField && !expField.value) {
      try {
        const parsedD = new Date(dates.exp_date);
        if (!isNaN(parsedD.getTime())) {
          expField.value = parsedD.toISOString().split("T")[0];
        }
      } catch (e) {}
    }
  }
})();
