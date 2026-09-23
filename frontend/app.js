// Interactive Workbench Controller for FSI Document Intelligence
let activeUseCase = "credit_rating";
let platformOverviewData = null;
let activeCollection = "chunks";

const DEFAULT_SUGGESTED_QUESTIONS = {
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

document.addEventListener("DOMContentLoaded", async () => {
  const selector = document.getElementById("global-usecase-selector");
  if (selector) {
    selector.addEventListener("change", (e) => {
      selectUseCase(e.target.value);
    });
  }

  await loadPlatformOverview();
  await selectUseCase("credit_rating");
  await loadVaultDocuments();
  await inspectMongoCollection("chunks");
});

function scrollToSection(sectionId) {
  const el = document.getElementById(sectionId);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function loadPlatformOverview() {
  try {
    const res = await fetch("/api/platform/overview");
    const data = await res.json();
    platformOverviewData = data;

    const statusText = document.getElementById("mongo-status-text");
    if (statusText) {
      statusText.textContent = `MongoDB Live (${data.total_collections} Collections • ${data.total_records} Docs)`;
    }

    renderUseCaseCards(data.use_cases);
    renderCollectionPills(data.collections);
  } catch (err) {
    console.error("Failed to load platform overview:", err);
  }
}

function renderUseCaseCards(useCasesMap) {
  const container = document.getElementById("usecase-cards-container");
  if (!container || !useCasesMap) return;

  container.innerHTML = Object.entries(useCasesMap)
    .map(([ucKey, meta]) => {
      const isSelected = ucKey === activeUseCase;
      return `
        <div class="usecase-card ${isSelected ? "selected" : ""}" id="uc-card-${ucKey}" onclick="selectUseCase('${ucKey}')">
          <div>
            <div class="uc-card-top">
              <div class="uc-icon-box" style="color:${meta.color};">
                <i class="fa-solid ${meta.icon}"></i>
              </div>
              <span class="uc-badge">${meta.badge}</span>
            </div>
            <div class="uc-title">${meta.title}</div>
            <p class="uc-summary" style="margin-top:0.45rem;">${meta.summary}</p>
          </div>
          <div class="uc-footer">
            <span><i class="fa-solid fa-file-circle-check"></i> ${meta.sample_docs.length} Seed Docs</span>
            <span>${isSelected ? "✓ Active Workspace" : "Load Domain →"}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

async function selectUseCase(useCaseKey) {
  activeUseCase = useCaseKey;

  // Sync top dropdown
  const selector = document.getElementById("global-usecase-selector");
  if (selector && selector.value !== useCaseKey) {
    selector.value = useCaseKey;
  }

  // Highlight active card
  document.querySelectorAll(".usecase-card").forEach((c) => c.classList.remove("selected"));
  const activeCard = document.getElementById(`uc-card-${useCaseKey}`);
  if (activeCard) activeCard.classList.add("selected");

  // Update thread badge
  const threadBadge = document.getElementById("qa-thread-badge");
  if (threadBadge) {
    threadBadge.textContent = `session-${useCaseKey}-001`;
  }

  try {
    const res = await fetch(`/api/platform/use-case/${useCaseKey}`);
    const ws = await res.json();

    // 1. Update Persona Banner & Question Chips
    const persona = ws.persona || {};
    document.getElementById("qa-persona-name").textContent =
      persona.persona_name || ws.meta.title + " Specialist";
    document.getElementById("qa-persona-greeting").textContent =
      persona.greeting || ws.meta.summary;

    const questions =
      (persona.example_questions && persona.example_questions.length
        ? persona.example_questions
        : null) ||
      DEFAULT_SUGGESTED_QUESTIONS[useCaseKey] ||
      DEFAULT_SUGGESTED_QUESTIONS.credit_rating;

    const chipsContainer = document.getElementById("qa-suggested-chips");
    chipsContainer.innerHTML = questions
      .map(
        (q) =>
          `<button class="question-chip" onclick="askPresetQuestion(${JSON.stringify(q).replace(/"/g, "&quot;")})">
            <i class="fa-regular fa-comment-dots"></i> ${q}
          </button>`
      )
      .join("");

    // Pre-fill first question in input box
    const qInput = document.getElementById("qa-question-input");
    if (qInput && questions[0]) {
      qInput.value = questions[0];
    }

    // 2. Update PDF Report Preview & Template Studio
    const pdfIframe = document.getElementById("pdf-preview-iframe");
    if (pdfIframe) {
      pdfIframe.src = ws.pdf_preview_url;
    }
    document.getElementById("btn-download-pdf").href = ws.pdf_download_url;
    document.getElementById("btn-open-pdf-tab").href = ws.pdf_preview_url;
    document.getElementById("pdf-preview-label").textContent = `fsi / ${useCaseKey}`;

    renderReportTemplate(ws.report_template, useCaseKey);

    // 3. Trigger Ingestion Preview & Initial Q&A so the user sees immediate results!
    await triggerSimulatedIngestion(false);
    await submitAgenticQA();
  } catch (err) {
    console.error("Error loading use case workspace:", err);
  }
}

function renderReportTemplate(templateDoc, useCaseKey) {
  const titleEl = document.getElementById("report-template-name");
  const listEl = document.getElementById("report-sections-list");
  if (!listEl) return;

  if (!templateDoc) {
    titleEl.textContent = `Executive Report Template (${useCaseKey})`;
    listEl.innerHTML = `<div class="doc-item-row">Standard 4-Section Executive Template Active</div>`;
    return;
  }

  titleEl.textContent = `${templateDoc.template_name || "Executive Industry Report"} (v1.0)`;
  const sections =
    (templateDoc.structure && templateDoc.structure.sections) ||
    templateDoc.sections ||
    [];

  if (!sections.length) {
    listEl.innerHTML = `
      <div class="doc-item-row"><div><strong>1. Executive Summary</strong><div style="font-size:0.75rem;color:var(--text-secondary);">Synthesizes overarching metrics and key takeaways from vector chunks.</div></div></div>
      <div class="doc-item-row"><div><strong>2. Deep-Dive Quantitative Analysis</strong><div style="font-size:0.75rem;color:var(--text-secondary);">Extracts financial ratios, tables, and visual chart metrics.</div></div></div>
      <div class="doc-item-row"><div><strong>3. Risk &amp; Compliance Matrix</strong><div style="font-size:0.75rem;color:var(--text-secondary);">Evaluates regulatory, credit, and operational risk indicators.</div></div></div>
    `;
    return;
  }

  listEl.innerHTML = sections
    .map(
      (sec, idx) => `
      <div class="doc-item-row" style="flex-direction:column; align-items:flex-start; gap:0.35rem;">
        <div style="display:flex; justify-content:space-between; width:100%;">
          <span style="font-weight:700; font-size:0.86rem; color:var(--mongo-green);">Section ${idx + 1}: ${sec.title || sec.section_name || "Analysis Section"}</span>
          <span class="uc-badge">Semantic Vector Query</span>
        </div>
        <div style="font-size:0.76rem; color:var(--text-secondary); line-height:1.45;">
          <strong>Search Prompt:</strong> ${sec.prompt || sec.search_query || sec.description || "Targeted vector search across ingested use-case chunks."}
        </div>
      </div>
    `
    )
    .join("");
}

async function loadVaultDocuments() {
  const listEl = document.getElementById("vault-docs-list");
  const badgeEl = document.getElementById("vault-count-badge");
  if (!listEl) return;

  try {
    const res = await fetch("/api/upload/documents");
    const data = await res.json();
    const files = (data.by_industry && data.by_industry.fsi && data.by_industry.fsi.files) || data.recent_files || [];

    badgeEl.textContent = `${files.length} Files Ready (${data.total_size_mb || 2.58} MB)`;

    listEl.innerHTML = files
      .map((f) => {
        const ext = f.filename.split(".").pop().toLowerCase();
        const isCurrentUC = f.use_case === activeUseCase;
        return `
          <div class="doc-item-row" style="${isCurrentUC ? "border-color:rgba(0,237,100,0.45); background:rgba(0,237,100,0.05);" : ""}">
            <div class="doc-item-left">
              <span class="doc-ext-badge">${ext}</span>
              <div>
                <div style="font-weight:600; font-size:0.84rem;">${f.filename}</div>
                <div style="font-size:0.72rem; color:var(--text-secondary); font-family:var(--font-mono);">
                  Use Case: <strong>${f.use_case}</strong> • Path: ${f.ingestion_path}
                </div>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span class="uc-badge">${f.size_mb} MB</span>
              ${isCurrentUC ? '<span class="grade-pill-yes">ACTIVE DOMAIN</span>' : ""}
            </div>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    console.error("Error loading vault documents:", err);
  }
}

