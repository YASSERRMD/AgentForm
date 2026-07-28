import { afterEach, describe, expect, it } from 'vitest';
import { getStoredStudioToken, initStudioToken } from './auth-token';

describe('initStudioToken / getStoredStudioToken', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    window.history.pushState(null, '', '/');
  });

  it('stores a token present in the URL and strips it from the visible URL', () => {
    window.history.pushState(null, '', '/?token=a-real-token');

    initStudioToken();

    expect(getStoredStudioToken()).toBe('a-real-token');
    expect(window.location.search).toBe('');
  });

  it('leaves other query params untouched when stripping the token', () => {
    window.history.pushState(null, '', '/?foo=bar&token=a-real-token');

    initStudioToken();

    expect(window.location.search).toBe('?foo=bar');
  });

  it('is undefined when no token has ever been bootstrapped', () => {
    expect(getStoredStudioToken()).toBeUndefined();
  });

  it('falls back to a previously-stored token on a plain refresh (no token in the URL)', () => {
    window.history.pushState(null, '', '/?token=a-real-token');
    initStudioToken();

    window.history.pushState(null, '', '/');
    initStudioToken();

    expect(getStoredStudioToken()).toBe('a-real-token');
  });

  it('does nothing when the URL carries no token', () => {
    window.history.pushState(null, '', '/some/path');

    initStudioToken();

    expect(getStoredStudioToken()).toBeUndefined();
    expect(window.location.pathname).toBe('/some/path');
  });
});
