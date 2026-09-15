import { describe, expect, it } from 'vitest';
import { geocodeError } from './geocode-errors';
describe('Google geocoding failures', () => {
  it('reports billing denial instead of an unknown address', () => {
    expect(geocodeError('REQUEST_DENIED', 'You must enable Billing on the Google Cloud Project')).toMatchObject({ code: 'billing_disabled', status: 503 });
  });
  it('distinguishes quota, permissions, missing results and transient errors', () => {
    expect(geocodeError('OVER_QUERY_LIMIT').status).toBe(429);
    expect(geocodeError('REQUEST_DENIED').code).toBe('geocoder_denied');
    expect(geocodeError('PERMISSION_DENIED').code).toBe('geocoder_denied');
    expect(geocodeError('ZERO_RESULTS').code).toBe('not_found');
    expect(geocodeError('UNKNOWN_ERROR').status).toBe(502);
  });
  it('does not expose arbitrary upstream details to the user', () => {
    expect(geocodeError('REQUEST_DENIED', 'secret-key-example').message).not.toContain('secret-key-example');
  });
});