async function handleVaultUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById("upload-status-msg");
  statusEl.textContent = `Uploading ${file.name} to fsi/${activeUseCase}...`;

  const formData = new FormData();
  formData.append("files", file);
  formData.append("industry", "fsi");
  formData.append("use_case", activeUseCase);

  try {
    const res = await fetch("/api/upload/documents", {
      method: "POST",
      body: formData
    });
    const result = await res.json();
    if (res.ok) {
      statusEl.textContent = `✅ Uploaded ${file.name} to fsi/${activeUseCase}! Refreshing vault...`;
      await loadVaultDocuments();
    } else {
      statusEl.textContent = `⚠️ Upload notice: ${result.detail || "Check file extension (.pdf/.docx) & size"}`;
    }
  } catch (err) {
    statusEl.textContent = `⚠️ Error uploading file: ${err.message}`;
  }
}

async function triggerSimulatedIngestion(animateDelay = true) {
  const btn = document.getElementById("btn-run-ingestion");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Running 5-Agent Supervisor Pipeline...`;
  }

  // Reset agent node styles
  for (let i = 1; i <= 5; i++) {
    const card = document.getElementById(`agent-card-${i}`);
    if (card) card.classList.remove("running", "completed");
  }

  try {
    const res = await fetch("/api/platform/simulate-ingestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ use_case: activeUseCase, source_type: "@local@" })
    });
    const data = await res.json();

    // Animate through the 5 agents sequentially
    for (let i = 1; i <= 5; i++) {
      const card = document.getElementById(`agent-card-${i}`);
      if (card) card.classList.add("running");
      if (animateDelay) {
        await new Promise((r) => setTimeout(r, 220));
      }
      if (card) {
        card.classList.remove("running");
        card.classList.add("completed");
      }
    }

    // Populate Evaluator Agent Output
    const step3 = data.steps[2].details;
    const evalBox = document.getElementById("evaluator-output-box");
    evalBox.innerHTML = `
      <div style="background:rgba(0,237,100,0.08); border:1px solid rgba(0,237,100,0.28); padding:0.65rem; border-radius:8px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">
          <strong style="color:var(--mongo-green);">✅ ACCEPTED (${step3.accepted_files.length} Domain Files)</strong>
          <span class="grade-pill-yes">Score: 0.96</span>
        </div>
        <div style="font-family:var(--font-mono); font-size:0.72rem; color:var(--text-secondary);">
          ${step3.accepted_files.join(", ")}
        </div>
      </div>
      <div style="background:rgba(244,63,94,0.09); border:1px solid rgba(244,63,94,0.3); padding:0.65rem; border-radius:8px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">
          <strong style="color:var(--accent-rose);">🚫 REJECTED: ${step3.rejected_file.document_name}</strong>
          <span class="grade-pill-no">Score: ${step3.rejected_file.relevance_score}</span>
        </div>
        <div style="font-size:0.74rem; color:var(--text-secondary);">
          ${step3.rejected_file.reason}
        </div>
      </div>
    `;

    // Populate Claude Vision Markdown Preview
    const step4 = data.steps[3].details;
    document.getElementById("vision-markdown-box").textContent = step4.extracted_markdown_preview;

    // Populate VoyageAI Context-3 1024-Dim Vector Visualizer
    const step5 = data.steps[4].details;
    const firstChunk = (step5.chunks_stored && step5.chunks_stored[0]) || {};
    const vecPreview = firstChunk.embedding_preview || [0.041, -0.028, 0.064, 0.019, -0.052, 0.071, -0.014, 0.038, 0.029, -0.044, 0.058, -0.031];

    const barsEl = document.getElementById("vector-bars-container");
    barsEl.innerHTML = Array.from({ length: 28 }, (_, idx) => {
      const v = Math.abs(vecPreview[idx % vecPreview.length] || 0.03);
      const heightPct = Math.min(98, Math.max(18, Math.round(v * 1150)));
      return `<div class="vec-bar" style="height:${heightPct}%"></div>`;
    }).join("");

    document.getElementById("vector-numbers-preview").textContent =
      `embedding[0..11] = [${vecPreview.join(", ")}, ... +1012 more floats] (1024 dims)`;
  } catch (err) {
    console.error("Ingestion simulation failed:", err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-bolt"></i> Run 5-Agent Ingestion Workflow`;
    }
  }
}

