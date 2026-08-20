import request from 'supertest';
import app from '../app';

describe('Auth Routes - Validation', () => {
  describe('POST /api/auth/register', () => {
    it('should reject registration with missing fields', async () => {
      const res = await request(app).post('/api/auth/register').send({});

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('should reject registration with an invalid email', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Test User',
        email: 'invalid-email',
        password: 'password123',
      });

      expect(res.body.errors.email[0]).toContain('Invalid email');
    });

    it('should reject registration with a short password', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'short',
      });
    
      expect(res.body.errors.password[0]).toContain('Password must be at least');
    });
  });

  describe('POST /api/auth/verify-otp', () => {
    it('should reject invalid email format', async () => {
      const res = await request(app).post('/api/auth/verify-otp').send({
        email: 'not-an-email',
        otp: '123456',
      });

      expect(res.status).toBe(400);
      expect(res.body.errors.email[0]).toContain('Invalid email');
    });

    it('should reject OTPs that are not 6 digits', async () => {
      const res = await request(app).post('/api/auth/verify-otp').send({
        email: 'test@example.com',
        otp: '123',
      });

      expect(res.status).toBe(400);
      expect(res.body.errors.otp[0]).toContain('OTP must be 6 digits');
    });
  });

  describe('POST /api/auth/resend-otp', () => {
    it('should reject invalid email format', async () => {
      const res = await request(app).post('/api/auth/resend-otp').send({
        email: 'not-an-email',
      });

      expect([400, 429]).toContain(res.status);

      if (res.status === 400) {
        expect(res.body.errors.email[0]).toContain('Invalid email');
      }
    });
  });

  describe('POST /api/auth/login', () => {
    it('should reject missing password', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'test@example.com',
      });

      expect([400, 429]).toContain(res.status);

      if (res.status === 400) {
        expect(res.body.errors.password[0]).toContain('Required');
      }
    });
  });
});
