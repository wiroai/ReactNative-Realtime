module.exports = {
  __esModule: true,
  default: {
    getString: jest.fn(() => Promise.resolve('')),
    setString: jest.fn(),
    hasString: jest.fn(() => Promise.resolve(false)),
    getImage: jest.fn(() => Promise.resolve('')),
    setImage: jest.fn(),
    hasImage: jest.fn(() => Promise.resolve(false)),
    hasURL: jest.fn(() => Promise.resolve(false)),
    hasWebURL: jest.fn(() => Promise.resolve(false)),
  },
};
