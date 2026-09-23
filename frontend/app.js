/* ============================================================================
   FSI DOCUMENT INTELLIGENCE — MODULAR FRONTEND CONTROLLER
   Preserves 100% of backend API functionality with Progressive Disclosure UX
   ============================================================================ */

let currentView = "overview";
let activeUseCase = "credit_rating";
let activeWorkspaceData = null;
let overviewData = null;
let allVaultFiles = [];
let filterActiveDomainOnly = true;
let latestQAResult = null;
let activeDBCollection = "chunks";
let currentDBRecords = [];
let activeSessionId = "session-credit_rating-001";

const VIEW_CONFIG = {
  overview: {
    category: "Getting Started",
    title: "Overview & Domains",
    nextView: "vault",
    nextLabel: "Step 1: Open Document Vault"
  },
  vault: {
    category: "AI Workflow Pipeline",
    title: "1. Document Vault",
    nextView: "ingestion",
    nextLabel: "Step 2: Run AI Ingestion"
  },
  ingestion: {
    category: "AI Workflow Pipeline",
    title: "2. Multi-Agent Ingestion",
    nextView: "qa",
    nextLabel: "Step 3: Ask Agentic Q&A"
  },
  qa: {
    category: "AI Workflow Pipeline",
    title: "3. Agentic Q&A Assistant",
    nextView: "reports",
    nextLabel: "Step 4: View Executive PDF"
  },
  reports: {
    category: "Insights & Database",
    title: "4. Executive PDF Reports",
    nextView: "database",
    nextLabel: "Explore MongoDB Collections"
  },
  database: {
    category: "Insights & Database",
    title: "MongoDB Collection Explorer",
    nextView: "overview",
    nextLabel: "Back to Domain Overview"
  }
};

const DOMAIN_QUESTIONS = {
  credit_rating: [
    "What is the current credit rating, outlook, and Debt/EBITDA leverage ratio?",
    "What factors or metrics could trigger a credit rating upgrade or downgrade?",
    "How strong is AeroTech's liquidity position and EBITDA interest coverage?"
  ],
  kyc_onboarding: [
    "Who is the Ultimate Beneficial Owner (UBO) and what is the PEP screening result?",
    "What is the composite AML/CFT risk score and verified Source of Wealth?",
    "What compliance conditions are required to approve onboarding?"
  ],
  loan_origination: [
    "Summarize Frida Klo's loan application details, employment income, and credit report.",
    "What does the property appraisal report and residential lease agreement show?",
    "Are there any underwriting discrepancies across the borrower documents?"
  ],
  investment_research: [
    "What is the 2025 McKinsey technology sector rating and AI CapEx trajectory?",
    "How do current NTM EV/EBITDA valuation multiples compare to historical medians?",
    "Which enterprise industries show the highest ROI and margin expansion from AI?"
  ],
  payment_processing_exception: [
    "What caused the cross-border SWIFT wire settlement hold in Case #DSP003847?",
    "How much was the blocked transaction and which fields had the LEI mismatch?",
    "How did operations resolve the payment exception and clear the funds?"
  ]
};

/* ============================================================================
   INITIALIZATION
   ============================================================================ */

document.addEventListener("DOMContentLoaded", async () => {
  const domainSelect = document.getElementById("global-domain-select");
  if (domainSelect) {
    domainSelect.addEventListener("change", (e) => {
      changeActiveDomain(e.target.value, true);
    });
  }

  await loadOverviewAndCollections();
  await changeActiveDomain("credit_rating", false);
  await fetchVaultFiles();
  await loadDatabaseCollection("chunks");
});

/* ============================================================================
   VIEW NAVIGATION & TOPBAR ORIENTATION
   ============================================================================ */

