// Simple debug test
const mockRes = {
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis()
};

console.log('mockRes.status calls:', mockRes.status.mock.calls);
console.log('mockRes.json calls:', mockRes.json.mock.calls);