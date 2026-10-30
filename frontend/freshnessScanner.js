/**
 * freshnessScanner.js
 * -------------------
 * Real-Time Food Freshness & Spoilage Scanner client integration.
 * Connects browser webcam and image upload to FastAPI YOLOv8 microservice.
 */

(function () {
  const ML_SERVICE_URL = "http://localhost:8000";

  let cameraStream = null;

  // DOM Elements
  const videoEl = document.getElementById("visionWebcam");
  const previewImg = document.getElementById("visionResultPreview");
  const placeholderEl = document.getElementById("visionPlaceholder");
  const btnToggleCam = document.getElementById("btnToggleVisionCam");
  const btnScanFrame = document.getElementById("btnAnalyzeVisionFrame");
  const fileInput = document.getElementById("visionFileInput");
  const statusBadge = document.getElementById("cvVisionStatus");
  const verdictCard = document.getElementById("visionVerdictCard");
  const verdictTitle = document.getElementById("visionVerdictTitle");
  const safetyScore = document.getElementById("visionSafetyScore");
  const itemsList = document.getElementById("visionItemsList");

  if (!btnToggleCam) return; // Guard if elements not mounted

  // 1. Toggle Live Webcam
  btnToggleCam.addEventListener("click", async () => {
    if (cameraStream) {
      stopCamera();
    } else {
      await startCamera();
    }
  });

  async function startCamera() {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "environment" },
        audio: false,
      });
      videoEl.srcObject = cameraStream;
      videoEl.play();

      if (placeholderEl) placeholderEl.style.display = "none";
      if (previewImg) previewImg.style.display = "none";

      btnToggleCam.innerHTML = '<i class="fas fa-video-slash"></i> Stop Camera';
      btnToggleCam.className = "btn btn-outline";
      btnScanFrame.disabled = false;
      if (statusBadge) {
        statusBadge.textContent = "Live Stream Active";
        statusBadge.style.background = "#dbeafe";
        statusBadge.style.color = "#1e40af";
      }
    } catch (err) {
      alert("Unable to access camera: " + err.message);
    }
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
    videoEl.srcObject = null;
    btnToggleCam.innerHTML = '<i class="fas fa-video"></i> Start Camera';
    btnScanFrame.disabled = true;
    if (placeholderEl && (!previewImg || previewImg.style.display === "none")) {
      placeholderEl.style.display = "block";
    }
    if (statusBadge) {
      statusBadge.textContent = "Camera Inactive";
      statusBadge.style.background = "#f1f5f9";
      statusBadge.style.color = "#475569";
    }
  }

  // 2. Scan Current Frame from Webcam (<100ms low-latency endpoint)
  btnScanFrame.addEventListener("click", () => {
    if (!videoEl.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = videoEl.videoWidth || 640;
    canvas.height = videoEl.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          sendInferenceRequest(blob, `${ML_SERVICE_URL}/api/v1/detect/frame`, "frame");
        }
      },
      "image/jpeg",
      0.8
    );
  });

  // 3. Local Image Upload
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      sendInferenceRequest(file, `${ML_SERVICE_URL}/api/v1/detect/image`, "file");
    }
  });

  // 4. Send Request to FastAPI
  async function sendInferenceRequest(dataBlob, endpoint, fieldName) {
    const formData = new FormData();
    formData.append(fieldName, dataBlob, "sample.jpg");

    btnScanFrame.disabled = true;
    if (statusBadge) {
      statusBadge.textContent = "Analyzing Quality...";
      statusBadge.style.background = "#fef3c7";
      statusBadge.style.color = "#b45309";
    }

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Inference service error: ${res.statusText}`);
      }

      const result = await res.json();
      renderInferenceResults(result);
    } catch (err) {
      console.error("Freshness scanner error:", err);
      alert("Failed to analyze food sample: " + err.message);
    } finally {
      if (cameraStream) btnScanFrame.disabled = false;
    }
  }

  // 5. Render Results to UI
  function renderInferenceResults(result) {
    const { summary, detections, annotated_image } = result;

    // Show annotated image overlay
    if (annotated_image && previewImg) {
      previewImg.src = annotated_image;
      previewImg.style.display = "block";
      if (placeholderEl) placeholderEl.style.display = "none";
    }

    // Update Verdict Card styling
    if (verdictCard) {
      verdictCard.style.display = "block";
      if (summary.status === "safe") {
        verdictCard.style.background = "#f0fdf4";
        verdictCard.style.border = "1px solid #86efac";
        verdictTitle.style.color = "#15803d";
      } else if (summary.status === "unsafe") {
        verdictCard.style.background = "#fef2f2";
        verdictCard.style.border = "1px solid #fca5a5";
        verdictTitle.style.color = "#b91c1c";
      } else {
        verdictCard.style.background = "#fffbeb";
        verdictCard.style.border = "1px solid #fde68a";
        verdictTitle.style.color = "#b45309";
      }

      verdictTitle.textContent = summary.verdict;
      safetyScore.textContent = `Safety Index: ${summary.safety_score}/100 (${summary.total_detected} items)`;
    }

    // Populate Detections Breakdown
    if (itemsList) {
      if (!detections || detections.length === 0) {
        itemsList.innerHTML = "<p style='color:#64748b; margin:0;'>No food items recognized in this frame.</p>";
      } else {
        itemsList.innerHTML = detections
          .map((d) => {
            const badgeColor =
              d.state === "rotten"
                ? "background:#ef4444; color:#fff;"
                : d.state === "fresh"
                ? "background:#22c55e; color:#fff;"
                : "background:#f59e0b; color:#fff;";
            return `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px dashed #e2e8f0;">
                <span style="font-weight:600; color:#334155;">${d.label}</span>
                <div>
                  <span style="font-size:0.75rem; color:#64748b; margin-right:8px;">${(d.confidence * 100).toFixed(1)}%</span>
                  <span style="padding:2px 8px; border-radius:12px; font-size:0.7rem; font-weight:700; text-transform:uppercase; ${badgeColor}">
                    ${d.state}
                  </span>
                </div>
              </div>
            `;
          })
          .join("");
      }
    }

    if (statusBadge) {
      statusBadge.textContent = summary.status === "safe" ? "Verified Safe" : "Spoilage Warning";
      statusBadge.style.background = summary.status === "safe" ? "#dcfce7" : "#fee2e2";
      statusBadge.style.color = summary.status === "safe" ? "#166534" : "#991b1b";
    }
  }
})();