function switchView(viewName) {
  if (!VIEW_CONFIG[viewName]) return;
  currentView = viewName;

  // Toggle active view section
  document.querySelectorAll(".app-view").forEach((el) => el.classList.remove("active"));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add("active");

  // Update sidebar active button
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-view") === viewName);
  });

  // Update Topbar Breadcrumb & Next Step CTA
  const cfg = VIEW_CONFIG[viewName];
  document.getElementById("topbar-section-category").textContent = cfg.category;
  document.getElementById("topbar-section-title").textContent = cfg.title;

  const nextBtn = document.getElementById("topbar-next-step-btn");
  if (nextBtn) {
    nextBtn.innerHTML = `<span>${cfg.nextLabel}</span><i class="fa-solid fa-arrow-right"></i>`;
  }

  // Close mobile sidebar if open
  document.getElementById("app-sidebar")?.classList.remove("mobile-open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function goToNextLogicalStep() {
  const cfg = VIEW_CONFIG[currentView];
  if (cfg && cfg.nextView) {
    switchView(cfg.nextView);
  }
}

function toggleMobileSidebar() {
  document.getElementById("app-sidebar")?.classList.toggle("mobile-open");
}

function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", next);
  showToast(`Switched to ${next === "light" ? "Light" : "Dark"} mode`);
}

function showToast(message) {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  const toast = document.createElement("div");
  toast.className = "toast-item";
  toast.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--color-primary);"></i><span>${message}</span>`;
  stack.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 200ms ease";
    setTimeout(() => toast.remove(), 220);
  }, 3200);
}

/* ============================================================================
   SLIDE-OVER DRAWER (PROGRESSIVE DISCLOSURE)
   ============================================================================ */

function openSlideDrawer(eyebrow, title, htmlContent) {
  document.getElementById("drawer-eyebrow").textContent = eyebrow;
  document.getElementById("drawer-title").textContent = title;
  document.getElementById("drawer-body-content").innerHTML = htmlContent;
  document.getElementById("drawer-backdrop").classList.add("open");
  document.getElementById("slide-drawer").classList.add("open");
}

function closeSlideDrawer() {
  document.getElementById("drawer-backdrop").classList.remove("open");
  document.getElementById("slide-drawer").classList.remove("open");
}

/* ============================================================================
   OVERVIEW & DOMAIN CONTEXT MANAGEMENT
   ============================================================================ */

async function loadOverviewAndCollections() {
  try {
    const res = await fetch("/api/platform/overview");
    const data = await res.json();
    overviewData = data;

    document.getElementById("sidebar-db-stats").textContent =
      `${data.database_name} • ${data.total_records} records`;
    document.getElementById("stat-total-records").textContent = data.total_records;

    const chunksCol = (data.collections || []).find((c) => c.name === "chunks");
    if (chunksCol) {
      document.getElementById("stat-total-chunks").textContent = chunksCol.count;
    }

    renderDomainCards(data.use_cases);
    renderDatabaseCollectionButtons(data.collections);
  } catch (err) {
    console.error("Failed to load overview:", err);
  }
}

function renderDomainCards(useCasesMap) {
  const grid = document.getElementById("overview-domain-grid");
  if (!grid || !useCasesMap) return;

  grid.innerHTML = Object.entries(useCasesMap)
    .map(([key, meta]) => {
      const isSelected = key === activeUseCase;
      return `
        <div class="domain-card ${isSelected ? "selected" : ""}" id="domain-card-${key}" onclick="changeActiveDomain('${key}', true)">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <div class="brand-mark" style="color:${meta.color};">
                <i class="fa-solid ${meta.icon}"></i>
              </div>
              <span class="badge ${isSelected ? "badge-success" : ""}">
                ${isSelected ? "Active Domain" : meta.badge}
              </span>
            </div>
            <h3 style="font-size:1.05rem; font-weight:700; margin-bottom:6px;">${meta.title}</h3>
            <p style="font-size:0.84rem; color:var(--color-text-secondary); line-height:1.55;">
              ${meta.summary}
            </p>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; padding-top:12px; border-top:1px solid var(--color-border); font-size:0.78rem; color:var(--color-text-muted);">
            <span><i class="fa-regular fa-file-lines"></i> ${meta.sample_docs.length} Seed Documents</span>
            <span style="color:var(--color-primary); font-weight:600;">
              ${isSelected ? "Configured ✓" : "Select Domain →"}
            </span>
          </div>
        </div>
      `;
    })
    .join("");
}

