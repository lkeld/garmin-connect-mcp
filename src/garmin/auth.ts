import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { Config } from '../config.js';
import { tokenSetSchema, type AuthWorkerResult, type LoginChallengeState, type Region, type TokenSet } from './types.js';

export class GarminAuthError extends Error {
  constructor(readonly code: string, message: string, readonly retryable = false) {
    super(message);
    this.name = 'GarminAuthError';
  }
}

export class GarminAuth {
  constructor(private readonly config: Pick<Config, 'authWorkerPython' | 'authWorkerPath' | 'authWorkerTimeoutMs'>) {}

  async login(username: string, password: string, region: Region): Promise<AuthWorkerResult> {
    return this.call({ action: 'login', username, password, region });
  }

  async completeMfa(code: string, state: LoginChallengeState, region: Region): Promise<AuthWorkerResult> {
    return this.call({ action: 'mfa', code, state, region });
  }

  async refresh(tokens: TokenSet, region: Region): Promise<TokenSet> {
    const result = await this.call({ action: 'refresh', tokens, region });
    if (result.status === 'error') throw new GarminAuthError(result.code, result.message, result.retryable);
    if (result.status !== 'success') throw new GarminAuthError('upstream', 'Unexpected token refresh response', true);
    return tokenSetSchema.parse(result.tokens);
  }

  private async call(payload: Record<string, unknown>): Promise<AuthWorkerResult> {
    const output = await this.execute(payload);
    let result: AuthWorkerResult;
    try {
      result = JSON.parse(output) as AuthWorkerResult;
    } catch {
      throw new GarminAuthError('worker_protocol', 'The authentication worker returned an invalid response', true);
    }
    if (result.status === 'success') tokenSetSchema.parse(result.tokens);
    return result;
  }

  private execute(payload: Record<string, unknown>): Promise<string> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(this.config.authWorkerPython, ['-I', resolve(this.config.authWorkerPath)], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin', PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1' },
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback();
      };
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish(() => reject(new GarminAuthError('timeout', 'Garmin authentication timed out', true)));
      }, this.config.authWorkerTimeoutMs);
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
        if (stdout.length > 2_000_000) child.kill('SIGKILL');
      });
      child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-2_000); });
      child.on('error', () => finish(() => reject(new GarminAuthError('worker_unavailable', 'The authentication worker is unavailable', true))));
      child.on('close', (code) => finish(() => {
        if (code !== 0) {
          reject(new GarminAuthError('worker_failed', 'The authentication worker stopped unexpectedly', true));
          return;
        }
        resolvePromise(stdout);
      }));
      child.stdin.on('error', () => { /* close/error handler reports the failure */ });
      child.stdin.end(JSON.stringify(payload));
      void stderr;
    });
  }
}
