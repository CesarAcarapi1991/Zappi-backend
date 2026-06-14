// ─── Device Service Tests ─────────────────────────────────────────────────────
// Tests for the /v1/device-identify and auth endpoints.
// Uses MockDeviceRepository so no real DB/AWS connections needed.

import request from 'supertest';
import { createApp } from '../infrastructure/app';

// Set MOCK_MODE before creating app
process.env.MOCK_MODE = 'true';
process.env.JWT_SECRET = 'test-secret-key-for-jest';

const app = createApp();

// ─── Helper payloads ─────────────────────────────────────────────────────────
const validIdentifyPayload = {
  device_id: 'TEST-DEVICE-001',
  device_type: 'ANDROID',
  product: 'Zappi',
  certificate: true,
  notification_id: 'fcm-test-token-123',
  version: '1.0.0',
  reference: 'REF-001',
  send_id: 'SEND-001',
  event: 1,
};

const validAuthPayload = {
  device_id: 'TEST-DEVICE-001',
  device_type: 'ANDROID',
  certificate: true,
  encrypted_device: 'encrypted-data-test',
  send_id: 'SEND-001',
};

// Regex: decimal values 0-255 separated by pipes  e.g.  "58|210|67|147|..."
const DECIMAL_PIPED = /^\d{1,3}(\|\d{1,3})*$/;

// =============================================================================
// 1. HEALTH CHECK
// =============================================================================
describe('Device Service - Health Check', () => {
  it('GET /health → 200 with service status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('device-service');
    expect(res.body.timestamp).toBeDefined();
  });
});

// =============================================================================
// 2. DEVICE IDENTIFICATION — POST /v1/device-identify
// =============================================================================
describe('Device Service - Device Identification', () => {
  describe('POST /v1/device-identify', () => {
    it('returns 200 with key, iv, and certified_id on valid request (without auth_token)', async () => {
      const res = await request(app)
        .post('/v1/device-identify')
        .send(validIdentifyPayload);

      expect(res.status).toBe(200);
      expect(res.body.state).toBe(0);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.key).toBeDefined();
      expect(res.body.data.iv).toBeDefined();
      expect(res.body.data.certified_id).toBeDefined();
      expect(res.body.data.auth_token).toBeUndefined();

      // key: 32 decimal segments, iv: 16 decimal segments
      expect(res.body.data.key).toMatch(DECIMAL_PIPED);
      expect(res.body.data.iv).toMatch(DECIMAL_PIPED);
      expect(res.body.data.key.split('|')).toHaveLength(32);
      expect(res.body.data.iv.split('|')).toHaveLength(16);
    });

    it('returns 400 if device_id is missing (validation error)', async () => {
      const { device_id: _, ...payload } = validIdentifyPayload;
      const res = await request(app).post('/v1/device-identify').send(payload);

      expect(res.status).toBe(400);
      expect(res.body.state).toBe(-2);
    });

    it('returns 400 if device_type is missing', async () => {
      const { device_type: _, ...payload } = validIdentifyPayload;
      const res = await request(app).post('/v1/device-identify').send(payload);

      expect(res.status).toBe(400);
      expect(res.body.state).toBe(-2);
    });

    it('returns 400 if product is missing', async () => {
      const { product: _, ...payload } = validIdentifyPayload;
      const res = await request(app).post('/v1/device-identify').send(payload);

      expect(res.status).toBe(400);
      expect(res.body.state).toBe(-2);
    });

    it('returns consistent certified_id for the same device_id', async () => {
      const res1 = await request(app).post('/v1/device-identify').send(validIdentifyPayload);
      const res2 = await request(app).post('/v1/device-identify').send(validIdentifyPayload);

      expect(res1.body.data.certified_id).toBe(res2.body.data.certified_id);
    });

    it('returns 200 for a different device_id', async () => {
      const res = await request(app)
        .post('/v1/device-identify')
        .send({ ...validIdentifyPayload, device_id: 'DIFFERENT-DEVICE-999' });

      expect(res.status).toBe(200);
    });
  });
});

// =============================================================================
// 3. DEVICE AUTHENTICATION
// =============================================================================
describe('Device Service - Device Authentication', () => {
  const endpoints = [
    '/v1/device-auth',
  ];

  endpoints.forEach((url) => {
    describe(`POST ${url}`, () => {
      it('returns 200 with decimal-piped key and iv on valid request (without auth_token)', async () => {
        const res = await request(app).post(url).send(validAuthPayload);

        expect(res.status).toBe(200);
        expect(res.body.state).toBe(0);
        expect(res.body.data.key).toMatch(DECIMAL_PIPED);
        expect(res.body.data.iv).toMatch(DECIMAL_PIPED);
        expect(res.body.data.certified_id).toBeDefined();
        expect(res.body.data.auth_token).toBeUndefined();
      });

      it('returns 400 if device_id is missing', async () => {
        const { device_id: _, ...payload } = validAuthPayload;
        const res = await request(app).post(url).send(payload);

        expect(res.status).toBe(400);
        expect(res.body.state).toBe(-2);
      });

      it('returns 400 if device_type is missing', async () => {
        const { device_type: _, ...payload } = validAuthPayload;
        const res = await request(app).post(url).send(payload);

        expect(res.status).toBe(400);
        expect(res.body.state).toBe(-2);
      });
    });
  });
});

// =============================================================================
// 4. 404 HANDLER
// =============================================================================
describe('Device Service - 404 Not Found', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).post('/V1/unknown-endpoint');
    expect(res.status).toBe(404);
    expect(res.body.state).toBe(-4);
  });

  it('returns 404 for GET on identify endpoint', async () => {
    const res = await request(app).get('/v1/device-identify');
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// 5. SECURITY HEADERS
// =============================================================================
describe('Device Service - Security Headers (Helmet)', () => {
  it('response includes X-Content-Type-Options header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBeDefined();
  });

  it('response includes X-Frame-Options or CSP header', async () => {
    const res = await request(app).get('/health');
    const hasFrameOption = res.headers['x-frame-options'] !== undefined;
    const hasCsp = res.headers['content-security-policy'] !== undefined;
    expect(hasFrameOption || hasCsp).toBe(true);
  });
});