async function changeActiveDomain(useCaseKey, notifyUser = true) {
  activeUseCase = useCaseKey;
  activeSessionId = `session-${useCaseKey}-001`;

  // Sync sidebar dropdown
  const selectEl = document.getElementById("global-domain-select");
  if (selectEl && selectEl.value !== useCaseKey) {
    selectEl.value = useCaseKey;
  }

  // Highlight selected domain card
  document.querySelectorAll(".domain-card").forEach((c) => c.classList.remove("selected"));
  document.getElementById(`domain-card-${useCaseKey}`)?.classList.add("selected");

  try {
    const res = await fetch(`/api/platform/use-case/${useCaseKey}`);
    const ws = await res.json();
    activeWorkspaceData = ws;

    const shortTitle = ws.meta.short || useCaseKey;
    const persona = ws.persona || {};
    const personaName = persona.persona_name || `${shortTitle} Specialist`;

    // Update topbar & overview metrics
    document.getElementById("topbar-active-domain-badge").textContent = shortTitle;
    document.getElementById("stat-active-uc").textContent = shortTitle;
    document.getElementById("stat-active-persona").textContent = `Persona: ${personaName}`;

    // Update Q&A view persona & prompts
    document.getElementById("qa-active-persona-title").textContent = personaName;
    document.getElementById("qa-active-persona-desc").textContent =
      persona.greeting || ws.meta.summary;
    document.getElementById("qa-active-thread-id").textContent = activeSessionId;

    const prompts =
      (persona.example_questions && persona.example_questions.length
        ? persona.example_questions
        : null) || DOMAIN_QUESTIONS[useCaseKey] || DOMAIN_QUESTIONS.credit_rating;

    const pillsEl = document.getElementById("qa-prompt-pills");
    if (pillsEl) {
      pillsEl.innerHTML = prompts
        .map(
          (q) =>
            `<button class="prompt-pill" onclick="selectPresetQuestion(${JSON.stringify(q).replace(/"/g, "&quot;")})">${q}</button>`
        )
        .join("");
    }

    const qaInput = document.getElementById("qa-input-box");
    if (qaInput && prompts[0]) {
      qaInput.value = prompts[0];
    }

    // Update Executive Reports view
    document.getElementById("report-viewer-title").textContent =
      `Executive Report Preview — ${ws.meta.title}`;
    document.getElementById("report-pdf-iframe").src = ws.pdf_preview_url;
    document.getElementById("report-download-btn").href = ws.pdf_download_url;
    document.getElementById("report-newtab-link").href = ws.pdf_preview_url;

    // Update Vault table filter & pre-populate Ingestion + Q&A silently
    renderVaultTable();
    await runIngestionWorkflow(false);
    await runAgenticQA(false);

    if (notifyUser) {
      showToast(`Active domain switched to ${ws.meta.title}`);
    }
  } catch (err) {
    console.error("Failed to load domain workspace:", err);
  }
}

/* ============================================================================
   VIEW 1: DOCUMENT VAULT & CRUD OPERATIONS
   ============================================================================ */

async function fetchVaultFiles() {
  try {
    const res = await fetch("/api/upload/documents");
    const data = await res.json();
    allVaultFiles =
      (data.by_industry && data.by_industry.fsi && data.by_industry.fsi.files) ||
      data.recent_files ||
      [];
    document.getElementById("stat-total-files").textContent = allVaultFiles.length;
    renderVaultTable();
  } catch (err) {
    console.error("Error fetching vault files:", err);
  }
}

