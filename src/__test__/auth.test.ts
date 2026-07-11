import request from 'supertest';
import app from '../app';

describe('Auth Routes - Validation', () => {
  describe('POST /api/auth/register', () => {
    it('should reject registration with missing fields', async () => {
      const res = await request(app).post('/api/auth/register').send({});
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
});
