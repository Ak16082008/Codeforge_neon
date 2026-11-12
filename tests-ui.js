
/* CodeForge Neon — Extra Test Manager */
(() => {
  const wait = setInterval(() => {
    const root = document.getElementById('problemRoot');

    if (
      !root?.querySelector('.editor-pane') ||
      !window.CodeForgeRunner ||
      !document.getElementById('cfStdin')
    ) return;

    clearInterval(wait);
    init(root);
  }, 150);

  // Stop polling if the editor cannot load.
  setTimeout(() => clearInterval(wait), 30000);

  async function init(root) {
    const id = new URLSearchParams(location.search).get('id');
    const runner = window.CodeForgeRunner;

    const panel = document.createElement('section');
    panel.className = 'pane';

    panel.style.cssText = `
      position:fixed;
      right:16px;
      bottom:72px;
      width:min(520px,calc(100vw - 32px));
      height:min(460px,calc(100dvh - 110px));
      box-sizing:border-box;
      padding:16px;
      overflow:auto;
      z-index:9998;
      background:#0c1225;
      border:1px solid #43f5ed;
      border-radius:12px;
      box-shadow:0 12px 40px #000b;
      display:none;
    `;

    panel.innerHTML = `
      <h3>🧪 TEST CASE MANAGER</h3>
      <p id="cfTestCount">Loading extra tests...</p>

      <div id="cfTestButtons"
        style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0">
      </div>

      <div style="
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
        gap:12px;
      ">
        <div>
          <b>INPUT</b>
          <pre id="cfTestInput"
            style="white-space:pre-wrap;overflow:auto"></pre>
        </div>

        <div>
          <b>EXPECTED OUTPUT</b>
          <pre id="cfTestExpected"
            style="white-space:pre-wrap;overflow:auto"></pre>
        </div>
      </div>

      <p id="cfTestSource"></p>

      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <button id="cfLoadExtra" type="button">
          LOAD SELECTED TEST
        </button>

        <button id="cfRunExtra" type="button">
          ▶ RUN SELECTED TEST
        </button>

        <button id="cfRunAllExtra" type="button">
          ▶ RUN ALL AVAILABLE TESTS
        </button>
      </div>

      <pre id="cfTestResults"
        style="white-space:pre-wrap;overflow:auto;margin-top:12px">
      </pre>
    `;

    const editor = root.querySelector('.editor-pane');
    
    document.body.appendChild(panel);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = '🧪 TEST CASES';

    toggle.style.cssText = `
      position:fixed;
      right:16px;
      bottom:16px;
      z-index:9999;
      background:#102c3a;
      color:#43f5ed;
      border:1px solid #43f5ed;
      border-radius:10px;
      padding:12px 16px;
      font:700 12px monospace;
      cursor:pointer;
      box-shadow:0 6px 24px #0008;
    `;

    toggle.onclick = () => {
      const open = panel.style.display === 'none';
      panel.style.display = open ? 'block' : 'none';
      toggle.textContent = open
        ? '✕ CLOSE TESTS'
        : '🧪 TEST CASES';
    };

    document.body.appendChild(toggle);

    const $ = selector => panel.querySelector(selector);

    const count = $('#cfTestCount');
    const buttons = $('#cfTestButtons');
    const inputPreview = $('#cfTestInput');
    const expectedPreview = $('#cfTestExpected');
    const sourcePreview = $('#cfTestSource');
    const results = $('#cfTestResults');

    let tests = [];
    let active = 0;
    let busy = false;

    try {
      const response = await fetch(
        'tests-800-1200.json',
        { cache: 'no-cache' }
      );

      if (!response.ok) {
        throw Error('HTTP ' + response.status);
      }

      const database = await response.json();
      const record = database[id];

      // This pack contains official and extra tests.
      tests = (record?.tests || [])
        .filter(test =>
          typeof test.input === 'string' &&
          typeof test.expected === 'string'
        )
        .map(test => ({
          input: test.input,
          expected: test.expected,
          source: test.source || 'Test pack'
        }));

      // Preserve official samples from the problem data.
      const problem = (window.PROBLEMS || [])
        .find(p => p.id === id);

      const official = (problem?.samples || [])
        .filter(s =>
          typeof s.input === 'string' &&
          typeof s.output === 'string'
        )
        .map(s => ({
          input: s.input,
          expected: s.output,
          source: 'Official sample'
        }));

      // Remove duplicate input/output pairs.
      const seen = new Set();

      tests = [...official, ...tests].filter(test => {
        const key =
          runner.normalize(test.input) + '\0' +
          runner.normalize(test.expected);

        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      count.textContent =
        tests.length + ' available test case(s)';

      if (!tests.length) {
        results.textContent =
          'No tests found for this problem.';
        return;
      }

      function select(index) {
        active = index;

        const test = tests[index];

        inputPreview.textContent = test.input;
        expectedPreview.textContent = test.expected;
        sourcePreview.textContent =
          'Source: ' + test.source;

        Array.from(buttons.children).forEach(
          (button, i) => {
            button.style.borderColor =
              i === active ? '#45e6e0' : '#30405c';
          }
        );
      }

      tests.forEach((test, index) => {
        const button = document.createElement('button');

        button.type = 'button';
        button.textContent = 'TEST ' + (index + 1);

        button.style.cssText = `
          padding:9px 12px;
          background:#101c32;
          color:#d9eaff;
          border:1px solid #30405c;
          border-radius:7px;
          cursor:pointer;
        `;

        button.onclick = () => {
          if (!busy) select(index);
        };

        buttons.appendChild(button);
      });

      function loadSelected() {
        const stdin = document.getElementById('cfStdin');

        stdin.value = tests[active].input;
        stdin.dispatchEvent(
          new Event('input', { bubbles: true })
        );
      }

      async function runTest(test, index) {
        const ok = await runner.execute(
          test.input,
          test.expected
        );

        return {
          index,
          ok,
          source: test.source
        };
      }

      async function withLock(callback) {
        if (busy) return;

        busy = true;

        const actionButtons = [
          $('#cfLoadExtra'),
          $('#cfRunExtra'),
          $('#cfRunAllExtra')
        ];

        actionButtons.forEach(b => b.disabled = true);

        try {
          await callback();
        } finally {
          busy = false;
          actionButtons.forEach(b => b.disabled = false);
        }
      }

      $('#cfLoadExtra').onclick = () => {
        loadSelected();
        results.textContent =
          'Test ' + (active + 1) +
          ' loaded into Standard Input.';
      };

      $('#cfRunExtra').onclick = () => withLock(
        async () => {
          loadSelected();

          results.textContent =
            'Running test ' + (active + 1) + '...';

          const result = await runTest(
            tests[active],
            active
          );

          results.textContent =
            'TEST ' + (active + 1) + ': ' +
            (result.ok ? '✓ PASSED' : '✕ FAILED') +
            '\nSource: ' + result.source;
        }
      );

      $('#cfRunAllExtra').onclick = () => withLock(
        async () => {
          let passed = 0;
          const lines = [];

          for (let i = 0; i < tests.length; i++) {
            results.textContent =
              'Running test ' + (i + 1) +
              ' of ' + tests.length + '...';

            const result = await runTest(tests[i], i);

            if (result.ok) passed++;

            lines.push(
              'TEST ' + (i + 1) + ': ' +
              (result.ok ? '✓ PASSED' : '✕ FAILED') +
              ' (' + result.source + ')'
            );

            results.textContent = lines.join('\n');
          }

          results.textContent +=
            '\n\nRESULT: ' + passed +
            '/' + tests.length + ' passed';

          const allPassed = passed === tests.length;

          const verdict = document.getElementById('verdict');

          if (verdict) {
            verdict.textContent = allPassed
              ? 'ALL AVAILABLE TESTS PASSED'
              : 'SOME TESTS FAILED';

            verdict.style.color = allPassed
              ? '#56edb3'
              : '#ff7595';
          }
        }
      );

      select(0);

    } catch (error) {
      count.textContent =
        'Could not load extra tests';

      results.textContent = error.message;
    }
  }
})();