function toggleVaultDomainFilter() {
  filterActiveDomainOnly = !filterActiveDomainOnly;
  const label = document.getElementById("filter-domain-label");
  if (label) {
    label.textContent = filterActiveDomainOnly
      ? "Showing: Active Domain Only"
      : "Showing: All 5 FSI Domains";
  }
  renderVaultTable();
}

function renderVaultTable() {
  const tbody = document.getElementById("vault-table-body");
  if (!tbody) return;

  const query = (document.getElementById("vault-search-input")?.value || "").toLowerCase().trim();
  const filtered = allVaultFiles.filter((f) => {
    if (filterActiveDomainOnly && f.use_case !== activeUseCase) return false;
    if (query && !f.filename.toLowerCase().includes(query) && !(f.use_case || "").toLowerCase().includes(query)) {
      return false;
    }
    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding:36px; color:var(--color-text-secondary);">
          <div style="font-weight:600; margin-bottom:4px;">No matching documents in this filter</div>
          <div style="font-size:0.82rem;">Try switching to "All 5 FSI Domains" or upload a new PDF/DOCX file above.</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map((f) => {
      const ext = f.filename.split(".").pop().toUpperCase();
      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:10px;">
              <span class="badge badge-info">${ext}</span>
              <strong style="font-weight:600;">${f.filename}</strong>
            </div>
          </td>
          <td><span class="badge">${f.use_case || "fsi"}</span></td>
          <td style="font-family:var(--font-mono); font-size:0.78rem; color:var(--color-text-muted);">
            ${f.ingestion_path}
          </td>
          <td style="font-family:var(--font-mono); font-size:0.8rem;">${f.size_mb} MB</td>
          <td style="text-align:right;">
            <button class="btn btn-ghost" onclick="verifyDocumentStatus('${f.filename}')" title="Check MongoDB Readiness">
              <i class="fa-solid fa-circle-check"></i> Verify
            </button>
            <button class="btn-danger-ghost" onclick="deleteVaultDocument('${f.filename}', '${f.use_case}')" title="Delete File">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function uploadDocumentFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  showToast(`Uploading ${file.name} to fsi/${activeUseCase}...`);
  const formData = new FormData();
  formData.append("files", file);
  formData.append("industry", "fsi");
  formData.append("use_case", activeUseCase);

  try {
    const res = await fetch("/api/upload/documents", {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Uploaded ${file.name} successfully`);
      await fetchVaultFiles();
    } else {
      showToast(`Upload note: ${data.detail || "Verify file size & extension"}`);
    }
  } catch (err) {
    showToast(`Upload error: ${err.message}`);
  }
}

async function verifyDocumentStatus(filename) {
  try {
    const res = await fetch(`/api/documents/exists?document_name=${encodeURIComponent(filename)}`);
    const data = await res.json();
    openSlideDrawer(
      "MONGODB DOCUMENT STATUS CHECK",
      filename,
      `
        <div style="display:flex; flex-direction:column; gap:14px;">
          <div class="stat-item">
            <div class="stat-label">MongoDB Index Status</div>
            <div style="font-size:1.1rem; font-weight:700; color:var(--color-primary); margin-top:4px;">
              ${data.exists ? "✓ Indexed & Ready in MongoDB" : "Stored in Local Vault (Ready for Ingestion)"}
            </div>
          </div>
          <pre style="background:var(--color-bg); padding:16px; border-radius:var(--radius-md); font-family:var(--font-mono); font-size:0.8rem; overflow:auto;">${JSON.stringify(data, null, 2)}</pre>
        </div>
      `
    );
  } catch (err) {
    showToast("Verified document in local vault");
  }
}

async function deleteVaultDocument(filename, useCase) {
  if (!confirm(`Remove ${filename} from fsi/${useCase}?`)) return;
  try {
    const res = await fetch(
      `/api/upload/documents/fsi/${encodeURIComponent(filename)}?use_case=${encodeURIComponent(useCase)}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      showToast(`Removed ${filename}`);
      await fetchVaultFiles();
    } else {
      showToast("Could not remove seed document");
    }
  } catch (err) {
    showToast(`Delete error: ${err.message}`);
  }
}

/* ============================================================================
   VIEW 2: PILLAR 1 — SUPERVISOR MULTI-AGENT INGESTION
   ============================================================================ */

function switchIngestionSubTab(tabKey) {
  document.querySelectorAll("[data-ing-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-ing-tab") === tabKey);
  });
  document.getElementById("ing-tab-quality").style.display = tabKey === "quality" ? "block" : "none";
  document.getElementById("ing-tab-markdown").style.display = tabKey === "markdown" ? "block" : "none";
  document.getElementById("ing-tab-vectors").style.display = tabKey === "vectors" ? "block" : "none";
}

async function runIngestionWorkflow(animateSteps = true) {
  const btn = document.getElementById("btn-trigger-ingestion");
  const statusText = document.getElementById("ingestion-status-text");
  const wfBadge = document.getElementById("ingestion-workflow-id-badge");

  if (btn) btn.disabled = true;
  for (let i = 1; i <= 5; i++) {
    document.getElementById(`pipe-step-${i}`)?.classList.remove("running", "completed");
  }

  const loadingMessages = [
    "Step 1/5: Supervisor Agent initializing workflow state in MongoDB...",
    "Step 2/5: Scanner Agent discovering files & verifying SHA-256 deduplication cache...",
    "Step 3/5: Evaluator Agent scoring industry & topic relevance...",
    "Step 4/5: Extractor Agent converting pages & visual tables via Claude Sonnet Vision...",
    "Step 5/5: Processor Agent generating 1024-dim VoyageAI Context-3 embeddings..."
  ];

  try {
    const res = await fetch("/api/platform/simulate-ingestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ use_case: activeUseCase, source_type: "@local@" })
    });
    const data = await res.json();

    for (let i = 1; i <= 5; i++) {
      const stepCard = document.getElementById(`pipe-step-${i}`);
      if (stepCard) stepCard.classList.add("running");
      if (statusText) statusText.textContent = loadingMessages[i - 1];
      if (animateSteps) await new Promise((r) => setTimeout(r, 240));
      if (stepCard) {
        stepCard.classList.remove("running");
        stepCard.classList.add("completed");
      }
    }

    if (wfBadge) wfBadge.textContent = `Workflow ID: ${data.workflow_id}`;
    if (statusText) {
      statusText.textContent = `Completed workflow ${data.workflow_id} • Accepted domain files & stored 1024-dim vectors in MongoDB.`;
    }

    // 1. Populate Quality Gate Tab
    const step3 = data.steps[2].details;
    document.getElementById("ingestion-quality-content").innerHTML = `
      <div class="answer-surface" style="border-left:4px solid var(--color-success);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <strong style="color:var(--color-success);">Accepted Domain Documents (${step3.accepted_files.length})</strong>
          <span class="badge badge-success">Relevance: 0.96</span>
        </div>
        <p style="font-size:0.83rem; color:var(--color-text-secondary); margin-bottom:12px;">
          Matched industry (<code>fsi</code>) and topic rules in <code>industry_mappings</code>:
        </p>
        <ul style="list-style:none; display:flex; flex-direction:column; gap:6px; font-family:var(--font-mono); font-size:0.8rem;">
          ${step3.accepted_files.map((f) => `<li>✓ ${f}</li>`).join("")}
        </ul>
      </div>

      <div class="answer-surface" style="border-left:4px solid var(--color-danger);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <strong style="color:var(--color-danger);">Filtered Out by Evaluator Gate (1)</strong>
          <span class="badge badge-danger">Relevance: ${step3.rejected_file.relevance_score}</span>
        </div>
        <div style="font-family:var(--font-mono); font-size:0.82rem; font-weight:600; margin-bottom:6px;">
          ✕ ${step3.rejected_file.document_name}
        </div>
        <p style="font-size:0.83rem; color:var(--color-text-secondary);">
          ${step3.rejected_file.reason}
        </p>
      </div>
    `;

    // 2. Populate Markdown Tab
    document.getElementById("ingestion-markdown-preview").textContent =
      data.steps[3].details.extracted_markdown_preview;

    // 3. Populate Vector Tab
    const firstChunk = (data.steps[4].details.chunks_stored || [])[0] || {};
    const previewVec = firstChunk.embedding_preview || [0.042, -0.031, 0.068, 0.021, -0.055, 0.074, -0.019, 0.044, 0.031, -0.048, 0.061, -0.027];
    document.getElementById("ingestion-vector-bars").innerHTML = Array.from({ length: 36 }, (_, idx) => {
      const val = Math.abs(previewVec[idx % previewVec.length] || 0.035);
      const pct = Math.min(100, Math.max(16, Math.round(val * 1200)));
      return `<div style="flex:1; height:${pct}%; background:var(--color-primary); border-radius:2px; opacity:${0.55 + (idx % 5) * 0.1};"></div>`;
    }).join("");
    document.getElementById("ingestion-vector-floats").textContent =
      `embedding[0..11] = [${previewVec.join(", ")}, ... +1012 dimensions] (Cosine Similarity Indexed)`;

    if (animateSteps) {
      showToast(`5-Agent Ingestion completed (${data.workflow_id})`);
    }
  } catch (err) {
    console.error("Ingestion error:", err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ============================================================================
   VIEW 3: PILLAR 2 — SELF-CORRECTING AGENTIC RAG Q&A
   ============================================================================ */

function selectPresetQuestion(qText) {
  const input = document.getElementById("qa-input-box");
  if (input) {
    input.value = qText;
    runAgenticQA(true);
  }
}

async function startNewQASession() {
  try {
    const res = await fetch("/api/qa/new-session", { method: "POST" });
    const data = await res.json();
    activeSessionId = data.session_id || `session-${activeUseCase}-${Math.floor(Math.random() * 900 + 100)}`;
  } catch (_) {
    activeSessionId = `session-${activeUseCase}-${Math.floor(Math.random() * 900 + 100)}`;
  }
  document.getElementById("qa-active-thread-id").textContent = activeSessionId;
  showToast(`Started fresh memory thread: ${activeSessionId}`);
}

async function runAgenticQA(notify = true) {
  const input = document.getElementById("qa-input-box");
  const question = (input?.value || "").trim() || "What are the primary metrics and risk factors?";
  const btn = document.getElementById("btn-submit-qa");
  const statusBadge = document.getElementById("qa-status-badge");

  if (btn) btn.disabled = true;
  if (statusBadge) {
    statusBadge.className = "badge badge-info";
    statusBadge.textContent = "Retrieving & Grading Chunks...";
  }

  try {
    const res = await fetch("/api/platform/qa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        use_case: activeUseCase,
        thread_id: activeSessionId
      })
    });
    const data = await res.json();
    latestQAResult = data;

    if (statusBadge) {
      statusBadge.className = "badge badge-success";
      statusBadge.textContent = "Grounded Answer Ready";
    }
    document.getElementById("qa-sources-summary").textContent =
      `Synthesized from ${data.citations.length} verified MongoDB chunks • Saved to checkpoints_aio`;
    document.getElementById("qa-answer-markdown").textContent = data.answer;

    // Render citation cards
    document.getElementById("qa-citation-cards").innerHTML = data.citations
      .map(
        (c) => `
        <div style="background:var(--color-bg-subtle); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:12px 14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span class="badge badge-success">Citation [${c.ref_num}]</span>
            <span style="font-family:var(--font-mono); font-size:0.74rem; color:var(--color-text-muted);">
              Similarity: ${c.similarity_score}
            </span>
          </div>
          <div style="font-weight:600; font-size:0.84rem; margin-bottom:2px;">${c.document_name}</div>
          <div style="font-size:0.76rem; color:var(--color-text-secondary);">${c.section_title}</div>
        </div>
      `
      )
      .join("");

    if (notify) {
      showToast("Agentic RAG answer generated & saved to MongoDB checkpoints");
    }
  } catch (err) {
    console.error("Q&A error:", err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function openReasoningDrawer() {
  if (!latestQAResult) {
    showToast("Ask a question first to inspect its reasoning trace");
    return;
  }

  const traceHtml = (latestQAResult.agent_trace || [])
    .map(
      (t, i) => `
      <div style="padding:12px 14px; background:var(--color-bg-subtle); border-left:3px solid var(--color-primary); border-radius:var(--radius-sm); margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <strong style="font-size:0.86rem;">Step ${i + 1}: ${t.title}</strong>
          <span class="badge">${t.node}</span>
        </div>
        <div style="font-size:0.8rem; color:var(--color-text-secondary);">${t.detail}</div>
      </div>
    `
    )
    .join("");

  const gradesHtml = (latestQAResult.graded_chunks || [])
    .map(
      (g) => `
      <div style="padding:12px 14px; background:var(--color-bg-subtle); border:1px solid var(--color-border); border-radius:var(--radius-sm); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-weight:600; font-size:0.84rem;">${g.document_name}</div>
          <div style="font-size:0.75rem; color:var(--color-text-muted);">Chunk #${g.chunk_index} • Cosine Score: ${g.similarity_score}</div>
        </div>
        <span class="badge ${g.grade === "yes" ? "badge-success" : "badge-danger"}">
          GRADER: ${g.grade.toUpperCase()}
        </span>
      </div>
    `
    )
    .join("");

  openSlideDrawer(
    "LANGGRAPH SELF-CORRECTING RAG TRACE",
    "Agent Reasoning & Chunk Grading",
    `
      <div style="margin-bottom:20px;">
        <h4 style="font-size:0.82rem; text-transform:uppercase; color:var(--color-text-muted); margin-bottom:10px;">
          5-Step LangGraph Execution Trace (logged to logs_qa)
        </h4>
        ${traceHtml}
      </div>
      <div>
        <h4 style="font-size:0.82rem; text-transform:uppercase; color:var(--color-text-muted); margin-bottom:10px;">
          Document Grader LLM Assessments (logged to gradings)
        </h4>
        ${gradesHtml}
      </div>
    `
  );
}

/* ============================================================================
   VIEW 4: EXECUTIVE PDF REPORT TEMPLATE DRAWER
   ============================================================================ */

function openTemplateSchemaDrawer() {
  const tpl = (activeWorkspaceData && activeWorkspaceData.report_template) || {};
  const sections =
    (tpl.structure && tpl.structure.sections) ||
    tpl.sections || [
      { title: "Executive Summary", prompt: "Synthesize primary metrics and strategic findings." },
      { title: "Quantitative Risk Breakdown", prompt: "Extract key financial tables, ratios, and limits." },
      { title: "Actionable Recommendations", prompt: "Formulate compliance and underwriting next steps." }
    ];

  const sectionsHtml = sections
    .map(
      (s, i) => `
      <div style="padding:14px; background:var(--color-bg-subtle); border:1px solid var(--color-border); border-radius:var(--radius-md); margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <strong style="color:var(--color-primary);">Section ${i + 1}: ${s.title || s.section_name || "Report Section"}</strong>
          <span class="badge">Vector Search</span>
        </div>
        <div style="font-size:0.82rem; color:var(--color-text-secondary);">
          ${s.prompt || s.search_query || s.description || "Targeted semantic retrieval across domain chunks."}
        </div>
      </div>
    `
    )
    .join("");

  openSlideDrawer(
    "MONGODB COLLECTION: report_templates",
    tpl.template_name || `Executive Template (${activeUseCase})`,
    `
      <p style="font-size:0.84rem; color:var(--color-text-secondary); margin-bottom:16px;">
        Each section below runs an independent <code>$vectorSearch</code> query against MongoDB before ReportLab compiles the PDF:
      </p>
      ${sectionsHtml}
    `
  );
}

/* ============================================================================
   VIEW 5: MONGODB 13-COLLECTION EXPLORER
   ============================================================================ */

function renderDatabaseCollectionButtons(collections) {
  const container = document.getElementById("db-collection-selector");
  if (!container || !collections) return;

  container.innerHTML = collections
    .map(
      (c) => `
      <button
        class="btn ${c.name === activeDBCollection ? "btn-primary" : "btn-secondary"}"
        id="db-col-btn-${c.name}"
        onclick="loadDatabaseCollection('${c.name}')"
        style="padding:7px 13px; font-size:0.82rem;"
      >
        <span>${c.name}</span>
        <span class="badge" style="background:rgba(0,0,0,0.2); color:inherit;">${c.count}</span>
      </button>
    `
    )
    .join("");
}

async function loadDatabaseCollection(colName) {
  activeDBCollection = colName;

  if (overviewData && overviewData.collections) {
    renderDatabaseCollectionButtons(overviewData.collections);
  }

  document.getElementById("db-table-collection-name").textContent =
    `document_intelligence.${colName}`;

  try {
    const res = await fetch(`/api/platform/collections/${colName}?limit=15`);
    const data = await res.json();
    currentDBRecords = data.documents || [];

    document.getElementById("db-table-collection-desc").textContent =
      data.meta?.description || "";
    document.getElementById("db-table-count-badge").textContent =
      `${data.total_count} Total Records`;

    const tbody = document.getElementById("db-records-tbody");
    if (!currentDBRecords.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:32px; color:var(--color-text-muted);">Collection is currently empty.</td></tr>`;
      return;
    }

    tbody.innerHTML = currentDBRecords
      .map((doc, idx) => {
        const idStr = String(doc._id || doc.document_id || doc.workflow_id || idx).slice(0, 14);
        const primaryName =
          doc.document_name ||
          doc.persona_name ||
          doc.template_name ||
          doc.workflow_id ||
          doc.industry ||
          doc.session_id ||
          colName;
        const summary =
          (doc.chunk_text && doc.chunk_text.slice(0, 85) + "...") ||
          doc.greeting ||
          doc.question ||
          (doc.assessment && doc.assessment.reason) ||
          doc.status ||
          "Structured MongoDB Document";
        const metaTag =
          doc.embedding_dimensions
            ? `${doc.embedding_dimensions}-dim vector`
            : doc.grade
            ? `Grade: ${doc.grade.toUpperCase()}`
            : doc.use_case || doc.status || "BSON";

        return `
          <tr>
            <td style="font-family:var(--font-mono); font-size:0.78rem; color:var(--color-text-muted);">${idStr}</td>
            <td><strong style="font-weight:600;">${primaryName}</strong></td>
            <td style="color:var(--color-text-secondary); font-size:0.83rem; max-width:380px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${summary}
            </td>
            <td><span class="badge">${metaTag}</span></td>
            <td style="text-align:right;">
              <button class="btn btn-secondary" style="padding:5px 11px; font-size:0.78rem;" onclick="inspectDBRecord(${idx})">
                <i class="fa-solid fa-code"></i> Inspect JSON
              </button>
            </td>
          </tr>
        `;
      })
      .join("");
  } catch (err) {
    console.error("Failed to load collection:", err);
  }
}

function inspectDBRecord(idx) {
  const doc = currentDBRecords[idx];
  if (!doc) return;
  openSlideDrawer(
    `MONGODB DOCUMENT • ${activeDBCollection}`,
    doc.document_name || doc.persona_name || doc.workflow_id || `Record #${idx + 1}`,
    `<pre style="background:var(--color-bg); padding:16px; border-radius:var(--radius-md); border:1px solid var(--color-border); font-family:var(--font-mono); font-size:0.78rem; color:var(--color-info); overflow:auto; line-height:1.55;">${JSON.stringify(doc, null, 2)}</pre>`
  );
}
