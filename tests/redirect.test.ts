import { describe, expect, it } from 'vitest';
import { redirectAllowed } from '../src/oauth/registration.js';

const config = { extraRedirectUris: ['https://inspector.example.com/oauth/callback'] };

describe('OAuth redirect policy', () => {
  it('accepts Claude and loopback callbacks', () => {
    expect(redirectAllowed('https://claude.ai/api/mcp/auth_callback', config)).toBe(true);
    expect(redirectAllowed('http://localhost:43127/callback', config)).toBe(true);
    expect(redirectAllowed('http://127.0.0.1:3118/callback', config)).toBe(true);
    expect(redirectAllowed('http://[::1]:3118/callback', config)).toBe(true);
  });
  it('accepts explicitly configured additional callbacks', () => {
    expect(redirectAllowed('https://inspector.example.com/oauth/callback', config)).toBe(true);
    expect(redirectAllowed('https://other.example.com/oauth/callback', config)).toBe(false);
  });
  it('rejects credential-bearing, remote, downgrade and lookalike redirects', () => {
    for (const uri of ['https://claude.ai.evil.example/callback', 'https://localhost/callback', 'http://127.0.0.1.evil.example/callback', 'http://user@localhost/callback', 'javascript:alert(1)']) {
      expect(redirectAllowed(uri, config)).toBe(false);
    }
  });
});
