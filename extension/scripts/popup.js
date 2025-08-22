document.addEventListener('DOMContentLoaded', async function () {
  console.log('Popup DOM loaded');

  try {
    const status = await sendApiMessage({ action: 'checkServerStatus' });
    console.log('Server status:', status);

    if (!status.online) {
      updateConnectionStatus(false, status.error);
      return;
    }

    updateConnectionStatus(true);

    await loadSettings();

    setupEventListeners();

    await updateCurrentSite();

  } catch (error) {
    console.error('Error initializing popup:', error);
    updateConnectionStatus(false, error.message);
  }
});

async function loadSettings() {
  try {
    const settings = await sendApiMessage({ action: 'getSettings' });
    console.log('Current settings:', settings);

    updateSettingsUI(settings);
  } catch (error) {
    console.error('Error loading settings:', error);

    updateSettingsUI({
      extension_enabled: true,
      active_model: 'all',
      post_box: true,
      search_bar: true,
      comment_box: true,
      chat_box: true,
      prediction_method: 'backoff',
      suggestions_count: 3
    });
  }
}

function updateSettingsUI(settings) {
  const toggleBtn = document.getElementById('toggle-btn');
  const statusText = document.getElementById('status-text');

  if (settings.extension_enabled) {
    statusText.textContent = 'Active';
    toggleBtn.textContent = 'Disable';
    toggleBtn.classList.remove('disabled');
  } else {
    statusText.textContent = 'Disabled';
    toggleBtn.textContent = 'Enable';
    toggleBtn.classList.add('disabled');
  }

  const modelRadios = document.querySelectorAll('form.radio-buttons input[name="word"]');
  modelRadios.forEach(radio => {
    if (radio.value === settings.active_model) {
      radio.checked = true;
    }
  });

  const postBox = document.getElementById('postBox');
  const searchBar = document.getElementById('searchBar');
  const commentBox = document.getElementById('commentBox');
  const chatBox = document.getElementById('chatBox');

  if (postBox) postBox.checked = settings.post_box;
  if (searchBar) searchBar.checked = settings.search_bar;
  if (commentBox) commentBox.checked = settings.comment_box;
  if (chatBox) chatBox.checked = settings.chat_box;

  const methodRadios = document.querySelectorAll('div.model-type input[type="radio"]');
  methodRadios.forEach(radio => {
    if ((radio.value === 'poetic' && settings.prediction_method === 'backoff') ||
      (radio.value === 'formal' && settings.prediction_method === 'interpolation')) {
      radio.checked = true;
    }
  });

  const suggestionsInput = document.querySelector('.input-box[type="number"]');
  if (suggestionsInput) {
    suggestionsInput.value = settings.suggestions_count || 3;
  }
}

function setupEventListeners() {
  const toggleBtn = document.getElementById('toggle-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', async function () {
      try {
        const result = await sendApiMessage({ action: 'toggleExtension' });
        console.log('Toggle result:', result);

        const statusText = document.getElementById('status-text');

        if (result.enabled) {
          statusText.textContent = 'Active';
          this.textContent = 'Disable';
          this.classList.remove('disabled');
        } else {
          statusText.textContent = 'Disabled';
          this.textContent = 'Enable';
          this.classList.add('disabled');
        }
      } catch (error) {
        console.error('Error toggling extension:', error);
      }
    });
  }

  const modelRadios = document.querySelectorAll('form.radio-buttons input[name="word"]');
  modelRadios.forEach(radio => {
    radio.addEventListener('change', async function () {
      if (this.checked) {
        try {
          const result = await sendApiMessage({
            action: 'switchModel',
            model: this.value
          });
          console.log('Model switched:', result);
        } catch (error) {
          console.error('Error switching model:', error);
        }
      }
    });
  });

  ['postBox', 'searchBar', 'commentBox', 'chatBox'].forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('change', async function () {
        await updateServerSettings();
      });
    }
  });

  const methodRadios = document.querySelectorAll('div.model-type input[type="radio"]');
  methodRadios.forEach(radio => {
    radio.addEventListener('change', async function () {
      if (this.checked) {
        await updateServerSettings();
      }
    });
  });

  const suggestionsInput = document.querySelector('.input-box[type="number"]');
  if (suggestionsInput) {
    suggestionsInput.addEventListener('change', async function () {
      await updateServerSettings();
    });
  }
}

async function updateServerSettings() {
  try {
    const settings = {};

    const postBox = document.getElementById('postBox');
    const searchBar = document.getElementById('searchBar');
    const commentBox = document.getElementById('commentBox');
    const chatBox = document.getElementById('chatBox');

    if (postBox) settings.post_box = postBox.checked;
    if (searchBar) settings.search_bar = searchBar.checked;
    if (commentBox) settings.comment_box = commentBox.checked;
    if (chatBox) settings.chat_box = chatBox.checked;

    const suggestionsInput = document.querySelector('.input-box[type="number"]');
    if (suggestionsInput) {
      settings.suggestions_count = parseInt(suggestionsInput.value) || 3;
    }

    const methodRadios = document.querySelectorAll('div.model-type input[type="radio"]');
    methodRadios.forEach(radio => {
      if (radio.checked) {
        settings.prediction_method = radio.value === 'poetic' ? 'backoff' : 'interpolation';
      }
    });

    const result = await sendApiMessage({ action: "updateSettings", settings });
    console.log("Settings updated:", result);
    // tell content script(s) to update behavior
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: "settingsChanged", settings });
    }
  } catch (error) {
    console.error('Error updating settings:', error);
  }
}

async function updateCurrentSite() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentSiteElement = document.getElementById('current-site');

    if (tab && tab.url && currentSiteElement) {
      const url = new URL(tab.url);
      const siteName = url.hostname;
      currentSiteElement.textContent = siteName;
    } else if (currentSiteElement) {
      currentSiteElement.textContent = 'Unknown';
    }
  } catch (error) {
    console.error('Error getting current tab:', error);
    const currentSiteElement = document.getElementById('current-site');
    if (currentSiteElement) {
      currentSiteElement.textContent = 'Unknown';
    }
  }
}

function updateConnectionStatus(online, error = null) {
  const statusText = document.getElementById('status-text');
  const toggleBtn = document.getElementById('toggle-btn');

  if (!online) {
    if (statusText) {
      statusText.textContent = 'Offline';
      statusText.style.color = '#ff4444';
    }

    if (toggleBtn) {
      toggleBtn.disabled = true;
      toggleBtn.textContent = 'Server Offline';
    }

    const controls = document.querySelectorAll('input, button');
    controls.forEach(control => {
      if (control.id !== 'toggle-btn') {
        control.disabled = true;
      }
    });

    console.error('Server offline:', error);
  } else {
    if (statusText) {
      statusText.style.color = '';
    }

    if (toggleBtn) {
      toggleBtn.disabled = false;
    }

    const controls = document.querySelectorAll('input, button');
    controls.forEach(control => {
      control.disabled = false;
    });

    console.log('Server online and ready');
  }
}

function sendApiMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response.success) {
        reject(new Error(response.error));
      } else {
        resolve(response.data);
      }
    });
  });
}
