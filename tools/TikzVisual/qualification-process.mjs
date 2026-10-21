// Shared bounded execution; callers retain family-specific command/report policy.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

export async function captureProcess(executable, args, {cwd, timeout = 60000, maxBytes = 2000000, killTree = false} = {}) {
  assert.ok(typeof executable === 'string' && executable.length > 0);
  assert.ok(Array.isArray(args) && args.every(a => typeof a === 'string'));
  // Long arrow reconstruction owns a three-hour budget; all callers remain
  // explicitly bounded rather than silently shortening a family's deadline.
  assert.ok(Number.isSafeInteger(timeout) && timeout > 0 && timeout <= 10800000);
  assert.ok(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= 2000000);
  assert.equal(typeof killTree, 'boolean');
  const chunks = [], stdout = [], stderr = [];
  let size = 0, failure = null, terminationFailure = null, terminationEscalated = false;
  const exitCode = await new Promise(resolve => {
    const child = spawn(executable, args, {cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    let settled = false, stopping = false, exited = false, killTimer, closeTimer;
    const finish = code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); clearTimeout(killTimer); clearTimeout(closeTimer);
      resolve(code);
    };
    const stop = message => {
      failure ??= message;
      if (stopping || settled) return;
      stopping = true;
      if (!exited) {
        if (killTree && process.platform === 'win32' && Number.isSafeInteger(child.pid)) {
          // Preserve Windows descendant cleanup for browser-owning commands.
          // The cleanup process has its own short bound and cannot hold us open.
          const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'],
            {cwd, shell: false, windowsHide: true, stdio: 'ignore', timeout: 750});
          killer.on('error', () => { if (!exited && !settled) child.kill('SIGKILL'); });
          killer.unref();
        } else child.kill('SIGTERM');
      }
      // Unix children can handle SIGTERM. Escalate after a short cleanup grace.
      killTimer = setTimeout(() => {
        if (!exited) { terminationEscalated = true; child.kill('SIGKILL'); }
      }, 250);
      // Also bound close: inherited pipes or a failed kill must not hang a caller.
      closeTimer = setTimeout(() => {
        terminationFailure = 'close-timeout';
        child.stdout.destroy(); child.stderr.destroy();
        child.unref();
        finish(null);
      }, 1000);
    };
    const timer = setTimeout(() => stop('timeout'), timeout);
    const capture = (bytes, stream) => {
      if (settled) return;
      size += bytes.length;
      if (size > maxBytes) stop('output-bound');
      else { chunks.push(bytes); stream.push(bytes); }
    };
    child.stdout.on('data', bytes => capture(bytes, stdout));
    child.stderr.on('data', bytes => capture(bytes, stderr));
    child.on('error', error => { failure ??= error.code ?? error.message; });
    child.on('exit', () => { exited = true; });
    child.on('close', finish);
  });
  return {exitCode, failure, terminationFailure, terminationEscalated,
    output: Buffer.concat(chunks).toString('utf8'),
    stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8')};
}
