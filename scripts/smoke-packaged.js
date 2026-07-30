const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { removeTemporaryDirectory } = require('./smoke-cleanup');

const executable = process.argv[2];
if (!executable || !fs.existsSync(executable)) {
  console.error('Usage: node scripts/smoke-packaged.js <packaged executable>');
  process.exit(2);
}

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'crunchymurmur-packaged-smoke-'));
const port = 9400 + (process.pid % 400);
const launchArguments = [
  '--show',
  `--user-data-dir=${userData}`,
  `--remote-debugging-port=${port}`,
  '--remote-allow-origins=*',
];
// GitHub's unpacked Linux test directory cannot give chrome-sandbox root
// ownership and mode 4755. Installed AppImages and debs keep their normal
// sandbox; only this isolated CI smoke process bypasses it.
if (process.platform === 'linux' && process.env.CI) launchArguments.push('--no-sandbox');
const child = spawn(path.resolve(executable), launchArguments, {
  stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true,
});
let startupError = '';
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => {
  startupError = `${startupError}${chunk}`.slice(-16_000);
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function targets() {
  return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json());
}

async function findMainTarget() {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`Packaged app exited during startup with code ${child.exitCode}.\n${startupError}`);
    try {
      const target = (await targets()).find((item) => item.type === 'page' && item.url.endsWith('/ui/main.html'));
      if (target) return target;
    } catch {}
    await delay(250);
  }
  throw new Error(`Packaged app did not expose its main renderer within 30 seconds.\n${startupError}`);
}

async function command(target, method, params = {}) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Renderer debugging connection timed out.')), 5_000);
    socket.onopen = () => { clearTimeout(timer); resolve(); };
    socket.onerror = () => { clearTimeout(timer); reject(new Error('Renderer debugging connection failed.')); };
  });
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Renderer evaluation timed out.')), 15_000);
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };
    socket.send(JSON.stringify({
      id: 1,
      method,
      params,
    }));
  });
  socket.close();
  return result;
}

async function evaluate(target, expression) {
  const result = await command(target, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description
      || result.exceptionDetails.text
      || 'Unknown renderer exception';
    throw new Error(description);
  }
  return result.result.value;
}

