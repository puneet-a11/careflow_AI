document.addEventListener('DOMContentLoaded', function () {
  if (!Auth.requireAuth()) return;
  var chatBody = document.getElementById('aiChatBody');
  var chatInput = document.getElementById('aiChatInput');
  var sendButton = document.getElementById('aiSendBtn');
  var status = document.querySelector('.ai-sidebar .status-indicator');
  var attachBtn = document.getElementById('aiAttachBtn');
  var fileInput = document.getElementById('aiReportInput');
  var attachedRow = document.getElementById('aiAttachedFileRow');
  var attachedName = document.getElementById('aiAttachedFileName');
  var attachedClear = document.getElementById('aiAttachedFileClear');
  var attachedFile = null;
  var patientContext = document.getElementById('aiPatientContext');
  var deleteChatBtn = document.getElementById('aiDeleteChatBtn');

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character];
    });
  }
  function addMessage(text, sender) {
    var message = document.createElement('div');
    message.className = 'ai-chat-message ' + sender;
    message.innerHTML = '<div class="ai-chat-message-avatar"><i class="fa-solid ' + (sender === 'bot' ? 'fa-robot' : 'fa-user') + '"></i></div><div class="ai-chat-bubble">' + escapeHtml(text).replace(/\n/g, '<br>') + '</div>';
    chatBody.appendChild(message); chatBody.scrollTop = chatBody.scrollHeight;
  }
  function localResponse(text) {
    var value = text.toLowerCase();
    if (value.indexOf('critical') >= 0) return 'Please prioritise patients with critical severity and high triage scores. Review vital signs and contact the assigned clinician immediately.';
    if (value.indexOf('vital') >= 0) return 'Please share BP, heart rate, temperature, SpO₂ and respiratory rate for a structured vital-sign review.';
    return 'I can help with triage, symptoms, vitals, risk assessment and department recommendations. Please include the patient details you have. (This is the offline fallback - the backend AI assistant seems unreachable right now.)';
  }

  function clearAttachment() {
    attachedFile = null;
    fileInput.value = '';
    attachedRow.style.display = 'none';
    attachedName.textContent = '';
  }

  function setBusy(busy) {
    sendButton.disabled = busy;
    attachBtn.disabled = busy;
  }

  if (deleteChatBtn) {
    deleteChatBtn.addEventListener('click', async function () {
      if (!window.confirm('Delete this chat history? This cannot be undone.')) return;
      deleteChatBtn.disabled = true;
      try {
        await CareFlowAPI.deleteChatHistory();
        chatBody.querySelectorAll('.ai-chat-message').forEach(function (message) { message.remove(); });
        addMessage('Chat history deleted. How can I assist?', 'bot');
      } catch (error) {
        alert(error.message || 'Could not delete chat history.');
      } finally {
        deleteChatBtn.disabled = false;
      }
    });
  }

  // Reflects whichever patient the AI is currently focused on, so the
  // sidebar isn't stuck on "No patient selected" once a conversation
  // has actually resolved one.
  async function updatePatientContext(patientId) {
    if (!patientContext || !patientId) return;
    try {
      var patient = await CareFlowAPI.request('/patients/' + encodeURIComponent(patientId));
      patientContext.innerHTML =
        '<p style="margin:0;color:var(--color-primary-700);"><i class="fa-solid fa-user"></i> <strong>' +
        escapeHtml(patient.name) + ' (' + escapeHtml(patient.id) + ')</strong></p>' +
        '<p style="margin:0.25rem 0 0;font-size:0.75rem;color:var(--color-gray-500);">' +
        'Status: ' + escapeHtml(patient.status || 'N/A') + ' &middot; Severity: ' + escapeHtml(patient.severity || 'N/A') +
        '</p>';
    } catch (error) {
      // Patient may have just been deleted, or the request failed - leave
      // whatever the panel was already showing rather than erroring out.
    }
  }

  // After the AI writes to the database, refresh the shared client-side
  // cache immediately (patients/doctors/appointments/etc, see api.js
  // `hydrate()`) so every other page - and anything on this page reading
  // from cache - reflects the change without needing a manual reload.
  async function refreshAfterAiWrite(result) {
    if (!result || !result.data_changed) return;
    try {
      await CareFlowAPI.hydrate();
    } catch (error) {
      // Offline/network issue - nothing more we can do here; the write
      // itself already succeeded server-side.
    }
    if (result.affected_patient_id) {
      await updatePatientContext(result.affected_patient_id);
    }
  }

  async function sendMessage(text) {
    text = String(text || '').trim();
    var fileToSend = attachedFile;
    if (!text && !fileToSend) return;

    if (fileToSend) {
      addMessage(text ? (text + '\n[Attached: ' + fileToSend.name + ']') : ('[Attached: ' + fileToSend.name + ']'), 'user');
    } else {
      addMessage(text, 'user');
    }
    chatInput.value = '';
    clearAttachment();
    setBusy(true);

    try {
      var result = fileToSend
        ? await CareFlowAPI.analyzeReport(fileToSend, text)
        : await CareFlowAPI.chat(text);
      addMessage(result.response, 'bot');
      if (status) { status.textContent = 'Backend Connected'; status.classList.add('active'); }
      await refreshAfterAiWrite(result);
    } catch (error) {
      addMessage(localResponse(text || 'report'), 'bot');
      if (status) { status.textContent = 'Offline Assistant'; status.classList.remove('active'); }
    } finally {
      setBusy(false);
      chatInput.focus();
    }
  }

  sendButton.addEventListener('click', function () { sendMessage(chatInput.value); });
  chatInput.addEventListener('keydown', function (event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(chatInput.value); } });
  document.querySelectorAll('.ai-quick-action-btn').forEach(function (button) { button.addEventListener('click', function () { sendMessage(button.textContent.trim()); }); });

  if (attachBtn && fileInput) {
    attachBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'];
      if (allowed.indexOf(file.type) === -1) {
        addMessage('That file type isn\'t supported for report analysis. Please attach a PDF, PNG, JPEG, WEBP, or plain text file.', 'bot');
        fileInput.value = '';
        return;
      }
      attachedFile = file;
      attachedName.textContent = file.name;
      attachedRow.style.display = 'block';
      chatInput.focus();
    });
  }
  if (attachedClear) attachedClear.addEventListener('click', clearAttachment);

  // Restore this user's persisted chat history (feature: chat history
  // save) so a reload/restart doesn't lose the conversation. Falls back
  // silently to just the welcome message if the backend/history call
  // isn't available - never blocks the rest of the page from working.
  (async function restoreHistory() {
    if (!CareFlowAPI.getChatHistory) return;
    try {
      var history = await CareFlowAPI.getChatHistory(50);
      if (history && history.messages && history.messages.length) {
        history.messages.forEach(function (item) {
          addMessage(item.content, item.role === 'assistant' ? 'bot' : 'user');
        });
      }
    } catch (error) {
      // No history yet, or backend unreachable - the welcome message
      // already shown in the HTML is a perfectly fine starting state.
    }
  })();
});
