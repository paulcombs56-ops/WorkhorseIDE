(function initWorkhorseChatRenderModule(globalScope) {
  function createAppendChatMessage(runtime) {
    const {
      aiService,
      isNearBottom,
      scrollToBottom,
      insertCodeIntoEditor,
      copyCodeToClipboard,
      setAiPanelOutput,
      loadFileExplorer,
    } = runtime;

    let previewOffsetResizeBound = false;

    function countDiffChanges(diffText = "") {
      const lines = String(diffText || "").split("\n");
      let additions = 0;
      let deletions = 0;

      lines.forEach((line) => {
        if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) {
          return;
        }
        if (line.startsWith("+")) additions += 1;
        if (line.startsWith("-")) deletions += 1;
      });

      return { additions, deletions };
    }

    function groupPreviewsByPath(previews = []) {
      const grouped = new Map();

      previews.forEach((item) => {
        const path = item.path || "(workspace)";
        if (!grouped.has(path)) {
          grouped.set(path, []);
        }
        grouped.get(path).push(item);
      });

      return Array.from(grouped.entries()).map(([path, items]) => ({ path, items }));
    }

    function updatePreviewStickyOffset(container) {
      if (!container) return;
      const controls = container.querySelector(".chat-preview-controls");
      const controlsHeight = controls ? controls.offsetHeight : 0;
      const headerTop = controlsHeight > 0 ? controlsHeight + 4 : 0;
      container.style.setProperty("--chat-preview-summary-top", `${headerTop}px`);
    }

    function refreshAllPreviewStickyOffsets() {
      document.querySelectorAll(".chat-preview-container").forEach((container) => {
        updatePreviewStickyOffset(container);
      });
    }

    function bindPreviewOffsetResizeHandler() {
      if (previewOffsetResizeBound) return;

      const onResize = () => {
        refreshAllPreviewStickyOffsets();
      };

      window.addEventListener("resize", onResize);
      previewOffsetResizeBound = true;
    }

    function renderPreviewGroups(container, previews = [], errors = []) {
      bindPreviewOffsetResizeHandler();
      container.innerHTML = "";

      if (previews.length === 0 && errors.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("chat-preview-empty");
        empty.textContent = "No preview available.";
        container.appendChild(empty);
        return;
      }

      const grouped = groupPreviewsByPath(previews);

      let totalAdditions = 0;
      let totalDeletions = 0;
      previews.forEach((item) => {
        const totals = countDiffChanges(item.diff || "");
        totalAdditions += totals.additions;
        totalDeletions += totals.deletions;
      });

      const summaryChip = document.createElement("div");
      summaryChip.classList.add("chat-preview-chip");
      let chipMode = "counts";
      const totalChangedLines = totalAdditions + totalDeletions;

      const setChipText = () => {
        if (chipMode === "percent") {
          const addPct = totalChangedLines > 0 ? Math.round((totalAdditions / totalChangedLines) * 100) : 0;
          const delPct = totalChangedLines > 0 ? Math.round((totalDeletions / totalChangedLines) * 100) : 0;
          summaryChip.textContent = `${grouped.length} file(s) • ${previews.length} action(s) • +${addPct}% -${delPct}%`;
          return;
        }

        summaryChip.textContent = `${grouped.length} file(s) • ${previews.length} action(s) • +${totalAdditions} -${totalDeletions}`;
      };

      summaryChip.title = "Click to toggle count/percent view";
      summaryChip.onclick = () => {
        chipMode = chipMode === "counts" ? "percent" : "counts";
        setChipText();
      };
      setChipText();
      container.appendChild(summaryChip);

      if (grouped.length > 1) {
        const controls = document.createElement("div");
        controls.classList.add("chat-preview-controls");

        const expandBtn = document.createElement("button");
        expandBtn.classList.add("chat-preview-toggle-btn");
        expandBtn.textContent = "Expand all";
        expandBtn.onclick = () => {
          container.querySelectorAll(".chat-preview-group").forEach((item) => {
            item.open = true;
          });
        };

        const collapseBtn = document.createElement("button");
        collapseBtn.classList.add("chat-preview-toggle-btn");
        collapseBtn.textContent = "Collapse all";
        collapseBtn.onclick = () => {
          container.querySelectorAll(".chat-preview-group").forEach((item, index) => {
            item.open = index === 0;
          });
        };

        controls.appendChild(expandBtn);
        controls.appendChild(collapseBtn);
        container.appendChild(controls);
      }

      grouped.forEach((group, index) => {
        const details = document.createElement("details");
        details.classList.add("chat-preview-group");
        if (index === 0) {
          details.open = true;
        }

        const summary = document.createElement("summary");
        summary.classList.add("chat-preview-summary");

        let additions = 0;
        let deletions = 0;
        group.items.forEach((item) => {
          const totals = countDiffChanges(item.diff || "");
          additions += totals.additions;
          deletions += totals.deletions;
        });

        summary.textContent = `${group.path} • ${group.items.length} action(s) • +${additions} -${deletions}`;
        details.appendChild(summary);

        const content = document.createElement("div");
        content.classList.add("chat-preview-content");

        group.items.forEach((item) => {
          const itemBlock = document.createElement("div");
          itemBlock.classList.add("chat-preview-item");

          const meta = document.createElement("div");
          meta.classList.add("chat-preview-meta");
          meta.textContent = `[${item.type}] ${item.summary || ""}`.trim();
          itemBlock.appendChild(meta);

          const diffBlock = document.createElement("pre");
          diffBlock.classList.add("chat-code", "chat-diff");
          diffBlock.textContent = item.diff || "(no content changes)";
          itemBlock.appendChild(diffBlock);

          content.appendChild(itemBlock);
        });

        details.appendChild(content);
        container.appendChild(details);
      });

      if (errors.length > 0) {
        const errorBlock = document.createElement("pre");
        errorBlock.classList.add("chat-code");
        errorBlock.textContent = `Preview errors:\n${errors.map((entry) => `- ${entry}`).join("\n")}`;
        container.appendChild(errorBlock);
      }

      updatePreviewStickyOffset(container);
    }

    function appendChatMessage(
      role,
      message,
      code = "",
      actionsExecuted = [],
      actionErrors = [],
      actionsProposed = [],
      plan = [],
      verificationCommands = []
    ) {
      const messages = document.getElementById("chat-messages");
      const shouldAutoScroll = isNearBottom(messages);
      const bubble = document.createElement("div");
      bubble.classList.add("chat-message");
      bubble.classList.add(role === "user" ? "chat-user" : "chat-assistant");
      bubble.textContent = message;

      if (code) {
        const codeBlock = document.createElement("pre");
        codeBlock.classList.add("chat-code");
        codeBlock.textContent = code;
        bubble.appendChild(codeBlock);

        const insertBtn = document.createElement("button");
        insertBtn.classList.add("chat-insert-btn");
        insertBtn.textContent = "Insert Code";
        insertBtn.onclick = () => insertCodeIntoEditor(code);
        bubble.appendChild(insertBtn);

        const copyBtn = document.createElement("button");
        copyBtn.classList.add("chat-copy-btn");
        copyBtn.textContent = "Copy Code";
        copyBtn.onclick = () => copyCodeToClipboard(code);
        bubble.appendChild(copyBtn);
      }

      if (plan && plan.length > 0) {
        const planBlock = document.createElement("div");
        planBlock.classList.add("chat-plan-block");

        const title = document.createElement("div");
        title.classList.add("chat-plan-title");
        title.textContent = "Plan";
        planBlock.appendChild(title);

        const list = document.createElement("ol");
        list.classList.add("chat-plan-list");
        plan.forEach((step) => {
          const item = document.createElement("li");
          item.textContent = step;
          list.appendChild(item);
        });
        planBlock.appendChild(list);
        bubble.appendChild(planBlock);
      }

      if (verificationCommands && verificationCommands.length > 0) {
        const verifyBlock = document.createElement("div");
        verifyBlock.classList.add("chat-plan-block");

        const title = document.createElement("div");
        title.classList.add("chat-plan-title");
        title.textContent = "Verification";
        verifyBlock.appendChild(title);

        const list = document.createElement("ul");
        list.classList.add("chat-plan-list");
        verificationCommands.forEach((cmd) => {
          const item = document.createElement("li");
          item.textContent = cmd;
          list.appendChild(item);
        });
        verifyBlock.appendChild(list);
        bubble.appendChild(verifyBlock);
      }

      if (actionsExecuted && actionsExecuted.length > 0) {
        const executedBlock = document.createElement("pre");
        executedBlock.classList.add("chat-code");
        executedBlock.textContent = `Applied actions:\n${actionsExecuted.map((item) => `- ${item}`).join("\n")}`;
        bubble.appendChild(executedBlock);
      }

      if (actionErrors && actionErrors.length > 0) {
        const errorBlock = document.createElement("pre");
        errorBlock.classList.add("chat-code");
        errorBlock.textContent = `Action errors:\n${actionErrors.map((item) => `- ${item}`).join("\n")}`;
        bubble.appendChild(errorBlock);
      }

      if (actionsProposed && actionsProposed.length > 0) {
        const previewContainer = document.createElement("div");
        previewContainer.classList.add("chat-preview-container");
        previewContainer.textContent = "Generating diff preview...";
        bubble.appendChild(previewContainer);

        aiService
          .previewChatActions(actionsProposed)
          .then((previewResult) => {
            const previews = previewResult.previews || [];
            const errors = previewResult.errors || [];
            renderPreviewGroups(previewContainer, previews, errors);
          })
          .catch((error) => {
            previewContainer.textContent = `Preview failed: ${error.message}`;
          });

        const keepBtn = document.createElement("button");
        keepBtn.classList.add("chat-keep-btn");
        keepBtn.textContent = "Keep (Apply)";
        keepBtn.onclick = async () => {
          keepBtn.disabled = true;
          const applyResult = await aiService.applyChatActions(actionsProposed);
          appendChatMessage(
            "assistant",
            "Applied proposed actions.",
            "",
            applyResult.actions_executed || [],
            applyResult.action_errors || [],
            []
          );
          setAiPanelOutput(
            JSON.stringify(
              {
                applied: applyResult.actions_executed || [],
                errors: applyResult.action_errors || [],
              },
              null,
              2
            )
          );
          await loadFileExplorer();
          keepBtn.textContent = "Applied";
        };
        bubble.appendChild(keepBtn);

        const undoBtn = document.createElement("button");
        undoBtn.classList.add("chat-undo-btn");
        undoBtn.textContent = "Undo Last";
        undoBtn.onclick = async () => {
          undoBtn.disabled = true;
          const undoResult = await aiService.undoLastChatActions();
          appendChatMessage("assistant", "Undo result:", "", undoResult.undone || [], undoResult.errors || [], []);
          setAiPanelOutput(
            JSON.stringify(
              {
                undone: undoResult.undone || [],
                errors: undoResult.errors || [],
              },
              null,
              2
            )
          );
          undoBtn.disabled = false;
        };
        bubble.appendChild(undoBtn);
      }

      messages.appendChild(bubble);
      if (shouldAutoScroll) {
        scrollToBottom(messages);
      }
    }

    return appendChatMessage;
  }

  globalScope.workhorseChatRenderModule = {
    createAppendChatMessage,
  };
})(window);