function askPresetQuestion(questionText) {
  const input = document.getElementById("qa-question-input");
  if (input) {
    input.value = questionText;
    submitAgenticQA();
  }
}

async function submitAgenticQA() {
  const input = document.getElementById("qa-question-input");
  const question = (input && input.value.trim()) || "Summarize the key financial findings and risk metrics.";
  const btn = document.getElementById("btn-ask-qa");

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Running Agentic RAG...`;
  }

  try {
    const res = await fetch("/api/platform/qa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: question,
        use_case: activeUseCase,
        thread_id: `session-${activeUseCase}-001`
      })
    });
    const data = await res.json();

    // Render Answer
    document.getElementById("qa-answer-output").textContent = data.answer;
    document.getElementById("qa-citation-count").textContent = `${data.citations.length} Verified MongoDB Sources`;

    // Render Citations
    const citEl = document.getElementById("qa-citations-list");
    citEl.innerHTML = data.citations
      .map(
        (c) => `
        <div class="doc-item-row" style="padding:0.65rem 0.9rem;">
          <div style="display:flex; align-items:center; gap:0.65rem;">
            <span class="grade-pill-yes">[Source ${c.ref_num}]</span>
            <div>
              <div style="font-weight:700; font-size:0.82rem;">${c.document_name}</div>
              <div style="font-size:0.73rem; color:var(--text-secondary);">Section: ${c.section_title}</div>
            </div>
          </div>
          <div style="display:flex; gap:0.5rem; align-items:center;">
            ${c.has_visual_references ? '<span class="uc-badge" style="color:var(--accent-cyan);"><i class="fa-solid fa-table"></i> Visual Table</span>' : ""}
            <span class="uc-badge">Cosine Score: ${c.similarity_score}</span>
          </div>
        </div>
      `
      )
      .join("");

    // Render LangGraph Trace
    const traceEl = document.getElementById("qa-trace-container");
    traceEl.innerHTML = data.agent_trace
      .map(
        (t, idx) => `
        <div class="trace-step-item">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.2rem;">
            <span style="font-weight:700; font-size:0.82rem; color:var(--mongo-green);">Step ${idx + 1}: ${t.title}</span>
            <span style="font-family:var(--font-mono); font-size:0.68rem; color:var(--text-secondary);">${t.node}</span>
          </div>
          <div style="font-size:0.76rem; color:var(--text-secondary);">${t.detail}</div>
        </div>
      `
      )
      .join("");

    // Render Graded Chunks
    const gradesEl = document.getElementById("qa-graded-chunks-container");
    gradesEl.innerHTML = data.graded_chunks
      .map(
        (g) => `
        <div class="doc-item-row" style="padding:0.6rem 0.85rem;">
          <div style="font-size:0.78rem;">
            <strong>${g.document_name}</strong> <span style="color:var(--text-secondary);">(Chunk #${g.chunk_index})</span>
          </div>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span class="uc-badge">Sim: ${g.similarity_score}</span>
            <span class="${g.grade === "yes" ? "grade-pill-yes" : "grade-pill-no"}">
              GRADER: ${g.grade.toUpperCase()}
            </span>
          </div>
        </div>
      `
      )
      .join("");
  } catch (err) {
    console.error("Agentic QA error:", err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Ask Agentic RAG`;
    }
  }
}

