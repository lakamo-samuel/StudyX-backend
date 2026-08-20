import request from 'supertest';
import app from '../app';

describe('Group Routes - Protection and Validation', () => {
  describe('GET /api/groups', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/groups');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/groups', () => {
    it('should require authentication before creating a group', async () => {
      const res = await request(app).post('/api/groups').send({
        name: 'Calculus Study Group',
        subject: 'Mathematics',
        goal: 'Prepare for finals',
        visibility: 'private',
      });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/groups/:groupId/invite', () => {
    it('should require authentication before inviting by email', async () => {
      const res = await request(app)
        .post('/api/groups/00000000-0000-0000-0000-000000000000/invite')
        .send({
          email: 'student@example.com',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/groups/invites/:token', () => {
    it('should require authentication before viewing invite details', async () => {
      const res = await request(app).get('/api/groups/invites/fake-token');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/groups/invites/:token/accept', () => {
    it('should require authentication before accepting invite link', async () => {
      const res = await request(app).post('/api/groups/invites/fake-token/accept');

      expect(res.status).toBe(401);
    });
  });
});