(async () => {
  try {
    const target = await findMainTarget();
    await delay(500);
    const state = await evaluate(target, '({title:document.title,htmlLength:document.documentElement.outerHTML.length,bodyText:document.body?.innerText||"",styleSheets:document.styleSheets.length,scripts:document.scripts.length,brandMark:{tag:document.querySelector(".titlebar-mark")?.tagName,loaded:document.querySelector(".titlebar-mark")?.complete&&document.querySelector(".titlebar-mark")?.naturalWidth>0,source:document.querySelector(".titlebar-mark")?.getAttribute("src")}})');
    if (state.title !== 'CrunchyMurmur' || state.htmlLength < 1_000 || !state.bodyText.includes('CrunchyMurmur') || state.styleSheets < 1 || state.scripts < 1
        || state.brandMark.tag !== 'IMG' || !state.brandMark.loaded || state.brandMark.source !== '../assets/brand-mark.svg') {
      throw new Error(`Packaged renderer is blank or incomplete: ${JSON.stringify(state)}`);
    }
    console.log(`Packaged renderer loaded correctly (${state.htmlLength} HTML characters).`);

    await command(target, 'Emulation.setDeviceMetricsOverride', {
      width: 720,
      height: 560,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(150);
    const regression = await evaluate(target, `(async () => {
      for (let attempt = 0; attempt < 50 && !window.__lastSettings; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!window.__lastSettings) throw new Error('Renderer settings did not finish loading.');
      const keyText = () => document.getElementById('hotkeyDisplay').innerText;
      const painted = () => new Promise((resolve) => setTimeout(resolve, 75));
      document.querySelector('[data-tab="settings"]').click();
      document.querySelector('.settings-nav-item[data-settings-section="general"]').click();
      document.getElementById('recordHotkey').click();
      window.dispatchEvent(new KeyboardEvent('keydown', { key:'Control', code:'ControlLeft', ctrlKey:true, bubbles:true, cancelable:true }));
      const liveModifier = keyText();
      window.dispatchEvent(new KeyboardEvent('keydown', { key:'k', code:'KeyK', bubbles:true, cancelable:true }));
      const incompleteKey = keyText();
      window.dispatchEvent(new KeyboardEvent('keydown', { key:'k', code:'KeyK', ctrlKey:true, altKey:true, bubbles:true, cancelable:true }));
      const completedChord = keyText();

      const realPlatform = window.__lastSettings.platform;
      window.__lastSettings.platform = 'darwin';
      document.getElementById('recordHotkey').click();
      window.dispatchEvent(new KeyboardEvent('keydown', { key:'k', code:'KeyK', altKey:true, bubbles:true, cancelable:true }));
      const macChord = keyText();
      window.__lastSettings.platform = realPlatform;

      await window.wisper.saveSettings({ theme: 'light' });
      await painted();
      const lightTheme = {
        background: getComputedStyle(document.body).backgroundColor,
        text: getComputedStyle(document.body).color,
      };
      await window.wisper.saveSettings({ theme: 'dark' });
      await painted();
      const darkTheme = {
        background: getComputedStyle(document.body).backgroundColor,
        text: getComputedStyle(document.body).color,
      };
      await window.wisper.saveSettings({ theme: 'system' });
      await painted();

      document.querySelector('.settings-nav-item[data-settings-section="transcription"]').click();
      window.i18n.setLocale('en', 'en');
      for (let attempt = 0; attempt < 50 && document.getElementById('parakeetReadiness').textContent.includes('Checking'); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const parakeetRuntimeStatus = document.getElementById('parakeetReadiness').textContent;
      document.querySelector('input[name="engineKind"][value="local"]').click();
      for (let attempt = 0; attempt < 50 && document.getElementById('cliReadiness').textContent.includes('Checking'); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      // The acceleration status resolves after a further IPC round-trip once
      // the cli status has settled, so it needs its own wait.
      for (let attempt = 0; attempt < 50 && document.getElementById('localBackendReadiness').textContent.includes('Checking'); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (document.getElementById('localBackendReadiness').textContent.includes('Checking')) {
        throw new Error('Local acceleration status did not settle within the readiness timeout.');
      }
      const tab = document.getElementById('settings-transcription');
      const visible = (element) => element.getClientRects().length > 0;
      const cards = [...tab.querySelectorAll('.card')].filter(visible);
      const modules = [...tab.querySelectorAll('.engine-radio .radio')].filter(visible);
      const controls = [...tab.querySelectorAll('.card input[type="text"], .card input[type="password"], .card select')].filter(visible);
      const contained = cards.every((card) => {
        const box = card.getBoundingClientRect();
        return [...card.querySelectorAll('label, input, select, button, p')].filter(visible).every((child) => {
          const rect = child.getBoundingClientRect();
          return rect.left >= box.left - 1 && rect.right <= box.right + 1;
        });
      });
      const cardsClip = cards.some((card) => card.scrollWidth > card.clientWidth + 1 || card.scrollHeight > card.clientHeight + 1);
      const minimumModuleHeight = Math.min(...modules.map((module) => module.getBoundingClientRect().height));
      const modulesCentered = modules.every((module) => getComputedStyle(module).alignItems === 'center');
      const minimumControlHeight = Math.min(...controls.map((control) => control.getBoundingClientRect().height));
      const localSetup = document.getElementById('localSetup');
      const localStatuses = [...localSetup.querySelectorAll('span')];
      const localStatusRects = localStatuses.map((status) => status.getBoundingClientRect());
      const localSetupLayout = {
        contained: localSetup.scrollWidth <= localSetup.clientWidth + 1,
        minimumStatusWidth: Math.min(...localStatusRects.map((rect) => rect.width)),
        maximumStatusHeight: Math.max(...localStatusRects.map((rect) => rect.height)),
        aligned: localStatusRects.every((rect) => Math.abs(rect.left - localStatusRects[0].left) < 2),
      };
      const bundledRuntimeStatus = document.getElementById('cliReadiness').textContent;
      const persistentRuntimeStatus = document.getElementById('localBackendReadiness').textContent;
      const expectedModelCount = (await window.wisper.modelsCatalog()).length;
      let modelQualities = [];
      for (let attempt = 0; attempt < 50; attempt++) {
        modelQualities = [...document.querySelectorAll('.model-card .meta')].map((meta) => meta.textContent);
        if (modelQualities.length === expectedModelCount
            && modelQualities.every((text) => text && !/\{\d+\}/.test(text))) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (modelQualities.length !== expectedModelCount
          || modelQualities.some((text) => !text || /\{\d+\}/.test(text))) {
        throw new Error('Model metadata did not become ready: ' + JSON.stringify(modelQualities));
      }

      document.querySelector('.settings-nav-item[data-settings-section="templates"]').click();
      const templateTextarea = document.getElementById('templateInstructions');
      const templateEditor = templateTextarea.__crunchyEditor;
      const originalTemplate = templateEditor.getValue();
      templateEditor.setValue('# Packaged editor\\n\\n**Safe Markdown**\\n\\n<script>window.packagedEditorXss=true</script>');
      const editorRegression = {
        mounted: document.querySelectorAll('.text-editor-shell').length,
        heading: templateEditor.shell.querySelector('h1')?.textContent,
        strong: templateEditor.shell.querySelector('strong')?.textContent,
        scriptCount: templateEditor.shell.querySelectorAll('script').length,
        contenteditable: templateEditor.shell.querySelector('[contenteditable="true"]')?.getAttribute('contenteditable'),
        markdown: templateEditor.getValue(),
        legacyModeButtons: document.querySelectorAll('[data-editor-mode]').length,
        stats: document.getElementById('templateEditorStats').textContent,
      };
      templateEditor.setValue(originalTemplate);
      return {
        liveModifier, incompleteKey, completedChord, macChord, contained, editorRegression, lightTheme, darkTheme,
        cardsClip, minimumModuleHeight, modulesCentered, minimumControlHeight, localSetupLayout,
        parakeetRuntimeStatus, bundledRuntimeStatus, persistentRuntimeStatus, modelQualities,
      };
    })()`);
    if (!/Ctrl/.test(regression.liveModifier) || !/K/.test(regression.incompleteKey)
        || !/Ctrl.*(?:Alt|Option).*K/.test(regression.completedChord) || !/Option.*K/.test(regression.macChord)) {
      throw new Error(`Packaged shortcut recorder regression: ${JSON.stringify(regression)}`);
    }
    if (regression.lightTheme.background !== 'rgb(250, 248, 243)' || regression.lightTheme.text !== 'rgb(36, 51, 45)'
        || regression.darkTheme.background !== 'rgb(16, 24, 21)' || regression.darkTheme.text !== 'rgb(246, 241, 232)') {
      throw new Error(`Packaged theme regression: ${JSON.stringify(regression)}`);
    }
    if (!regression.contained || regression.cardsClip || regression.minimumModuleHeight < 34
        || !regression.modulesCentered || regression.minimumControlHeight < 36
        || !regression.localSetupLayout.contained || regression.localSetupLayout.minimumStatusWidth < 240
        || regression.localSetupLayout.maximumStatusHeight > 44 || !regression.localSetupLayout.aligned
        || !regression.parakeetRuntimeStatus.includes('Download Parakeet V3')
        || !regression.bundledRuntimeStatus.includes('Bundled whisper.cpp is ready')
        || !regression.persistentRuntimeStatus.includes('Persistent acceleration is available')) {
      throw new Error(`Packaged card layout regression: ${JSON.stringify(regression)}`);
    }
    if (!regression.modelQualities.some((text) => text.includes('Speed: Fastest') && text.includes('Accuracy: Lowest'))
        || !regression.modelQualities.some((text) => text.includes('Speed: Fast') && text.includes('Accuracy: Excellent'))
        || regression.modelQualities.some((text) => /\{\d+\}/.test(text))) {
      throw new Error(`Packaged model rating regression: ${JSON.stringify(regression.modelQualities)}`);
    }
    const editor = regression.editorRegression;
    if (editor.mounted !== 3 || !/Packaged editor$/.test(editor.heading) || editor.strong !== 'Safe Markdown'
        || editor.scriptCount !== 0 || editor.contenteditable !== 'true' || editor.legacyModeButtons !== 0
        || !editor.markdown.includes('<script>window.packagedEditorXss=true</script>')
        || !/words · .*characters · .*lines/.test(editor.stats)) {
      throw new Error(`Packaged Markdown editor regression: ${JSON.stringify(regression)}`);
    }
    console.log('Packaged shortcut recorder, themes, card layout, and Markdown editor passed.');
    await evaluate(target, "window.wisper.saveSettings({theme:'dark'})");
    await delay(100);
    const floatingThemeTarget = (await targets()).find((item) => item.type === 'page' && item.url.endsWith('/ui/floating.html'));
    if (!floatingThemeTarget) throw new Error('Packaged floating overlay target is missing.');
    const floatingTheme = await evaluate(floatingThemeTarget, 'document.documentElement.dataset.themePreference');
    if (floatingTheme !== 'dark') throw new Error(`Floating overlay theme did not update: ${floatingTheme}`);
    await evaluate(target, "window.wisper.saveSettings({theme:'system'})");
    if (process.platform === 'win32') {
      const { uIOhook, UiohookKey } = require('uiohook-napi');
      try {
        uIOhook.keyToggle(UiohookKey.Ctrl, 'down');
        uIOhook.keyToggle(UiohookKey.Meta, 'down');
        await delay(500);
        const floating = (await targets()).find((item) => item.type === 'page' && item.url.endsWith('/ui/floating.html'));
        if (!floating) throw new Error('Packaged floating overlay target is missing.');
        const overlayClass = await evaluate(floating, 'document.body.className');
        if (!String(overlayClass).includes('state-recording')) {
          throw new Error(`Packaged Ctrl + Win hook did not activate the overlay: ${overlayClass}`);
        }
        console.log('Packaged Ctrl + Win hook activated the recording overlay.');
      } finally {
        uIOhook.keyToggle(UiohookKey.Meta, 'up');
        uIOhook.keyToggle(UiohookKey.Ctrl, 'up');
      }
    }
  } finally {
    child.kill();
    await delay(500);
    await removeTemporaryDirectory(userData);
  }
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