function renderCollectionPills(collections) {
  const grid = document.getElementById("mongo-collections-grid");
  if (!grid || !collections) return;

  grid.innerHTML = collections
    .map(
      (c) => `
      <button class="col-pill-btn ${c.name === activeCollection ? "active" : ""}" id="col-pill-${c.name}" onclick="inspectMongoCollection('${c.name}')">
        <div>
          <div style="font-weight:700; font-size:0.84rem;">${c.name}</div>
          <div style="font-size:0.68rem; color:var(--text-secondary);">${c.category}</div>
        </div>
        <span class="col-count-tag">${c.count}</span>
      </button>
    `
    )
    .join("");
}

async function inspectMongoCollection(colName) {
  activeCollection = colName;
  document.querySelectorAll(".col-pill-btn").forEach((b) => b.classList.remove("active"));
  const activeBtn = document.getElementById(`col-pill-${colName}`);
  if (activeBtn) activeBtn.classList.add("active");

  const titleEl = document.getElementById("inspector-collection-title");
  const descEl = document.getElementById("inspector-collection-desc");
  const preEl = document.getElementById("mongo-json-inspector");

  titleEl.innerHTML = `<i class="fa-solid fa-database" style="color:var(--mongo-green);"></i> Collection: <code>document_intelligence.${colName}</code>`;
  preEl.textContent = `Fetching live documents from document_intelligence.${colName}...`;

  try {
    const res = await fetch(`/api/platform/collections/${colName}?limit=10`);
    const data = await res.json();
    descEl.textContent = `${data.meta.description || ""} (${data.total_count} total documents)`;
    preEl.textContent = JSON.stringify(data.documents, null, 2);
  } catch (err) {
    preEl.textContent = `Error loading collection ${colName}: ${err.message}`;
  }
}

async function runFullGuidedDemo() {
  scrollToSection("step-3-ingestion");
  await triggerSimulatedIngestion(true);
  await new Promise((r) => setTimeout(r, 700));
  scrollToSection("step-4-rag");
  await submitAgenticQA();
}
