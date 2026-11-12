
/* CodeForge Neon - Unified Runner */
(() => {
  const $ = id => document.getElementById(id);
  const run = $('runBtn');
  if (!run || !document.querySelector('.output')) return;

  const code = $('code');
  const lang = $('language');
  const terminal = $('terminal');
  const verdict = $('verdict');
  const problemId = new URLSearchParams(location.search).get('id');
  const problem = (window.PROBLEMS || []).find(p => p.id === problemId);
  const samples = problem?.samples || [];

  const style = document.createElement('style');
  style.textContent = `
    .editor-pane {
      display:flex!important;
      flex-direction:column!important;
      min-height:0!important;
      height:100%!important;
      overflow-y:auto!important;
      overflow-x:hidden!important;
    }
    .editor-pane .editor-area {
      flex:1 0 180px!important;
      min-height:180px!important;
    }
    .editor-pane .output {
      flex-shrink:0!important;
      min-height:130px!important;
      overflow:visible!important;
    }
    .cf-stdin-panel {
      flex-shrink:0!important;
      padding:14px!important;
      border-top:1px solid #30405c;
    }
    .cf-stdin-panel textarea {
      box-sizing:border-box;
      display:block;
      width:100%;
      min-height:110px;
      resize:vertical;
      padding:12px;
      margin-top:10px;
      background:#090e20;
      color:#e0efff;
      border:1px solid #41617d;
      border-radius:8px;
      font:13px monospace;
    }
    .cf-test-actions {
      display:flex;
      gap:8px;
      flex-wrap:wrap;
      margin-top:10px;
    }
    .cf-test-actions button {
      padding:9px 12px;
      border:1px solid #45e6e0;
      border-radius:6px;
      background:#102639;
      color:#45e6e0;
      cursor:pointer;
    }
    @media(max-width:900px) {
      .editor-pane {
        height:auto!important;
        max-height:none!important;
        overflow:visible!important;
      }
      .editor-pane .editor-area {
        min-height:230px!important;
      }
      .editor-pane .editor-toolbar {
        flex-wrap:wrap!important;
      }
    }
  `;
  document.head.appendChild(style);

  const panel = document.createElement('section');
  panel.className = 'cf-stdin-panel';
  panel.innerHTML = `
    <label for="cfStdin" style="color:#45e6e0;font-weight:bold">
      ⌨ STANDARD INPUT
    </label>
    <textarea id="cfStdin" spellcheck="false"
      placeholder="Enter input here..."></textarea>
    <div class="cf-test-actions">
      <button id="cfSample" type="button">LOAD SAMPLE</button>
      <button id="cfRetry" type="button">↻ RETRY TEST</button>
      <button id="cfAll" type="button">▶ RUN ALL SAMPLES</button>
    </div>
    <div style="margin-top:9px;color:#91a0b9;font-size:11px">
      C++ / Python use an external compiler service.
      JavaScript runs in an isolated browser worker.
    </div>
  `;
  document.querySelector('.output').before(panel);

  const stdin = $('cfStdin');
  stdin.value = samples[0]?.input || '';

  const normalize = value =>
    String(value ?? '')
      .replace(/\r/g, '')
      .trim()
      .split('\n')
      .map(x => x.trimEnd())
      .join('\n');

  const setStatus = (message, success) => {
    verdict.textContent = message;
    verdict.style.color =
      success === true ? '#56edb3' :
      success === false ? '#ff7595' : '#f7d080';
  };

  $('cfSample').onclick = () => {
    stdin.value = samples[0]?.input || '';
  };

  // The original editor's LOAD SAMPLE button
  // updates our visible input box as well.
  $('sampleBtn')?.addEventListener('click', () => {
    stdin.value = samples[0]?.input || '';
  });

  function browserWorker() {
    self.onmessage = event => {
      const { source, input } = event.data;
      const lines = input.split(/\r?\n/);
      let cursor = 0;
      let output = '';

      const write = value => {
        output += String(value);
      };

      const readline = () => lines[cursor++] ?? '';
      const print = (...args) => {
        write(args.join(' ') + '\n');
      };

      const console = {
        log: print,
        error: print,
        warn: print
      };

      const fs = {
        readFileSync(fd, encoding) {
          if (fd !== 0 && fd !== '/dev/stdin')
            throw Error('Only standard input is supported');
          return input;
        }
      };

      const require = name => {
        if (name === 'fs' || name === 'node:fs')
          return fs;
        throw Error(
          'Node module "' + name +
          '" is unavailable in browser mode'
        );
      };

      const process = {
        stdin: {
          fd: 0
        },
        stdout: {
          write
        },
        stderr: {
          write
        },
        exit(code = 0) {
          throw { cfExit: true, code };
        }
      };

      try {
        const execute = new Function(
          'require',
          'process',
          'readline',
          'print',
          'console',
          source
        );

        execute(require, process, readline, print, console);

        self.postMessage({ output });
      } catch (error) {
        if (error?.cfExit && error.code === 0) {
          self.postMessage({ output });
        } else {
          self.postMessage({
            error: String(error?.stack || error),
            output
          });
        }
      }
    };
  }

  async function runJavaScript(source, input) {
    const workerSource =
      '(' + browserWorker.toString() + ')()';

    const url = URL.createObjectURL(
      new Blob([workerSource], {
        type: 'text/javascript'
      })
    );

    const worker = new Worker(url);

    return new Promise((resolve, reject) => {
      let finished = false;

      const finish = (error, data) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        worker.terminate();
        URL.revokeObjectURL(url);
        error ? reject(error) : resolve(data);
      };

      const timer = setTimeout(() => {
        finish(Error('Time limit exceeded (5 seconds)'));
      }, 5000);

      worker.onmessage = event => {
        const data = event.data;
        if (data.error) {
          finish(Error(data.error));
        } else {
          finish(null, data.output);
        }
      };

      worker.onerror = event => {
        finish(Error(event.message || 'Worker error'));
      };

      worker.postMessage({ source, input });
    });
  }

  let compilerList = null;

  async function runOnline(source, input, language) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      45000
    );

    try {
      if (!compilerList) {
        const response = await fetch(
          'https://wandbox.org/api/list.json',
          { signal: controller.signal }
        );
        if (!response.ok)
          throw Error('Compiler list HTTP ' + response.status);

        compilerList = await response.json();
      }

      const choices = compilerList.filter(c =>
        c.language === (
          language === 'cpp' ? 'C++' : 'Python'
        )
      );

      const preferred = language === 'cpp'
        ? choices.find(c => c.name === 'gcc-head') ||
          choices.find(c => c.name.startsWith('gcc-'))
        : choices.find(c => c.name.startsWith('cpython-')) ||
          choices.find(c => /python/i.test(c.name));

      const compiler = preferred || choices[0];

      if (!compiler)
        throw Error('No compiler available for ' + language);

      const response = await fetch(
        'https://wandbox.org/api/compile.json',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            compiler: compiler.name,
            code: source,
            stdin: input,
            save: false
          }),
          signal: controller.signal
        }
      );

      if (!response.ok)
        throw Error('Compiler HTTP ' + response.status);

      const result = await response.json();

      const errors = [
        result.compiler_error,
        result.program_error
      ].filter(Boolean).join('\n');

      const messages = [
        result.compiler_message,
        result.program_message
      ].filter(Boolean).join('\n');

      const status = Number(result.status ?? 0);

      if (errors || status !== 0) {
        throw Error(
          errors || messages ||
          'Process exited with code ' + status
        );
      }

      return result.program_output || '';
    } finally {
      clearTimeout(timeout);
    }
  }

  async function execute(input, expected = null) {
    const language = lang.value;
    const source = code.value;

    setStatus('RUNNING...', null);

    let output;

    try {
      if (language === 'javascript') {
        output = await runJavaScript(source, input);
      } else {
        output = await runOnline(source, input, language);
      }

      let report = 'YOUR OUTPUT:\n' +
        (output || '(empty)');

      if (expected !== null) {
        const passed =
          normalize(output) === normalize(expected);

        report += '\n\nEXPECTED OUTPUT:\n' + expected;
        report += '\n\n' +
          (passed ? '✓ PASSED' : '✕ WRONG ANSWER');

        setStatus(
          passed ? 'SAMPLE PASSED' : 'SAMPLE FAILED',
          passed
        );

        terminal.textContent = report;
        return passed;
      }

      setStatus('EXECUTED', true);
      terminal.textContent = report;
      return true;

    } catch (error) {
      const message = String(error.message || error);

      const serviceError =
        /catatonit|failed to exec pid1|resource temporarily unavailable|failed to fetch|networkerror|compiler http|compiler list http|aborterror/i
          .test(message);

      setStatus(
        serviceError ? 'COMPILER SERVICE ERROR' : 'EXECUTION ERROR',
        false
      );

      terminal.textContent =
        (serviceError
          ? 'The online compiler service failed.\n'
          : 'Your program could not execute.\n') +
        '\nDETAILS:\n' + message;

      return false;
    }
  }

  async function runSelected() {
    run.disabled = true;

    try {
      const input = stdin.value;
      const sample = samples.find(s =>
        normalize(s.input) === normalize(input)
      );

      await execute(
        input,
        sample ? sample.output : null
      );
    } finally {
      run.disabled = false;
      run.textContent = '▶ RUN CODE';
    }
  }

  // Override the old JavaScript-only handler.
  run.addEventListener('click', event => {
    event.stopImmediatePropagation();
    runSelected();
  }, true);

  $('cfRetry').onclick = runSelected;

  $('cfAll').onclick = async () => {
    if (!samples.length) {
      terminal.textContent = 'No official samples available.';
      return;
    }

    $('cfAll').disabled = true;
    const results = [];
    let passed = 0;

    try {
      for (let i = 0; i < samples.length; i++) {
        const sample = samples[i];
        const ok = await execute(
          sample.input,
          sample.output
        );

        if (ok) passed++;

        results.push(
          'Test ' + (i + 1) + ': ' +
          (ok ? 'PASSED' : 'FAILED')
        );

        if (!ok) {
          results.push('\n' + terminal.textContent);
          break;
        }
      }

      terminal.textContent =
        results.join('\n') +
        '\n\nPassed ' + passed +
        ' / ' + samples.length + ' official samples';

      setStatus(
        passed === samples.length
          ? 'ALL SAMPLES PASSED'
          : 'SOME TESTS FAILED',
        passed === samples.length
      );
    } finally {
      $('cfAll').disabled = false;
    }
  };

  // Allow the extra-test manager to use the real runner.
  window.CodeForgeRunner = {
    execute,
    normalize
  };
  run.textContent = '▶ RUN CODE';

  console.log('CodeForge Neon unified runner loaded');
})();
